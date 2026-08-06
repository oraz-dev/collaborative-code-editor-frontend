/**
 * Typefaces, self-hosted.
 *
 * Every font the design system names — Geist, Geist Mono, Newsreader — and
 * every option the editor font picker offers was previously declared in CSS
 * but never actually loaded, so the whole app rendered in system fallbacks and
 * switching the editor font between JetBrains Mono and Fira Code changed
 * nothing at all: all three choices resolved to the same `ui-monospace`.
 *
 * Bundled rather than pulled from a CDN, because the app is expected to keep
 * working offline and a blocked font request would silently undo all of this
 * again.
 */
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/newsreader';
// The dashboard greeting sets the display face in italic.
import '@fontsource-variable/newsreader/opsz-italic.css';

// Selectable editor faces.
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/fira-code';
