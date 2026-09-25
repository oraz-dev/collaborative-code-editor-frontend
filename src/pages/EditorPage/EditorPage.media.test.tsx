import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { EditorPage } from './EditorPage';

vi.mock('@monaco-editor/react', () => ({ default: () => <div data-testid="monaco-stub" /> }));

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32"/></svg>';

function mockApi(docname: string, content: string) {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = String(input);
    if (url.endsWith('/refresh')) return new Response(JSON.stringify({ access_token: 't' }), { status: 200 });
    if (url.endsWith('/auth/me')) {
      return new Response(JSON.stringify({ id: 'u1', username: 'u', display_name: 'U', email: 'u@e.com' }), { status: 200 });
    }
    if (url.match(/\/documents\/doc-1$/)) {
      return new Response(JSON.stringify({
        id: 'doc-1', owner_id: 'u1', parent_id: 'f1', doctype: 'file', docname, content,
      }), { status: 200 });
    }
    return new Response('[]', { status: 200 });
  }));
}

function openDocument() {
  renderWithProviders(
    <Routes><Route path="/editor/:documentId" element={<EditorPage />} /></Routes>,
    { route: '/editor/doc-1' },
  );
}

describe('opening a media file', () => {
  test('shows the picture rather than the markup', async () => {
    mockApi('logo.svg', SVG);
    openDocument();

    const image = await screen.findByTestId('media-image');
    expect(image).toHaveAttribute('alt', 'logo.svg');
    // Drawn from the saved content, without waiting on the collaboration socket.
    expect(screen.queryByTestId('monaco-stub')).not.toBeInTheDocument();
  });

  test('drops the indentation and encoding from the status bar', async () => {
    mockApi('logo.svg', SVG);
    openDocument();

    await screen.findByTestId('media-image');
    const bar = screen.getByTestId('editor-status-bar');
    expect(bar).not.toHaveTextContent('Spaces:');
    expect(bar).toHaveTextContent('SVG');
  });

  test('leaves code files to the editor', async () => {
    mockApi('main.tsx', 'export const a = 1;');
    openDocument();

    await waitFor(() => expect(screen.getByLabelText('Settings')).toBeInTheDocument());
    expect(screen.queryByTestId('media-viewer')).not.toBeInTheDocument();
  });
});
