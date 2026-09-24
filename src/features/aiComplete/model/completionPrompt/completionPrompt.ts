import type { ChatMessage } from '@/features/aiProjects';
import { languageFromFileName } from '@/shared/lib/language/language';

/**
 * The request a completion is made of, and the answer's way back to code.
 *
 * Everything here is pure: text in, messages out, text in, text out. The
 * window is deliberately tiny — a completion that arrives after the next
 * keystroke is worth nothing, and the prompt is the only part of the latency
 * this app controls. Two hundred lines of context would read better and land
 * too late.
 */

/**
 * Characters of code kept before the cursor. About thirty lines: enough for
 * the current function and its imports, small enough to send on every pause.
 */
export const PREFIX_LIMIT = 1500;

/** Characters kept after the cursor — just enough to know what is being written into. */
export const SUFFIX_LIMIT = 400;

/**
 * Hard cap on what is accepted back. A model that ignores the instructions and
 * writes a whole file must not be able to paste one into the document.
 */
export const MAX_COMPLETION_CHARS = 400;

/**
 * The model is told three things, because each one is a failure seen in
 * practice: prose around the code, a fence around the code, and the line the
 * user already typed repeated back before the new part.
 */
export const COMPLETION_SYSTEM_PROMPT = [
  'You are a code completion engine inside an editor.',
  'Reply with the raw continuation at the cursor and nothing else.',
  'No prose, no explanation, no markdown fences, no language tag.',
  'Never repeat code that is already before or after the cursor.',
  'Write only what should be inserted at the cursor. If nothing should be inserted, reply with an empty string.',
].join(' ');

export interface CompletionSite {
  /** The whole document. */
  text: string;
  /** The cursor as a UTF-16 offset into `text`. */
  offset: number;
  /** The file's path, which tells the model the language and the project. */
  filePath: string;
}

export interface CompletionContext {
  filePath: string;
  /** Monaco's language id, e.g. `typescript`. */
  language: string;
  textBeforeCursor: string;
  textAfterCursor: string;
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * Whether `index` falls between the two halves of an astral character.
 *
 * Every limit here is measured in UTF-16 units, so an emoji or a rare CJK
 * character sitting on the boundary would otherwise be cut in half and sent as
 * a lone surrogate — which is not text, and which some JSON encoders replace
 * with U+FFFD before it ever reaches the model.
 */
function splitsPair(text: string, index: number): boolean {
  return index > 0
    && index < text.length
    && isHighSurrogate(text.charCodeAt(index - 1))
    && isLowSurrogate(text.charCodeAt(index));
}

/** The nearest boundary at or after `index` that keeps every pair whole. */
function startAt(text: string, index: number): number {
  return splitsPair(text, index) ? index + 1 : index;
}

/** The nearest boundary at or before `index` that keeps every pair whole. */
function endAt(text: string, index: number): number {
  return splitsPair(text, index) ? index - 1 : index;
}

/**
 * The window around the cursor, clamped and never split mid-character.
 *
 * A cursor that itself lands inside a pair is snapped backwards, so the whole
 * character belongs to the text after it rather than being torn in two.
 */
export function completionContext(site: CompletionSite): CompletionContext {
  const { text, filePath } = site;
  const cursor = endAt(text, Math.max(0, Math.min(site.offset, text.length)));

  const prefixStart = startAt(text, Math.max(0, cursor - PREFIX_LIMIT));
  const suffixEnd = endAt(text, Math.min(text.length, cursor + SUFFIX_LIMIT));

  return {
    filePath,
    language: languageFromFileName(filePath),
    textBeforeCursor: text.slice(prefixStart, cursor),
    textAfterCursor: text.slice(cursor, suffixEnd),
  };
}

/**
 * The two messages sent for one completion.
 *
 * The delimiters are spelled out because the halves of a file are being handed
 * over out of order: without them a model reads the suffix as more prefix and
 * completes the wrong end of the function.
 */
export function completionMessages(context: CompletionContext): ChatMessage[] {
  const user = [
    `File: ${context.filePath}`,
    `Language: ${context.language}`,
    '',
    '<before_cursor>',
    context.textBeforeCursor,
    '</before_cursor>',
    '<after_cursor>',
    context.textAfterCursor,
    '</after_cursor>',
    '',
    'Continue the code at the cursor, which sits exactly between the two sections above.',
  ].join('\n');

  return [
    { role: 'system', content: COMPLETION_SYSTEM_PROMPT },
    { role: 'user', content: user },
  ];
}

/** ```ts … ``` — the first fenced block, which is the answer when there is one. */
const FENCED_BLOCK = /```[^\n]*\n([\s\S]*?)```/;
/** An unterminated fence: the model opened one and ran out of tokens. */
const OPEN_FENCE = /^\s*```[^\n]*\n?/;

/**
 * Sentences a model writes around code it was asked to hand over bare: a
 * capitalised line ending in a colon ("Here is the completion:"), or an
 * opening it has been told twice not to write.
 */
const LEADING_PROSE = [
  /^[A-Z][^\n]*:\s*$/,
  /^(sure|certainly|of course|here|okay|ok)\b[^\n]*$/i,
];

/** The same at the end: an explanation of what was just written. */
const TRAILING_PROSE = [
  /^(this|that|note|hope|the above|explanation)\b[^\n]*$/i,
];

function stripFences(raw: string): string {
  const fenced = FENCED_BLOCK.exec(raw);
  // Everything outside the block is prose by definition — the model was asked
  // for code only, so a fence means the code is what is inside it.
  if (fenced) return fenced[1];
  if (OPEN_FENCE.test(raw)) return raw.replace(OPEN_FENCE, '').replace(/```\s*$/, '');
  return raw;
}

function stripProse(text: string): string {
  const lines = text.split('\n');

  while (lines.length > 0 && LEADING_PROSE.some((pattern) => pattern.test(lines[0].trim()))) {
    lines.shift();
  }
  while (lines.length > 0 && TRAILING_PROSE.some((pattern) => pattern.test(lines[lines.length - 1].trim()))) {
    lines.pop();
  }

  return lines.join('\n');
}

export interface CleanOptions {
  /** The text the completion would be inserted in front of. */
  textAfterCursor: string;
  /** True while a completion may not span lines. */
  singleLine?: boolean;
}

/**
 * The model's answer as something that can be inserted, or nothing.
 *
 * Nothing is the common case and not a failure: a model asked to continue a
 * finished line answers with the line, or with a paragraph about it, and both
 * are worse than no suggestion at all.
 */
export function cleanCompletion(raw: string, options: CleanOptions): string {
  if (typeof raw !== 'string' || raw.length === 0) return '';

  let text = stripProse(stripFences(raw));

  // A leading blank line is the model starting a new line the cursor is
  // already on; indentation on the first line, by contrast, can be real.
  text = text.replace(/^\n+/, '');
  if (options.singleLine) {
    const newline = text.indexOf('\n');
    if (newline !== -1) text = text.slice(0, newline);
  }
  text = text.replace(/\s+$/, '');

  // Whitespace only: whatever the model meant, inserting it moves the caret
  // and suggests nothing, which reads as the editor glitching.
  if (text.trim().length === 0) return '';

  // The classic failure of a fill-in-the-middle prompt: the model reads the
  // suffix as the thing to write and hands back what is already on screen.
  const ahead = options.textAfterCursor.trimStart();
  const body = text.trim();
  if (ahead.length > 0 && ahead.startsWith(body)) return '';

  return text.length > MAX_COMPLETION_CHARS ? text.slice(0, MAX_COMPLETION_CHARS) : text;
}
