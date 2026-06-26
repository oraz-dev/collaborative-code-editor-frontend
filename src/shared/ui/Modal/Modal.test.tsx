import { render, screen } from '@testing-library/react';
import { Modal } from './Modal';

describe('Modal', () => {
  test('renders without crashing', () => {
    render(<Modal open={true} onClose={() => {}} title="Test Modal">Content</Modal>);
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
  });
});
