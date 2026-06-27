import { render, screen } from '@testing-library/react';
import { SearchView } from './SearchView';

describe('SearchView', () => {
  test('renders without crashing', () => {
    render(<SearchView />);
    expect(screen.getByText('Search')).toBeInTheDocument();
  });
});
