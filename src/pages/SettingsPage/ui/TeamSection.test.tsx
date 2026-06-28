import { render, screen } from '@testing-library/react';
import { TeamSection } from './TeamSection';

describe('TeamSection', () => {
  test('renders without crashing', () => {
    render(<TeamSection />);
    expect(screen.getByText('Members')).toBeInTheDocument();
  });
});
