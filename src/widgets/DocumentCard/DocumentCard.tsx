import { memo, useCallback } from 'react';
import { Icons } from '@/shared/ui/Icon/Icons';
import { FileTypeIcon } from '@/shared/ui/FileTypeIcon/FileTypeIcon';
import { classNames } from '@/shared/lib/classNames/classNames';
import { relativeTime } from '@/shared/lib/relativeTime/relativeTime';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import { isOptimisticDocument, type WorkspaceDocument } from '@/entities/Document';
import cls from './DocumentCard.module.scss';

interface DocumentCardProps {
  className?: string;
  document: WorkspaceDocument;
  onOpen: (document: WorkspaceDocument) => void;
  onDelete?: (document: WorkspaceDocument) => void;
}

/**
 * Shows only what the API actually knows about a document — name, kind and
 * when it last changed. No invented metadata.
 */
export const DocumentCard = memo((props: DocumentCardProps) => {
  const { className, document, onOpen, onDelete } = props;

  const isFolder = document.kind === 'folder';
  const isPending = isOptimisticDocument(document);
  const updated = relativeTime(document.updatedAt);

  const handleOpen = useCallback(() => {
    if (!isPending) onOpen(document);
  }, [document, isPending, onOpen]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpen();
    }
  }, [handleOpen]);

  const handleDelete = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    onDelete?.(document);
  }, [document, onDelete]);

  return (
    <div
      className={classNames(cls.card, { [cls.pending]: isPending }, [className])}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`Open ${document.name}`}
      aria-busy={isPending}
      data-testid={`document-card-${document.name}`}
    >
      <div className={cls.top}>
        <span className={cls.icon} aria-hidden="true">
          <FileTypeIcon name={document.name} variant={isFolder ? 'folder' : 'file'} size={15} />
        </span>
        <span className={cls.name}>{document.name}</span>
        {isPending && <Spinner />}
        {!isPending && onDelete && (
          <button
            type="button"
            className={cls.delete}
            onClick={handleDelete}
            aria-label={`Delete ${document.name}`}
          >
            <Icons.Trash size={13} />
          </button>
        )}
      </div>

      <div className={cls.meta}>
        <span className={cls.kind}>{isFolder ? 'Folder' : 'File'}</span>
        {updated && <span className={cls.updated}>· updated {updated}</span>}
      </div>
    </div>
  );
});
