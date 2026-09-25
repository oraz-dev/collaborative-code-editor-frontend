/**
 * File-type glyphs for the explorer, tab bar and breadcrumbs.
 *
 * An icon theme only reads as one if the same extension always gets the same
 * shape and colour everywhere it appears, so the mapping lives here rather than
 * inside any single component. Shapes are deliberately reused across related
 * languages — a handful of strong silhouettes plus a distinct hue per language
 * is what makes a file list scannable, not a bespoke logo per extension.
 */
export type FileGlyph =
  | 'mark'
  | 'braces'
  | 'hash'
  | 'angles'
  | 'terminal'
  | 'doc'
  | 'docLines'
  | 'sliders'
  | 'database'
  | 'image'
  | 'film'
  | 'wave'
  | 'binary';

export interface FileTypeDescriptor {
  glyph: FileGlyph;
  /**
   * Two or three letters drawn instead of a silhouette, for the `mark` glyph.
   *
   * Languages that share a shape are indistinguishable at 15px however
   * different their hues are — colour alone is not enough to tell .ts from .js
   * at a glance, so the ones that would collide get a lettermark instead.
   */
  text?: string;
  /** Literal hex, because these hues have to survive both themes unchanged. */
  color: string;
  /** Human label for the status bar. */
  label: string;
}

const GENERIC: FileTypeDescriptor = { glyph: 'doc', color: '#8a92a4', label: 'Plain Text' };

