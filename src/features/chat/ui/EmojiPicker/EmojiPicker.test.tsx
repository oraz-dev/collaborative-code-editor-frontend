import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { EmojiPicker } from './EmojiPicker';

vi.mock('../../model/lib/searchEmoji/searchEmoji', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../model/lib/searchEmoji/searchEmoji')>();
  return {
    ...actual,
    loadEmojiKeywords: () => Promise.resolve({ '🦀': ['crab', 'rust'], '🔥': ['fire', 'lit'] }),
  };
});

describe('EmojiPicker', () => {
  test('lists recent emoji and every category', () => {
    render(<EmojiPicker recent={['🦀']} onPick={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Recently used' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Flags' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Dev & code' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(11);
  });

  test('picks an emoji', async () => {
    const onPick = vi.fn();
    render(<EmojiPicker recent={['🦀']} onPick={onPick} />);
    await userEvent.click(screen.getAllByText('🦀')[0]);
    expect(onPick).toHaveBeenCalledWith('🦀');
  });

  test('searches by keyword', async () => {
    render(<EmojiPicker recent={[]} onPick={vi.fn()} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search emoji' }), 'rust');
    await waitFor(() => expect(screen.getAllByTestId('emoji-option').map((el) => el.textContent)).toEqual(['🦀']));
  });

  test('says when nothing matches', async () => {
    render(<EmojiPicker recent={[]} onPick={vi.fn()} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search emoji' }), 'zzzz');
    expect(screen.getByText('No emoji match “zzzz”')).toBeInTheDocument();
  });
});
