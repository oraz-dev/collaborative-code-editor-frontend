import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@/shared/lib/logger/logger';
import {
  isOpenRouterError,
  type ChatMessage,
  type ChatResult,
  type JsonSchemaSpec,
  type OpenRouterClient,
  type StreamActivity,
} from '../openrouter/openrouter';
import {
  FREE_MODEL_CHAIN,
  nextModel,
  resolveModel,
  type ChainModel,
} from '../modelChain/modelChain';
import {
  createFileStream,
  parseLooseJson,
  type FinishResult,
  type ProjectFile,
  type StreamLimits,
} from '../streamJson/streamJson';
import {
  PLAN_SCHEMA,
  PROJECT_SCHEMA,
  generateMessages,
  planMessages,
  repairMessages,
  type ProjectPlan,
} from '../prompts/prompts';
import {
  isStubFile,
  repairHints,
  validateProject,
  type ValidationReport,
} from '../validateProject/validateProject';
import {
  createProjectDocuments,
  isProjectCreationError,
  type CreateDocumentFn,
  type CreateProjectProgress,
  type CreateProjectResult,
  type CreatedDocument,
} from '../createProjectDocuments/createProjectDocuments';

/**
 * The generation, from a sentence to an open project.
 *
 * idle -> planning -> plan -> generating -> validating -> (repairing ->
 * validating) -> ready -> creating -> done, with `error` reachable from any
 * step and every step cancellable.
 *
 * The shape follows what free models actually do:
 *
 * - They are busy. A 429 is the normal answer, not an outage, so a failure
 *   that another model could survive walks down the chain instead of stopping,
 *   and every attempt is recorded so the UI can say who ended up answering.
 * - They run out of room. A response cut off at the token cap is not a lost
 *   generation: the files that closed are kept and only the missing ones are
 *   asked for again — one round trip instead of the whole project.
 * - They loop. The observed failure was 177KB of one file repeating; the
 *   stream guard trips, the request is aborted, and the files that did arrive
 *   are still offered.
 * - They write plausible code for the wrong runtime. Validation runs before
 *   anything is created, and one repair round — errors only — is worth the
 *   rate limit. A repair that itself fails changes nothing: the user still
 *   gets the files and the list of what is wrong with them.
 *
 * Nothing is created until `create()` is called, so a bad generation costs the
 * user nothing but time.
 */

export type GeneratorPhase =
  | 'idle'
  | 'planning'
  | 'plan'
  | 'generating'
  | 'validating'
  | 'repairing'
  | 'ready'
  | 'creating'
  | 'done'
  | 'error';

export interface StreamProgress {
  /** Files completed so far. */
  files: number;
  /** The file being written right now, when the model has named it. */
  path: string | null;
  /** Characters of response received, which is all the size there is to show. */
  bytes: number;
  /**
   * Whether the model has said a single word of the answer yet.
   *
   * False through the whole reasoning phase — four minutes of it, in the run
   * this exists for — which is the difference between "thinking" and "writing"
   * and the only honest reason to show an indeterminate bar.
   */
  contentStarted: boolean;
  /** When the request went out, by the injected clock; null before it did. */
  startedAt: number | null;
  /**
   * The last sign of life of any kind — a keep-alive counts.
   *
   * The connection being alive is a fact worth showing, and during a long
   * reasoning phase it is the only fact there is.
   */
  lastActivityAt: number | null;
  /** Content characters received, counted as they arrive rather than scanned. */
  contentBytes: number;
}

export type AttemptOutcome = 'answered' | 'busy' | 'failed' | 'unusable';

export interface ModelAttempt {
  id: string;
  label: string;
  outcome: AttemptOutcome;
  /** Redacted already: it comes from `OpenRouterError`. */
  detail?: string;
}

