export {
  createOpenRouterClient,
  isOpenRouterError,
  OpenRouterError,
  OPENROUTER_BASE_URL,
  redact,
} from './model/openrouter/openrouter';
export type {
  ChatMessage,
  ChatRequest,
  ChatResult,
  ChatUsage,
  FreeModel,
  JsonSchemaSpec,
  KeyInfo,
  OpenRouterAuthMode,
  OpenRouterClient,
  OpenRouterClientOptions,
  OpenRouterErrorKind,
} from './model/openrouter/openrouter';

// The assistant is reached through this app, with the user's session; the
// OpenRouter key lives in the server's environment and is added there.
export { AI_PROXY_BASE_URL, createProxyFetch } from './model/aiProxy/aiProxy';

export {
  DEFAULT_MODEL,
  findModel,
  FREE_MODEL_CHAIN,
  MIN_USEFUL_OUTPUT,
  modelLabel,
  nextModel,
  rankFreeModels,
} from './model/modelChain/modelChain';
export type { ChainModel, NextModelOptions } from './model/modelChain/modelChain';

export { createFileStream, parseProjectJson } from './model/streamJson/streamJson';
export type {
  FileStream,
  FinishResult,
  ProjectFile,
  PushResult,
  StreamLimits,
  StreamStatus,
} from './model/streamJson/streamJson';

export {
  generateMessages,
  planMessages,
  PLAN_SCHEMA,
  PROJECT_SCHEMA,
  repairMessages,
  RUNTIME_RULES,
  SYSTEM_PROMPT,
  TAILWIND_CDN,
} from './model/prompts/prompts';
export type { GeneratedProject, PlannedFile, ProjectPlan } from './model/prompts/prompts';

export { parseLooseJson } from './model/streamJson/streamJson';

export {
  AI_SETTINGS_STORAGE_KEY,
  DEFAULT_AI_SETTINGS,
  aiSettingsStore,
  useAiSettings,
} from './model/aiSettings/aiSettings';
export type { AiSettings } from './model/aiSettings/aiSettings';

export {
  hasBlockingProblems,
  repairHints,
  usesTailwind,
  validateProject,
} from './model/validateProject/validateProject';
export type { ProjectProblem, ValidationReport } from './model/validateProject/validateProject';

export {
  createProjectDocuments,
  folderPaths,
  isProjectCreationError,
  ProjectCreationError,
  uniqueName,
} from './model/createProjectDocuments/createProjectDocuments';
export type {
  CreateDocumentFn,
  CreatedDocument,
  CreateProjectInput,
  CreateProjectProgress,
  CreateProjectResult,
} from './model/createProjectDocuments/createProjectDocuments';

export { useOpenRouterClient } from './model/useOpenRouterClient/useOpenRouterClient';

export {
  describeAttempts,
  mergeFiles,
  missingPaths,
  readPlan,
  useProjectGenerator,
} from './model/useProjectGenerator/useProjectGenerator';
export type {
  AttemptOutcome,
  GeneratorPhase,
  GeneratorState,
  ModelAttempt,
  ProjectGenerator,
  ProjectGeneratorOptions,
  StreamProgress,
} from './model/useProjectGenerator/useProjectGenerator';

// The UI: the dialog is the pure view over a generator, the flow is that view
// wired to this app's session, documents and settings, and the section is the
// screen where the model and the fallback are chosen.
export { GenerateProjectDialog } from './ui/GenerateProjectDialog/GenerateProjectDialog';
export type { GenerateProjectDialogProps } from './ui/GenerateProjectDialog/GenerateProjectDialog';
export { GenerateProjectFlow } from './ui/GenerateProjectFlow/GenerateProjectFlow';
export { AiSettingsSection } from './ui/AiSettingsSection/AiSettingsSection';
