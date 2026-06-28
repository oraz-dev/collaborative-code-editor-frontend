import { render, screen } from '@testing-library/react';
import { EditorSection } from './EditorSection';

describe('EditorSection', () => {
  test('renders without crashing', () => {
    render(<EditorSection />);
    expect(screen.getByText('Editor preferences')).toBeInTheDocument();
  });
});
