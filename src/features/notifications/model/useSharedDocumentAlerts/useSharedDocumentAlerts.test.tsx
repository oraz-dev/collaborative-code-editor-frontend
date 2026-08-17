import { render, screen } from '@testing-library/react';
import { ToastProvider } from '@/shared/ui/Toast/ToastProvider';
import { mapDocument, type WorkspaceDocument } from '@/entities/Document';
import { useSharedDocumentAlerts } from './useSharedDocumentAlerts';

function doc(id: string, name: string): WorkspaceDocument {
  return mapDocument({ id, docname: name, doctype: 'file', owner_id: 'someone-else' });
}

function Harness({ documents }: { documents?: WorkspaceDocument[] }) {
  useSharedDocumentAlerts(documents);
  return null;
}

function renderAlerts(documents?: WorkspaceDocument[]) {
  return render(<ToastProvider><Harness documents={documents} /></ToastProvider>);
}

describe('useSharedDocumentAlerts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('stays silent on the first list it ever sees', () => {
    // Otherwise signing in on a new machine announces your whole history.
    renderAlerts([doc('a', 'notes.md')]);
    expect(screen.queryByText('Shared with you')).not.toBeInTheDocument();
  });

  test('announces a document that arrives afterwards', () => {
    const { rerender } = renderAlerts([doc('a', 'notes.md')]);

    rerender(
      <ToastProvider>
        <Harness documents={[doc('a', 'notes.md'), doc('b', 'mekan.js')]} />
      </ToastProvider>,
    );

    expect(screen.getByText('Shared with you')).toBeInTheDocument();
    expect(screen.getByText(/mekan\.js/)).toBeInTheDocument();
  });

  test('does not announce the same document twice', () => {
    const { rerender } = renderAlerts([]);
    const withB = [doc('b', 'mekan.js')];

    rerender(<ToastProvider><Harness documents={withB} /></ToastProvider>);
    rerender(<ToastProvider><Harness documents={[...withB]} /></ToastProvider>);

    expect(screen.getAllByText('Shared with you')).toHaveLength(1);
  });

  test('summarises a large batch instead of stacking toasts', () => {
    const { rerender } = renderAlerts([]);

    rerender(
      <ToastProvider>
        <Harness documents={['a', 'b', 'c', 'd'].map((id) => doc(id, `${id}.ts`))} />
      </ToastProvider>,
    );

    expect(screen.getByText('4 documents shared with you')).toBeInTheDocument();
  });

  test('says nothing while the list is still loading', () => {
    renderAlerts(undefined);
    expect(screen.queryByTestId('toast-stack')).toBeEmptyDOMElement();
  });
});
