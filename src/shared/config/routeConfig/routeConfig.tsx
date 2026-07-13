import { AuthPage } from '@/pages/AuthPage/AuthPage';
import { DashboardPage } from '@/pages/DashboardPage/DashboardPage';
import { EditorPage } from '@/pages/EditorPage/EditorPage';
import { SettingsPage } from '@/pages/SettingsPage/SettingsPage';
import { ProfilePage } from '@/pages/ProfilePage/ProfilePage';
import { UpgradePage } from '@/pages/UpgradePage/UpgradePage';
import type { RouteProps } from 'react-router';

export enum AppRoutes {
  MAIN= 'main',
  AUTH= 'auth',
  EDITOR= 'editor',
  SETTINGS= 'settings',
  PROFILE= 'profile',
  UPGRADE= 'upgrade',

  // NOT_FOUND= 'not_found',
}

export const RoutePaths: Record<AppRoutes, string> = {
  [AppRoutes.MAIN]: '/',
  [AppRoutes.AUTH]: '/auth',
  [AppRoutes.EDITOR]: '/editor',
  [AppRoutes.SETTINGS]: '/settings',
  [AppRoutes.PROFILE]: '/profile',
  [AppRoutes.UPGRADE]: '/upgrade',

  // [AppRoutes.NOT_FOUND]: '*',
}

export const routeConfig: Record<AppRoutes, RouteProps> = {
  [AppRoutes.MAIN]: {
    path: RoutePaths.main,
    element: <DashboardPage />,
  },
  [AppRoutes.EDITOR]: {
    path: RoutePaths.editor,
    element: <EditorPage />,
  },
  [AppRoutes.AUTH]: {
    path: RoutePaths.auth,
    element: <AuthPage />,
  },
  [AppRoutes.PROFILE]: {
    path: RoutePaths.profile,
    element: <ProfilePage />,
  },
  [AppRoutes.SETTINGS]: {
    path: RoutePaths.settings,
    element: <SettingsPage />,
  },
  [AppRoutes.UPGRADE]: {
    path: RoutePaths.upgrade,
    element: <UpgradePage />,
  },
}