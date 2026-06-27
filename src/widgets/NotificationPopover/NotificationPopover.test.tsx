import { render, screen } from '@testing-library/react';
import { NotificationPopover } from './NotificationPopover';

describe('NotificationPopover', () => {
  test('renders without crashing', () => {
    render(<NotificationPopover />);
    expect(screen.getByLabelText('Notifications')).toBeInTheDocument();
  });
});
