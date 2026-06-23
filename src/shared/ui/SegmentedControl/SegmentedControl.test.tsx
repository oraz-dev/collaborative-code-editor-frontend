import { render, screen } from '@testing-library/react';
import { SegmentedControl } from './SegmentedControl';

describe('SegmentedControl', () => {
  test('renders without crashing', () => {
    const options = [
      { value: 'a', label: 'Option A' },
      { value: 'b', label: 'Option B' },
    ];
    render(<SegmentedControl value="a" onChange={() => {}} options={options} />);
    expect(screen.getByText('Option A')).toBeInTheDocument();
  });
});
