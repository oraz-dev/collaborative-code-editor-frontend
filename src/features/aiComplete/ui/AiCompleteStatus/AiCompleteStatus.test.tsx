import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { CompleteSettings } from '../../model/completeSettings/completeSettings';
import type { CompletionStatus } from '../../model/inlineCompletions/inlineCompletions';
import { AiCompleteStatus } from './AiCompleteStatus';

/**
 * Both stores are injected, so this file never touches `localStorage`, the
 * probe or the network.
 */
const IDLE: CompletionStatus = {
  backend: 'available',
  working: false,
  suggested: 0,
  accepted: 0,
  errors: 0,
  lastError: null,
};

function show(settings: Partial<CompleteSettings>, status: Partial<CompletionStatus> = {}) {
  return render(
    <AiCompleteStatus
      settings={{ mode: 'asYouType', singleLine: true, ...settings }}
      status={{ ...IDLE, ...status }}
    />,
  );
}

describe('AiCompleteStatus', () => {
  test('says nothing at all when completion is off', () => {
    show({ mode: 'off' });
    expect(screen.queryByTestId('ai-complete-status')).not.toBeInTheDocument();
  });

  test('shows it is working', () => {
    show({ mode: 'asYouType' }, { working: true });

    const item = screen.getByTestId('ai-complete-status');
    expect(item).toHaveTextContent('Completing…');
    expect(item).toHaveAttribute('data-tone', 'busy');
    expect(screen.getByLabelText(/Press Escape to cancel/)).toBeInTheDocument();
  });

  test('names the backend when idle and as-you-type is live', () => {
    show({ mode: 'asYouType' }, { backend: 'available' });

    const item = screen.getByTestId('ai-complete-status');
    expect(item).toHaveTextContent('AI: as you type');
    expect(item).toHaveAttribute('data-tone', 'idle');
  });

  test('names the on-demand backend and its shortcut', () => {
    show({ mode: 'onDemand' });

    const item = screen.getByTestId('ai-complete-status');
    expect(item).toHaveTextContent('AI: on demand');
    expect(screen.getByLabelText(/Cmd\+I/)).toBeInTheDocument();
  });

  test('says why as-you-type is inactive, and that a fast key is what it needs', () => {
    show({ mode: 'asYouType' }, { backend: 'unconfigured' });

    const item = screen.getByTestId('ai-complete-status');
    expect(item).toHaveTextContent('typing suggestions inactive');
    expect(item).toHaveAttribute('data-tone', 'inactive');
    expect(screen.getByLabelText(/need a fast provider key/)).toBeInTheDocument();
  });

  test('tells a refused session apart from a missing provider key', () => {
    show({ mode: 'asYouType' }, { backend: 'unauthenticated' });
    expect(screen.getByTestId('ai-complete-status')).toHaveTextContent('AI: signed out');
  });

  test('says so when nothing answered', () => {
    show({ mode: 'asYouType' }, { backend: 'offline' });
    expect(screen.getByTestId('ai-complete-status')).toHaveTextContent('AI: offline');
  });

  test('announces milestones politely and never the per-keystroke state', () => {
    show({ mode: 'asYouType' }, { backend: 'unconfigured' });

    const live = screen.getByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toHaveTextContent('Completion as you type is inactive: no fast provider key');
    // The item itself is inside the status bar's live region and must stay silent.
    expect(screen.getByTestId('ai-complete-status')).toHaveAttribute('aria-live', 'off');
  });

  test('says nothing out loud while merely idle', () => {
    show({ mode: 'onDemand' });
    expect(screen.getByRole('status')).toHaveTextContent('');
  });
});