export interface GeneratorState {
  phase: GeneratorPhase;
  request: string;
  plan: ProjectPlan | null;
  files: ProjectFile[];
  name: string | null;
  summary: string | null;
  /** What validation still says about `files`; null before it has run. */
  report: ValidationReport | null;
  progress: StreamProgress;
  /** Document-creation progress, once `create()` is running. */
  creation: CreateProjectProgress | null;
  /** Every model asked, in order, and how it answered. */
  attempts: ModelAttempt[];
  /** The model that produced what is on screen. */
  model: string | null;
  /** Something the user should know but that is not a failure. */
  notice: string | null;
  error: string | null;
  result: CreateProjectResult | null;
  /** Documents created before a failed `create()`, so they are not orphaned silently. */
  created: CreatedDocument[];
  /**
   * The name those documents' project folder actually got.
   *
   * Kept because a retry must re-enter that folder rather than resolve the name
   * again — `uniqueName` would see the half-created root and make `name-2`.
   */
  createdRootName: string | null;
  /** Whether the one repair round has been spent. */
  repaired: boolean;
}

export interface ProjectGeneratorOptions {
  /**
   * The assistant client. Always present: it is built on this app's proxy and
   * the session the user already has, so there is no "not configured yet".
   */
  client: OpenRouterClient;
  /** The chain to walk. Live-ranked by the caller, or the built-in order. */
  chain?: ChainModel[];
  /** The user's preferred model: the head of the walk. Default: the chain's own head. */
  modelId?: string;
  /** When false, a busy model is a failure rather than a reason to move on. */
  fallbackEnabled?: boolean;
  ownerId: string;
  createDocument: CreateDocumentFn;
  /** Names already at the workspace root, so a project folder never collides. */
  existingNames?: string[];
  /** Stream guards; the defaults are the ones measured against a real loop. */
  limits?: StreamLimits;
  /**
   * The clock, injected the way `relativeTime` takes its `now`.
   *
   * Progress carries timestamps now — when the request went out, when the last
   * sign of life arrived — and a test cannot assert on a clock it does not own.
   */
  now?: () => number;
}

