import { useState, useCallback, memo } from 'react';
import { Button } from '@/shared/ui/Button/Button';
import { LANG_COLOR, LANG_LABEL } from '@/shared/data/demo';
import cls from './NewProjectModal.module.scss';

interface NewProjectModalProps {
  className?: string;
  open: boolean;
  onClose: () => void;
}

export const NewProjectModal = memo((props: NewProjectModalProps) => {
  const { open, onClose } = props;
  const [langs, setLangs] = useState<string[]>(['tsx']);

  const toggleLang = useCallback((l: string) => {
    setLangs(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]);
  }, []);

  if (!open) return null;

  return (
    <div className={cls.dlgScrim} onClick={onClose}>
      <div className={cls.dlg} onClick={e => e.stopPropagation()}>
        <div className={cls.dlgHead}>
          <h3 className={cls.dlgTitle}>New project</h3>
          <p className={cls.dlgSub}>Start building something together.</p>
        </div>
        <div className={cls.dlgBody}>
          <div className={cls.formLabel}>Project name</div>
          <div className={cls.fieldInput}><input placeholder="my-cool-project" aria-label="Project name" /></div>
          <div className={cls.formLabel}>Language</div>
          <div className={cls.dlgLangs}>
            {Object.entries(LANG_LABEL).map(([k, v]) => (
              <span key={k} className={cls.dlgLangChip} data-on={langs.includes(k)} onClick={() => toggleLang(k)}>
                <span
                  className={cls.dlgLangDot}
                  style={{ '--dot-color': LANG_COLOR[k] } as React.CSSProperties}
                />
                {v}
              </span>
            ))}
          </div>
        </div>
        <div className={cls.dlgFoot}>
          <Button variant="ghost" size="small" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="small" onClick={onClose}>Create project</Button>
        </div>
      </div>
    </div>
  );
});
