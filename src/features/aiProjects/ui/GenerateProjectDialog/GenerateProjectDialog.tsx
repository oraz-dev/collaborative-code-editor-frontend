import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Alert } from '@/shared/ui/Alert/Alert';
import { Button } from '@/shared/ui/Button/Button';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Input } from '@/shared/ui/Input/Input';
import { Modal } from '@/shared/ui/Modal/Modal';
import { Progress } from '@/shared/ui/Progress/Progress';
import { Select } from '@/shared/ui/Select/Select';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import { Textarea } from '@/shared/ui/Textarea/Textarea';
import { FREE_MODEL_CHAIN, modelLabel, resolveModel, type ChainModel } from '../../model/modelChain/modelChain';
import type { ProjectProblem } from '../../model/validateProject/validateProject';
import type { GeneratorPhase, ProjectGenerator } from '../../model/useProjectGenerator/useProjectGenerator';
import cls from './GenerateProjectDialog.module.scss';

/**
 * The whole generation, as one dialog.
 *
 * It owns no generation logic at all: every step is read off the state machine
 * it is handed, which is what makes it testable with a fake generator and what
 * keeps "what the model is doing" in one place rather than spread across six
 * screens. The dialog only decides what the current phase should look like,
 * and which of the five actions — plan, generate, repair, create, cancel — a
 * person may take from here.
 *
 * Two things it does own, because they are presentation:
 *
 * - The request text, the chosen model and the project name are drafts. They
 *   live here until the user commits them, so going back from the plan does
 *   not lose what they typed.
 * - Closing mid-flight asks first. Everything before `create()` is free to
 *   throw away, but the user spent a minute of a rate-limited model on it.
 */

export interface GenerateProjectDialogProps {
  className?: string;
  open: boolean;
  onClose: () => void;
  /** The state machine; the app passes `useProjectGenerator`, tests a fake. */
  generator: ProjectGenerator;
  /** The models on offer, in the order they will be tried. */
  chain?: ChainModel[];
  modelId: string;
  onModelChange: (modelId: string) => void;
  /** Opens a created document — the project's entry file. */
  onOpenDocument: (documentId: string) => void;
}

interface Preset {
  label: string;
  request: string;
}

/**
 * Four starting points that each exercise a different part of the runtime
 * rules — the CDN Tailwind, MemoryRouter, no packages at all, and a package
 * that has to reach esm.sh — so a preset is also a smoke test of the prompt.
 */
const PRESETS: Preset[] = [
  {
    label: 'React + Tailwind starter',
    request: 'A bare project with react and react-dom, styled with Tailwind from the CDN: a centred card with a heading and a counter button.',
  },
  {
    label: 'React + Router + Tailwind dashboard',
    request: 'A dashboard using react-router with MemoryRouter and Tailwind from the CDN: a sidebar, an overview page with stat cards and a settings page.',
  },
  {
    label: 'TypeScript canvas game',
    request: 'A small canvas game in strict TypeScript with no packages beyond react and react-dom: a paddle, a bouncing ball, a score and a restart button.',
  },
  {
    label: 'Zustand + forms CRUD',
    request: 'A contacts list with zustand for state and a controlled form to add, edit and delete entries, styled with Tailwind from the CDN.',
  },
];

type Step = 'ask' | 'plan' | 'working' | 'review' | 'creating' | 'done';

/** Phases where a request is in flight, so closing has something to interrupt. */
const BUSY_PHASES: GeneratorPhase[] = ['planning', 'generating', 'validating', 'repairing', 'creating'];

function isBusy(phase: GeneratorPhase): boolean {
  return BUSY_PHASES.includes(phase);
}

/**
 * An error is not a step of its own: it is shown on whichever step the user
 * can act from — back at the request when nothing exists yet, at the files
 * when some arrived.
 */