/** What `useProjectGenerator` hands back: the UI is written against this, not the hook. */
export interface ProjectGenerator {
  state: GeneratorState;
  /** Ask for a file list the user can approve. */
  plan: (request: string) => Promise<void>;
  /** Write the files for the approved plan (or `override`), then validate them. */
  generate: (override?: ProjectPlan) => Promise<void>;
  /** Another fix-up round on the files in hand, driven by the user. */
  repair: () => Promise<void>;
  /** Turn the files into documents. Nothing is created before this. */
  create: (rootName?: string) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

const EMPTY_PROGRESS: StreamProgress = {
  files: 0,
  path: null,
  bytes: 0,
  contentStarted: false,
  startedAt: null,
  lastActivityAt: null,
  contentBytes: 0,
};

const INITIAL_STATE: GeneratorState = {
  phase: 'idle',
  request: '',
  plan: null,
  files: [],
  name: null,
  summary: null,
  report: null,
  progress: EMPTY_PROGRESS,
  creation: null,
  attempts: [],
  model: null,
  notice: null,
  error: null,
  result: null,
  created: [],
  createdRootName: null,
  repaired: false,
};

/** A file list is a few hundred tokens; anything more is the model musing. */
const PLAN_MAX_TOKENS = 2_000;

/**
 * Enough for roughly fifteen files of a hundred lines, and deliberately far
 * below what the free models allow: the 177KB loop was produced by asking for
 * everything a 235k-token cap permits. A project that genuinely needs more
 * than this is one the repair round should be splitting up anyway.
 */
const GENERATE_MAX_TOKENS = 24_000;

/**
 * Stream guards sized to what was actually asked for.
 *
 * The defaults in `streamJson` were measured against a response allowed 235k
 * tokens; at `GENERATE_MAX_TOKENS` the model stops long before a 900k-character
 * buffer, so the guard that exists for the 177KB loop could never fire. Four
 * characters per token is generous for JSON-escaped code, and a completed file
 * is always kept, so a guard that fires early costs a notice, not the files.
 */
const STREAM_GUARDS: StreamLimits = {
  maxBuffer: GENERATE_MAX_TOKENS * 4,
};

/** Low, not zero: the same request should give roughly the same project. */
const TEMPERATURE = 0.2;

/**
 * How often streaming progress reaches React.
 *
 * Deltas arrive dozens of times a second and `stream.pending` scans the open
 * file, so both the render and the scan are throttled; a completed file always
 * updates immediately, since that is the part people watch.
 */
const PROGRESS_INTERVAL_MS = 120;

function outcomeFor(error: unknown): AttemptOutcome {
  return isOpenRouterError(error) && error.kind === 'rateLimited' ? 'busy' : 'failed';
}

function countFiles(count: number): string {
  return `${count} missing file${count === 1 ? '' : 's'}`;
}

function describeError(error: unknown): string {
  if (isOpenRouterError(error)) return error.message;
  return error instanceof Error ? error.message : String(error);
}

/**
 * "Qwen3.8 27B was busy — Nex-N2.5 Pro answered." — the sentence the UI shows
 * when the generation did not come from the model the user chose.
 */
export function describeAttempts(attempts: ModelAttempt[]): string | null {
  const index = attempts.findIndex((attempt) => attempt.outcome === 'answered');
  if (index <= 0) return null;

  const answered = attempts[index];
  const before = attempts.slice(0, index);

  const busy = before.filter((attempt) => attempt.outcome === 'busy').map((attempt) => attempt.label);
  const others = before.filter((attempt) => attempt.outcome !== 'busy').map((attempt) => attempt.label);
  const parts = [
    busy.length > 0 ? `${busy.join(' and ')} ${busy.length > 1 ? 'were' : 'was'} busy` : '',
    others.length > 0 ? `${others.join(' and ')} could not answer` : '',
  ].filter(Boolean);

  return `${parts.join(', ')} — ${answered.label} answered.`;
}

/** The plan as the model returns it, or null when the answer is not one. */
export function readPlan(text: string): ProjectPlan | null {
  const payload = parseLooseJson(text);
  if (!payload || typeof payload !== 'object') return null;

  const { name, summary, files } = payload as Record<string, unknown>;
  const planned = Array.isArray(files) ? files : [];
  const list = planned
    .filter((item): item is { path: string; purpose?: unknown } => (
      Boolean(item) && typeof item === 'object' && typeof (item as { path?: unknown }).path === 'string'
    ))
    .map((item) => ({
      path: item.path,
      purpose: typeof item.purpose === 'string' ? item.purpose : '',
    }));

  // A plan with no files is not a plan, whatever else the model wrote.
  if (list.length === 0) return null;

  return {
    name: typeof name === 'string' && name ? name : 'AI project',
    summary: typeof summary === 'string' ? summary : '',
    files: list,
  };
}

/**
 * The files worth telling the model it has already written.
 *
 * A stub is not one of them. Shown in "FILES WRITTEN SO FAR" it reads as done,
 * and the prompt's own rule — "do not repeat a file that is already correct" —
 * then talks the model out of writing the one file that has to be rewritten.
 */
function realFiles(files: ProjectFile[]): ProjectFile[] {
  return files.filter((file) => !isStubFile(file));
}

/** Later files win, and order is kept — a repair replaces, it does not append twice. */
export function mergeFiles(existing: ProjectFile[], incoming: ProjectFile[]): ProjectFile[] {
  const merged = [...existing];
  for (const file of incoming) {
    const index = merged.findIndex((item) => item.path === file.path);
    if (index === -1) merged.push(file);
    else merged[index] = file;
  }
  return merged;
}

/**
 * What the plan promised and the response never delivered.
 *
 * A stub counts as undelivered. The failure this rule comes from: a model
 * wrote a 27-byte `index.html` and stopped, the file was counted as written,
 * and the top-up asked only for the four that were missing outright — so the
 * one file that decides whether anything renders was never asked for again.
 */
export function missingPaths(plan: ProjectPlan | null, finished: FinishResult): string[] {
  const stubs = finished.files.filter(isStubFile).map((file) => file.path);
  const written = new Set(
    finished.files.map((file) => file.path).filter((path) => !stubs.includes(path)),
  );
  const missing = (plan?.files ?? [])
    .map((file) => file.path)
    .filter((path) => !written.has(path));

  // A stub the plan never named is still a file that has to be written again.
  for (const path of stubs) {
    if (!missing.includes(path)) missing.push(path);
  }

  // The file it was cut off inside was dropped for being incomplete, and it is
  // not always one the plan named.
  if (finished.incompletePath && !written.has(finished.incompletePath) && !missing.includes(finished.incompletePath)) {
    missing.unshift(finished.incompletePath);
  }
  return missing;
}

interface AttemptOptions<T> {
  messages: ChatMessage[];
  schema: JsonSchemaSpec;
  maxTokens: number;
  signal: AbortSignal;
  /** A model is about to be asked; per-attempt state resets here. */
  onStart?: (model: ChainModel) => void;
  /** Each delta. Returning false stops this attempt and keeps what arrived. */
  onDelta?: (delta: string) => boolean;
  /** Every sign of life, content or not — including the keep-alives. */
  onActivity?: (activity: StreamActivity) => void;
  /**
   * Turns an attempt into a value, or null to move down the chain. `result` is
   * null when `onDelta` stopped the attempt deliberately.
   */
  read: (result: ChatResult | null, model: ChainModel) => T | null;
}

interface AttemptResult<T> {
  value: T;
  model: ChainModel;
  attempts: ModelAttempt[];
}

export function useProjectGenerator(options: ProjectGeneratorOptions): ProjectGenerator {
  const {
    client,
    chain = FREE_MODEL_CHAIN,
    // '' means "no preference", which `resolveModel` reads as the chain's head.
    // Naming a specific id here would override a caller's own ranked chain.
    modelId = '',
    fallbackEnabled = true,
    ownerId,
    createDocument,
    existingNames,
    limits,
    now = Date.now,
  } = options;

  const [state, setState] = useState<GeneratorState>(INITIAL_STATE);
  /** The same state, readable inside an async step without a stale closure. */
  const stateRef = useRef(state);
  const controllerRef = useRef<AbortController | null>(null);

  const patch = useCallback((update: Partial<GeneratorState>) => {
    stateRef.current = { ...stateRef.current, ...update };
    setState(stateRef.current);
  }, []);

  /** Starts a step, abandoning whatever was running. */
  const begin = useCallback((): AbortController => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    return controller;
  }, []);

