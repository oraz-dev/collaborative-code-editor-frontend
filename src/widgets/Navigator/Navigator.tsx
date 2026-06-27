import { memo } from 'react';
import { Icons } from '@/shared/ui/Icon/Icons';
import { AvatarStack } from '@/shared/ui/AvatarStack/AvatarStack';
import { FILES, LIVE_CURSORS, OUTLINE, LANG_COLOR, byId, type FileData, type OutlineSymbol } from '@/shared/data/demo';
import cls from './Navigator.module.scss';

const SYMBOL_ICO: Record<string, typeof Icons.Fn> = {
  function: Icons.Fn, const: Icons.Box, type: Icons.TypeSym, import: Icons.Return,
  effect: Icons.Bolt, return: Icons.Return, rule: Icons.HashSym,
};

const FileTree = memo(({ files, active, onSelect }: {
  files: Record<string, FileData>;
  active: string;
  onSelect: (name: string) => void;
}) => {
  const grouped: Record<string, FileData[]> = {};
  Object.values(files).forEach(f => {
    const dir = f.path.length ? f.path.join('/') : '(root)';
    (grouped[dir] ??= []).push(f);
  });

  return (
    <>
      {Object.entries(grouped).map(([dir, items]) => (
        <div key={dir} className={cls.sec}>
          <div className={cls.label}>
            <Icons.ChevD size={12} /> {dir === '(root)' ? 'root' : dir}
            <span className={cls.ct}>{items.length}</span>
          </div>
          <div className={cls.open}>
            {items.map(f => {
              const cursors = LIVE_CURSORS[f.name] || [];
              return (
                <div key={f.name} className={cls.row} data-active={active === f.name} onClick={() => onSelect(f.name)}>
                  <span
                    className={cls.dot}
                    style={{ '--dot-color': LANG_COLOR[f.lang] || 'var(--ink-400)' } as React.CSSProperties}
                  />
                  <span className={cls.name}>{f.name}</span>
                  {cursors.length > 0 && (
                    <span className={cls.here}>
                      <AvatarStack
                        people={cursors.map(c => { const u = byId(c.who); return { id: u.id, name: u.name, presence: u.presence }; })}
                        max={2} size="xs"
                      />
                    </span>
                  )}
                  <button className={cls.close} aria-label={`Close ${f.name}`}><Icons.X size={12} /></button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
});

const OutlinePanel = memo(({ symbols }: { symbols: OutlineSymbol[] }) => {
  if (!symbols || symbols.length === 0) return null;

  return (
    <div className={cls.sec}>
      <div className={cls.label}>Outline <span className={cls.ct}>{symbols.length}</span></div>
      <div className={cls.outline}>
        {symbols.map((s, i) => {
          const Ico = SYMBOL_ICO[s.kind] || Icons.Box;
          return (
            <div key={i} className={cls.sym}>
              <span className={cls.symIco}><Ico size={13} /></span>
              <span className={cls.symName}>{s.name}</span>
              <span className={cls.symLn}>{s.line}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

interface NavigatorProps {
  className?: string;
  activeFile: string;
  onSelectFile: (name: string) => void;
}

export const Navigator = memo((props: NavigatorProps) => {
  const { activeFile, onSelectFile } = props;
  const outline = OUTLINE[activeFile] || [];

  return (
    <div className={cls.root}>
      <div className={cls.scroll}>
        <FileTree files={FILES} active={activeFile} onSelect={onSelectFile} />
        <OutlinePanel symbols={outline} />
      </div>
    </div>
  );
});
