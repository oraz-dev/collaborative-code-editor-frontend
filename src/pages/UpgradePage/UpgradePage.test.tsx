import { render, screen } from '@testing-library/react';
import { UpgradePage } from './UpgradePage';

describe('UpgradePage', () => {
  test('renders without crashing', () => {
    render(<UpgradePage onBack={vi.fn()} />);
    expect(screen.getByText('Pricing')).toBeInTheDocument();
  });
});
