/**
 * A language the sandbox will run.
 *
 * `id` is Judge0's language id and is what a run frame carries. It is not
 * stable across deployments — the same list can be narrowed by the execution
 * service's allowlist — so ids are always resolved from a fetched list rather
 * than hard-coded anywhere.
 */
export interface Language {
  id: number;
  /** Includes the version, e.g. `"Python (3.8.1)"`. */
  name: string;
}

/** `"Python (3.8.1)"` -> `"Python"`. */
export function languageFamily(language: Language): string {
  const open = language.name.indexOf('(');
  return (open === -1 ? language.name : language.name.slice(0, open)).trim();
}

/** `"Python (3.8.1)"` -> `"3.8.1"`, or `''` when unversioned. */
export function languageVersion(language: Language): string {
  const match = /\(([^)]*)\)\s*$/.exec(language.name);
  return match ? match[1].trim() : '';
}
