import { render, screen } from '@testing-library/react';
import { GeneralSection } from './GeneralSection';

describe('GeneralSection', () => {
  test('renders without crashing', () => {
    render(<GeneralSection />);
    expect(screen.getByText('Workspace')).toBeInTheDocument();
  });
});
