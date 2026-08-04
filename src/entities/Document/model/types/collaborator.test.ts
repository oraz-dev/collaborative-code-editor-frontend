import { describe, expect, test } from 'vitest';
import {
  canEditWithRole,
  mapCollaborator,
  mapCollaborators,
  sortCollaborators,
  toDocumentRole,
} from './collaborator';

describe('toDocumentRole', () => {
  test('recognises the three real roles', () => {
    expect(toDocumentRole('owner')).toBe('owner');
    expect(toDocumentRole('editor')).toBe('editor');
    expect(toDocumentRole('viewer')).toBe('viewer');
  });

  test('falls back to viewer for anything unexpected', () => {
    // Defaulting to the least privileged role means an unknown value can never
    // accidentally grant write access.
    expect(toDocumentRole('admin')).toBe('viewer');
    expect(toDocumentRole('')).toBe('viewer');
    expect(toDocumentRole(undefined)).toBe('viewer');
  });
});

describe('canEditWithRole', () => {
  test('only owner and editor may write', () => {
    expect(canEditWithRole('owner')).toBe(true);
    expect(canEditWithRole('editor')).toBe(true);
    expect(canEditWithRole('viewer')).toBe(false);
  });
});

describe('mapCollaborator', () => {
  test('maps the wire shape', () => {
    expect(mapCollaborator({
      user_id: 'u1',
      username: 'ada',
      display_name: 'Ada Lovelace',
      role: 'editor',
      created_at: '2026-07-28T10:00:00Z',
    })).toEqual({
      userId: 'u1',
      username: 'ada',
      displayName: 'Ada Lovelace',
      avatarUrl: null,
      role: 'editor',
      createdAt: '2026-07-28T10:00:00Z',
    });
  });

  test('stays readable when the auth service could not resolve the profile', () => {
    // Only user_id and role are guaranteed; profile fields come back empty.
    const mapped = mapCollaborator({ user_id: '6f6483f1-276c-4434', role: 'viewer' });
    expect(mapped.displayName).toBe('User 6f6483f1');
    expect(mapped.role).toBe('viewer');
  });

  test('falls back to username when there is no display name', () => {
    expect(mapCollaborator({ user_id: 'u1', username: 'ada' }).displayName).toBe('ada');
  });
});

describe('mapCollaborators', () => {
  test('tolerates a null list', () => {
    expect(mapCollaborators(null)).toEqual([]);
    expect(mapCollaborators(undefined)).toEqual([]);
  });
});

describe('sortCollaborators', () => {
  test('puts the most privileged first', () => {
    const list = mapCollaborators([
      { user_id: '1', display_name: 'Zoe', role: 'viewer' },
      { user_id: '2', display_name: 'Ada', role: 'owner' },
      { user_id: '3', display_name: 'Mira', role: 'editor' },
      { user_id: '4', display_name: 'Ben', role: 'editor' },
    ]);

    expect(sortCollaborators(list).map((c) => c.displayName))
      .toEqual(['Ada', 'Ben', 'Mira', 'Zoe']);
  });

  test('does not mutate the input', () => {
    const list = mapCollaborators([
      { user_id: '1', display_name: 'Zoe', role: 'viewer' },
      { user_id: '2', display_name: 'Ada', role: 'owner' },
    ]);
    const original = [...list];
    sortCollaborators(list);
    expect(list).toEqual(original);
  });
});
