import type { Transform } from 'sucrase';
import type { PreviewFile } from '../buildPreviewDocument/buildPreviewDocument';

const TYPESCRIPT = /\.tsx?$/i;
const JSX_SOURCE = /\.(tsx|jsx)$/i;
/** Everything the compiler has to see before a browser can run it. */
const COMPILED = /\.(tsx?|jsx)$/i;

export interface TranspileFailure {
  path: string;
  message: string;
}

export interface TranspileResult {
  files: PreviewFile[];
  failures: TranspileFailure[];
}

export function needsTranspile(path: string): boolean {
  return COMPILED.test(path);
}

/**
 * The path a file is published under once its types are stripped.
 *
 * TypeScript source imports its neighbours by their *output* name
 * (`import './util.js'` from `util.ts`), so publishing the compiled module as
 * `.js` is what makes the ordinary spelling resolve without any aliasing.
 */
export function transpiledPath(path: string): string {
  return needsTranspile(path) ? path.replace(COMPILED, '.js') : path;
}

/** Sucrase reports the offset but not the line; this makes it clickable-ish. */
function describeError(error: unknown, source: string): string {
  if (!(error instanceof Error)) return String(error);

  const match = /\((\d+):(\d+)\)/.exec(error.message);
  if (match) return error.message;

  const index = (error as { pos?: number }).pos;
  if (typeof index !== 'number') return error.message;

  const line = source.slice(0, index).split('\n').length;
  return `${error.message} (line ${line})`;
}

function transformsFor(path: string): Transform[] {
  const transforms: Transform[] = TYPESCRIPT.test(path) ? ['typescript'] : [];
  if (JSX_SOURCE.test(path)) transforms.push('jsx');
  return transforms;
}

/**
 * Strips types and compiles JSX so the sandbox can run TypeScript and React.
 *
 * Transpile-only, deliberately: it removes annotations and rewrites the few
 * TS-specific constructs, but it does **not** type-check. `const x: number =
 * 'a'` runs happily here — the editor's language service is what reports that,
 * and stopping a preview on a type error would make the feature useless for
 * exactly the exploratory edits it exists for.
 *
 * Sucrase is imported lazily, so a workspace of plain JS or HTML never pays
 * for the compiler.
 */
export async function transpileWorkspace(files: PreviewFile[]): Promise<TranspileResult> {
  if (!files.some((file) => needsTranspile(file.path))) {
    return { files, failures: [] };
  }

  const { transform } = await import('sucrase');
  const output: PreviewFile[] = [];
  const failures: TranspileFailure[] = [];

  for (const file of files) {
    if (!needsTranspile(file.path)) {
      output.push(file);
      continue;
    }

    try {
      const { code } = transform(file.content, {
        transforms: transformsFor(file.path),
        // The automatic runtime imports `react/jsx-runtime` itself, so a
        // component file needs no `import React` just to have JSX in scope.
        // The package resolver maps that import like any other.
        jsxRuntime: 'automatic',
        // The dev runtime would stamp every element with a `this` that is
        // undefined in a module, and adds nothing the console can show.
        production: true,
        // Keeps `import type` erasure honest without a full type graph.
        disableESTransforms: true,
        filePath: file.path,
      });
      output.push({ path: transpiledPath(file.path), content: code });
    } catch (error) {
      failures.push({ path: file.path, message: describeError(error, file.content) });
      // Publish an empty module so an importer fails on the missing export
      // rather than on a missing module, which is the more useful error.
      output.push({ path: transpiledPath(file.path), content: '' });
    }
  }

  return { files: output, failures };
}
