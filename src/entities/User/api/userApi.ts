import { authHttp } from '@/shared/api';
import { mapUser, type User, type UserResponseDto } from '../model/types/user';

/** Resolves the signed-in user from the bearer token currently in the store. */
export async function fetchCurrentUser(signal?: AbortSignal): Promise<User> {
  const dto = await authHttp<UserResponseDto>('/me', { method: 'GET', signal });
  return mapUser(dto);
}
