/** Wire shape returned by the auth service (snake_case). */
export interface UserResponseDto {
  id?: string;
  email?: string;
  username?: string;
  display_name?: string;
  avatar_url?: string;
  created_at?: string;
}

/** Domain shape used everywhere in the app. */
export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string | null;
}

/**
 * The service omits fields it has no value for and returns a zero-value
 * timestamp (`0001-01-01T00:00:00Z`) on the register response, so anything
 * missing or zero is normalised to a sensible default here.
 */
export function mapUser(dto: UserResponseDto): User {
  const createdAt = dto.created_at && !dto.created_at.startsWith('0001-01-01')
    ? dto.created_at
    : null;

  return {
    id: dto.id ?? '',
    email: dto.email ?? '',
    username: dto.username ?? '',
    displayName: dto.display_name || dto.username || dto.email || 'Unknown',
    avatarUrl: dto.avatar_url || null,
    createdAt,
  };
}
