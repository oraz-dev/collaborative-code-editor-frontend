import { memo, type ReactNode } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icons } from '@/shared/ui/Icon/Icons';
import { fileTypeFor } from '@/shared/lib/fileType/fileType';
import cls from './EditorStatusBar.module.scss';

export interface CursorPosition {
  line: number;
  column: number;
  /** Characters currently selected, 0 when the selection is empty. */
  selected: number;
}

interface EditorStatusBarProps {
  className?: string;
  fileName: string;
  cursor: CursorPosition | null;
  tabSize: number;
  readOnly?: boolean;
  /** Number of other people in the document right now. */
  peerCount?: number;
  encoding?: string;
  /** Extra items at the start of the bar, e.g. background work in progress. */
  addonLeft?: ReactNode;
}

/** The bar along the bottom of the editor: position, indentation, language. */
export const EditorStatusBar = memo((props: EditorStatusBarProps) => {
  const {
    className,
    fileName,
    cursor,
    tabSize,
    readOnly = false,
    peerCount = 0,
    encoding = 'UTF-8',
    addonLeft,
  } = props;

  const language = fileTypeFor(fileName).label;

  return (
    <div
      className={classNames(cls.bar, {}, [className])}
      role="status"
      aria-label="Editor status"
      data-testid="editor-status-bar"
    >
      <span className={cls.left}>
        {addonLeft}
        {peerCount > 0 && (
          <span className={cls.item} title={`${peerCount} other people are editing this file`}>
            <Icons.Users size={12} />
            {peerCount}
          </span>
        )}
        {readOnly && (
          <span className={classNames(cls.item, { [cls.warn]: true })} title="You have view-only access">
            <Icons.Lock size={12} />
            Read only
          </span>
        )}
      </span>

      <span className={cls.right}>
        {cursor && (
          <span className={cls.item} data-testid="status-position">
            Ln {cursor.line}, Col {cursor.column}
            {cursor.selected > 0 && ` (${cursor.selected} selected)`}
          </span>
        )}
        <span className={cls.item}>Spaces: {tabSize}</span>
        <span className={cls.item}>{encoding}</span>
        <span className={cls.item} data-testid="status-language">{language}</span>
      </span>
    </div>
  );
});
