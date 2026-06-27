import { render, screen } from '@testing-library/react';
import { AccountMenu } from './AccountMenu';

describe('AccountMenu', () => {
  test('renders without crashing', () => {
    render(<AccountMenu />);
    expect(screen.getByLabelText('Account')).toBeInTheDocument();
  });
});
