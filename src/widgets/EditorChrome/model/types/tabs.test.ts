import { closeTab, openTab, tabAfterClosing } from './tabs';

const A = { id: 'a', name: 'a.ts' };
const B = { id: 'b', name: 'b.ts' };
const C = { id: 'c', name: 'c.ts' };

describe('openTab', () => {
  test('appends a file that is not open yet', () => {
    expect(openTab([A], B)).toEqual([A, B]);
  });

  test('does not duplicate a file that is already open', () => {
    expect(openTab([A, B], A)).toEqual([A, B]);
  });

  test('keeps the same array when nothing changed, so memo holds', () => {
    const tabs = [A, B];
    expect(openTab(tabs, A)).toBe(tabs);
  });

  test('picks up a rename in place, keeping the tab position', () => {
    expect(openTab([A, B], { id: 'a', name: 'renamed.ts' }))
      .toEqual([{ id: 'a', name: 'renamed.ts' }, B]);
  });
});

describe('closeTab', () => {
  test('drops only the closed file', () => {
    expect(closeTab([A, B], 'a')).toEqual([B]);
  });
});

describe('tabAfterClosing', () => {
  test('focuses the tab to the right', () => {
    expect(tabAfterClosing([A, B, C], 'b')).toEqual(C);
  });

  test('falls back to the left when closing the last tab', () => {
    expect(tabAfterClosing([A, B], 'b')).toEqual(A);
  });

  test('returns nothing when the strip empties', () => {
    expect(tabAfterClosing([A], 'a')).toBeNull();
  });

  test('returns nothing for a file that is not open', () => {
    expect(tabAfterClosing([A], 'zzz')).toBeNull();
  });
});
