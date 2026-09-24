/**
 * AI code completion: ghost text while typing when a fast backend exists, and
 * an explicit Cmd+I completion that always works.
 *
 * Nothing is downloaded to the browser and no key is stored in it. Both
 * backends are this app's own origin — `/api/ai/fast/v1` and `/api/ai/v1` —
 * and both provider keys live in the server's environment.
 */

export {
  cleanCompletion,
  completionContext,
  completionMessages,
  COMPLETION_SYSTEM_PROMPT,
  MAX_COMPLETION_CHARS,
  PREFIX_LIMIT,
  SUFFIX_LIMIT,
} from './model/completionPrompt/completionPrompt';
export type { CleanOptions, CompletionContext, CompletionSite } from './model/completionPrompt/completionPrompt';

export {
  CompletionError,
  EXCLUDED_MODELS,
  FAST_MODEL_FALLBACK,
  FAST_MODEL_PREFERENCES,
  FAST_PROXY_BASE_URL,
  pickFastModel,
  probeFastBackend,
  requestCompletion,
} from './model/completionBackend/completionBackend';
export type {
  CompletionBackend,
  CompletionRequest,
  FastBackendState,
  FastProbe,
} from './model/completionBackend/completionBackend';

export { COMPLETION_CACHE_SIZE, createCompletionCache } from './model/completionCache/completionCache';
export type { CompletionCache } from './model/completionCache/completionCache';

export {
  COMPLETION_LANGUAGES,
  completionStatusStore,
  createCompletionStatusStore,
  createInlineCompletionsProvider,
  IDLE_DEBOUNCE_MS,
  isMidWord,
  lineTailBlocks,
  MAX_COMPLETION_TOKENS,
  useCompletionStatus,
} from './model/inlineCompletions/inlineCompletions';
export type {
  CompletionStatus,
  CompletionStatusStore,
  InlineCompletionsDeps,
  InlineCompletionsProviderHandle,
} from './model/inlineCompletions/inlineCompletions';

export {
  COMPLETE_SETTINGS_STORAGE_KEY,
  completeSettingsStore,
  DEFAULT_COMPLETE_SETTINGS,
  useCompleteSettings,
} from './model/completeSettings/completeSettings';
export type { CompleteMode, CompleteSettings } from './model/completeSettings/completeSettings';

export {
  ensureFastBackend,
  refreshFastBackend,
  resetFastBackend,
  useAiComplete,
} from './model/useAiComplete/useAiComplete';

export { AiCompleteStatus } from './ui/AiCompleteStatus/AiCompleteStatus';
export { AiCompleteSettingsSection } from './ui/AiCompleteSettingsSection/AiCompleteSettingsSection';
