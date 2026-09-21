import type { Language } from '../../types/language';

/**
 * Picking a language for a file.
 *
 * Judge0 offers several builds of the same language — three GCCs for C, two
 * Pythons, Clang alongside GCC — and their ids are not in version order
 * (`C (Clang 7.0.1)` is 75, `C (GCC 9.2.0)` is 50). So nothing here is keyed
 * on an id. Each extension names its preferred *families* in order, the first
 * family with any match wins, and the newest version inside it is chosen.
 *
 * Doing it this way also means a deployment that narrows its allowlist keeps
 * working: if the preferred family is gone the next one is used, and if none
 * survive the file is simply reported as not runnable.
 */
interface LanguageRule {
  /** Families to try, most preferred first. Anchored — `C` must not match `C#`. */
  readonly families: readonly RegExp[];
}

const C_FAMILIES = [/^C \(GCC/i, /^C \(Clang/i, /^C \(/i] as const;
const CPP_FAMILIES = [/^C\+\+ \(GCC/i, /^C\+\+ \(Clang/i, /^C\+\+ \(/i] as const;

const RULES: Readonly<Record<string, LanguageRule>> = {
  py: { families: [/^Python \(3\./i, /^Python\b/i] },
  // Judge0 runs Node, so a .js file here is a script, not a page. Anything
  // that touches the DOM belongs in the in-browser preview instead.
  js: { families: [/^JavaScript\b/i] },
  mjs: { families: [/^JavaScript\b/i] },
  cjs: { families: [/^JavaScript\b/i] },
  ts: { families: [/^TypeScript\b/i] },
  go: { families: [/^Go\b/i] },
  rs: { families: [/^Rust\b/i] },
  java: { families: [/^Java\b/i] },
  kt: { families: [/^Kotlin\b/i] },
  rb: { families: [/^Ruby\b/i] },
  php: { families: [/^PHP\b/i] },
  // GCC before Clang: it is the newer build in the Judge0 images that ship
  // both, and versions are only compared within one family.
  c: { families: C_FAMILIES },
  h: { families: C_FAMILIES },
  cpp: { families: CPP_FAMILIES },
  cc: { families: CPP_FAMILIES },
  cxx: { families: CPP_FAMILIES },
  hpp: { families: CPP_FAMILIES },
  cs: { families: [/^C#/i] },
  swift: { families: [/^Swift\b/i] },
  scala: { families: [/^Scala\b/i] },
  sh: { families: [/^Bash\b/i] },
  bash: { families: [/^Bash\b/i] },
  lua: { families: [/^Lua\b/i] },
  pl: { families: [/^Perl\b/i] },
  r: { families: [/^R \(/i] },
  sql: { families: [/^SQL\b/i] },
  hs: { families: [/^Haskell\b/i] },
  ex: { families: [/^Elixir\b/i] },
  exs: { families: [/^Elixir\b/i] },
  erl: { families: [/^Erlang\b/i] },
  ml: { families: [/^OCaml\b/i] },
  pas: { families: [/^Pascal\b/i] },
  f90: { families: [/^Fortran\b/i] },
  clj: { families: [/^Clojure\b/i] },
  groovy: { families: [/^Groovy\b/i] },
  m: { families: [/^Objective-C\b/i] },
  d: { families: [/^D \(/i] },
  lisp: { families: [/^Common Lisp\b/i] },
  cob: { families: [/^COBOL\b/i] },
  fs: { families: [/^F#/i] },
  vb: { families: [/^Visual Basic\b/i] },
  asm: { families: [/^Assembly\b/i] },
};

/** Lowercase extension without the dot, or `''` for a file that has none. */
export function extensionOf(fileName: string): string {
  const base = fileName.slice(fileName.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  // A leading dot is `.gitignore`, not an extension.
  if (dot <= 0) return '';
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Orders `"3.8.1"` against `"2.7.17"` numerically, so `17` does not beat `8`
 * the way a string comparison would.
 */
function compareVersions(a: string, b: string): number {
  const left = a.match(/\d+/g) ?? [];
  const right = b.match(/\d+/g) ?? [];

  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = Number(left[i] ?? 0) - Number(right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function newest(candidates: Language[]): Language {
  return candidates.reduce((best, candidate) => (
    compareVersions(candidate.name, best.name) > 0 ? candidate : best
  ));
}

/**
 * The language a file should run as, or `null` if this deployment has none.
 *
 * `languages` is the list fetched from the server, so an empty or narrowed
 * list naturally produces `null` rather than a guess the sandbox would reject.
 */
export function resolveLanguage(fileName: string, languages: Language[]): Language | null {
  const rule = RULES[extensionOf(fileName)];
  if (!rule || languages.length === 0) return null;

  for (const family of rule.families) {
    const matches = languages.filter((language) => family.test(language.name));
    if (matches.length > 0) return newest(matches);
  }
  return null;
}

/** Extensions this client knows how to name a language for. */
export const RUNNABLE_EXTENSIONS: readonly string[] = Object.keys(RULES);
