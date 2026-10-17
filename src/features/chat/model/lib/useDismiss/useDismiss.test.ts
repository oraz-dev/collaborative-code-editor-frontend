import { renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { useDismiss } from './useDismiss';

describe('useDismiss', () => {
  test('dismisses on Escape and on a press outside, not inside', () => {
    const inside = document.createElement('div');
    document.body.appendChild(inside);
    const refs = [{ current: inside }];
    const onDismiss = vi.fn();

    renderHook(() => useDismiss(true, onDismiss, refs));

    inside.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(onDismiss).not.toHaveBeenCalled();

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onDismiss).toHaveBeenCalledTimes(2);
    inside.remove();
  });

  test('does nothing while closed', () => {
    const onDismiss = vi.fn();
    renderHook(() => useDismiss(false, onDismiss, []));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
