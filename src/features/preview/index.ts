export { PreviewPane } from './ui/PreviewPane/PreviewPane';
export {
  buildPreviewDocument,
  isRunnable,
  whyNotRunnable,
} from './model/buildPreviewDocument/buildPreviewDocument';
export type { PreviewFile, PreviewInput } from './model/buildPreviewDocument/buildPreviewDocument';
export { needsTranspile, transpileWorkspace, transpiledPath } from './model/transpile/transpile';
export type { TranspileFailure, TranspileResult } from './model/transpile/transpile';
export { loadProject, MAX_PROJECT_FILES } from './model/loadProject/loadProject';
export type {
  LoadedProject,
  ProjectDocument,
  ProjectFetchers,
} from './model/loadProject/loadProject';
export { useProjectLoader } from './model/useProjectLoader/useProjectLoader';
export type { ProjectLoadState } from './model/useProjectLoader/useProjectLoader';
export { useProjectSnapshot } from './model/useProjectSnapshot/useProjectSnapshot';
export type { ProjectSnapshot } from './model/useProjectSnapshot/useProjectSnapshot';
export { projectTypeInfo } from './model/projectTypeInfo/projectTypeInfo';
export type { ProjectPackage, ProjectTypeInfo } from './model/projectTypeInfo/projectTypeInfo';

/*
 * Read-only helpers, exported for `features/aiProjects`: a generated project is
 * checked against the rules this feature runs projects by, so the validator
 * resolves imports, finds the entry and reads a page with exactly the code
 * that will later run them — never a second, drifting copy of those rules.
 */
export { detectProjectEntry } from './model/projectEntry/projectEntry';
export { parsePlainScripts } from './model/transpile/transpile';
export type { ScriptParseFailure } from './model/transpile/transpile';
export { lookupIn } from './model/cssReferences/cssReferences';
export { buildAliases } from './model/buildPreviewDocument/buildPreviewDocument';
export { collectDependencies, splitQuery } from './model/rewriteImports/rewriteImports';
export { applyPathAliases, readPathAliases } from './model/pathAliases/pathAliases';
export type { PathAlias } from './model/pathAliases/pathAliases';
export { hasModuleScript } from './model/htmlPage/htmlPage';
