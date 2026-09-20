import { Suspense, useCallback } from 'react';
import { Route, Routes } from 'react-router';
import { routeConfig, type AppRouteProps } from '@/shared/config/routeConfig/routeConfig';
import { RequireAuth, RequireGuest } from '@/features/auth';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import cls from './AppRouter.module.scss';

const fallback = (
  <div className={cls.fallback} role="status" aria-live="polite" aria-label="Loading page">
    <Spinner size="large" label="Loading page" />
  </div>
);

export default function AppRouter() {
  const renderRoute = useCallback((route: AppRouteProps) => {
    const { path, element, authOnly, guestOnly } = route;

    let guarded = element;
    if (authOnly) guarded = <RequireAuth>{element}</RequireAuth>;
    if (guestOnly) guarded = <RequireGuest>{element}</RequireGuest>;

    return <Route key={path} path={path} element={guarded} />;
  }, []);

  return (
    <Suspense fallback={fallback}>
      <Routes>
        {Object.values(routeConfig).map(renderRoute)}
      </Routes>
    </Suspense>
  );
}
