import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { aiSettingsStore } from '../../model/aiSettings/aiSettings';
import { GenerateProjectFlow } from './GenerateProjectFlow';

describe('GenerateProjectFlow', () => {
  beforeEach(() => {
    localStorage.clear();
    aiSettingsStore.reload();
  });

  test('renders nothing until it is opened', () => {
    renderWithProviders(<GenerateProjectFlow open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('generate-project-dialog')).not.toBeInTheDocument();
  });

  test('opens ready to ask, with nothing to set up first', () => {
    renderWithProviders(<GenerateProjectFlow open onClose={vi.fn()} />);

    expect(screen.getByTestId('generate-project-dialog')).toBeInTheDocument();
    // The key is the server's, so there is no notice about one and no gate.
    expect(screen.queryByText(/key/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('ai-request')).toBeEnabled();
  });

  test('starts on the model saved in Settings', () => {
    aiSettingsStore.setModelId('nex-agi/nex-n2.5-pro:free');

    renderWithProviders(<GenerateProjectFlow open onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Model to generate with' })).toHaveTextContent('Nex-N2.5 Pro');
  });
});
