import { render, screen } from '@testing-library/react';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  test('renders the three caret bars', () => {
    const { container } = render(<Spinner />);

    expect(container.querySelector('span')).toBeInTheDocument();
    // Three bars is the mark, not a detail: the stagger between them is what
    // reads as a keystroke travelling left to right.
    expect(container.querySelectorAll('span > span')).toHaveLength(3);
  });

  test('is hidden from assistive tech unless it is given something to say', () => {
    const { container } = render(<Spinner />);

    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  test('announces itself politely when labelled', () => {
    render(<Spinner size="large" label="Loading your documents" />);

    expect(screen.getByRole('status')).toHaveAccessibleName('Loading your documents');
  });

  test('keeps the inline size on the caller colour so it stays legible in a filled button', () => {
    const { container } = render(<Spinner />);

    // `brand` would paint azure bars, which vanish on a brand-azure button.
    expect(container.firstChild).toHaveClass('current');
    expect(container.firstChild).not.toHaveClass('brand');
  });

  test('defaults the standalone size to the brand hues', () => {
    const { container } = render(<Spinner size="large" />);

    expect(container.firstChild).toHaveClass('brand');
  });

  test('honours an explicit tone over the size default', () => {
    const { container } = render(<Spinner size="large" tone="current" />);

    expect(container.firstChild).toHaveClass('current');
    expect(container.firstChild).not.toHaveClass('brand');
  });
});
