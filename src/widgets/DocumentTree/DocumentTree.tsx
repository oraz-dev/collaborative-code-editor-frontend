import { memo, useCallback, useState } from 'react';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import { Button } from '@/shared/ui/Button/Button';
import { classNames } from '@/shared/lib/classNames/classNames';
import {
  useCreateDocument,
  useDeleteDocument,
  useDocumentRoots,
  type WorkspaceDocument,
} from '@/entities/Document';
import { InlineNameInput } from '@/shared/ui/InlineNameInput/InlineNameInput';
import { DocumentTreeNode, type TreeCreationTarget } from './ui/DocumentTreeNode/DocumentTreeNode';
import cls from './DocumentTree.module.scss';

interface DocumentTreeProps {
  className?: string;
  ownerId: string;
  activeDocumentId?: string | null;
  onSelectDocument: (document: WorkspaceDocument) => void;
}

/**
 * The workspace file tree. Roots load up front and each folder fetches its own
 * children when opened, so a large workspace never blocks the first paint and
 * a failed branch can retry without touching the rest of the tree.
 */
export const DocumentTree = memo((props: DocumentTreeProps) => {
  const { className, ownerId, activeDocumentId, onSelectDocument } = props;

  const rootsQuery = useDocumentRoots();
  const createMutation = useCreateDocument();
  const deleteMutation = useDeleteDocument();

  const [creating, setCreating] = useState<TreeCreationTarget | null>(null);

  const onStartCreate = useCallback((target: TreeCreationTarget) => {
    setCreating(target);
  }, []);

  const onCancelCreate = useCallback(() => {
    setCreating(null);
  }, []);

  const onSubmitCreate = useCallback((name: string) => {
    if (!creating) return;

    createMutation.mutate({
      name,
      kind: creating.kind,
      ownerId,
      parentId: creating.parentId,
      // A brand-new file starts empty; the editor seeds CRDT state on open.
      content: '',
    });
    setCreating(null);
  }, [creating, createMutation, ownerId]);

  const onDelete = useCallback((document: WorkspaceDocument) => {
    deleteMutation.mutate({ documentId: document.id, parentId: document.parentId });
  }, [deleteMutation]);

  const onNewRootFile = useCallback(() => {
    setCreating({ parentId: null, kind: 'file' });
  }, []);

  const onNewRootFolder = useCallback(() => {
    setCreating({ parentId: null, kind: 'folder' });
  }, []);

  const isCreatingAtRoot = creating?.parentId === null;

  return (
    <div className={classNames(cls.root, {}, [className])} data-testid="document-tree">
      <div className={cls.head}>
        <span className={cls.title}>Files</span>
        <button
          type="button"
          className={cls.action}
          onClick={onNewRootFile}
          aria-label="New file"
        >
          <Icons.Plus size={13} />
        </button>
        <button
          type="button"
          className={cls.action}
          onClick={onNewRootFolder}
          aria-label="New folder"
        >
          <Icons.Folder size={13} />
        </button>
      </div>

      <div className={cls.scroll} role="tree" aria-label="Workspace files">
        {rootsQuery.isPending && (
          <div className={cls.center}><Spinner /></div>
        )}

        {rootsQuery.isError && (
          <div className={cls.errorBox}>
            <p className={cls.errorText}>We couldn&apos;t load your files.</p>
            <Button
              size="small"
              variant="secondary"
              onClick={() => rootsQuery.refetch()}
              isLoading={rootsQuery.isFetching}
              aria-label="Retry loading files"
            >
              Try again
            </Button>
          </div>
        )}

        {rootsQuery.data?.map((document) => (
          <DocumentTreeNode
            key={document.id}
            document={document}
            depth={0}
            activeDocumentId={activeDocumentId}
            creating={creating}
            onSelect={onSelectDocument}
            onDelete={onDelete}
            onStartCreate={onStartCreate}
            onSubmitCreate={onSubmitCreate}
            onCancelCreate={onCancelCreate}
          />
        ))}

        {isCreatingAtRoot && (
          <InlineNameInput
            style={{ paddingLeft: 8 }}
            ariaLabel={creating.kind === 'folder' ? 'New folder name' : 'New file name'}
            placeholder={creating.kind === 'folder' ? 'folder name' : 'file name'}
            icon={creating.kind === 'folder' ? <Icons.Folder size={13} /> : <Icons.Files size={13} />}
            onSubmit={onSubmitCreate}
            onCancel={onCancelCreate}
          />
        )}

        {rootsQuery.data?.length === 0 && !isCreatingAtRoot && (
          <div className={cls.empty}>
            <p className={cls.emptyText}>No files yet.</p>
            <Button size="small" variant="secondary" onClick={onNewRootFile} aria-label="Create your first file">
              New file
            </Button>
          </div>
        )}
      </div>
    </div>
  );
});
