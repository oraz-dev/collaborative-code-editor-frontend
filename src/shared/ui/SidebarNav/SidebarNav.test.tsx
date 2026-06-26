import { render, screen } from '@testing-library/react';
import { SidebarNav } from './SidebarNav';

describe('SidebarNav', () => {
  test('renders without crashing', () => {
    const items = [
      { key: 'home', label: 'Home', icon: 'menu' as const },
    ];
    render(<SidebarNav items={items} />);
    expect(screen.getByText('Home')).toBeInTheDocument();
  });
});
