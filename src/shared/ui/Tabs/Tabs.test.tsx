import { render, screen } from '@testing-library/react';
import { Tabs } from './Tabs';

describe('Tabs', () => {
  test('renders without crashing', () => {
    const items = [
      { key: 'tab1', label: 'Tab 1' },
      { key: 'tab2', label: 'Tab 2' },
    ];
    render(<Tabs items={items} activeKey="tab1" onChange={() => {}} />);
    expect(screen.getByText('Tab 1')).toBeInTheDocument();
  });
});
