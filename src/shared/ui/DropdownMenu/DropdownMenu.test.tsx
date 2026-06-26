import { render, screen } from '@testing-library/react';
import { DropdownMenu } from './DropdownMenu';

describe('DropdownMenu', () => {
  test('renders without crashing', () => {
    const items = [{ key: 'item1', label: 'Item 1' }];
    render(<DropdownMenu trigger={<span>Menu</span>} items={items} />);
    expect(screen.getByText('Menu')).toBeInTheDocument();
  });
});
