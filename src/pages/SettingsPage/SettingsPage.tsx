import { useState, useCallback, memo } from 'react';
import { useNavigate } from 'react-router';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Button } from '@/shared/ui/Button/Button';
import { AppBar } from '@/widgets/AppBar/AppBar';
import { CommandPalette } from '@/widgets/CommandPalette/CommandPalette';
import { useCommandPaletteHotkey } from '@/shared/lib/hotkey/useCommandPaletteHotkey';
import { AiSettingsSection } from '@/features/aiProjects';
import { AiCompleteSettingsSection } from '@/features/aiComplete';
import { GeneralSection } from './ui/GeneralSection';
import { EditorSection } from './ui/EditorSection';
import cls from './SettingsPage.module.scss';

type Section = 'general' | 'editor' | 'assistant';

const NAV: { value: Section; label: string; icon: typeof Icons.Settings }[] = [
  { value: 'general', label: 'General', icon: Icons.Settings },
  { value: 'editor', label: 'Editor', icon: Icons.Files },
  { value: 'assistant', label: 'Assistant', icon: Icons.Sparkle },
];

export const SettingsPage = memo(() => {
  const [paletteOpen, setPaletteOpen] = useState(false);

  const onOpenPalette = useCallback(() => {
    setPaletteOpen(true);
  }, []);

  const onClosePalette = useCallback(() => {
    setPaletteOpen(false);
  }, []);

  useCommandPaletteHotkey(onOpenPalette);

  const [section, setSection] = useState<Section>('general');
  const navigate = useNavigate();

  const handleNavClick = useCallback((value: Section) => {
    setSection(value);
  }, []);

  const onBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  return (
    <div className={cls.canvas}>
      <AppBar onCmdk={onOpenPalette} />
      <div className={cls.body}>
        <div className={cls.wrap}>
          <div className={cls.sidebar}>
            <div className={cls.sidebarTitle}>Settings</div>
            {NAV.map((item) => (
              <button
                type="button"
                key={item.value}
                className={cls.navItem}
                data-active={section === item.value}
                onClick={() => handleNavClick(item.value)}
                aria-current={section === item.value}
              >
                <item.icon size={16} /> {item.label}
              </button>
            ))}
            <div className={cls.sidebarBackWrap}>
              <Button variant="ghost" size="small" onClick={onBack} aria-label="Back to dashboard">
                <Icons.Arrow size={14} /> Back to dashboard
              </Button>
            </div>
          </div>
          <div className={cls.content}>
            {section === 'general' && <GeneralSection />}
            {section === 'editor' && <EditorSection />}
            {section === 'assistant' && (
              <div className={cls.stack}>
                <AiSettingsSection />
                <AiCompleteSettingsSection />
              </div>
            )}
          </div>
        </div>
      </div>

      <CommandPalette open={paletteOpen} onClose={onClosePalette} />
    </div>
  );
});
