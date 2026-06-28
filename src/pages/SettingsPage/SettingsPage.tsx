import { useState, useCallback, memo } from 'react';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Button } from '@/shared/ui/Button/Button';
import { AppBar } from '@/widgets/AppBar/AppBar';
import { GeneralSection } from './ui/GeneralSection';
import { EditorSection } from './ui/EditorSection';
import { TeamSection } from './ui/TeamSection';
import { BillingSection } from './ui/BillingSection';
import cls from './SettingsPage.module.scss';
import { useNavigate } from 'react-router';
import { RoutePaths } from '@/shared/config/routeConfig/routeConfig';

type Section = 'general' | 'editor' | 'team' | 'billing';

const NAV: { value: Section; label: string; icon: typeof Icons.Settings }[] = [
  { value: 'general', label: 'General', icon: Icons.Settings },
  { value: 'editor', label: 'Editor', icon: Icons.Files },
  { value: 'team', label: 'Team', icon: Icons.Users },
  { value: 'billing', label: 'Billing', icon: Icons.Bolt },
];

// interface SettingsPageProps {
//   className?: string;
// }

export const SettingsPage = memo(() => {
  const [section, setSection] = useState<Section>('general');
  const router = useNavigate();

  const handleNavClick = useCallback((value: Section) => {
    setSection(value);
  }, []);

  return (
    <div className={cls.canvas}>
      <AppBar />
      <div className={cls.body}>
        <div className={cls.wrap}>
          <div className={cls.sidebar}>
            <div className={cls.sidebarTitle}>Settings</div>
            {NAV.map(n => (
              <div key={n.value} className={cls.navItem} data-active={section === n.value} onClick={() => handleNavClick(n.value)}>
                <n.icon size={16} /> {n.label}
              </div>
            ))}
            <div className={cls.sidebarBackWrap}>
              <Button variant="ghost" size="small" onClick={() => router(-1)}><Icons.Arrow size={14} /> Back to dashboard</Button>
            </div>
          </div>
          <div className={cls.content}>
            {section === 'general' && <GeneralSection />}
            {section === 'editor' && <EditorSection />}
            {section === 'team' && <TeamSection />}
            {section === 'billing' && <BillingSection onUpgrade={() => router(RoutePaths.upgrade)} />}
          </div>
        </div>
      </div>
    </div>
  );
});
