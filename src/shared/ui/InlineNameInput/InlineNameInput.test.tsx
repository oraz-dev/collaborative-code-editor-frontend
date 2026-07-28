import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InlineNameInput } from './InlineNameInput';

describe('InlineNameInput', () => {
  test('commits the trimmed name on Enter', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<InlineNameInput ariaLabel="New file name" onSubmit={onSubmit} onCancel={vi.fn()} />);

    await user.type(screen.getByLabelText('New file name'), '  index.ts  {Enter}');

    expect(onSubmit).toHaveBeenCalledWith('index.ts');
  });

  test('cancels on Escape without submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(<InlineNameInput ariaLabel="New file name" onSubmit={onSubmit} onCancel={onCancel} />);

    await user.type(screen.getByLabelText('New file name'), 'draft{Escape}');

    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('treats an empty name as a cancel', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(<InlineNameInput ariaLabel="New file name" onSubmit={onSubmit} onCancel={onCancel} />);

    await user.type(screen.getByLabelText('New file name'), '   {Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  test('is focused so the user can type straight away', () => {
    render(<InlineNameInput ariaLabel="New file name" onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText('New file name')).toHaveFocus();
  });
});
