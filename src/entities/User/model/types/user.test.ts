import { describe, expect, test } from 'vitest';
import { mapUser } from './user';

describe('mapUser', () => {
  test('maps the auth service response', () => {
    expect(mapUser({
      id: 'user-1',
      email: 'ada@example.com',
      username: 'ada',
      display_name: 'Ada Lovelace',
      created_at: '2026-07-28T16:39:47Z',
    })).toEqual({
      id: 'user-1',
      email: 'ada@example.com',
      username: 'ada',
      displayName: 'Ada Lovelace',
      avatarUrl: null,
      createdAt: '2026-07-28T16:39:47Z',
    });
  });

  test('falls back through username then email for a display name', () => {
    expect(mapUser({ username: 'ada' }).displayName).toBe('ada');
    expect(mapUser({ email: 'ada@example.com' }).displayName).toBe('ada@example.com');
    expect(mapUser({}).displayName).toBe('Unknown');
  });

  test('drops the zero-value timestamp the register response returns', () => {
    expect(mapUser({ id: 'a', created_at: '0001-01-01T00:00:00Z' }).createdAt).toBeNull();
  });
});
