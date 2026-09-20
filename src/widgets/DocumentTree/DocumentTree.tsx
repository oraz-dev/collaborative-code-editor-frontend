import { memo, useCallback, useState, type CSSProperties } from 'react';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import { Button } from '@/shared/ui/Button/Button';
import { classNames } from '@/shared/lib/classNames/classNames';
import { InlineNameInput } from '@/shared/ui/InlineNameInput/InlineNameInput';
import {
  useCreateDocument,
  useDeleteDocument,
  useDocumentRoots,
  useRenameDocument,
  useSharedDocuments,
  type WorkspaceDocument,
} from '@/entities/Document';
import { ShareDialog } from '@/widgets/ShareDialog';
import { FileTypeIcon } from '@/shared/ui/FileTypeIcon/FileTypeIcon';
import { INDENT_STEP, DocumentTreeNode, type TreeCreationTarget } from './ui/DocumentTreeNode/DocumentTreeNode';
import cls from './DocumentTree.module.scss';

interface DocumentTreeProps {
  className?: string;
  /** Set by the resizable layout in EditorPage. */
  style?: CSSProperties;
  ownerId: string;
  activeDocumentId?: string | null;
  onSelectDocument: (document: WorkspaceDocument) => void;
}

/**
 * The workspace file tree. Roots load up front and each folder fetches its own
 * children when opened, so a large workspace never blocks the first paint and
 * a failed branch can retry without touching the rest of the tree.
 *
 * Documents other people shared are listed separately — they live inside the
 * owner's tree, so they would never appear among this user's roots.
 */
export const DocumentTree = memo((props: DocumentTreeProps) => {
  const { className, style, ownerId, activeDocumentId, onSelectDocument } = props;

  const rootsQuery = useDocumentRoots();
  const sharedQuery = useSharedDocuments();
  const createMutation = useCreateDocument();
  const deleteMutation = useDeleteDocument();
  const renameMutation = useRenameDocument();

  const [creating, setCreating] = useState<TreeCreationTarget | null>(null);
  const [renaming, setRenaming] = useState<WorkspaceDocument | null>(null);
  const [sharing, setSharing] = useState<WorkspaceDocument | null>(null);

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
      content: '',
    });
    setCreating(null);
  }, [creating, createMutation, ownerId]);

  const onStartRename = useCallback((document: WorkspaceDocument) => {
    setRenaming(document);
  }, []);

  const onCancelRename = useCallback(() => {
    setRenaming(null);
  }, []);

  const onSubmitRename = useCallback((name: string) => {
    if (!renaming) return;
    if (name !== renaming.name) {
      renameMutation.mutate({ document: renaming, name });
    }
    setRenaming(null);
  }, [renameMutation, renaming]);

  const onShare = useCallback((document: WorkspaceDocument) => {
    setSharing(document);
  }, []);

  const onCloseShare = useCallback(() => {
    setSharing(null);
  }, []);

  const onDelete = useCallback((document: WorkspaceDocument) => {
    deleteMutation.mutate({ documentId: document.id, parentId: document.parentId });
  }, [deleteMutation]);

  const onNewRootFile = useCallback(() => {
    setCreating({ parentId: null, kind: 'file' });
  }, []);

  const onNewRootFolder = useCallback(() => {
    setCreating({ parentId: null, kind: 'folder' });
  }, []);

  const [collapsed, setCollapsed] = useState(false);

  const onToggleSection = useCallback(() => {
    setCollapsed((value) => !value);
  }, []);

  const isCreatingAtRoot = creating?.parentId === null;
  const shared = sharedQuery.data ?? [];
  const rootCount = rootsQuery.data?.length ?? 0;

  const nodeHandlers = {
    currentUserId: ownerId,
    creating,
    renamingId: renaming?.id ?? null,
    onSelect: onSelectDocument,
    onDelete,
    onShare,
    onStartCreate,
    onSubmitCreate,
    onCancelCreate,
    onStartRename,
    onSubmitRename,
    onCancelRename,
  };

  return (
    <div className={classNames(cls.root, {}, [className])} style={style} data-testid="document-tree">
      <div className={cls.paneTitle}>Explorer</div>

      <div className={cls.head}>
        <button
          type="button"
          className={cls.headToggle}
          onClick={onToggleSection}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand files' : 'Collapse files'}
        >
          <span className={cls.headChevron} aria-hidden="true">
            {collapsed ? <Icons.ChevR size={12} /> : <Icons.ChevD size={12} />}
          </span>
          Files
          {rootCount > 0 && <span className={cls.count}>{rootCount}</span>}
        </button>
        <button type="button" className={cls.action} onClick={onNewRootFile} aria-label="New file">
          <Icons.Plus size={13} />
        </button>
        <button type="button" className={cls.action} onClick={onNewRootFolder} aria-label="New folder">
          <Icons.Folder size={13} />
        </button>
      </div>

      {!collapsed && (
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
            {...nodeHandlers}
          />
        ))}

        {isCreatingAtRoot && (
          <InlineNameInput
            className={cls.rootCreate}
            style={{ '--indent': `${INDENT_STEP}px` } as CSSProperties}
            ariaLabel={creating.kind === 'folder' ? 'New folder name' : 'New file name'}
            placeholder={creating.kind === 'folder' ? 'folder name' : 'file name'}
            icon={<FileTypeIcon name="" variant={creating.kind === 'folder' ? 'folder' : 'file'} size={15} />}
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

        {shared.length > 0 && (
          <>
            <div className={cls.sectionHead}>Shared with me</div>
            {shared.map((document) => (
              <DocumentTreeNode
                key={document.id}
                document={document}
                depth={0}
                activeDocumentId={activeDocumentId}
                {...nodeHandlers}
              />
            ))}
          </>
        )}
      </div>
      )}

      <ShareDialog
        open={Boolean(sharing)}
        onClose={onCloseShare}
        document={sharing}
        isOwner={sharing?.ownerId === ownerId}
        currentUserId={ownerId}
      />
    </div>
  );
});
