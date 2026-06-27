import { useState, useCallback, memo } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icons } from '@/shared/ui/Icon/Icons';
import { IconButton } from '@/shared/ui/IconButton/IconButton';
import { RUN_OUTPUT } from '@/shared/data/demo';
import cls from './Terminal.module.scss';

interface TerminalProps {
  className?: string;
  open: boolean;
  onClose: () => void;
}

const LINE_CLS: Record<string, string> = {
  cmd: cls.cmd, dim: cls.dim, info: cls.info,
  ok: cls.ok, ready: cls.ready, blank: '',
};

export const Terminal = memo((props: TerminalProps) => {
  const { open, onClose } = props;
  const [tab, setTab] = useState<'terminal' | 'problems'>('terminal');

  const handleTerminalTab = useCallback(() => {
    setTab('terminal');
  }, []);

  const handleProblemsTab = useCallback(() => {
    setTab('problems');
  }, []);

  if (!open) return null;

  return (
    <div className={cls.root}>
      <div className={cls.head}>
        <div className={cls.tabs}>
          <button className={cls.tab} data-active={tab === 'terminal'} onClick={handleTerminalTab}>
            <Icons.Term size={14} /> Terminal
          </button>
          <button className={cls.tab} data-active={tab === 'problems'} onClick={handleProblemsTab}>
            Problems <span className={cls.ct}>2</span>
          </button>
        </div>
        <div className={cls.sp} />
        <span className={classNames(cls.status, {}, [cls.statusOk])}>
          <span className={cls.statusDot} />Ready
        </span>
        <IconButton size="sm" onClick={onClose} aria-label="Close terminal"><Icons.X size={14} /></IconButton>
      </div>
      {tab === 'terminal' ? (
        <div className={cls.body}>
          {RUN_OUTPUT.map((ln, i) => (
            <div key={i} className={classNames(cls.ln, {}, [LINE_CLS[ln.t]])}>{ln.text}</div>
          ))}
          <div className={cls.ln}><span className={cls.caret} /></div>
        </div>
      ) : (
        <div className={classNames(cls.body, {}, [cls.probs])}>
          <div className={cls.probrow}>
            <span className={cls.probIcoWarn}><Icons.Minus size={14} /></span>
            Unused variable &apos;setPeers&apos;
            <span className={cls.probLoc}>editor.tsx:6</span>
          </div>
          <div className={cls.probrow}>
            <span className={cls.probIcoInfo}><Icons.Minus size={14} /></span>
            Import &apos;channel&apos; could be tree-shaken
            <span className={cls.probLoc}>presence.ts:2</span>
          </div>
        </div>
      )}
    </div>
  );
});
