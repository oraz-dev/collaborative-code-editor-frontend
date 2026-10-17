import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ChatThemePicker } from './ChatThemePicker';

function setup(skin: Parameters<typeof ChatThemePicker>[0]['skin'] = 'classic') {
  const props = { skin, accent: 'mint' as const, onSkinChange: vi.fn(), onAccentChange: vi.fn() };
  render(<ChatThemePicker {...props} />);
  return props;
}

describe('ChatThemePicker', () => {
  test('previews all twenty themes and marks the current one', () => {
    setup('doodle');
    expect(screen.getAllByTestId('chat-theme-option')).toHaveLength(20);
    expect(screen.getByRole('button', { name: 'Doodle theme' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('picks a theme', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Windows 95 theme' }));
    expect(props.onSkinChange).toHaveBeenCalledWith('win95');
  });

  test('filters by group', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Seasonal' }));
    expect(screen.getAllByTestId('chat-theme-option').map((el) => el.getAttribute('aria-label')))
      .toEqual(['Spooky theme', 'Snow theme']);
  });

  test('Surprise me picks a different theme', async () => {
    const props = setup('classic');
    await userEvent.click(screen.getByRole('button', { name: 'Pick a random theme' }));
    expect(props.onSkinChange).toHaveBeenCalledTimes(1);
    expect(props.onSkinChange.mock.calls[0][0]).not.toBe('classic');
  });

  test('offers bubble colours only for Classic', async () => {
    const props = setup('classic');
    await userEvent.click(screen.getByRole('button', { name: 'Pink bubbles' }));
    expect(props.onAccentChange).toHaveBeenCalledWith('pink');
  });

  test('hides bubble colours for other themes', () => {
    setup('neon');
    expect(screen.queryByRole('group', { name: 'Bubble colour' })).not.toBeInTheDocument();
  });
});
