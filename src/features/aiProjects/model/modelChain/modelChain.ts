import type { FreeModel } from '../openrouter/openrouter';

/**
 * Which free model writes the project, and what to do when it will not.
 *
 * Free models are shared capacity: the one that answered a minute ago returns
 * 429 "temporarily rate-limited upstream" on the next request. A single model
 * is therefore not a setting, it is a chain — the generation walks down it
 * until one answers, and the UI names whichever did.
 */
export interface ChainModel {
  id: string;
  label: string;
  /** Honours `response_format: json_schema` with `strict: true`. */
  structured: boolean;
  /** Provider's completion cap, the ceiling for `maxTokens`. */
  maxOutput: number;
  contextLength: number;
  /** Why this one sits where it does, shown as a hint in the model picker. */
  note?: string;
}

/**
 * The ranked chain, measured against the live catalogue and by asking each
 * model for a project.
 *
 * Order is measured, not guessed. The same real generate request, sent to
 * every candidate at the same moment, then run through validateProject:
 *
 *   nex-n2.5-mini        9s   5 files, clean
 *   nemotron-3-super    22s   4 files, INVALID (unterminated string, bad json)
 *   dots-3-note         32s   5 files, clean
 *   north-mini-code     79s   5 files, clean
 *   nex-n2.5-pro       230s   5 files, clean
 *   qwen3.8-27b, gemma-4-31b    429, rate-limited upstream
 *
 * So the fastest clean answer leads, and the 27B model the user picked keeps
 * its place behind it because it is genuinely good whenever it is free.
 * Nemotron is last of the strict-JSON group: speed is worth nothing when the
 * code does not parse. The two that can only be *asked* for JSON come after
 * all of them, which is also the invariant `nextModel` relies on.
 */
export const FREE_MODEL_CHAIN: ChainModel[] = [
  {
    id: 'nex-agi/nex-n2.5-mini:free',
    label: 'Nex-N2.5 Mini',
    structured: true,
    maxOutput: 235_929,
    contextLength: 262_144,
    note: 'Fastest clean answer — about 9 seconds for a small project.',
  },
{
    id: 'qwen/qwen3.8-27b:free',
    label: 'Qwen3.8 27B',
    structured: true,
    maxOutput: 235_929,
    contextLength: 262_144,
    note: 'Strong code, but the busiest free model — often rate-limited.',
  },
{
    id: 'dots-studio/dots-3-note-preview:free',
    label: 'Dots3-Note Preview',
    structured: true,
    maxOutput: 460_800,
    contextLength: 512_000,
    note: 'Largest budget; about half a minute of thinking first.',
  },
{
    id: 'nex-agi/nex-n2.5-pro:free',
    label: 'Nex-N2.5 Pro',
    structured: true,
    maxOutput: 235_929,
    contextLength: 262_144,
    note: 'Same family as Mini but spends minutes reasoning; a last resort.',
  },
{
    id: 'nvidia/nemotron-3-super-120b-a12b:free',
    label: 'Nemotron 3 Super',
    structured: true,
    maxOutput: 235_929,
    contextLength: 262_144,
    note: 'Quick, but has returned code that does not parse — late for that reason.',
  },
{
    id: 'cohere/north-mini-code:free',
    label: 'North Mini Code',
    structured: false,
    maxOutput: 64_000,
    contextLength: 256_000,
    note: 'Code-specialised, prompt-JSON only, and slow (over a minute).',
  },
{
    id: 'google/gemma-4-31b-it:free',
    label: 'Gemma 4 31B',
    structured: false,
    maxOutput: 32_768,
    contextLength: 262_144,
    note: 'No strict JSON: the shape is asked for in the prompt instead.',
  },
];

/** The user's chosen default, and the head of the chain. */
export const DEFAULT_MODEL = 'nex-agi/nex-n2.5-mini:free';

/**
 * Models this account may not use.
 *
 * `thinkingmachines/*` is listed as free in the catalogue and answers 403 for
 * this key, so offering it would only ever waste a step of the chain.
 */
const UNAVAILABLE_PREFIXES = ['thinkingmachines/'];

/**
 * Free models that exist but cannot write a project: classifiers, guards and
 * embedders answer something, just never code.
 */
const NOT_A_CODER = /content-safety|guard|moderation|embed|rerank|vision-only/i;

/**
 * Below this a model cannot finish even a bare project in one answer, so it
 * would only ever produce a truncated response to repair.
 */
