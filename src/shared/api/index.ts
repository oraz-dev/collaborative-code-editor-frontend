import { AUTH_BASE_URL, DOCS_BASE_URL } from './config/apiConfig';
import { createHttpClient } from './lib/httpClient/httpClient';

export const authHttp = createHttpClient(AUTH_BASE_URL);
export const docsHttp = createHttpClient(DOCS_BASE_URL);

export { ApiError, isApiError } from './lib/ApiError/ApiError';
export type { ApiErrorKind } from './lib/ApiError/ApiError';
export { tokenStore, readUserIdFromToken } from './lib/tokenStore/tokenStore';
export { onSessionExpired } from './lib/sessionEvents/sessionEvents';
export { queryKeys } from './lib/queryKeys/queryKeys';
export { refreshAccessToken } from './lib/httpClient/httpClient';
export type { HttpRequestOptions } from './lib/httpClient/httpClient';
export {
  AUTH_BASE_URL,
  DOCS_BASE_URL,
  WS_TICKET_TTL_MS,
  REQUEST_TIMEOUT_MS,
  resolveWebSocketUrl,
} from './config/apiConfig';
