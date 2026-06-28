import { render, screen } from '@testing-library/react';
import { AuthPage } from './AuthPage';

describe('AuthPage', () => {
  test('renders without crashing', () => {
    render(<AuthPage onSignIn={vi.fn()} />);
    expect(screen.getByText('Sign in to Space')).toBeInTheDocument();
  });
});
