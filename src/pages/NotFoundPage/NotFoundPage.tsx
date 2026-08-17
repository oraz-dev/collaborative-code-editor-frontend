import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/shared/ui/Button/Button';
import { RoutePaths } from '@/shared/config/routeConfig/routeConfig';
import cls from './NotFoundPage.module.scss';

interface NotFoundPageProps {
  className?: string;
}

export const NotFoundPage = memo((props: NotFoundPageProps) => {
  const { className } = props;
  const navigate = useNavigate();

  const onGoHome = useCallback(() => {
    navigate(RoutePaths.main);
  }, [navigate]);

  return (
    <div className={[cls.root, className].filter(Boolean).join(' ')} data-testid="not-found-page">
      <h1 className={cls.code}>404</h1>
      <p className={cls.text}>We couldn&apos;t find that page.</p>
      <Button variant="secondary" onClick={onGoHome} aria-label="Back to your workspace">
        Back to workspace
      </Button>
    </div>
  );
});

export default NotFoundPage;