const BY_EXTENSION: Record<string, FileTypeDescriptor> = {
  ts: { glyph: 'mark', text: 'TS', color: '#4d9eff', label: 'TypeScript' },
  tsx: { glyph: 'mark', text: 'TSX', color: '#4d9eff', label: 'TypeScript JSX' },
  mts: { glyph: 'mark', text: 'TS', color: '#4d9eff', label: 'TypeScript' },
  cts: { glyph: 'mark', text: 'TS', color: '#4d9eff', label: 'TypeScript' },

  js: { glyph: 'mark', text: 'JS', color: '#e7c34a', label: 'JavaScript' },
  jsx: { glyph: 'mark', text: 'JSX', color: '#e7c34a', label: 'JavaScript JSX' },
  mjs: { glyph: 'mark', text: 'JS', color: '#e7c34a', label: 'JavaScript' },
  cjs: { glyph: 'mark', text: 'JS', color: '#e7c34a', label: 'JavaScript' },

  json: { glyph: 'mark', text: '{}', color: '#e7ab43', label: 'JSON' },
  jsonc: { glyph: 'mark', text: '{}', color: '#e7ab43', label: 'JSON with Comments' },

  css: { glyph: 'hash', color: '#5aa1ff', label: 'CSS' },
  scss: { glyph: 'hash', color: '#f06ca6', label: 'SCSS' },
  sass: { glyph: 'hash', color: '#f06ca6', label: 'Sass' },
  less: { glyph: 'hash', color: '#7f9fd6', label: 'Less' },

  html: { glyph: 'angles', color: '#ef6c5a', label: 'HTML' },
  htm: { glyph: 'angles', color: '#ef6c5a', label: 'HTML' },
  xml: { glyph: 'angles', color: '#d98b4a', label: 'XML' },
  svg: { glyph: 'image', color: '#e7ab43', label: 'SVG' },
  vue: { glyph: 'mark', text: 'VUE', color: '#42b883', label: 'Vue' },

  md: { glyph: 'docLines', color: '#7fb6ff', label: 'Markdown' },
  mdx: { glyph: 'docLines', color: '#7fb6ff', label: 'MDX' },
  txt: { glyph: 'docLines', color: '#9aa4ba', label: 'Plain Text' },
  log: { glyph: 'docLines', color: '#78849c', label: 'Log' },

  py: { glyph: 'mark', text: 'PY', color: '#4d9eff', label: 'Python' },
  go: { glyph: 'mark', text: 'GO', color: '#36c5cf', label: 'Go' },
  rs: { glyph: 'mark', text: 'RS', color: '#e08a4a', label: 'Rust' },
  java: { glyph: 'mark', text: 'JV', color: '#ef6c5a', label: 'Java' },
  kt: { glyph: 'mark', text: 'KT', color: '#9d7cff', label: 'Kotlin' },
  rb: { glyph: 'mark', text: 'RB', color: '#e05561', label: 'Ruby' },
  php: { glyph: 'mark', text: 'PHP', color: '#8f8fd6', label: 'PHP' },
  c: { glyph: 'mark', text: 'C', color: '#5aa1ff', label: 'C' },
  h: { glyph: 'binary', color: '#7fb6ff', label: 'C Header' },
  cpp: { glyph: 'mark', text: 'C++', color: '#5aa1ff', label: 'C++' },
  cs: { glyph: 'mark', text: 'C#', color: '#9d7cff', label: 'C#' },

  sh: { glyph: 'terminal', color: '#2fc88e', label: 'Shell' },
  bash: { glyph: 'terminal', color: '#2fc88e', label: 'Shell' },
  zsh: { glyph: 'terminal', color: '#2fc88e', label: 'Shell' },

  yml: { glyph: 'sliders', color: '#b6c25a', label: 'YAML' },
  yaml: { glyph: 'sliders', color: '#b6c25a', label: 'YAML' },
  toml: { glyph: 'sliders', color: '#c08a5a', label: 'TOML' },
  ini: { glyph: 'sliders', color: '#c08a5a', label: 'INI' },
  env: { glyph: 'sliders', color: '#e7c34a', label: 'Dotenv' },
  lock: { glyph: 'sliders', color: '#78849c', label: 'Lockfile' },

  sql: { glyph: 'mark', text: 'SQL', color: '#e7ab43', label: 'SQL' },

  png: { glyph: 'image', color: '#9d7cff', label: 'Image' },
  jpg: { glyph: 'image', color: '#9d7cff', label: 'Image' },
  jpeg: { glyph: 'image', color: '#9d7cff', label: 'Image' },
  gif: { glyph: 'image', color: '#9d7cff', label: 'Image' },
  webp: { glyph: 'image', color: '#9d7cff', label: 'Image' },
  ico: { glyph: 'image', color: '#9d7cff', label: 'Image' },
  avif: { glyph: 'image', color: '#9d7cff', label: 'Image' },
  bmp: { glyph: 'image', color: '#9d7cff', label: 'Image' },

  mp4: { glyph: 'film', color: '#f06ca6', label: 'Video' },
  m4v: { glyph: 'film', color: '#f06ca6', label: 'Video' },
  webm: { glyph: 'film', color: '#f06ca6', label: 'Video' },
  ogv: { glyph: 'film', color: '#f06ca6', label: 'Video' },
  mov: { glyph: 'film', color: '#f06ca6', label: 'Video' },

  mp3: { glyph: 'wave', color: '#36c5cf', label: 'Audio' },
  wav: { glyph: 'wave', color: '#36c5cf', label: 'Audio' },
  ogg: { glyph: 'wave', color: '#36c5cf', label: 'Audio' },
  oga: { glyph: 'wave', color: '#36c5cf', label: 'Audio' },
  opus: { glyph: 'wave', color: '#36c5cf', label: 'Audio' },
  m4a: { glyph: 'wave', color: '#36c5cf', label: 'Audio' },
  aac: { glyph: 'wave', color: '#36c5cf', label: 'Audio' },
  flac: { glyph: 'wave', color: '#36c5cf', label: 'Audio' },
};

/** Whole-name matches win over the extension, the way real icon themes work. */
const BY_NAME: Record<string, FileTypeDescriptor> = {
  'package.json': { glyph: 'mark', text: 'npm', color: '#e05561', label: 'JSON' },
  'tsconfig.json': { glyph: 'sliders', color: '#4d9eff', label: 'JSON with Comments' },
  dockerfile: { glyph: 'binary', color: '#5aa1ff', label: 'Dockerfile' },
  '.gitignore': { glyph: 'sliders', color: '#ef6c5a', label: 'Ignore' },
  license: { glyph: 'docLines', color: '#e7ab43', label: 'Plain Text' },
};

export function extensionOf(fileName: string): string {
  const base = fileName.trim().toLowerCase();
  const dot = base.lastIndexOf('.');
  // A leading dot means a dotfile (`.gitignore`), not an extension.
  if (dot <= 0) return '';
  return base.slice(dot + 1);
}

export function fileTypeFor(fileName: string): FileTypeDescriptor {
  const named = BY_NAME[fileName.trim().toLowerCase()];
  if (named) return named;
  return BY_EXTENSION[extensionOf(fileName)] ?? GENERIC;
}
