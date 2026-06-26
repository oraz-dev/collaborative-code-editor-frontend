import { render, screen } from '@testing-library/react';
import { ListRow } from './ListRow';

describe('ListRow', () => {
  test('renders without crashing', () => {
    render(<ListRow title="Test title" />);
    expect(screen.getByText('Test title')).toBeInTheDocument();
  });
});
