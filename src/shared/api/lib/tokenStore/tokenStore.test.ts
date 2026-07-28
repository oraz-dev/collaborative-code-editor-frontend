import { beforeEach, describe, expect, test, vi } from 'vitest';
import { readUserIdFromToken, tokenStore } from './tokenStore';

describe('tokenStore', () => {
  beforeEach(() => {
    tokenStore.clear();
  });

  test('stores and clears the access token', () => {
    tokenStore.set('abc');
    expect(tokenStore.get()).toBe('abc');
    tokenStore.clear();
    expect(tokenStore.get()).toBeNull();
  });

  test('notifies subscribers only when the value actually changes', () => {
    const listener = vi.fn();
    const unsubscribe = tokenStore.subscribe(listener);

    tokenStore.set('abc');
    tokenStore.set('abc');
    expect(listener).toHaveBeenCalledTimes(1);

    tokenStore.set('def');
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    tokenStore.set('ghi');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('readUserIdFromToken', () => {
  test('reads the sub claim', () => {
    // header.payload.signature with sub = the user id
    const payload = btoa(JSON.stringify({ sub: '6f6483f1-276c-4434-acce-e6566bfb1b5b' }))
      .replace(/=/g, '');
    expect(readUserIdFromToken(`x.${payload}.y`)).toBe('6f6483f1-276c-4434-acce-e6566bfb1b5b');
  });

  test('returns null for anything unreadable', () => {
    expect(readUserIdFromToken(null)).toBeNull();
    expect(readUserIdFromToken('')).toBeNull();
    expect(readUserIdFromToken('not-a-jwt')).toBeNull();
    expect(readUserIdFromToken('x.@@@.y')).toBeNull();
  });
});
