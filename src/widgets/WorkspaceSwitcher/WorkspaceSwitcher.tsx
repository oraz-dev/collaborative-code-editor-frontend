import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Logo } from '@/shared/ui/Logo/Logo';
import { classNames } from '@/shared/lib/classNames/classNames';
import cls from './WorkspaceSwitcher.module.scss';

interface WorkspaceSwitcherProps {
  className?: string;
}

/**
 * The brand mark, doubling as a link home.
 *
 * It used to carry a "Studio · Team" subtitle and a chevron, both implying a
 * workspace switcher. There is no workspace or team concept in the API and the
 * chevron opened nothing, so only the real behaviour is left.
 */
export const WorkspaceSwitcher = memo((props: WorkspaceSwitcherProps) => {
  const { className } = props;
  const navigate = useNavigate();

  const onGoHome = useCallback(() => {
    navigate('/');
  }, [navigate]);

  return (
    <button
      type="button"
      className={classNames(cls.root, {}, [className])}
      onClick={onGoHome}
      title="Back to dashboard"
      aria-label="Back to dashboard"
    >
      <Logo size={26} className={cls.logo} />
      <span className={cls.name}>Space</span>
    </button>
  );
});