export const MIN_USEFUL_OUTPUT = 8_192;

export function modelLabel(id: string, chain: ChainModel[] = FREE_MODEL_CHAIN): string {
  return chain.find((model) => model.id === id)?.label ?? id;
}

export function findModel(id: string, chain: ChainModel[] = FREE_MODEL_CHAIN): ChainModel | null {
  return chain.find((model) => model.id === id) ?? null;
}

/** Said of a model chosen from the live catalogue that this chain does not rank. */
export const UNLISTED_NOTE = 'Chosen in Settings and not in the built-in list — untested here.';

/**
 * The model to ask for — including one the built-in chain has never heard of.
 *
 * `rankFreeModels` offers everything the live catalogue lists, so the saved
 * preference is quite often an id `FREE_MODEL_CHAIN` does not carry. Falling
 * back to the head of the chain meant the generation quietly came from a
 * different model than the one the UI named, so an unknown id becomes a model
 * in its own right: prompt-JSON, because a schema sent to a model that does not
 * support it is a 400, and a conservative completion cap, because the
 * catalogue's real one is not to hand here.
 */
export function resolveModel(id: string, chain: ChainModel[] = FREE_MODEL_CHAIN): ChainModel | null {
  const known = findModel(id, chain);
  if (known) return known;
  if (!id) return chain[0] ?? null;

  return {
    id,
    label: id,
    structured: false,
    maxOutput: MIN_USEFUL_OUTPUT * 4,
    contextLength: 0,
    note: UNLISTED_NOTE,
  };
}

export interface NextModelOptions {
  /** The chain to walk; the built-in ranking by default. */
  chain?: ChainModel[];
  /** Every model already attempted, in any order. */
  tried: string[];
  /** Set false once a strict-JSON attempt has itself failed to parse. */
  preferStructured?: boolean;
}

/**
 * The next model to try after a retryable failure, or null when the chain is
 * spent.
 *
 * Strict-JSON models come first whatever their position, because a prompt-JSON
 * model costs an extra parse-and-repair round trip; within each group the
 * chain's own order decides. Nothing is ever handed back twice — a 429 loop on
 * one model must not become an infinite loop over the chain.
 */
export function nextModel(options: NextModelOptions): ChainModel | null {
  const { chain = FREE_MODEL_CHAIN, tried, preferStructured = true } = options;
  const seen = new Set(tried);
  const remaining = chain.filter((model) => !seen.has(model.id));

  if (preferStructured) {
    const strict = remaining.find((model) => model.structured);
    if (strict) return strict;
  }
  return remaining[0] ?? null;
}

/**
 * The best chain available *today*, from the live catalogue.
 *
 * The ranking above is knowledge the catalogue does not carry (which models
 * actually answered, which are gated, which stall on reasoning), so it leads —
 * but only for models the account can still see. Free models appear and
 * disappear weekly, so anything new is kept as a tail: strict-JSON first, then
 * by how much it can write, which is the best guess available without asking
 * it. Models that cannot write code, or that this key may not use, are dropped.
 */
export function rankFreeModels(listed: FreeModel[]): ChainModel[] {
  const usable = listed.filter((model) => (
    !UNAVAILABLE_PREFIXES.some((prefix) => model.id.startsWith(prefix))
    && !NOT_A_CODER.test(model.id)
    && model.maxOutput >= MIN_USEFUL_OUTPUT
  ));
  const byId = new Map(usable.map((model) => [model.id, model]));

  // Known models keep their measured rank, refreshed with live limits: a
  // provider raising or lowering its completion cap must not be ignored.
  const known = FREE_MODEL_CHAIN
    .filter((model) => byId.has(model.id))
    .map((model) => {
      const live = byId.get(model.id) as FreeModel;
      return {
        ...model,
        structured: live.structured,
        maxOutput: live.maxOutput,
        contextLength: live.contextLength,
      };
    });
  const knownIds = new Set(known.map((model) => model.id));

  const discovered = usable
    .filter((model) => !knownIds.has(model.id))
    .sort((a, b) => (
      Number(b.structured) - Number(a.structured)
      || b.maxOutput - a.maxOutput
      || a.id.localeCompare(b.id)
    ))
    .map((model): ChainModel => ({
      id: model.id,
      label: model.label,
      structured: model.structured,
      maxOutput: model.maxOutput,
      contextLength: model.contextLength,
      note: 'New in the free catalogue — untested here.',
    }));

  return [...known, ...discovered];
}
