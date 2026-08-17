import { initials } from './initials';

describe('initials', () => {
  test('takes the first and last name', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
  });

  test('skips the middle names', () => {
    expect(initials('Ada King Lovelace')).toBe('AL');
  });

  test('gives a single word two letters rather than one', () => {
    expect(initials('orr')).toBe('OR');
  });

  test('survives the extra whitespace the API sends', () => {
    expect(initials('  Ada   Lovelace ')).toBe('AL');
  });

  test('falls back to a placeholder for an unresolved name', () => {
    // Collaborators come back from the document service with empty names.
    expect(initials('')).toBe('?');
  });
});
