import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MediaViewer } from './MediaViewer';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32"/></svg>';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

describe('MediaViewer', () => {
  test('draws an SVG instead of its markup', () => {
    render(<MediaViewer fileName="logo.svg" content={SVG} />);

    const image = screen.getByTestId('media-image');
    expect(image).toHaveAttribute('alt', 'logo.svg');
    expect(decodeURIComponent(image.getAttribute('src') ?? '')).toContain('<rect');
    expect(screen.queryByTestId('media-source-toggle')).not.toBeInTheDocument();
  });

  test('says how big the file is', () => {
    render(<MediaViewer fileName="logo.svg" content={SVG} />);

    expect(screen.getByTestId('media-size')).toHaveTextContent('96 B');
  });

  test('offers a download of the file as it will be saved', () => {
    render(<MediaViewer fileName="shot.png" content={PNG} />);

    const link = screen.getByTestId('media-download');
    expect(link).toHaveAttribute('href', PNG);
    expect(link).toHaveAttribute('download', 'shot.png');
  });

  test('swaps the picture for the editor, and back', async () => {
    const user = userEvent.setup();
    render(<MediaViewer fileName="logo.svg" content={SVG} sourceView={<div>editor</div>} />);

    const toggle = screen.getByTestId('media-source-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);
    expect(screen.getByText('editor')).toBeInTheDocument();
    expect(screen.queryByTestId('media-image')).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await user.click(toggle);
    expect(screen.getByTestId('media-image')).toBeInTheDocument();
  });

  test('opens on the text when there is no picture to show yet', () => {
    render(<MediaViewer fileName="logo.svg" content="" sourceView={<div>editor</div>} />);

    expect(screen.getByText('editor')).toBeInTheDocument();
    expect(screen.getByTestId('media-source-toggle')).toHaveAttribute('aria-pressed', 'true');
  });

  test('explains a file that holds no media, rather than showing an empty frame', () => {
    render(<MediaViewer fileName="hero.png" content="export this from Figma" />);

    expect(screen.getByTestId('media-empty')).toHaveTextContent('no image in this file');
    expect(screen.queryByTestId('media-download')).not.toBeInTheDocument();
  });

  test('explains a picture the browser refuses', () => {
    render(<MediaViewer fileName="hero.png" content={PNG} />);

    fireEvent.error(screen.getByTestId('media-image'));

    const failure = screen.getByTestId('media-failed');
    expect(failure).toHaveAttribute('role', 'alert');
    expect(failure).toHaveTextContent('not a valid PNG');
  });

  test('names the host as the suspect when the file is a link', () => {
    render(<MediaViewer fileName="hero.png" content="https://example.com/hero.png" />);

    fireEvent.error(screen.getByTestId('media-image'));

    expect(screen.getByTestId('media-failed')).toHaveTextContent('linked file could not be loaded');
  });

  test('plays a video with controls', () => {
    render(<MediaViewer fileName="demo.mp4" content="https://example.com/demo.mp4" />);

    const video = screen.getByTestId('media-video');
    expect(video).toHaveAttribute('controls');
    expect(video).toHaveAttribute('src', 'https://example.com/demo.mp4');
    // Zoom is meaningless for something with its own controls.
    expect(screen.queryByTestId('media-zoom')).not.toBeInTheDocument();
  });

  test('plays audio, named', () => {
    render(<MediaViewer fileName="theme.mp3" content="https://example.com/theme.mp3" />);

    expect(screen.getByTestId('media-audio')).toHaveAttribute('controls');
    expect(screen.getByText('theme.mp3')).toBeInTheDocument();
  });
});

describe('MediaViewer zoom', () => {
  function renderImage() {
    render(<MediaViewer fileName="shot.png" content={PNG} />);
    // jsdom never decodes the image, so the load is faked to give it a size.
    const image = screen.getByTestId('media-image') as HTMLImageElement;
    Object.defineProperty(image, 'naturalWidth', { value: 200, configurable: true });
    Object.defineProperty(image, 'naturalHeight', { value: 100, configurable: true });
    fireEvent.load(image);
    return image;
  }

  test('reports the real size of the picture', () => {
    renderImage();

    expect(screen.getByTestId('media-dimensions')).toHaveTextContent('200 × 100');
  });

  test('fits the window until asked for actual pixels', async () => {
    const user = userEvent.setup();
    const image = renderImage();

    expect(screen.getByTestId('media-zoom')).toHaveTextContent('Fit');
    expect(image).not.toHaveStyle({ width: '200px' });

    await user.click(screen.getByTestId('media-zoom'));
    expect(screen.getByTestId('media-zoom')).toHaveTextContent('100%');
    expect(image).toHaveStyle({ width: '200px', height: '100px' });
  });

  test('steps through the zoom stops', async () => {
    const user = userEvent.setup();
    const image = renderImage();

    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByTestId('media-zoom')).toHaveTextContent('150%');
    expect(image).toHaveStyle({ width: '300px' });

    await user.click(screen.getByRole('button', { name: 'Zoom out' }));
    await user.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(screen.getByTestId('media-zoom')).toHaveTextContent('75%');
  });
});
