import { useState, useCallback, memo } from 'react';
import { Icons } from '@/shared/ui/Icon/Icons';
import { AvatarStack } from '@/shared/ui/AvatarStack/AvatarStack';
import { SegmentedControl } from '@/shared/ui/SegmentedControl/SegmentedControl';
import { Kbd } from '@/shared/ui/Kbd/Kbd';
import { IconButton } from '@/shared/ui/IconButton/IconButton';
import { FILES, COMMENTS, COLLABORATORS, type CodeSegment, type FileData } from '@/shared/data/demo';
import { Navigator } from '@/widgets/Navigator/Navigator';
import { CodeView } from '@/widgets/CodeView/CodeView';
import { CommentsMargin } from '@/widgets/CommentsMargin/CommentsMargin';
import { Terminal } from '@/widgets/Terminal/Terminal';
import { CommandPalette } from '@/widgets/CommandPalette/CommandPalette';
import { WorkspaceSwitcher } from '@/widgets/WorkspaceSwitcher/WorkspaceSwitcher';
import { SearchView } from '@/widgets/SearchView/SearchView';
import { GitView } from '@/widgets/GitView/GitView';
import cls from './EditorPage.module.scss';

type SubView = 'code' | 'search' | 'git';

interface EditorPageProps {
  className?: string;
  onSettings?: () => void;
}

export const EditorPage = memo((props: EditorPageProps) => {
  const { onSettings } = props;
  const [view, setView] = useState<SubView>('code');
  const [activeFile, setActiveFile] = useState('Editor.tsx');
  const [termOpen, setTermOpen] = useState(true);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [fileOverrides, setFileOverrides] = useState<Record<string, CodeSegment[][]>>({});

  const baseFile = FILES[activeFile] || Object.values(FILES)[0];
  const file: FileData = fileOverrides[activeFile]
    ? { ...baseFile, lines: fileOverrides[activeFile] }
    : baseFile;
  const comments = COMMENTS[activeFile] || [];

  const handleFileChange = useCallback((lines: CodeSegment[][]) => {
    setFileOverrides(prev => ({ ...prev, [activeFile]: lines }));
  }, [activeFile]);

  const handleViewChange = useCallback((v: string) => {
    setView(v as SubView);
  }, []);

  const handleToggleTerm = useCallback(() => {
    setTermOpen(o => !o);
  }, []);

  const handleCloseTerm = useCallback(() => {
    setTermOpen(false);
  }, []);

  const handleOpenCmd = useCallback(() => {
    setCmdOpen(true);
  }, []);

  const handleCloseCmd = useCallback(() => {
    setCmdOpen(false);
  }, []);

  const here = COLLABORATORS.filter(c => c.presence !== 'offline').slice(0, 4);

  return (
    <div className={cls.canvas}>
      <div className={cls.topnav}>
        <WorkspaceSwitcher />
        <div className={cls.div} />
        <div className={cls.seg}>
          <SegmentedControl
            value={view}
            onChange={handleViewChange}
            options={[
              { value: 'code', label: 'Code' },
              { value: 'search', label: 'Search' },
              { value: 'git', label: 'Git' },
            ]}
          />
        </div>
        <div className={cls.div} />
        <div className={cls.cmdPill} onClick={handleOpenCmd}>
          <Icons.Search size={14} /> Search files… <Kbd keys={['⌘', 'K']} />
        </div>
        <div className={cls.sp} />
        <div className={cls.right}>
          <IconButton size="sm" onClick={handleToggleTerm} aria-label="Toggle terminal"><Icons.Term size={16} /></IconButton>
          <IconButton size="sm" onClick={onSettings} aria-label="Settings"><Icons.Settings size={16} /></IconButton>
          <div className={cls.div} />
          <div className={cls.here}>
            <span className={cls.hereLbl}>{here.length} here</span>
            <AvatarStack people={here.map(c => ({ id: c.id, name: c.name, presence: c.presence }))} max={4} size="xs" />
          </div>
        </div>
      </div>
      <div className={cls.work}>
        {view === 'code' && (
          <>
            <Navigator activeFile={activeFile} onSelectFile={setActiveFile} />
            <div className={cls.viewpanel}>
              <CodeView file={file} activeLine={4} onFileChange={handleFileChange} />
              <Terminal open={termOpen} onClose={handleCloseTerm} />
            </div>
            <CommentsMargin comments={comments} />
          </>
        )}
        {view === 'search' && (
          <div className={cls.viewpanel}>
            <SearchView />
          </div>
        )}
        {view === 'git' && (
          <div className={cls.viewpanel}>
            <GitView />
          </div>
        )}
      </div>
      <CommandPalette open={cmdOpen} onClose={handleCloseCmd} />
    </div>
  );
});
