import { act, renderHook } from '@testing-library/react';
import * as Y from 'yjs';
import { useLiveText } from './useLiveText';

function makeText(initial: string): Y.Text {
  const doc = new Y.Doc();
  const text = doc.getText('shared');
  text.insert(0, initial);
  return text;
}

describe('useLiveText', () => {
  test('falls back to the saved content until a session exists', () => {
    const { result } = renderHook(() => useLiveText(null, '<svg />'));

    expect(result.current).toBe('<svg />');
  });

  test('prefers the shared buffer once there is one', () => {
    const text = makeText('<svg id="live" />');
    const { result } = renderHook(() => useLiveText(text, '<svg id="saved" />'));

    expect(result.current).toBe('<svg id="live" />');
  });

  test('follows edits, wherever they came from', () => {
    const text = makeText('<svg>');
    const { result } = renderHook(() => useLiveText(text, ''));

    act(() => {
      text.insert(5, '<rect />');
    });

    expect(result.current).toBe('<svg><rect />');
  });

  test('stops observing a buffer it has let go of', () => {
    const text = makeText('a');
    const { unmount } = renderHook(() => useLiveText(text, ''));
    unmount();

    // Would throw inside the observer if the subscription had outlived us.
    expect(() => text.insert(1, 'b')).not.toThrow();
    expect(text.toString()).toBe('ab');
  });
});
