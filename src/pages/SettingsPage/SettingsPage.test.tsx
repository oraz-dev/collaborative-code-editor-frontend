import { render, screen } from '@testing-library/react';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage', () => {
  test('renders without crashing', () => {
    render(<SettingsPage onBack={vi.fn()} />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});
