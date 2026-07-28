const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  md: 'markdown',
  mdx: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  py: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  rb: 'ruby',
  php: 'php',
  sql: 'sql',
  sh: 'shell',
  bash: 'shell',
  toml: 'ini',
  xml: 'xml',
};

/** Maps a file name to a Monaco language id, defaulting to plain text. */
export function languageFromFileName(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (!extension || extension === fileName.toLowerCase()) return 'plaintext';
  return EXTENSION_TO_LANGUAGE[extension] ?? 'plaintext';
}
