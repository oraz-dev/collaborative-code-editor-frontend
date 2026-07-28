import { memo, useCallback, useState } from 'react';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import { classNames } from '@/shared/lib/classNames/classNames';
import {
  isOptimisticDocument,
  useDocumentChildren,
  type DocumentKind,
  type WorkspaceDocument,
} from '@/entities/Document';
import { InlineNameInput } from '@/shared/ui/InlineNameInput/InlineNameInput';
import cls from './DocumentTreeNode.module.scss';

export interface TreeCreationTarget {
  parentId: string | null;
  kind: DocumentKind;
}

interface DocumentTreeNodeProps {
  document: WorkspaceDocument;
  depth: number;
  activeDocumentId?: string | null;
  creating: TreeCreationTarget | null;
  onSelect: (document: WorkspaceDocument) => void;
  onDelete: (document: WorkspaceDocument) => void;
  onStartCreate: (target: TreeCreationTarget) => void;
  onSubmitCreate: (name: string) => void;
  onCancelCreate: () => void;
}

export const DocumentTreeNode = memo((props: DocumentTreeNodeProps) => {
  const {
    document,
    depth,
    activeDocumentId,
    creating,
    onSelect,
    onDelete,
    onStartCreate,
    onSubmitCreate,
    onCancelCreate,
  } = props;

  const isFolder = document.kind === 'folder';
  const isPending = isOptimisticDocument(document);
  const [expanded, setExpanded] = useState(false);

  // Children are only requested once the folder is actually opened.
  const childrenQuery = useDocumentChildren(document.id, isFolder && expanded);
  const isCreatingHere = creating?.parentId === document.id;

  const onRowClick = useCallback(() => {
    // A placeholder has no server id yet, so it cannot be opened or expanded.
    if (isPending) return;
    if (isFolder) setExpanded((open) => !open);
    else onSelect(document);
  }, [document, isFolder, isPending, onSelect]);

  const onNewFile = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setExpanded(true);
    onStartCreate({ parentId: document.id, kind: 'file' });
  }, [document.id, onStartCreate]);

  const onNewFolder = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setExpanded(true);
    onStartCreate({ parentId: document.id, kind: 'folder' });
  }, [document.id, onStartCreate]);

  const onDeleteClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    onDelete(document);
  }, [document, onDelete]);

  const isActive = activeDocumentId === document.id;

  return (
    <>
      <div
        className={classNames(cls.row, { [cls.active]: isActive, [cls.pending]: isPending })}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={onRowClick}
        role={isFolder ? 'treeitem' : 'treeitem'}
        aria-expanded={isFolder ? expanded : undefined}
        aria-selected={isActive}
        aria-busy={isPending}
        tabIndex={0}
        data-testid={`tree-node-${document.name}`}
      >
        <span className={cls.icon} aria-hidden="true">
          {isFolder
            ? (expanded ? <Icons.ChevD size={12} /> : <Icons.ChevR size={12} />)
            : <span className={cls.fileDot} />}
        </span>
        <span className={cls.name}>{document.name}</span>

        {isPending && <Spinner />}

        {!isPending && (
          <span className={cls.actions}>
            {isFolder && (
              <>
                <button
                  type="button"
                  className={cls.action}
                  onClick={onNewFile}
                  aria-label={`New file in ${document.name}`}
                >
                  <Icons.Plus size={12} />
                </button>
                <button
                  type="button"
                  className={cls.action}
                  onClick={onNewFolder}
                  aria-label={`New folder in ${document.name}`}
                >
                  <Icons.Folder size={12} />
                </button>
              </>
            )}
            <button
              type="button"
              className={cls.action}
              onClick={onDeleteClick}
              aria-label={`Delete ${document.name}`}
            >
              <Icons.Trash size={12} />
            </button>
          </span>
        )}
      </div>

      {isFolder && expanded && (
        <>
          {childrenQuery.isPending && (
            <div className={cls.status} style={{ paddingLeft: 20 + depth * 12 }}>
              <Spinner />
            </div>
          )}

          {childrenQuery.isError && (
            <div className={cls.status} style={{ paddingLeft: 20 + depth * 12 }}>
              <span className={cls.error}>Couldn&apos;t load</span>
              <button
                type="button"
                className={cls.retry}
                onClick={() => childrenQuery.refetch()}
                aria-label={`Retry loading ${document.name}`}
              >
                Retry
              </button>
            </div>
          )}

          {childrenQuery.data?.map((child) => (
            <DocumentTreeNode
              key={child.id}
              document={child}
              depth={depth + 1}
              activeDocumentId={activeDocumentId}
              creating={creating}
              onSelect={onSelect}
              onDelete={onDelete}
              onStartCreate={onStartCreate}
              onSubmitCreate={onSubmitCreate}
              onCancelCreate={onCancelCreate}
            />
          ))}

          {isCreatingHere && (
            <InlineNameInput
              style={{ paddingLeft: 8 + (depth + 1) * 12 }}
              ariaLabel={creating.kind === 'folder' ? 'New folder name' : 'New file name'}
              placeholder={creating.kind === 'folder' ? 'folder name' : 'file name'}
              icon={creating.kind === 'folder' ? <Icons.Folder size={13} /> : <Icons.Files size={13} />}
              onSubmit={onSubmitCreate}
              onCancel={onCancelCreate}
            />
          )}

          {!childrenQuery.isPending
            && !childrenQuery.isError
            && childrenQuery.data?.length === 0
            && !isCreatingHere && (
            <div className={cls.status} style={{ paddingLeft: 20 + depth * 12 }}>
              <span className={cls.empty}>Empty</span>
            </div>
          )}
        </>
      )}
    </>
  );
});
