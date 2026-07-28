import type { ReactNode } from 'react';
import { AuthPage } from '@/pages/AuthPage/AuthPage';
import { DashboardPage } from '@/pages/DashboardPage/DashboardPage';
import { EditorPage } from '@/pages/EditorPage/EditorPage';
import { SettingsPage } from '@/pages/SettingsPage/SettingsPage';
import { ProfilePage } from '@/pages/ProfilePage/ProfilePage';
import { UpgradePage } from '@/pages/UpgradePage/UpgradePage';
import { NotFoundPage } from '@/pages/NotFoundPage/NotFoundPage';

/**
 * A const map rather than an enum: the test project runs with
 * `erasableSyntaxOnly`, which rejects enums outright.
 */
export const AppRoutes = {
  MAIN: 'main',
  AUTH: 'auth',
  EDITOR: 'editor',
  SETTINGS: 'settings',
  PROFILE: 'profile',
  UPGRADE: 'upgrade',
  NOT_FOUND: 'not_found',
} as const;

export type AppRoute = (typeof AppRoutes)[keyof typeof AppRoutes];

export const RoutePaths: Record<AppRoute, string> = {
  [AppRoutes.MAIN]: '/',
  [AppRoutes.AUTH]: '/auth',
  [AppRoutes.EDITOR]: '/editor',
  [AppRoutes.SETTINGS]: '/settings',
  [AppRoutes.PROFILE]: '/profile',
  [AppRoutes.UPGRADE]: '/upgrade',
  [AppRoutes.NOT_FOUND]: '*',
};

/** Deep link straight to a document, so an editor tab is shareable and reloadable. */
export function toEditorPath(documentId: string): string {
  return `${RoutePaths.editor}/${documentId}`;
}

export interface AppRouteProps {
  path: string;
  element: ReactNode;
  /** Requires a resolved session; redirects to sign-in otherwise. */
  authOnly?: boolean;
  /** Only for signed-out visitors; bounces authenticated users home. */
  guestOnly?: boolean;
}

export const routeConfig: Record<AppRoute, AppRouteProps> = {
  [AppRoutes.MAIN]: {
    path: RoutePaths.main,
    element: <DashboardPage />,
    authOnly: true,
  },
  [AppRoutes.EDITOR]: {
    // optional param keeps /editor valid as an empty-state landing
    path: `${RoutePaths.editor}/:documentId?`,
    element: <EditorPage />,
    authOnly: true,
  },
  [AppRoutes.AUTH]: {
    path: RoutePaths.auth,
    element: <AuthPage />,
    guestOnly: true,
  },
  [AppRoutes.PROFILE]: {
    path: RoutePaths.profile,
    element: <ProfilePage />,
    authOnly: true,
  },
  [AppRoutes.SETTINGS]: {
    path: RoutePaths.settings,
    element: <SettingsPage />,
    authOnly: true,
  },
  [AppRoutes.UPGRADE]: {
    path: RoutePaths.upgrade,
    element: <UpgradePage />,
    authOnly: true,
  },
  [AppRoutes.NOT_FOUND]: {
    path: RoutePaths.not_found,
    element: <NotFoundPage />,
  },
};
