import { memo } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { FileTypeIcon } from '@/shared/ui/FileTypeIcon/FileTypeIcon';
import { Icons } from '@/shared/ui/Icon/Icons';
import cls from './EditorBreadcrumbs.module.scss';

export interface BreadcrumbSegment {
  id: string;
  name: string;
  kind: 'folder' | 'file';
  /** Renders as a non-interactive "…" for ancestors we have not resolved. */
  elided?: boolean;
}

interface EditorBreadcrumbsProps {
  className?: string;
  segments: BreadcrumbSegment[];
  onSelect?: (segment: BreadcrumbSegment) => void;
}

/** The path strip under the tabs — where the open file sits in the workspace. */
export const EditorBreadcrumbs = memo((props: EditorBreadcrumbsProps) => {
  const { className, segments, onSelect } = props;

  if (segments.length === 0) return null;

  return (
    <nav
      className={classNames(cls.bar, {}, [className])}
      aria-label="Document path"
      data-testid="editor-breadcrumbs"
    >
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;
        const canOpen = Boolean(onSelect) && !segment.elided && !isLast;

        return (
          <span className={cls.item} key={segment.id}>
            {index > 0 && (
              <span className={cls.sep} aria-hidden="true"><Icons.ChevR size={11} /></span>
            )}
            <button
              type="button"
              className={classNames(cls.crumb, { [cls.current]: isLast, [cls.plain]: !canOpen })}
              onClick={canOpen ? () => onSelect?.(segment) : undefined}
              disabled={!canOpen}
              aria-current={isLast ? 'page' : undefined}
            >
              {!segment.elided && (
                <FileTypeIcon
                  name={segment.name}
                  variant={segment.kind === 'folder' ? 'folder' : 'file'}
                  size={13}
                />
              )}
              {segment.elided ? '…' : segment.name}
            </button>
          </span>
        );
      })}
    </nav>
  );
});