function stepFor(phase: GeneratorPhase, hasPlan: boolean, hasFiles: boolean): Step {
  switch (phase) {
    case 'plan':
      return 'plan';
    case 'generating':
    case 'validating':
    case 'repairing':
      return 'working';
    case 'ready':
      return 'review';
    case 'creating':
      return 'creating';
    case 'done':
      return 'done';
    case 'error':
      if (hasFiles) return 'review';
      return hasPlan ? 'plan' : 'ask';
    default:
      return 'ask';
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function countLabel(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

interface ProblemGroup {
  path: string;
  errors: ProjectProblem[];
  warnings: ProjectProblem[];
}

/** Problems read by file, since that is how they will be fixed. */
function groupProblems(errors: ProjectProblem[], warnings: ProjectProblem[]): ProblemGroup[] {
  const groups = new Map<string, ProblemGroup>();

  const add = (problem: ProjectProblem, kind: 'errors' | 'warnings') => {
    const path = problem.path || 'The project';
    const group = groups.get(path) ?? { path, errors: [], warnings: [] };
    group[kind].push(problem);
    groups.set(path, group);
  };

  errors.forEach((problem) => add(problem, 'errors'));
  warnings.forEach((problem) => add(problem, 'warnings'));

  // Files with errors first: they are the ones standing between here and a
  // project that runs.
  return [...groups.values()].sort((a, b) => b.errors.length - a.errors.length);
}

export const GenerateProjectDialog = memo((props: GenerateProjectDialogProps) => {
  const {
    className,
    open,
    onClose,
    generator,
    chain = FREE_MODEL_CHAIN,
    modelId,
    onModelChange,
    onOpenDocument,
  } = props;

  const { state } = generator;
  const busy = isBusy(state.phase);
  const step = stepFor(state.phase, Boolean(state.plan), state.files.length > 0);

  const [request, setRequest] = useState('');
  const [name, setName] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  /** Once the user has typed a name, no later answer may overwrite it. */
  const nameEdited = useRef(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  /**
   * Focus moves into the dialog on open and back to whatever opened it on
   * close.
   *
   * A layout effect, and not an ordinary one, because of the order React runs
   * them in: the request box autofocuses from its own effect, which runs
   * *before* this component's effects but after its layout effects. Capturing
   * the outgoing element any later would capture the textarea and restore
   * focus to a node that no longer exists — which is how focus ends up on
   * `body` with no way back to the button that opened the dialog.
   */
  useLayoutEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement as HTMLElement | null;

    // The panel itself, unless a field inside has already claimed focus.
    if (!panelRef.current?.contains(document.activeElement)) {
      panelRef.current?.focus();
    }

    return () => restoreRef.current?.focus?.();
  }, [open]);

  /**
   * Focus follows the step.
   *
   * The footer's buttons are swapped out when the phase changes — two become
   * one on "Generate files" — so the element the keyboard user just pressed is
   * unmounted and focus falls to `body`. The panel takes it back, which is also
   * what the `Modal`'s Tab trap needs as a starting point.
   */
  useLayoutEffect(() => {
    if (!open) return;
    if (panelRef.current?.contains(document.activeElement)) return;
    if (document.activeElement !== document.body && document.activeElement !== null) return;
    panelRef.current?.focus();
  }, [open, step]);

  // The name the model proposed becomes the draft, until the user edits it.
  useEffect(() => {
    if (state.name && !nameEdited.current) setName(state.name);
  }, [state.name]);

  const onNameChange = useCallback((value: string) => {
    nameEdited.current = true;
    setName(value);
  }, []);

  /**
   * A prompt about work that has finished is not a question any more.
   *
   * "Stop and close? The files written so far will be lost." is shown instead
   * of the footer, so a run that completes while it is up leaves a finished
   * project behind an offer to throw it away, with no way to create it.
   */
  useEffect(() => {
    if (!busy) setConfirmClose(false);
  }, [busy]);

  /**
   * Reopening after a run that has stopped starts a new one.
   *
   * The generator outlives the dialog — it is held by the page — so without
   * this, opening it again would show the last run's files, and the review step
   * has no way back to the request. A run that is still going is left alone on
   * purpose: closing the dialog mid-generation and coming back to it is a
   * reasonable thing to do.
   */
  const wasOpen = useRef(open);
  useEffect(() => {
    const finished = state.phase === 'done' || state.phase === 'ready' || state.phase === 'error';
    if (open && !wasOpen.current && finished) {
      generator.reset();
      nameEdited.current = false;
      setName('');
      // The request is kept unless the project was actually created: after a
      // generation the user did not like, it is the thing they want to edit.
      if (state.phase === 'done') setRequest('');
    }
    wasOpen.current = open;
  }, [generator, open, state.phase]);

  const close = useCallback(() => {
    setConfirmClose(false);
    onClose();
  }, [onClose]);

  /**
   * Throws the generation away and goes back to the request.
   *
   * The review step had no way back at all: a result the user did not want
   * could only be created, or escaped by leaving the page. The request text
   * stays, since it is the thing they will want to edit.
   */
  const onStartOver = useCallback(() => {
    generator.reset();
    nameEdited.current = false;
    setName('');
  }, [generator]);

  /** Escape and the close button both land here; mid-flight they only ask. */
  const onRequestClose = useCallback(() => {
    if (busy) {
      setConfirmClose(true);
      return;
    }
    close();
  }, [busy, close]);

  const onKeepGoing = useCallback(() => setConfirmClose(false), []);

  const onStopAndClose = useCallback(() => {
    generator.cancel();
    close();
  }, [close, generator]);

  const onCancel = useCallback(() => {
    generator.cancel();
    setConfirmClose(false);
  }, [generator]);

  const onPresetClick = useCallback((preset: Preset) => {
    setRequest(preset.request);
  }, []);

  const onPlanClick = useCallback(() => {
    if (!request.trim()) return;
    generator.plan(request.trim());
  }, [generator, request]);

  // The draft text stays here, so "Back" costs nothing but the plan.
  const onBackToRequest = onStartOver;

  const onGenerateClick = useCallback(() => {
    const plan = state.plan;
    if (!plan) return;
    generator.generate({ ...plan, name: name.trim() || plan.name });
  }, [generator, name, state.plan]);

  const onFixClick = useCallback(() => {
    generator.repair();
  }, [generator]);

  const onCreateClick = useCallback(() => {
    generator.create(name.trim() || undefined);
  }, [generator, name]);

  const onRetryClick = useCallback(() => {
    if (state.plan) {
      generator.generate();
      return;
    }
    if (request.trim()) generator.plan(request.trim());
  }, [generator, request, state.plan]);

  /** The half-created project folder, so the user can see what is there. */
  const onOpenPartialClick = useCallback(() => {
    const root = state.created[0];
    if (!root) return;
    onOpenDocument(root.id);
    close();
  }, [close, onOpenDocument, state.created]);

  const onOpenProjectClick = useCallback(() => {
    const result = state.result;
    if (!result) return;
    // The entry file, so the project opens on something worth reading; the
    // root folder is the fallback for a project with no detectable entry.
    onOpenDocument(result.entryId ?? result.rootId);
    close();
  }, [close, onOpenDocument, state.result]);

  const modelOptions = useMemo(() => {
    const options = chain.map((model) => ({ value: model.id, label: model.label }));
    // A model chosen from the live catalogue in Settings is not in the chain
    // this dialog was given. Leaving it out showed the Select's placeholder and
    // described the chain's head, while the generation used the chosen one.
    if (!options.some((option) => option.value === modelId)) {
      options.push({ value: modelId, label: `${modelId} (not listed)` });
    }
    return options;
  }, [chain, modelId]);
  const selectedModel = resolveModel(modelId, chain);

  const report = state.report;
  const errorCount = report?.errors.length ?? 0;
  const warningCount = report?.warnings.length ?? 0;
  const groups = useMemo(
    () => (report ? groupProblems(report.errors, report.warnings) : []),
    [report],
  );

  /**
   * The one thing announced.
   *
   * Files land several times a second and the model's name changes mid-run;
   * read out item by item that is noise, so the list below is `aria-live="off"`
   * and this line carries the milestones instead. It changes on a phase
   * change, not on progress.
   */
  const milestone = useMemo(() => {
    switch (state.phase) {
      case 'planning':
        return 'Planning the project.';
      case 'generating':
        return 'Writing the project files.';
      case 'validating':
        return 'Checking the project against the sandbox.';
      case 'repairing':
        return 'Asking the model to fix the problems it left.';
      case 'ready':
        // No report means validation never ran — a cancelled generation. It
        // must not be announced as a clean one.
        if (!report) return 'The files that arrived are ready to review.';
        return errorCount > 0
          ? `Files ready to review. ${countLabel(errorCount, 'problem', 'problems')} to fix.`
          : 'Files ready to review. No problems found.';
      case 'creating':
        return 'Creating the documents.';
      case 'done':
        return 'The project was created.';
      case 'error':
        return state.error ?? 'The generation failed.';
      default:
        return '';
    }
  }, [errorCount, report, state.error, state.phase]);

  const plannedCount = state.plan?.files.length ?? 0;
  const writtenCount = state.files.length;
  /**
   * Monotonic by construction: files only ever close, and the one case where
   * the count drops — a second model starting from nothing after a busy one —
   * is a restart the bar should show as one.
   */
  const streamPercent = plannedCount > 0
    ? Math.min(99, Math.round((writtenCount / plannedCount) * 100))
    : undefined;

  const creation = state.creation;
  const creationPercent = creation && creation.total > 0
    ? Math.round((creation.done / creation.total) * 100)
    : 0;

  const answeredBy = state.model ? modelLabel(state.model, chain) : null;
  /** Documents a failed or cancelled create left in the workspace. */
  const partial = step === 'review' && state.created.length > 0;
  const pendingPath = state.progress.path;
  const showPendingRow = Boolean(pendingPath) && !state.files.some((file) => file.path === pendingPath);

  const footer = (() => {
    if (confirmClose) return null;

    if (step === 'ask') {
      return (
        <>
          <Button variant="ghost" size="small" onClick={close}>Cancel</Button>
          <Button
            size="small"
            onClick={onPlanClick}
            disabled={!request.trim() || state.phase === 'planning'}
            isLoading={state.phase === 'planning'}
            aria-label="Generate a plan for this project"
          >
            Generate
          </Button>
        </>
      );
    }

    if (step === 'plan') {
      return (
        <>
          <Button variant="ghost" size="small" onClick={onBackToRequest}>Back</Button>
          <Button size="small" onClick={onGenerateClick} aria-label="Generate the project files">
            Generate files
          </Button>
        </>
      );
    }

    if (step === 'working') {
      return <Button variant="secondary" size="small" onClick={onCancel}>Cancel</Button>;
    }

    if (step === 'review') {
      return (
        <>
          <Button variant="ghost" size="small" onClick={close}>Close</Button>
          <Button
            variant="ghost"
            size="small"
            onClick={onStartOver}
            aria-label="Start over with a new description"
          >
            Start over
          </Button>
          {errorCount > 0 && (
            <Button
              variant="secondary"
              size="small"
              onClick={onFixClick}
              aria-label="Ask the AI to fix the problems"
            >
              Ask AI to fix
            </Button>
          )}
          <Button
            size="small"
            onClick={onCreateClick}
            aria-label={partial ? 'Finish creating the project documents' : 'Create the project documents'}
          >
            {partial ? 'Resume creating' : errorCount > 0 ? 'Create anyway' : 'Create project'}
          </Button>
        </>
      );
    }

    if (step === 'creating') {
      return <Button variant="secondary" size="small" onClick={onCancel}>Cancel</Button>;
    }

    return (
      <>
        <Button variant="ghost" size="small" onClick={close}>Close</Button>
        <Button size="small" onClick={onOpenProjectClick} aria-label="Open the new project">
          Open project
        </Button>
      </>
    );
  })();

  return (
    <Modal
      open={open}
      onClose={onRequestClose}
      size="lg"
      title="Generate a project with AI"
      footer={open ? footer : undefined}
      className={className}
    >
      {open && (
        <div
          className={cls.root}
          ref={panelRef}
          tabIndex={-1}
          // The shared Modal draws the frame; this is the element focus lands
          // on, so it is the one that has to name itself to a screen reader.
          role="dialog"
          aria-label="Generate a project with AI"
          data-testid="generate-project-dialog"
          data-step={step}
        >
          {/* The only live region: milestones, never the file list below. */}
          <span className={cls.srOnly} role="status" aria-live="polite">{milestone}</span>

          {confirmClose && (
            <div className={cls.confirm} data-testid="ai-confirm-close">
              <span className={cls.confirmText}>
                Stop and close? The files written so far will be lost.
              </span>
              <div className={cls.confirmActions}>
                <Button variant="ghost" size="small" onClick={onKeepGoing}>Keep going</Button>
                <Button variant="destructive" size="small" onClick={onStopAndClose}>Stop and close</Button>
              </div>
            </div>
          )}

          {state.error && (
            <Alert
              variant="error"
              title="The generation stopped"
              description={(
                <span>
                  {state.error}
                  {state.attempts.length > 0 && (
                    <span className={cls.attempts} data-testid="ai-attempts">
                      {state.attempts.map((attempt) => (
                        <span className={cls.attempt} key={attempt.id}>
                          {attempt.label}
                          {attempt.outcome === 'busy' && ' — busy'}
                          {attempt.outcome === 'failed' && ' — failed'}
                          {attempt.outcome === 'unusable' && ' — no project in the answer'}
                        </span>
                      ))}
                    </span>
                  )}
                  <Button
                    className={cls.retry}
                    variant="secondary"
                    size="small"
                    onClick={onRetryClick}
                    aria-label="Try generating again"
                  >
                    Retry
                  </Button>
                </span>
              )}
            />
          )}

          {/*
            * Shown with the error, not instead of it: the one notice that
            * matters most — "3 documents had already been created." — is
            * written on exactly the path that also sets an error, and hiding it
            * there left a half-created project nobody was told about.
            */}
          {state.notice && (
            <p className={cls.notice} data-testid="ai-notice">{state.notice}</p>
          )}

          {step === 'ask' && (
            <div className={cls.step}>
              <Textarea
                label="Describe the project you want"
                value={request}
                onChange={setRequest}
                rows={4}
                autofocus
                placeholder="A bare project with react, react-dom and tailwind"
                aria-label="Describe the project you want"
                data-testid="ai-request"
              />

              <div className={cls.presets} aria-label="Starting points" role="group">
                {PRESETS.map((preset) => (
                  <button
                    type="button"
                    key={preset.label}
                    className={cls.preset}
                    onClick={() => onPresetClick(preset)}
                    aria-label={`Use the ${preset.label} preset`}
                  >
                    <Icons.Sparkle size={12} aria-hidden />
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className={cls.modelRow}>
                <Select
                  className={cls.modelSelect}
                  label="Model"
                  value={modelId}
                  onChange={onModelChange}
                  options={modelOptions}
                  aria-label="Model to generate with"
                />
                <p className={cls.hint}>
                  {selectedModel?.note ?? 'Free models are shared, so a busy one falls through to the next.'}
                </p>
              </div>

              {state.phase === 'planning' && (
                <p className={cls.working}>
                  <Spinner size="small" /> Asking {modelLabel(modelId, chain)} for a plan…
                </p>
              )}
            </div>
          )}

          {step === 'plan' && state.plan && (
            <div className={cls.step}>
              <Input
                label="Project name"
                value={name}
                onChange={onNameChange}
                aria-label="Project name"
                data-testid="ai-project-name"
              />
              {state.summary && <p className={cls.summary}>{state.summary}</p>}

              <div className={cls.listHead}>
                {countLabel(state.plan.files.length, 'file', 'files')} planned
                {answeredBy && <span className={cls.by}>by {answeredBy}</span>}
              </div>
              <ul className={cls.planList}>
                {state.plan.files.map((file) => (
                  <li className={cls.planRow} key={file.path}>
                    <span className={cls.path}>{file.path}</span>
                    <span className={cls.purpose}>{file.purpose}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === 'working' && (
            <div className={cls.step}>
              <div className={cls.listHead}>
                {state.phase === 'generating' && `Writing files${answeredBy ? ` with ${answeredBy}` : ''}`}
                {state.phase === 'validating' && 'Checking the project against the sandbox'}
                {state.phase === 'repairing' && 'Asking the model to fix what it left'}
                <span className={cls.by}>
                  {plannedCount > 0 ? `${writtenCount} / ${plannedCount}` : countLabel(writtenCount, 'file', 'files')}
                </span>
              </div>

              <Progress
                value={streamPercent}
                indeterminate={streamPercent === undefined}
                size="sm"
                label="Project generation"
                className={cls.bar}
              />

              {/* Off, deliberately: the milestone line above speaks for this. */}
              <ul className={cls.fileList} aria-live="off" data-testid="ai-file-list">
                {state.files.map((file) => (
                  <li className={cls.fileRow} key={file.path} data-testid="ai-file-row">
                    <Icons.Check size={13} className={cls.ok} aria-hidden />
                    <span className={cls.path}>{file.path}</span>
                    <span className={cls.size}>{formatSize(file.content.length)}</span>
                  </li>
                ))}

                {showPendingRow && (
                  <li className={classNames(cls.fileRow, { [cls.pending]: true })} data-testid="ai-file-pending">
                    <Spinner size="small" className={cls.rowSpinner} />
                    <span className={cls.path}>{pendingPath}</span>
                    <span className={cls.size}>writing…</span>
                  </li>
                )}
              </ul>
            </div>
          )}

          {step === 'review' && (
            <div className={cls.step}>
              {partial && (
                <div className={cls.partial} data-testid="ai-partial">
                  <p className={cls.partialText}>
                    {countLabel(state.created.length, 'document', 'documents')} of this project
                    {state.createdRootName ? ` already exist in “${state.createdRootName}”` : ' already exist'}.
                    {' '}Creating again finishes that folder rather than making a second one.
                  </p>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={onOpenPartialClick}
                    aria-label="Open what was already created"
                  >
                    Open what exists
                  </Button>
                </div>
              )}

              <Input
                label="Project name"
                value={name}
                onChange={onNameChange}
                aria-label="Project name"
                data-testid="ai-project-name"
              />

              <div className={cls.listHead}>
                {countLabel(state.files.length, 'file', 'files')}
                <span className={cls.by}>
                  {errorCount === 0
                    ? 'nothing blocking'
                    : countLabel(errorCount, 'problem', 'problems')}
                  {warningCount > 0 && ` · ${countLabel(warningCount, 'warning', 'warnings')}`}
                </span>
              </div>

              <ul className={cls.fileList}>
                {state.files.map((file) => (
                  <li className={cls.fileRow} key={file.path} data-testid="ai-file-row">
                    <Icons.Check size={13} className={cls.ok} aria-hidden />
                    <span className={cls.path}>{file.path}</span>
                    <span className={cls.size}>{formatSize(file.content.length)}</span>
                  </li>
                ))}
              </ul>

              {groups.length > 0 && (
                <div className={cls.groups} data-testid="ai-problems">
                  {groups.map((group) => (
                    <div className={cls.group} key={group.path}>
                      <div className={cls.groupHead}>{group.path}</div>
                      {group.errors.map((problem) => (
                        <p className={classNames(cls.problem, { [cls.isError]: true })} key={problem.message}>
                          <Icons.Warning size={13} aria-hidden /> {problem.message}
                        </p>
                      ))}
                      {group.warnings.map((problem) => (
                        <p className={cls.problem} key={problem.message}>
                          <Icons.Minus size={13} aria-hidden /> {problem.message}
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {report && groups.length === 0 && (
                <p className={cls.clean}>
                  Everything checks out against the sandbox: it should run as soon as it is created.
                </p>
              )}

              {!report && (
                // A cancelled generation lands here with files but no report,
                // and claiming they are fine would be a guess.
                <p className={cls.hint}>
                  These files were not checked — the generation stopped before validation ran.
                </p>
              )}
            </div>
          )}

          {step === 'creating' && (
            <div className={cls.step}>
              <div className={cls.listHead}>
                Creating documents
                <span className={cls.by}>
                  {creation ? `${creation.done} / ${creation.total}` : 'starting…'}
                </span>
              </div>
              <Progress
                value={creationPercent}
                size="sm"
                label="Creating documents"
                className={cls.bar}
              />
              {creation && (
                <p className={cls.working} data-testid="ai-creating-path">
                  <Spinner size="small" /> {creation.path || name || 'project folder'}
                </p>
              )}
            </div>
          )}

          {step === 'done' && state.result && (
            <div className={cls.step}>
              <div className={cls.doneHead}>
                <Icons.CheckCircle size={18} className={cls.ok} aria-hidden />
                <span>
                  <b>{state.result.rootName}</b> is ready —{' '}
                  {countLabel(state.result.created.length, 'document', 'documents')} created.
                </span>
              </div>
              <p className={cls.hint}>
                Run works from any file in the project: open one and press Run, and the
                page is built from <code>index.html</code> whichever file you are in.
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
});
