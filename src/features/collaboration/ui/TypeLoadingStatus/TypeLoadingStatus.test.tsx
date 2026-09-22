import { act, fireEvent, render, screen } from '@testing-library/react';
import type { PackageProgress, TypeProgressSnapshot } from '../../model/typeSupport/typeProgress/typeProgress';
import { DONE_LINGER_MS, SHOW_DELAY_MS, TypeLoadingStatus } from './TypeLoadingStatus';

function entry(name: string, overrides: Partial<PackageProgress> = {}): PackageProgress {
  return {
    name, status: 'loading', source: name, version: '1.0.0', filesDone: 0, filesFound: 0, percent: 0, ...overrides,
  };
}

function snapshot(packages: PackageProgress[]): TypeProgressSnapshot {
  const settled = packages.filter((item) => item.status !== 'loading').length;
  return {
    packages,
    active: settled < packages.length,
    settled,
    total: packages.length,
    percent: Math.round(packages.reduce((sum, item) => sum + item.percent, 0) / packages.length),
  };
}

const loading = snapshot([
  entry('react', { status: 'ready', source: '@types/react', version: '19.2.2', filesFound: 12, filesDone: 12, percent: 100 }),
  entry('date-fns', { filesDone: 142, filesFound: 381, percent: 37 }),
]);
const ready = snapshot(loading.packages.map((item) => ({ ...item, status: 'ready' as const, percent: 100 })));

const isShown = () => screen.getByTestId('type-loading-status').className.includes('shown');

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('TypeLoadingStatus', () => {
  test('types that load at once — from the cache — never show at all', () => {
    const { rerender } = render(<TypeLoadingStatus snapshot={loading} />);
    act(() => vi.advanceTimersByTime(SHOW_DELAY_MS - 50));
    rerender(<TypeLoadingStatus snapshot={ready} />);
    act(() => vi.advanceTimersByTime(DONE_LINGER_MS));

    expect(isShown()).toBe(false);
  });

  test('a load that takes a while shows a bar and a count, and announces itself once', () => {
    render(<TypeLoadingStatus snapshot={loading} />);
    act(() => vi.advanceTimersByTime(SHOW_DELAY_MS));

    expect(isShown()).toBe(true);
    expect(screen.getByRole('button', { name: /1 of 2 ready, 69%/ })).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading types for 2 packages');
  });

  test('settles to "Types ready", then folds away', () => {
    const { rerender } = render(<TypeLoadingStatus snapshot={loading} />);
    act(() => vi.advanceTimersByTime(SHOW_DELAY_MS));
    rerender(<TypeLoadingStatus snapshot={ready} />);

    expect(screen.getByRole('button', { name: /Types ready/ })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(DONE_LINGER_MS));
    expect(isShown()).toBe(false);
  });

  test('a failed download stays, and can be retried from the panel', () => {
    const onRetry = vi.fn();
    const failed = snapshot([entry('zustand', { status: 'failed', percent: 100 })]);
    render(<TypeLoadingStatus snapshot={failed} onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: /Types: 1 failed/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry downloading types for zustand' }));

    expect(onRetry).toHaveBeenCalledWith('zustand');
    act(() => vi.advanceTimersByTime(DONE_LINGER_MS * 2));
    expect(isShown()).toBe(true);
  });

  test('the panel lists each package: files, version, and where its types come from', () => {
    render(<TypeLoadingStatus snapshot={loading} />);
    act(() => vi.advanceTimersByTime(SHOW_DELAY_MS));
    fireEvent.click(screen.getByRole('button', { name: /Show details/ }));

    const panel = screen.getByRole('dialog', { name: 'Package types' });
    expect(panel).toHaveTextContent('142 / 381 files');
    expect(panel).toHaveTextContent('v19.2.2 · via @types/react');
    expect(screen.getByRole('progressbar', { name: 'Types for date-fns' })).toHaveAttribute('aria-valuenow', '37');
  });

  test('Escape closes the panel and returns focus to the item', () => {
    render(<TypeLoadingStatus snapshot={loading} />);
    act(() => vi.advanceTimersByTime(SHOW_DELAY_MS));
    const trigger = screen.getByRole('button', { name: /Show details/ });
    fireEvent.click(trigger);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  test('a click elsewhere closes the panel', () => {
    render(<TypeLoadingStatus snapshot={loading} />);
    act(() => vi.advanceTimersByTime(SHOW_DELAY_MS));
    fireEvent.click(screen.getByRole('button', { name: /Show details/ }));

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('its ticking counters are kept out of the status bar’s live region', () => {
    render(<TypeLoadingStatus snapshot={loading} />);
    expect(screen.getByTestId('type-loading-status')).toHaveAttribute('aria-live', 'off');
  });
});
