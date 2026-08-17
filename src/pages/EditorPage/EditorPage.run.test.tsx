import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { renderWithProviders } from '@/shared/lib/tests/renderWithProviders';
import { EditorPage } from './EditorPage';

vi.mock('@monaco-editor/react', () => ({ default: () => <div data-testid="monaco-stub" /> }));

const DOC = {
  id: 'doc-1', owner_id: 'u1', parent_id: 'f1',
  docname: 'ttt.ts', doctype: 'file', content: 'const a: number = 1',
};

function mockApi() {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = String(input);
    if (url.endsWith('/refresh')) return new Response(JSON.stringify({ access_token: 't' }), { status: 200 });
    if (url.endsWith('/auth/me')) return new Response(JSON.stringify({ id: 'u1', username: 'u', display_name: 'U', email: 'u@e.com' }), { status: 200 });
    if (url.includes('/documents/doc-1/yjs-state')) return new Response(JSON.stringify({ state: null }), { status: 200 });
    if (url.includes('/documents/doc-1/ws-ticket')) return new Response(JSON.stringify({ ticket: 't', role: 'owner', can_edit: true }), { status: 200 });
    if (url.match(/\/documents\/doc-1$/)) return new Response(JSON.stringify(DOC), { status: 200 });
    if (url.includes('/children') || url.includes('/roots') || url.includes('shared-with-me')) return new Response('[]', { status: 200 });
    return new Response('[]', { status: 200 });
  }));
}

describe('Run button', () => {
  test('appears for a TypeScript file', async () => {
    mockApi();
    renderWithProviders(
      <Routes><Route path="/editor/:documentId" element={<EditorPage />} /></Routes>,
      { route: '/editor/doc-1' },
    );
    await waitFor(() => {
      expect(screen.getByTestId('run-button')).toBeInTheDocument();
    }, { timeout: 4000 });
  });

  test('stays hidden for a file the preview cannot run', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const url = String(input);
      if (url.endsWith('/refresh')) return new Response(JSON.stringify({ access_token: 't' }), { status: 200 });
      if (url.endsWith('/auth/me')) return new Response(JSON.stringify({ id: 'u1', username: 'u', display_name: 'U', email: 'u@e.com' }), { status: 200 });
      if (url.match(/\/documents\/doc-1$/)) {
        return new Response(JSON.stringify({ ...DOC, docname: 'styles.css' }), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    }));

    renderWithProviders(
      <Routes><Route path="/editor/:documentId" element={<EditorPage />} /></Routes>,
      { route: '/editor/doc-1' },
    );

    await waitFor(() => expect(screen.getByLabelText('Settings')).toBeInTheDocument());
    expect(screen.queryByTestId('run-button')).not.toBeInTheDocument();
  });
});
