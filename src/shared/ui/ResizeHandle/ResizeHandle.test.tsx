import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResizeHandle } from './ResizeHandle';

// jsdom has no pointer capture; the component calls it on every drag.
beforeAll(() => {
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => true);
});

function setup(overrides: Partial<React.ComponentProps<typeof ResizeHandle>> = {}) {
  const onResize = vi.fn();
  const onReset = vi.fn();
  render(
    <ResizeHandle
      axis="x"
      size={240}
      min={180}
      max={480}
      label="Resize file tree"
      onResize={onResize}
      onReset={onReset}
      {...overrides}
    />,
  );
  return { onResize, onReset, handle: screen.getByRole('separator') };
}

function drag(handle: HTMLElement, from: number, to: number, axis: 'x' | 'y' = 'x') {
  const at = (value: number) => (axis === 'x' ? { clientX: value, clientY: 0 } : { clientX: 0, clientY: value });
  fireEvent.pointerDown(handle, { button: 0, pointerId: 1, ...at(from) });
  fireEvent.pointerMove(handle, { pointerId: 1, ...at(to) });
  fireEvent.pointerUp(handle, { pointerId: 1, ...at(to) });
}

describe('ResizeHandle', () => {
  test('reports itself as an adjustable separator', () => {
    const { handle } = setup();
    expect(handle).toHaveAttribute('aria-orientation', 'vertical');
    expect(handle).toHaveAttribute('aria-valuenow', '240');
    expect(handle).toHaveAttribute('aria-valuemin', '180');
    expect(handle).toHaveAttribute('aria-valuemax', '480');
    expect(handle).toHaveAttribute('aria-label', 'Resize file tree');
  });

  test('a drag away from the panel grows it', () => {
    const { onResize, handle } = setup();
    drag(handle, 100, 160);
    expect(onResize).toHaveBeenLastCalledWith(300);
  });

  test('a drag towards the panel shrinks it', () => {
    const { onResize, handle } = setup();
    drag(handle, 100, 60);
    expect(onResize).toHaveBeenLastCalledWith(200);
  });

  test('reversed flips the direction, for a panel sitting after the handle', () => {
    // Dragging right must shrink the preview, not grow it.
    const { onResize, handle } = setup({ reversed: true });
    drag(handle, 100, 160);
    expect(onResize).toHaveBeenLastCalledWith(180);
  });

  test('never reports a size outside the bounds', () => {
    const { onResize, handle } = setup();
    drag(handle, 100, 5000);
    expect(onResize).toHaveBeenLastCalledWith(480);

    drag(handle, 100, -5000);
    expect(onResize).toHaveBeenLastCalledWith(180);
  });

  test('ignores a non-primary button, so a right-click drag is not a resize', () => {
    const { onResize, handle } = setup();
    fireEvent.pointerDown(handle, { button: 2, pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 200 });
    expect(onResize).not.toHaveBeenCalled();
  });

  test('ignores movement when no drag is in progress', () => {
    const { onResize, handle } = setup();
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 400 });
    expect(onResize).not.toHaveBeenCalled();
  });

  test('resizes from the keyboard', async () => {
    const user = userEvent.setup();
    const { onResize, handle } = setup();
    handle.focus();

    await user.keyboard('{ArrowRight}');
    expect(onResize).toHaveBeenLastCalledWith(256);

    await user.keyboard('{ArrowLeft}');
    expect(onResize).toHaveBeenLastCalledWith(224);
  });

  test('shift takes bigger steps', async () => {
    const user = userEvent.setup();
    const { onResize, handle } = setup();
    handle.focus();

    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(onResize).toHaveBeenLastCalledWith(304);
  });

  test('Home and End jump to the bounds', async () => {
    const user = userEvent.setup();
    const { onResize, handle } = setup();
    handle.focus();

    await user.keyboard('{Home}');
    expect(onResize).toHaveBeenLastCalledWith(180);

    await user.keyboard('{End}');
    expect(onResize).toHaveBeenLastCalledWith(480);
  });

  test('double-click restores the default', async () => {
    const user = userEvent.setup();
    const { onReset, handle } = setup();

    await user.dblClick(handle);
    expect(onReset).toHaveBeenCalled();
  });

  test('a vertical axis drags up and down instead', () => {
    const { onResize, handle } = setup({ axis: 'y', size: 160, min: 80, max: 480 });
    expect(handle).toHaveAttribute('aria-orientation', 'horizontal');

    drag(handle, 100, 140, 'y');
    expect(onResize).toHaveBeenLastCalledWith(200);
  });
});
