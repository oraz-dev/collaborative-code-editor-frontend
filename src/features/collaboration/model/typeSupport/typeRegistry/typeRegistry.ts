import type { TypeFile } from '../acquireTypes/acquireTypes';
import { ASSET_DECLARATIONS, untypedPackagesDeclaration } from '../editorLibs/editorLibs';

/** The part of Monaco's `typescriptDefaults` / `javascriptDefaults` this uses. */
export interface LanguageDefaults {
  setCompilerOptions: (options: Record<string, unknown>) => void;
  setExtraLibs: (libs: { content: string; filePath?: string }[]) => void;
}

const ASSETS_URI = 'file:///__space__/assets.d.ts';
const UNTYPED_URI = 'file:///__space__/untyped-packages.d.ts';

/**
 * Everything the editor's TypeScript service knows beyond the open file.
 *
 * Monaco's language defaults are global, so this is one registry for the
 * app, handed to Monaco in a single `setExtraLibs` per change rather than a
 * library at a time: package types arrive hundreds of files at once, and each
 * separate library would re-sync the worker.
 */
export class TypeRegistry {
  private targets: LanguageDefaults[] = [];

  private projectFiles = new Map<string, string>();

  private packageFiles = new Map<string, string>();

  private untyped: string[] = [];

  private options: Record<string, unknown> | null = null;

  private scheduled = false;

  private readonly schedule: (flush: () => void) => void;

  /** `schedule` batches changes into one flush; tests pass a synchronous one. */
  constructor(schedule: (flush: () => void) => void = (flush) => setTimeout(flush, 0)) {
    this.schedule = schedule;
  }

  attach(targets: LanguageDefaults[]): void {
    this.targets = targets;
    if (this.options) targets.forEach((target) => target.setCompilerOptions(this.options as Record<string, unknown>));
    this.requestFlush();
  }

  setProject(files: Map<string, string>, options: Record<string, unknown>): void {
    this.projectFiles = files;
    this.options = options;
    this.targets.forEach((target) => target.setCompilerOptions(options));
    this.requestFlush();
  }

  addPackageFiles(files: TypeFile[]): void {
    if (files.length === 0) return;
    for (const file of files) this.packageFiles.set(`file:///${file.path}`, file.content);
    this.requestFlush();
  }

  setUntyped(names: string[]): void {
    const next = [...names].sort();
    if (next.join('\n') === this.untyped.join('\n')) return;
    this.untyped = next;
    this.requestFlush();
  }

  /** The libraries as Monaco receives them; exposed for tests. */
  libraries(): { content: string; filePath: string }[] {
    const libs = [{ content: ASSET_DECLARATIONS, filePath: ASSETS_URI }];
    if (this.untyped.length > 0) {
      libs.push({ content: untypedPackagesDeclaration(this.untyped), filePath: UNTYPED_URI });
    }
    for (const [filePath, content] of this.packageFiles) libs.push({ content, filePath });
    for (const [filePath, content] of this.projectFiles) libs.push({ content, filePath });
    return libs;
  }

  private requestFlush(): void {
    if (this.scheduled || this.targets.length === 0) return;
    this.scheduled = true;
    this.schedule(() => {
      this.scheduled = false;
      const libs = this.libraries();
      this.targets.forEach((target) => target.setExtraLibs(libs));
    });
  }
}
