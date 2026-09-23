import { describe, expect, test } from 'vitest';
import type { FreeModel } from '../openrouter/openrouter';
import {
  DEFAULT_MODEL,
  findModel,
  FREE_MODEL_CHAIN,
  MIN_USEFUL_OUTPUT,
  modelLabel,
  nextModel,
  rankFreeModels,
  resolveModel,
  UNLISTED_NOTE,
} from './modelChain';

function listed(partial: Partial<FreeModel> & { id: string }): FreeModel {
  return {
    label: partial.id,
    contextLength: 262_144,
    maxOutput: 32_768,
    structured: false,
    ...partial,
  };
}

describe('FREE_MODEL_CHAIN', () => {
  test('starts at the chosen default', () => {
    expect(FREE_MODEL_CHAIN[0].id).toBe(DEFAULT_MODEL);
  });

  test('is all free models, listed once each', () => {
    const ids = FREE_MODEL_CHAIN.map((model) => model.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.endsWith(':free'))).toBe(true);
  });

  test('every model can write a whole project in one answer', () => {
    expect(FREE_MODEL_CHAIN.every((model) => model.maxOutput >= MIN_USEFUL_OUTPUT)).toBe(true);
  });

  test('leads with the strict-JSON models', () => {
    const firstPromptJson = FREE_MODEL_CHAIN.findIndex((model) => !model.structured);
    const lastStructured = FREE_MODEL_CHAIN.map((model) => model.structured).lastIndexOf(true);

    expect(lastStructured).toBeLessThan(firstPromptJson);
  });
});

describe('nextModel', () => {
  test('hands back the head of the chain when nothing has been tried', () => {
    expect(nextModel({ tried: [] })?.id).toBe(DEFAULT_MODEL);
  });

  test('never repeats a model, so a rate limit cannot become a loop', () => {
    const tried: string[] = [];
    for (;;) {
      const model = nextModel({ tried });
      if (!model) break;
      expect(tried).not.toContain(model.id);
      tried.push(model.id);
    }

    expect(tried).toHaveLength(FREE_MODEL_CHAIN.length);
    expect(nextModel({ tried })).toBeNull();
  });

  test('prefers a strict-JSON model over an earlier prompt-JSON one', () => {
    const chain = [
      { id: 'a:free', label: 'A', structured: false, maxOutput: 32_768, contextLength: 100 },
      { id: 'b:free', label: 'B', structured: true, maxOutput: 32_768, contextLength: 100 },
    ];

    expect(nextModel({ chain, tried: [] })?.id).toBe('b:free');
  });

  test('falls back to chain order once strict JSON has stopped helping', () => {
    const chain = [
      { id: 'a:free', label: 'A', structured: false, maxOutput: 32_768, contextLength: 100 },
      { id: 'b:free', label: 'B', structured: true, maxOutput: 32_768, contextLength: 100 },
    ];

    expect(nextModel({ chain, tried: [], preferStructured: false })?.id).toBe('a:free');
  });
});

describe('modelLabel and findModel', () => {
  test('names a known model, and falls back to the id', () => {
    expect(modelLabel(DEFAULT_MODEL)).toBe('Qwen3.8 27B');
    expect(modelLabel('someone/else:free')).toBe('someone/else:free');
    expect(findModel('someone/else:free')).toBeNull();
    expect(findModel(DEFAULT_MODEL)?.structured).toBe(true);
  });
});

describe('rankFreeModels', () => {
  test('keeps the measured order for models the account can still see', () => {
    const live = [
      listed({ id: 'google/gemma-4-31b-it:free' }),
      listed({ id: DEFAULT_MODEL, structured: true, maxOutput: 235_929 }),
    ];

    expect(rankFreeModels(live).map((model) => model.id)).toEqual([
      DEFAULT_MODEL,
      'google/gemma-4-31b-it:free',
    ]);
  });

  test('refreshes limits from the catalogue, because providers change them', () => {
    const live = [listed({ id: DEFAULT_MODEL, structured: false, maxOutput: 16_384, contextLength: 32_768 })];

    expect(rankFreeModels(live)[0]).toMatchObject({
      id: DEFAULT_MODEL,
      label: 'Qwen3.8 27B',
      structured: false,
      maxOutput: 16_384,
      contextLength: 32_768,
    });
  });

  test('appends new free models, strict JSON first then by how much they write', () => {
    const live = [
      listed({ id: 'new/small:free', maxOutput: 20_000 }),
      listed({ id: 'new/big:free', maxOutput: 120_000 }),
      listed({ id: 'new/strict:free', structured: true, maxOutput: 9_000 }),
      listed({ id: DEFAULT_MODEL, structured: true, maxOutput: 235_929 }),
    ];

    expect(rankFreeModels(live).map((model) => model.id)).toEqual([
      DEFAULT_MODEL,
      'new/strict:free',
      'new/big:free',
      'new/small:free',
    ]);
  });

  test('drops what cannot serve: gated, not a coder, or too small to finish', () => {
    const live = [
      listed({ id: 'thinkingmachines/inkling:free', maxOutput: 262_144 }),
      listed({ id: 'nvidia/nemotron-3.5-content-safety:free', maxOutput: 8_192 }),
      listed({ id: 'tiny/model:free', maxOutput: 2_048 }),
      listed({ id: DEFAULT_MODEL, structured: true, maxOutput: 235_929 }),
    ];

    expect(rankFreeModels(live).map((model) => model.id)).toEqual([DEFAULT_MODEL]);
  });

  test('an empty catalogue yields an empty chain rather than a stale one', () => {
    expect(rankFreeModels([])).toEqual([]);
  });
});

describe('resolveModel', () => {
  test('is the chain entry when the chain lists it', () => {
    expect(resolveModel(DEFAULT_MODEL)).toBe(FREE_MODEL_CHAIN[0]);
  });

  test('is the chain head when no model was chosen', () => {
    expect(resolveModel('')).toBe(FREE_MODEL_CHAIN[0]);
  });

  test('is a model of its own when the chain has never heard of it', () => {
    // Refresh in Settings offers everything the live catalogue lists, so a
    // saved id may simply not be in the built-in chain; substituting the head
    // would ask a different model than the UI names.
    const chosen = resolveModel('someone/brand-new-coder:free');

    expect(chosen).toMatchObject({
      id: 'someone/brand-new-coder:free',
      label: 'someone/brand-new-coder:free',
      structured: false,
      note: UNLISTED_NOTE,
    });
    expect(chosen?.maxOutput).toBeGreaterThanOrEqual(MIN_USEFUL_OUTPUT);
  });

  test('a model the live catalogue discovered is one such id', () => {
    const ranked = rankFreeModels([listed({ id: 'someone/brand-new-coder:free', maxOutput: 64_000 })]);

    expect(ranked.map((model) => model.id)).toContain('someone/brand-new-coder:free');
    expect(findModel('someone/brand-new-coder:free')).toBeNull();
  });
});
