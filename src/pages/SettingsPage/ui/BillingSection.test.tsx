import { render, screen } from '@testing-library/react';
import { BillingSection } from './BillingSection';

describe('BillingSection', () => {
  test('renders without crashing', () => {
    render(<BillingSection />);
    expect(screen.getByText('Current plan')).toBeInTheDocument();
  });
});
