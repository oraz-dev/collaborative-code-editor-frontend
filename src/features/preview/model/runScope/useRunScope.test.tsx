import { act, renderHook } from '@testing-library/react';
import { useRunScope } from './useRunScope';

describe('useRunScope', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  test('runs the project by default', () => {
    const { result } = renderHook(() => useRunScope());
    expect(result.current[0]).toBe('project');
  });

  test('remembers the choice for the session, across mounts', () => {
    const first = renderHook(() => useRunScope());
    act(() => first.result.current[1]('file'));
    expect(first.result.current[0]).toBe('file');
    first.unmount();

    const second = renderHook(() => useRunScope());
    expect(second.result.current[0]).toBe('file');
    expect(window.sessionStorage.getItem('preview.runScope')).toBe('file');
  });

  test('every mounted user sees a change', () => {
    const a = renderHook(() => useRunScope());
    const b = renderHook(() => useRunScope());
    act(() => a.result.current[1]('file'));
    expect(b.result.current[0]).toBe('file');
  });

  test('ignores a stored value it does not know', () => {
    window.sessionStorage.setItem('preview.runScope', 'everything');
    const { result } = renderHook(() => useRunScope());
    expect(result.current[0]).toBe('project');
  });

  test('still works when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const { result } = renderHook(() => useRunScope());
    act(() => result.current[1]('file'));
    expect(result.current[0]).toBe('file');
    act(() => result.current[1]('project'));
    expect(result.current[0]).toBe('project');
  });
});
