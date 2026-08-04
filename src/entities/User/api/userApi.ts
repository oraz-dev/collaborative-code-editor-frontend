import { authHttp } from '@/shared/api';
import { mapUser, type User, type UserResponseDto } from '../model/types/user';

/** Resolves the signed-in user from the bearer token currently in the store. */
export async function fetchCurrentUser(signal?: AbortSignal): Promise<User> {
  const dto = await authHttp<UserResponseDto>('/me', { method: 'GET', signal });
  return mapUser(dto);
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
