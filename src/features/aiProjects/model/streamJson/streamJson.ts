/**
 * Pulls whole files out of a JSON response while it is still arriving.
 *
 * Why not wait for the end and `JSON.parse` once: a generation is a minute of
 * silence otherwise, and — measured — a free model asked for a large answer
 * can fall into a loop and emit 177KB of the same file over and over until it
 * hits the token cap. Parsing at the end would turn that into one unusable
 * string. Reading files out as they close means the first file shows up in a
 * second, a repeat is caught at the moment it repeats, and a response cut off
 * by the token cap still yields every file that completed before the cut.
 *
 * The scanner is a real streaming one — string state, escapes and a container
 * stack carried across chunks — rather than a regex re-run over the buffer:
 * chunk boundaries fall mid-key, mid-escape and mid-`\uXXXX` all the time, and
 * a model puts `{`, `}` and `"` inside the code it is writing.
 */

export interface ProjectFile {
  /** Project-root-relative, forward slashes: `src/main.tsx`. */
  path: string;
  content: string;
}

export type StreamStatus = 'ok' | 'looping';

export interface StreamLimits {
  /** Files after which a project is not a project but a loop. */
  maxFiles?: number;
  /** Total characters of emitted file content. */
  maxBytes?: number;
  /** Raw response characters, which catches a loop inside a single file. */
  maxBuffer?: number;
  /**
   * Characters in one unterminated string.
   *
   * The guard that actually catches a loop inside a single file: `maxBuffer`
   * only trips once the *whole* response is huge, which a modest `max_tokens`
   * never allows, while one file running past this is a loop whatever the
   * token budget was.
   */
  maxStringChars?: number;
  /** Container nesting; only prose full of stray braces gets near it. */
  maxDepth?: number;
}

export interface PushResult {
  /** Files that closed in this chunk, in the order the model wrote them. */
  files: ProjectFile[];
  status: StreamStatus;
  /** Why the caller should stop the stream, when the status is `looping`. */
  reason: string | null;
}

export interface FinishResult {
  /** Every file recovered, in order. */
  files: ProjectFile[];
  /** The response ended mid-JSON, so more files were coming. */
  truncated: boolean;
  status: StreamStatus;
  reason: string | null;
  name: string | null;
  summary: string | null;
  /** The file the model was part-way through when it was cut off, if known. */
  incompletePath: string | null;
}

export interface FileStream {
  push(chunk: string): PushResult;
  /** Ends the stream, optionally with a last chunk, and recovers what it can. */
  finish(tail?: string): FinishResult;
  /**
   * The path of the file being written right now, once the model has named it;
   * null between files, and while the name is still to come.
   *
   * Reading it scans the open file object, so it is meant to be read once per
   * progress update — not once per delta, which would make it quadratic in the
   * size of a file.
   */
  readonly pending: string | null;
  /** Files emitted so far. */
  readonly files: ProjectFile[];
  /** Everything received, which is what `finish` parses over. */
  readonly text: string;
}

const DEFAULTS: Required<StreamLimits> = {
  maxFiles: 80,
  maxBytes: 600_000,
  maxBuffer: 900_000,
  // Roughly a thousand lines in one file, where the validator already warns
  // above a hundred and fifty: past this the model is repeating itself.
  maxStringChars: 50_000,
  maxDepth: 64,
};

