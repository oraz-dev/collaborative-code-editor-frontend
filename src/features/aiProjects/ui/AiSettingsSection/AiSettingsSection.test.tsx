import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OpenRouterError, type FreeModel, type OpenRouterClient } from '../../model/openrouter/openrouter';
import { aiSettingsStore } from '../../model/aiSettings/aiSettings';
import { AiSettingsSection } from './AiSettingsSection';

/**
 * No key anywhere, and no request either: the section is handed a client, so
 * nothing in this file reaches the proxy — or openrouter.ai.
 */
const LIVE_MODELS: FreeModel[] = [
  { id: 'zeta/one:free', label: 'Zeta One', contextLength: 262_144, maxOutput: 64_000, structured: true },
  { id: 'zeta/two:free', label: 'Zeta Two', contextLength: 131_072, maxOutput: 32_000, structured: false },
  // Too small to finish a project, so ranking should drop it.
  { id: 'zeta/tiny:free', label: 'Zeta Tiny', contextLength: 8_000, maxOutput: 1_000, structured: false },
];

function fakeClient(overrides: Partial<OpenRouterClient> = {}): OpenRouterClient {
  return {
    listFreeModels: async () => LIVE_MODELS,
    verifyKey: async () => ({ valid: true, label: 'server account', freeTier: true }),
    chat: async () => ({ content: '', model: 'test', finishReason: 'stop', usage: null }),
    ...overrides,
  };
}

function renderSection(overrides: Partial<OpenRouterClient> = {}) {
  return render(<AiSettingsSection client={fakeClient(overrides)} />);
}

describe('AiSettingsSection', () => {
  beforeEach(() => {
    localStorage.clear();
    aiSettingsStore.reload();
  });

  test('says the key is the server\'s, and asks for nothing', () => {
    renderSection();

    expect(screen.getByText(/key held by the server/)).toBeInTheDocument();
    expect(screen.getByText(/Requests go through this app/)).toBeInTheDocument();
    expect(screen.getByText(/no key to enter here/)).toBeInTheDocument();

    // Nothing to type a key into, and nowhere to go and get one.
    expect(screen.queryByLabelText(/API key/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /openrouter/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /key/i })).not.toBeInTheDocument();
  });

  test('tests the connection through the proxy', async () => {
    const user = userEvent.setup();
    const verifyKey = vi.fn(async () => ({ valid: true, label: 'server account', freeTier: true }));
    renderSection({ verifyKey });

    await user.click(screen.getByRole('button', { name: 'Test the connection to the assistant' }));

    const result = await screen.findByTestId('ai-test-result');
    expect(result).toHaveTextContent('The assistant is reachable.');
    // Still announced the same way.
    expect(result).toHaveAttribute('role', 'status');
    expect(verifyKey).toHaveBeenCalled();
  });

  test('never renders a label from the response', async () => {
    const user = userEvent.setup();
    renderSection({ verifyKey: async () => ({ valid: true, label: 'prod-openrouter-key', freeTier: true }) });

    await user.click(screen.getByRole('button', { name: 'Test the connection to the assistant' }));

    await waitFor(() => expect(screen.getByTestId('ai-test-result')).toBeInTheDocument());
    expect(document.body.innerHTML).not.toContain('prod-openrouter-key');
  });

  test('a refused session is reported as a session, not as a key', async () => {
    const user = userEvent.setup();
    renderSection({ verifyKey: async () => ({ valid: false, label: null, freeTier: false }) });

    await user.click(screen.getByRole('button', { name: 'Test the connection to the assistant' }));

    await waitFor(() => {
      expect(screen.getByTestId('ai-test-result'))
        .toHaveTextContent('Your session has expired. Sign in again to use the assistant.');
    });
  });

  test('a failed test never puts anything key-shaped on screen', async () => {
    const user = userEvent.setup();
    renderSection({
      verifyKey: async () => {
        // A service that echoed a key back would still not reach the screen.
        throw new OpenRouterError({ kind: 'server', message: 'upstream said sk-or-v1-leaked-secret' });
      },
    });

    await user.click(screen.getByRole('button', { name: 'Test the connection to the assistant' }));

    await waitFor(() => expect(screen.getByTestId('ai-test-result')).toBeInTheDocument());
    expect(document.body.innerHTML).not.toContain('sk-or-v1-leaked-secret');
    expect(screen.getByTestId('ai-test-result')).toHaveTextContent('[redacted]');
  });

  test('refreshes the free models from the live catalogue', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole('button', { name: 'Refresh the list of free models' }));

    // Two of the three: the one too small to finish a project is dropped.
    await waitFor(() => {
      expect(screen.getByTestId('ai-models-note')).toHaveTextContent('2 free models available right now.');
    });

    await user.click(screen.getByRole('button', { name: 'Model to generate with' }));
    expect(screen.getByRole('option', { name: /Zeta One/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Zeta Tiny/ })).not.toBeInTheDocument();
  });

  test('both live calls are offered without anything having to be set up first', () => {
    renderSection();

    expect(screen.getByRole('button', { name: 'Test the connection to the assistant' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Refresh the list of free models' })).toBeEnabled();
  });

  test('a failed refresh says so where it said so before', async () => {
    const user = userEvent.setup();
    renderSection({
      listFreeModels: async () => {
        throw new OpenRouterError({ kind: 'auth', message: 'Your session has expired. Sign in again to use the assistant.' });
      },
    });

    await user.click(screen.getByRole('button', { name: 'Refresh the list of free models' }));

    await waitFor(() => {
      expect(screen.getByTestId('ai-models-note')).toHaveTextContent('Your session has expired.');
    });
  });

  test('saves the chosen model', async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole('button', { name: 'Model to generate with' }));
    await user.click(screen.getByRole('option', { name: /Nex-N2.5 Pro/ }));

    expect(aiSettingsStore.get().modelId).toBe('nex-agi/nex-n2.5-pro:free');
  });

  test('saves the fallback preference', async () => {
    const user = userEvent.setup();
    renderSection();

    expect(aiSettingsStore.get().fallbackEnabled).toBe(true);
    await user.click(screen.getByLabelText('Try other free models'));

    expect(aiSettingsStore.get().fallbackEnabled).toBe(false);
  });
});
