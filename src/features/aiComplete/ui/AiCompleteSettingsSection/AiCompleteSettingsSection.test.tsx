import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { FastBackendState, FastProbe } from '../../model/completionBackend/completionBackend';
import { completeSettingsStore } from '../../model/completeSettings/completeSettings';
import { completionStatusStore } from '../../model/inlineCompletions/inlineCompletions';
import { AiCompleteSettingsSection } from './AiCompleteSettingsSection';

/**
 * The probe is injected, so nothing in this file reaches `/api/ai/fast/v1` —
 * and no key is involved at either end.
 */
function fakeProbe(state: FastBackendState) {
  return vi.fn(async (): Promise<FastProbe> => {
    completionStatusStore.setBackend(state);
    return { state, models: [] };
  });
}

function renderSection(state: FastBackendState = 'unconfigured') {
  const probe = fakeProbe(state);
  return { probe, ...render(<AiCompleteSettingsSection probe={probe} />) };
}

beforeEach(() => {
  localStorage.clear();
  completeSettingsStore.reload();
  completionStatusStore.reset();
});

describe('AiCompleteSettingsSection', () => {
  test('asks which backend is live as soon as it is shown', async () => {
    const { probe } = renderSection('available');

    await waitFor(() => expect(probe).toHaveBeenCalled());
    expect(await screen.findByTestId('ai-complete-backend'))
      .toHaveTextContent('The fast backend is live');
  });

  test('says the fast backend has no provider key, and that on demand still works', async () => {
    renderSection('unconfigured');

    expect(await screen.findByTestId('ai-complete-backend'))
      .toHaveTextContent('no provider key on the server yet');
    expect(screen.getByTestId('ai-complete-backend')).toHaveTextContent('On demand still works');
  });

  test('carries the daily-limit caveat for the on-demand path', () => {
    renderSection();
    expect(screen.getByText(/fifty completions a day/)).toBeInTheDocument();
  });

  test('says no key from this browser is involved', () => {
    renderSection();

    expect(screen.getByText(/keys live in the server/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/API key/i)).not.toBeInTheDocument();
  });

  test('defaults to on demand', () => {
    renderSection();
    expect(screen.getByLabelText('When to suggest completions')).toHaveTextContent('On demand');
  });

  test('changing the mode is kept', async () => {
    const user = userEvent.setup();
    renderSection('available');

    await user.click(screen.getByLabelText('When to suggest completions'));
    await user.click(screen.getByRole('option', { name: 'As you type' }));

    expect(completeSettingsStore.get().mode).toBe('asYouType');
  });

  test('as-you-type can be chosen without a fast key, and is reported inactive', async () => {
    const user = userEvent.setup();
    renderSection('unconfigured');
    await screen.findByTestId('ai-complete-backend');

    await user.click(screen.getByLabelText('When to suggest completions'));
    await user.click(screen.getByRole('option', { name: 'As you type' }));

    expect(completeSettingsStore.get().mode).toBe('asYouType');
    const warning = await screen.findByTestId('ai-complete-inactive');
    expect(warning).toHaveTextContent('selected but inactive');
    expect(warning).toHaveTextContent('no provider key on the server yet');
  });

  test('nothing is called inactive while the fast backend is live', async () => {
    const user = userEvent.setup();
    renderSection('available');
    await screen.findByTestId('ai-complete-backend');

    await user.click(screen.getByLabelText('When to suggest completions'));
    await user.click(screen.getByRole('option', { name: 'As you type' }));

    expect(screen.queryByTestId('ai-complete-inactive')).not.toBeInTheDocument();
  });

  test('the single-line toggle is kept', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByLabelText('Keep suggestions to a single line'));
    expect(completeSettingsStore.get().singleLine).toBe(false);
  });

  test('the backend can be checked again', async () => {
    const user = userEvent.setup();
    const { probe } = renderSection('offline');
    await waitFor(() => expect(probe).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Check which completion backend is live' }));

    await waitFor(() => expect(probe).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('ai-complete-backend')).toHaveTextContent('could not be reached');
  });

  test('shows the last completion problem when there was one', async () => {
    renderSection();
    completionStatusStore.recordError('That model is rate-limited right now.');

    expect(await screen.findByTestId('ai-complete-last-error'))
      .toHaveTextContent('That model is rate-limited right now.');
  });
});
