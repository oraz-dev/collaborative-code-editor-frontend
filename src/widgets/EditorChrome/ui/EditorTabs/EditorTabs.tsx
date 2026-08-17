import { memo, useCallback, type MouseEvent } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { FileTypeIcon } from '@/shared/ui/FileTypeIcon/FileTypeIcon';
import { Icons } from '@/shared/ui/Icon/Icons';
import type { EditorTab } from '../../model/types/tabs';
import cls from './EditorTabs.module.scss';

interface EditorTabsProps {
  className?: string;
  tabs: EditorTab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

interface TabProps {
  tab: EditorTab;
  isActive: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

const Tab = memo((props: TabProps) => {
  const { tab, isActive, onSelect, onClose } = props;

  const handleSelect = useCallback(() => {
    onSelect(tab.id);
  }, [onSelect, tab.id]);

  const handleClose = useCallback((event: MouseEvent) => {
    event.stopPropagation();
    onClose(tab.id);
  }, [onClose, tab.id]);

  // Middle click closes a tab, the way every editor does it.
  const handleAuxClick = useCallback((event: MouseEvent) => {
    if (event.button !== 1) return;
    event.preventDefault();
    onClose(tab.id);
  }, [onClose, tab.id]);

  return (
    <div
      className={classNames(cls.tab, { [cls.active]: isActive })}
      onClick={handleSelect}
      onAuxClick={handleAuxClick}
      role="tab"
      aria-selected={isActive}
      tabIndex={0}
      title={tab.name}
      data-testid={`editor-tab-${tab.name}`}
    >
      <FileTypeIcon name={tab.name} size={15} />
      <span className={cls.label}>{tab.name}</span>
      <button
        type="button"
        className={cls.close}
        onClick={handleClose}
        aria-label={`Close ${tab.name}`}
      >
        <Icons.X size={12} />
      </button>
    </div>
  );
});

/** The open-files strip above the editor. */
export const EditorTabs = memo((props: EditorTabsProps) => {
  const { className, tabs, activeId, onSelect, onClose } = props;

  if (tabs.length === 0) return null;

  return (
    <div
      className={classNames(cls.strip, {}, [className])}
      role="tablist"
      aria-label="Open files"
      data-testid="editor-tabs"
    >
      {tabs.map((tab) => (
        <Tab
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeId}
          onSelect={onSelect}
          onClose={onClose}
        />
      ))}
    </div>
  );
});