/** An unescaped `"key":` — the escaped one inside a string is another file's code. */
function keyValue(text: string, key: string): string | null {
  const pattern = new RegExp(`(?<!\\\\)"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`);
  const match = pattern.exec(text);
  if (!match) return null;
  try {
    return JSON.parse(`"${match[1]}"`) as string;
  } catch {
    return null;
  }
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Where the container that opens at `from` closes, or -1 when it never does.
 *
 * String-aware, because the closing brace of a file object is preceded by a
 * few hundred braces of its own code.
 */
function containerEnd(text: string, from: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = from; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/**
 * How many wrappers to look past. A model that opens more containers than this
 * before the answer is not writing an answer.
 */
const MAX_CANDIDATES = 32;

/** Every container in `text` that closes, outermost first, as parsed values. */
function* jsonCandidates(text: string): Generator<unknown> {
  let tried = 0;

  for (let index = 0; index < text.length && tried < MAX_CANDIDATES; index += 1) {
    const char = text[index];
    if (char !== '{' && char !== '[') continue;

    tried += 1;
    const end = containerEnd(text, index);
    if (end === -1) continue;
    const parsed = tryParse(text.slice(index, end + 1));
    if (parsed !== undefined) yield parsed;
  }
}

/**
 * A whole response as JSON, tolerating what models wrap it in.
 *
 * Prompt-JSON models (and the chatty ones) put the object inside a ```json
 * fence or between two sentences, so a direct parse is tried first and
 * balanced containers second. Both brackets are tried, and each candidate is
 * matched to its own close rather than to the last `}` in the response: the
 * answer may be a bare array, and the prose in front of it may contain a brace
 * of its own — either of which used to make a complete answer unreadable.
 */
export function parseLooseJson(text: string): unknown {
  const direct = tryParse(text.trim());
  if (direct !== undefined) return direct;

  for (const candidate of jsonCandidates(text)) return candidate;
  return undefined;
}

interface ProjectPayload {
  name: string | null;
  summary: string | null;
  files: ProjectFile[];
}

function readProjectShape(payload: unknown): ProjectPayload | null {
  if (!payload || typeof payload !== 'object') return null;

  const record = payload as { name?: unknown; summary?: unknown; files?: unknown };
  const list = Array.isArray(payload) ? payload : record.files;
  // A file object on its own is not a project: a truncated response leaves
  // several of those lying in the buffer, and reading one as the whole answer
  // would say the response was complete when it was cut off.
  if (!Array.isArray(list)) return null;
  const files = list.filter(isProjectFile);

  return {
    name: typeof record.name === 'string' ? record.name : null,
    summary: typeof record.summary === 'string' ? record.summary : null,
    files,
  };
}

/**
 * The project object a generation answers with, however it was wrapped.
 *
 * The first container that parses is not automatically the answer: a model
 * that restates the requested shape before writing the project puts a perfectly
 * valid object of placeholders in front of it, so the first candidate carrying
 * actual files wins and an empty one is only the fallback.
 */
export function parseProjectJson(text: string): ProjectPayload | null {
  const direct = readProjectShape(tryParse(text.trim()));
  if (direct && direct.files.length > 0) return direct;

  let fallback: ProjectPayload | null = direct;
  for (const candidate of jsonCandidates(text)) {
    const project = readProjectShape(candidate);
    if (!project) continue;
    if (project.files.length > 0) return project;
    fallback ??= project;
  }
  return fallback;
}

/**
 * A path a project could really contain.
 *
 * `{"path":"...","content":"..."}` is the answer shape restated, which a
 * prompt-JSON model writes out before its real answer; taking it for a file
 * creates a document literally named `...` in the user's workspace.
 */
function isUsablePath(path: string): boolean {
  const base = path.slice(path.lastIndexOf('/') + 1);
  return /[A-Za-z0-9_]/.test(base);
}

function isProjectFile(value: unknown): value is ProjectFile {
  if (!value || typeof value !== 'object') return false;
  const { path, content } = value as { path?: unknown; content?: unknown };
  // Key order is arbitrary and a file object carries nothing else, so the two
  // types are the whole test — `content` may legitimately be empty.
  return typeof path === 'string' && path.length > 0 && typeof content === 'string' && isUsablePath(path);
}

interface OpenContainer {
  /** Index in the buffer of the `{` or `[` that opened it. */
  start: number;
  isObject: boolean;
  /** An array whose objects are the project's files, not an example of one. */
  isFileList: boolean;
}

/** `"files": [` — the only array whose objects are files. */
const FILES_KEY = /"files"\s*:\s*$/;
/** Enough to hold `"files"`, a colon and any whitespace a model puts between. */
const KEY_LOOKBEHIND = 64;

export function createFileStream(limits: StreamLimits = {}): FileStream {
  const { maxFiles, maxBytes, maxBuffer, maxStringChars, maxDepth } = { ...DEFAULTS, ...limits };

  let buffer = '';
  let scanned = 0;
  let inString = false;
  let escaped = false;
  let stringStart = 0;
  /**
   * Whether JSON has started.
   *
   * Without this the first `"` anywhere — including one in the sentence a
   * chatty model writes first — puts the scanner inside a string, and an odd
   * number of them swallows the whole answer.
   */
  let started = false;
  const stack: OpenContainer[] = [];

  const files: ProjectFile[] = [];
  const seenPaths = new Set<string>();
  let bytes = 0;
  let status: StreamStatus = 'ok';
  let reason: string | null = null;

  /**
   * The path named inside the file object that is still open, or null.
   *
   * Read over the whole open object rather than its first line: key order is
   * arbitrary, and `"path"` was observed *after* the file's entire content.
   */
  const openPath = (): string | null => {
    for (let index = stack.length - 1; index >= 0; index -= 1) {
      if (!stack[index].isObject) continue;
      // Only a file object has a path worth showing; an example object in the
      // model's prose has one too, and it is not being written.
      if (!stack[index - 1]?.isFileList) return null;

      const found = keyValue(buffer.slice(stack[index].start), 'path');
      return found === null || seenPaths.has(found) || !isUsablePath(found) ? null : found;
    }
    return null;
  };

  const stop = (why: string): void => {
    if (status === 'ok') {
      status = 'looping';
      reason = why;
    }
  };

  /** A closed object: a file if it has both string keys, ignored otherwise. */
  const closeObject = (raw: string, found: ProjectFile[]): void => {
    const parsed = tryParse(raw);
    if (!isProjectFile(parsed)) return;

    if (seenPaths.has(parsed.path)) {
      // The observed loop: the same file written again and again until the
      // token cap. One repeat is enough to know the rest is noise.
      stop(`the model wrote "${parsed.path}" twice`);
      return;
    }

    seenPaths.add(parsed.path);
    files.push(parsed);
    found.push(parsed);
    bytes += parsed.content.length;

    if (files.length > maxFiles) stop(`more than ${maxFiles} files`);
    else if (bytes > maxBytes) stop(`more than ${maxBytes} characters of code`);
  };

  const scan = (): ProjectFile[] => {
    const found: ProjectFile[] = [];

    for (let index = scanned; index < buffer.length; index += 1) {
      const char = buffer[index];

      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        else if (index - stringStart > maxStringChars) {
          // One string this long is a model repeating itself inside a single
          // file, where the repeated-path guard can never see it.
          stop(`one file passed ${maxStringChars} characters`);
          break;
        }
        continue;
      }

      // Prose before the JSON is skipped whole, quotes and all.
      if (!started) {
        if (char !== '{' && char !== '[') continue;
        started = true;
      }

      if (char === '"') {
        inString = true;
        stringStart = index;
      } else if (char === '{' || char === '[') {
        const isObject = char === '{';
        stack.push({
          start: index,
          isObject,
          // `"files": [`, or the bare top-level array that is the other shape
          // an answer may take. Any other array holds examples, not files.
          isFileList: !isObject && (
            stack.length === 0 || FILES_KEY.test(buffer.slice(Math.max(0, index - KEY_LOOKBEHIND), index))
          ),
        });
        if (stack.length > maxDepth) {
          stop('the response is nested far deeper than a file list');
          break;
        }
      } else if (char === '}' || char === ']') {
        const open = stack.pop();
        // A close with nothing open, or `}` closing a `[`, means the text was
        // never JSON — prose with braces in it. Skipping it costs nothing.
        if (open?.isObject && char === '}' && stack[stack.length - 1]?.isFileList) {
          closeObject(buffer.slice(open.start, index + 1), found);
          if (status === 'looping') {
            scanned = index + 1;
            return found;
          }
        }
        // The answer closed. Anything after it is prose again — a recap, a
        // fence, a sign-off — and must not be scanned as JSON.
        if (stack.length === 0) {
          started = false;
          inString = false;
          escaped = false;
        }
      }
    }

    scanned = buffer.length;
    return found;
  };

  return {
    push(chunk) {
      if (status === 'looping') return { files: [], status, reason };

      buffer += chunk;
      // Scanned before the size check, so files that closed inside this chunk
      // are kept even when it is the chunk that trips the guard.
      const found = scan();

      if (buffer.length > maxBuffer) {
        // This much text with nothing closing means one file is looping
        // inside its own string, where the repeated-path guard cannot see it.
        stop(`the response passed ${maxBuffer} characters`);
      }
      return { files: found, status, reason };
    },

    finish(tail = '') {
      if (tail && status === 'ok') {
        buffer += tail;
        scan();
      }

      const whole = parseProjectJson(buffer);
      // A response that parses whole is complete, however it was wrapped; one
      // that does not, with containers still open, was cut off mid-write.
      // Nothing open and nothing unterminated means the model finished writing
      // whatever it wrote, even when this app could not read it back.
      const balanced = stack.length === 0 && !inString;
      const truncated = whole === null && !balanced;

      if (whole) {
        // The scanner can only miss a file if the model wrote a duplicate or
        // the guard fired, and in both cases the extra files are the loop.
        for (const file of whole.files) {
          if (!seenPaths.has(file.path)) {
            seenPaths.add(file.path);
            files.push(file);
          }
        }
      }

      const incompletePath = truncated ? openPath() : null;

      return {
        files: [...files],
        truncated,
        status,
        reason,
        // Read leniently: on a truncated response the header is usually all
        // that survived, and `name` may sit after `files` in the object.
        name: whole?.name ?? keyValue(buffer, 'name'),
        summary: whole?.summary ?? keyValue(buffer, 'summary'),
        incompletePath,
      };
    },

    get pending() {
      return status === 'ok' ? openPath() : null;
    },

    get files() {
      return [...files];
    },

    get text() {
      return buffer;
    },
  };
}
