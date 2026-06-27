import { memo } from 'react';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Kbd } from '@/shared/ui/Kbd/Kbd';
import { FILES } from '@/shared/data/demo';
import cls from './CommandPalette.module.scss';

interface CommandPaletteProps {
  className?: string;
  open: boolean;
  onClose: () => void;
}

export const CommandPalette = memo((props: CommandPaletteProps) => {
  const { open, onClose } = props;

  if (!open) return null;

  return (
    <div className={cls.scrim} onClick={onClose}>
      <div className={cls.palette} onClick={e => e.stopPropagation()}>
        <div className={cls.input}>
          <Icons.Search size={18} />
          <input placeholder="Type a command…" autoFocus aria-label="Command palette" />
          <Kbd keys={['esc']} />
        </div>
        <div className={cls.list}>
          <div className={cls.group}>Files</div>
          {Object.values(FILES).slice(0, 4).map((f, i) => (
            <div className={cls.row} key={f.name} data-active={i === 0} onClick={onClose}>
              <span className={cls.ico}><Icons.Files size={16} /></span>
              <span className={cls.lbl}>{f.name}</span>
              <span className={cls.meta}>{f.path.join('/')}</span>
            </div>
          ))}
          <div className={cls.group}>Actions</div>
          <div className={cls.row} onClick={onClose}>
            <span className={cls.ico}><Icons.Search size={16} /></span>
            <span className={cls.lbl}>Find in project</span>
            <span className={cls.meta}>⌘⇧F</span>
          </div>
          <div className={cls.row} onClick={onClose}>
            <span className={cls.ico}><Icons.Settings size={16} /></span>
            <span className={cls.lbl}>Open settings</span>
            <span className={cls.meta}>⌘,</span>
          </div>
          <div className={cls.row} onClick={onClose}>
            <span className={cls.ico}><Icons.Term size={16} /></span>
            <span className={cls.lbl}>Toggle terminal</span>
            <span className={cls.meta}>⌘J</span>
          </div>
        </div>
      </div>
    </div>
  );
});
