import { describe, expect, test, vi } from 'vitest';
import { TypeRegistry, type LanguageDefaults } from './typeRegistry';

function target() {
  return {
    setExtraLibs: vi.fn<LanguageDefaults['setExtraLibs']>(),
    setCompilerOptions: vi.fn<LanguageDefaults['setCompilerOptions']>(),
  };
}

function manual() {
  const queue: Array<() => void> = [];
  return { schedule: (flush: () => void) => queue.push(flush), run: () => queue.splice(0).forEach((flush) => flush()) };
}

describe('TypeRegistry', () => {
  test('batches changes into one setExtraLibs per flush, for every target', () => {
    const { schedule, run } = manual();
    const registry = new TypeRegistry(schedule);
    const ts = target();
    const js = target();
    registry.attach([ts, js]);

    registry.setProject(new Map([['file:///p/k/a.ts', 'a']]), { strict: true });
    registry.addPackageFiles([{ path: 'node_modules/x/index.d.ts', content: 'x' }]);
    run();

    expect(ts.setExtraLibs).toHaveBeenCalledTimes(1);
    expect(js.setExtraLibs).toHaveBeenCalledTimes(1);
    const paths = ts.setExtraLibs.mock.calls[0][0].map((lib) => lib.filePath);
    expect(paths).toEqual(expect.arrayContaining(['file:///p/k/a.ts', 'file:///node_modules/x/index.d.ts']));
    expect(ts.setCompilerOptions).toHaveBeenCalledWith({ strict: true });
  });

  test('untyped packages get stand-in declarations until their types arrive', () => {
    const { schedule, run } = manual();
    const registry = new TypeRegistry(schedule);
    registry.attach([target()]);

    registry.setUntyped(['zustand']);
    run();
    expect(registry.libraries().some((lib) => lib.content.includes("declare module 'zustand';"))).toBe(true);

    registry.setUntyped([]);
    expect(registry.libraries().some((lib) => lib.content.includes("declare module 'zustand'"))).toBe(false);
  });

  test('options set before Monaco is ready are applied when it attaches', () => {
    const registry = new TypeRegistry(() => undefined);
    registry.setProject(new Map(), { jsx: 4 });
    const ts = target();

    registry.attach([ts]);
    expect(ts.setCompilerOptions).toHaveBeenCalledWith({ jsx: 4 });
  });

  test('always declares what Vite lets a module import', () => {
    const registry = new TypeRegistry(() => undefined);
    expect(registry.libraries()[0].content).toContain("declare module '*.module.css'");
  });
});
