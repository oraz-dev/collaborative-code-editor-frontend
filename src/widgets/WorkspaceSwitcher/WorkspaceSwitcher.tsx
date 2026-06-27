import { memo } from 'react';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Logo } from '@/shared/ui/Logo/Logo';
import cls from './WorkspaceSwitcher.module.scss';
import { useNavigate } from 'react-router';

interface WorkspaceSwitcherProps {
  className?: string;
  sub?: string;
}

export const WorkspaceSwitcher = memo((props: WorkspaceSwitcherProps) => {
  const { sub = 'Studio · Team' } = props;
  const router = useNavigate();

  return (
    <div className={cls.root} onClick={() => router('/')} title="Back to dashboard">
      <Logo size={26} className={cls.logo} />
      <div className={cls.ws}>
        <span className={cls.name}>Space</span>
        <span className={cls.sub}>{sub}</span>
      </div>
      <span className={cls.chev}><Icons.ChevSel size={15} /></span>
    </div>
  );
});