  /**
   * Whether this step may still write state.
   *
   * `mine` is the weaker of the two: a cancelled step is still the current one
   * until another begins, and it has things worth reporting — which documents
   * were already created before the user stopped it. `owns` also requires that
   * nobody cancelled, which is what an ordinary success path wants.
   */
  const mine = useCallback((controller: AbortController): boolean => (
    controllerRef.current === controller
  ), []);

  const owns = useCallback((controller: AbortController): boolean => (
    controllerRef.current === controller && !controller.signal.aborted
  ), []);

  /**
   * Asks the chain until one model answers usefully.
   *
   * The per-attempt controller is what makes the loop guard work: aborting it
   * stops the download without touching the run's own signal, so a looping
   * model is cut off while the generation carries on with what it sent.
   */
  const attempt = useCallback(async <T,>(config: AttemptOptions<T>): Promise<AttemptResult<T>> => {
    const { messages, schema, maxTokens, signal, onStart, onDelta, onActivity, read } = config;
    const attempts: ModelAttempt[] = [];
    const tried: string[] = [];
    let preferStructured = true;
    let lastError: unknown = null;

    // The model the user chose, even when the built-in chain does not list it:
    // asking a different one than the UI names is worse than asking an
    // untested one.
    let model: ChainModel | null = resolveModel(modelId, chain);

    while (model) {
      if (signal.aborted) throw new DOMException('Generation cancelled.', 'AbortError');

      const current: ChainModel = model;
      tried.push(current.id);
      onStart?.(current);

      const child = new AbortController();
      const forward = () => child.abort();
      signal.addEventListener('abort', forward, { once: true });
      let stopped = false;

      try {
        const result = await client.chat({
          model: current.id,
          messages,
          // Only where it works: asking a prompt-JSON model for a schema is a
          // 400, and the prompt already states the shape for both kinds.
          schema: current.structured ? schema : undefined,
          maxTokens: Math.min(maxTokens, current.maxOutput),
          temperature: TEMPERATURE,
          signal: child.signal,
          onActivity,
          onDelta: onDelta && ((delta: string) => {
            if (stopped || onDelta(delta) !== false) return;
            stopped = true;
            child.abort();
          }),
        });

        const value = read(result, current);
        if (value !== null) {
          attempts.push({ id: current.id, label: current.label, outcome: 'answered' });
          return { value, model: current, attempts };
        }

        attempts.push({
          id: current.id,
          label: current.label,
          outcome: 'unusable',
          detail: 'answered with something that was not a project',
        });
        // Strict JSON did not save this one, so it is no longer a reason to
        // prefer the next structured model over the next model in the chain.
        preferStructured = false;
        lastError = new Error(`${current.label} did not answer with a project.`);
      } catch (error) {
        if (stopped) {
          // Aborted on purpose: whatever arrived before the guard is the answer.
          const value = read(null, current);
          if (value !== null) {
            attempts.push({ id: current.id, label: current.label, outcome: 'answered' });
            return { value, model: current, attempts };
          }
          // It looped before finishing even one file, which says nothing about
          // the next model — so that one gets a turn.
          attempts.push({
            id: current.id,
            label: current.label,
            outcome: 'unusable',
            detail: 'repeated itself before writing a whole file',
          });
          lastError = new Error(`${current.label} repeated itself before writing a whole file.`);
        } else {
          // The user cancelled the run; no other model would help.
          if (signal.aborted) throw error;

          attempts.push({
            id: current.id,
            label: current.label,
            outcome: outcomeFor(error),
            detail: describeError(error),
          });
          lastError = error;

          const worthAnother = isOpenRouterError(error) && error.worthAnotherModel;
          if (!worthAnother || !fallbackEnabled) {
            throw error;
          }
          logger.warn(`OpenRouter: ${current.id} could not answer, trying the next free model`);
        }
      } finally {
        signal.removeEventListener('abort', forward);
      }

      model = nextModel({ chain, tried, preferStructured });
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('No free model could answer right now. Try again in a minute.');
  }, [chain, client, fallbackEnabled, modelId]);

  /**
   * One streamed request for a set of files, with the loop guard wired in.
   *
   * Shared by the first generation, the truncation top-up and the repair
   * round: all three are "ask for files and read them as they arrive", and
   * only the messages differ.
   */
  const streamProject = useCallback(async (
    messages: ChatMessage[],
    controller: AbortController,
    onFiles?: (files: ProjectFile[], progress: StreamProgress) => void,
    /**
     * Whether an answer with no files in it counts as an answer.
     *
     * For the first generation it does not: no files is nothing to show, so the
     * next model gets a turn. For a top-up or a repair it does — "there is
     * nothing more to add" is a legitimate reply, and walking the whole chain
     * over it burns seven rate-limited models for nothing.
     */
    emptyIsAnAnswer = false,
  ): Promise<{ finished: FinishResult; attempts: ModelAttempt[]; model: ChainModel }> => {
    const guards: StreamLimits = { ...STREAM_GUARDS, ...limits };
    let stream = createFileStream(guards);
    let lastTick = 0;

    // Liveness, kept beside the scanner's own numbers: the two answer different
    // questions — "how much of the project is written" and "is anything
    // happening at all" — and during a reasoning phase only the second has an
    // answer.
    let startedAt: number | null = null;
    let lastActivityAt: number | null = null;
    let contentStarted = false;
    let contentBytes = 0;

    const snapshot = (): StreamProgress => ({
      files: stream.files.length,
      path: stream.pending,
      bytes: stream.text.length,
      contentStarted,
      startedAt,
      lastActivityAt,
      contentBytes,
    });

    const report = (force: boolean) => {
      const at = now();
      if (!force && at - lastTick < PROGRESS_INTERVAL_MS) return;
      lastTick = at;
      onFiles?.(stream.files, snapshot());
    };

    const { value, attempts, model } = await attempt<FinishResult>({
      messages,
      schema: PROJECT_SCHEMA,
      maxTokens: GENERATE_MAX_TOKENS,
      signal: controller.signal,
      onStart: () => {
        // A new model starts from nothing: half a project from the busy one
        // would merge into this one's answer — and its clock starts here too,
        // since the elapsed time on screen is this model's, not the run's.
        stream = createFileStream(guards);
        lastTick = 0;
        startedAt = now();
        lastActivityAt = startedAt;
        contentStarted = false;
        contentBytes = 0;
        onFiles?.([], snapshot());
      },
      onActivity: (activity) => {
        lastActivityAt = now();
        const first = activity.kind === 'content' && !contentStarted;
        if (activity.kind === 'content') {
          contentStarted = true;
          contentBytes += activity.bytes;
        }
        // Forced on the first content: "thinking" becoming "writing" is the one
        // change the user has been waiting minutes for, and it must not sit in
        // the throttle. Everything else — keep-alives, reasoning — is a tick.
        report(first);
      },
      onDelta: (delta) => {
        const pushed = stream.push(delta);
        report(pushed.files.length > 0);
        return pushed.status === 'ok';
      },
      read: () => {
        const finished = stream.finish();
        return finished.files.length > 0 || emptyIsAnAnswer ? finished : null;
      },
    });

    report(true);
    return { finished: value, attempts, model };
  }, [attempt, limits, now]);

  const fail = useCallback((controller: AbortController, error: unknown) => {
    if (!owns(controller)) return;
    patch({ phase: 'error', error: describeError(error) });
  }, [owns, patch]);

  /** Step one: a file list the user can read, argue with and approve. */
  const plan = useCallback(async (request: string) => {
    const controller = begin();
    patch({
      ...INITIAL_STATE,
      phase: 'planning',
      request,
    });

    try {
      const { value, model, attempts } = await attempt<ProjectPlan>({
        messages: planMessages(request),
        schema: PLAN_SCHEMA,
        maxTokens: PLAN_MAX_TOKENS,
        signal: controller.signal,
        read: (result) => (result ? readPlan(result.content) : null),
      });
      if (!owns(controller)) return;

      patch({
        phase: 'plan',
        plan: value,
        name: value.name,
        summary: value.summary,
        model: model.id,
        attempts,
        notice: describeAttempts(attempts),
      });
    } catch (error) {
      fail(controller, error);
    }
  }, [attempt, begin, fail, owns, patch]);

  /**
   * Step two: the files themselves, then validation and at most one repair.
   *
   * `override` is the plan the user edited; without it the approved one is used.
   */
  const generate = useCallback(async (override?: ProjectPlan) => {
    const approved = override ?? stateRef.current.plan;
    const request = stateRef.current.request;
    if (!approved) return;

    const controller = begin();
    patch({
      phase: 'generating',
      plan: approved,
      files: [],
      report: null,
      error: null,
      notice: null,
      repaired: false,
      progress: EMPTY_PROGRESS,
      attempts: [],
      // A different set of files is a different project: an earlier half-made
      // one must not be resumed with them, since what it already holds would
      // keep the old contents.
      created: [],
      createdRootName: null,
    });

    try {
      const onFiles = (files: ProjectFile[], progress: StreamProgress) => {
        if (owns(controller)) patch({ files, progress });
      };

      const first = await streamProject(generateMessages(request, approved), controller, onFiles);
      if (!owns(controller)) return;

      let files = first.finished.files;
      const notices: string[] = [];
      const answered = describeAttempts(first.attempts);
      if (answered) notices.push(answered);
      patch({
        files,
        model: first.model.id,
        attempts: first.attempts,
        // A name the caller supplied is the one the user typed on the plan
        // step, and it must not be replaced by the one the model invented —
        // nothing downstream shows it again before the folder is created.
        name: override?.name ?? first.finished.name ?? approved.name,
        summary: first.finished.summary ?? approved.summary,
      });

      if (first.finished.status === 'looping') {
        notices.push(`The model started repeating itself (${first.finished.reason}), so it was stopped. These are the files it had written.`);
      }

      // A guard trip leaves the response mid-JSON by construction, so the
      // top-up belongs here too: this is the one chance to ask for the files
      // that were never written.
      if (first.finished.truncated) {
        const missing = missingPaths(approved, first.finished);
        if (missing.length > 0) {
          patch({ notice: 'The answer was cut off — asking for the last files.' });
          try {
            const top = await streamProject(
              repairMessages(request, realFiles(files), [
                `The answer was cut off before these files were written in full: ${missing.join(', ')}.`,
                'Return only those files, each one complete from its first line to its last. Do not repeat the files that are already written.',
              ]),
              controller,
              undefined,
              true,
            );
            if (!owns(controller)) return;
            files = mergeFiles(files, top.finished.files);
            const got = top.finished.files.length;
            notices.push(got > 0
              ? `The answer was cut off; ${countFiles(got)} ${got === 1 ? 'was' : 'were'} asked for separately.`
              : 'The answer was cut off, and the missing files could not be fetched.');
            patch({ files });
          } catch (error) {
            if (!owns(controller)) return;
            // The same rule as the repair round: a failed follow-up is not a
            // failed generation. Validation still runs on the files in hand.
            notices.push(`The answer was cut off and the missing files could not be fetched (${describeError(error)}).`);
          }
        } else if (first.finished.status !== 'looping') {
          notices.push('The answer was cut off, but every planned file had already been written.');
        }
      }

      patch({ phase: 'validating', files });
      let report = await validateProject(files);
      if (!owns(controller)) return;

      let repaired = false;
      if (report.errors.length > 0) {
        repaired = true;
        patch({ phase: 'repairing', report });
        try {
          const fixes = await streamProject(
            repairMessages(request, realFiles(files), repairHints(report)),
            controller,
            undefined,
            true,
          );
          if (!owns(controller)) return;

          files = mergeFiles(files, fixes.finished.files);
          patch({ phase: 'validating', files });
          report = await validateProject(files);
          if (!owns(controller)) return;
          notices.push(report.errors.length === 0
            ? 'One problem round was fixed on a second pass.'
            : `A second pass fixed some problems; ${report.errors.length} remain.`);
        } catch (error) {
          if (!owns(controller)) return;
          // A failed repair is not a failed generation: the files are still
          // the best thing anyone has, and the report says what to fix by hand.
          notices.push(`The fix-up pass could not run (${describeError(error)}), so the problems below are still there.`);
        }
      }

      patch({
        phase: 'ready',
        files,
        report,
        repaired,
        notice: notices.join(' ') || null,
        progress: { ...stateRef.current.progress, files: files.length, path: null },
      });
    } catch (error) {
      fail(controller, error);
    }
  }, [begin, fail, owns, patch, streamProject]);

  /**
   * Another fix-up round, asked for by the user.
   *
   * `generate` already spends one automatic round on the errors it finds, so
   * this is the second opinion the review step offers when problems survived
   * it. It keeps the files it has whatever happens: a fix-up that fails or is
   * cancelled leaves the user exactly where they were, with the report intact.
   */
  const repair = useCallback(async () => {
    const { files, report, request } = stateRef.current;
    if (files.length === 0 || !report || report.errors.length === 0) return;

    const controller = begin();
    patch({ phase: 'repairing', error: null, notice: null, created: [], createdRootName: null });

    try {
      const fixes = await streamProject(
        repairMessages(request, realFiles(files), repairHints(report)),
        controller,
        undefined,
        true,
      );
      if (!owns(controller)) return;

      const merged = mergeFiles(files, fixes.finished.files);
      patch({ phase: 'validating', files: merged, model: fixes.model.id, attempts: fixes.attempts });

      const next = await validateProject(merged);
      if (!owns(controller)) return;

      const fixed = report.errors.length - next.errors.length;
      patch({
        phase: 'ready',
        files: merged,
        report: next,
        repaired: true,
        notice: next.errors.length === 0
          ? 'The fix-up pass cleared every problem.'
          : `The fix-up pass fixed ${fixed > 0 ? fixed : 'none'} of them; ${next.errors.length} still to go.`,
      });
    } catch (error) {
      if (!owns(controller)) return;
      patch({
        phase: 'ready',
        notice: `The fix-up pass could not run (${describeError(error)}), so the problems below are still there.`,
      });
    }
  }, [begin, owns, patch, streamProject]);

  /**
   * Step three: the files become documents.
   *
   * A second call after one that failed or was cancelled *finishes* that
   * project: the documents it made are handed back as `resume`, so the retry
   * creates only what is missing. Starting over would leave the half-written
   * folder behind and build `name-2` beside it.
   */
  const create = useCallback(async (rootName?: string) => {
    const { files, name, created, createdRootName } = stateRef.current;
    if (files.length === 0) return;

    const resume = created.length > 0 ? created : undefined;
    const controller = begin();
    patch({ phase: 'creating', error: null, creation: null });

    try {
      const result = await createProjectDocuments({
        rootName: (resume ? createdRootName : null) ?? rootName ?? name ?? 'AI project',
        files,
        ownerId,
        createDocument,
        existingNames,
        resume,
        signal: controller.signal,
        onProgress: (progress) => {
          if (owns(controller)) patch({ creation: progress });
        },
      });
      if (!owns(controller)) return;
      patch({
        phase: 'done',
        result,
        created: result.created,
        createdRootName: result.rootName,
      });
    } catch (error) {
      // A newer step owns the state now; this one has nothing to report.
      if (!mine(controller)) return;

      if (isProjectCreationError(error)) {
        // Whatever reached the server is named, so the user is never left with
        // a half-created project they cannot find — cancelled or failed.
        const count = error.created.length;
        const made = count > 0
          ? `${count} document${count === 1 ? '' : 's'} had already been created.`
          : 'Nothing had been created yet.';
        patch({
          phase: error.cancelled ? 'ready' : 'error',
          created: error.created,
          createdRootName: error.rootName,
          error: error.cancelled ? null : error.message,
          notice: error.cancelled ? `Cancelled — ${made}` : made,
        });
        return;
      }
      fail(controller, error);
    }
  }, [begin, createDocument, existingNames, fail, mine, owns, ownerId, patch]);

  /**
   * Stops whatever is running, keeping everything already earned: a cancelled
   * generation with files in hand lands in `ready`, not back at the start.
   */
  const cancel = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    // Kept as the current controller: the step it stops still reports what it
    // managed to do (see `mine`), and `begin` replaces it on the next step.
    controller.abort();

    const { files, plan: current, phase } = stateRef.current;
    if (phase === 'done' || phase === 'ready' || phase === 'idle') return;
    // A cancelled create writes its own ending, with the documents it made.
    if (phase === 'creating') return;

    if (files.length > 0) {
      patch({ phase: 'ready', notice: 'Cancelled — these are the files that had arrived.' });
      return;
    }
    patch({
      phase: current ? 'plan' : 'idle',
      notice: 'Cancelled.',
      progress: EMPTY_PROGRESS,
    });
  }, [patch]);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    patch(INITIAL_STATE);
  }, [patch]);

  // Unmounting abandons the request; the state it would have written is gone
  // with the component, so nothing is patched here.
  useEffect(() => () => controllerRef.current?.abort(), []);

  return { state, plan, generate, repair, create, cancel, reset };
}
