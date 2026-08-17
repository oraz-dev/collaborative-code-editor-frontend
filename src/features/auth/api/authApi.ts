import { authHttp, tokenStore } from '@/shared/api';
import { mapUser, type User, type UserResponseDto } from '@/entities/User';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterPayload extends LoginCredentials {
  username: string;
  displayName: string;
}

interface TokenResponseDto {
  access_token?: string;
}

/**
 * Exchanges credentials for a short-lived access token. The matching refresh
 * token comes back as an HttpOnly cookie, which is why nothing is persisted
 * here beyond the in-memory token.
 *
 * `auth: false` keeps a wrong-password 401 from being mistaken for an expired
 * session and triggering a pointless refresh round-trip.
 */
export async function login(credentials: LoginCredentials): Promise<string> {
  const data = await authHttp<TokenResponseDto>('/auth/login', {
    method: 'POST',
    body: credentials,
    auth: false,
  });

  if (!data.access_token) {
    throw new Error('Sign-in succeeded but no access token was returned.');
  }

  tokenStore.set(data.access_token);
  return data.access_token;
}

/** Creates the account. The service does not return tokens, so callers sign in after. */
export async function register(payload: RegisterPayload): Promise<User> {
  const dto = await authHttp<UserResponseDto>('/auth/register', {
    method: 'POST',
    body: {
      email: payload.email,
      password: payload.password,
      username: payload.username,
      display_name: payload.displayName,
    },
    auth: false,
  });

  return mapUser(dto);
}

/** Best-effort: the local session is dropped even if the server call fails. */
export async function logout(): Promise<void> {
  try {
    await authHttp<void>('/auth/logout', { method: 'POST' });
  } finally {
    tokenStore.clear();
  }
}

export async function logoutAllDevices(): Promise<void> {
  try {
    await authHttp<void>('/auth/logout-all', { method: 'POST' });
  } finally {
    tokenStore.clear();
  }
}
