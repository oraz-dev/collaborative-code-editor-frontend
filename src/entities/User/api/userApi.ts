import { authHttp } from '@/shared/api';
import { mapUser, type User, type UserResponseDto } from '../model/types/user';

/** Resolves the signed-in user from the bearer token currently in the store. */
export async function fetchCurrentUser(signal?: AbortSignal): Promise<User> {
  const dto = await authHttp<UserResponseDto>('/auth/me', { method: 'GET', signal });
  return mapUser(dto);
}

/**
 * Resolves a batch of user ids to public profiles.
 *
 * Needed because the document service currently returns collaborators with
 * empty `username` / `display_name`, so names are filled in from here instead
 * of rendering a row identified only by a uuid.
 */
export async function fetchUsersByIds(ids: string[], signal?: AbortSignal): Promise<User[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return [];

  const data = await authHttp<UserResponseDto[] | { users?: UserResponseDto[] }>(
    `/users?ids=${encodeURIComponent(unique.join(','))}`,
    { method: 'GET', signal },
  );

  const list = Array.isArray(data) ? data : data?.users;
  if (!Array.isArray(list)) return [];

  // Ids that don't exist are omitted by the service rather than erroring.
  return list.map(mapUser).filter((user) => Boolean(user.id));
}

/**
 * Turns a username or email into the user id that sharing expects.
 *
 * The response may come back either as a bare array or wrapped in `{ users }`,
 * so both are accepted rather than assuming one.
 */
export async function searchUsers(query: string, signal?: AbortSignal): Promise<User[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const data = await authHttp<UserResponseDto[] | { users?: UserResponseDto[] }>(
    `/users?query=${encodeURIComponent(trimmed)}`,
    { method: 'GET', signal },
  );

  const list = Array.isArray(data) ? data : data?.users;
  if (!Array.isArray(list)) return [];

  return list.map(mapUser).filter((user) => Boolean(user.id));
}
