import { memo } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { classNames } from '@/shared/lib/classNames/classNames';
import { useOnlineStatus } from '@/shared/lib/network/useOnlineStatus';
import cls from './OfflineBanner.module.scss';

interface OfflineBannerProps {
  className?: string;
}

/**
 * Standing reassurance during a network drop. Mutations are queued rather than
 * lost (networkMode: 'online'), so the copy promises a retry instead of an
 * error — and the pending count tells the user something is still owed to them.
 */
export const OfflineBanner = memo((props: OfflineBannerProps) => {
  const { className } = props;
  const isOnline = useOnlineStatus();
  const pendingMutations = useIsMutating();
  const pendingQueries = useIsFetching();

  if (isOnline) return null;

  const queued = pendingMutations + pendingQueries;

  return (
    <div
      className={classNames(cls.banner, {}, [className])}
      role="status"
      aria-live="polite"
      data-testid="offline-banner"
    >
      <span className={cls.dot} aria-hidden="true" />
      <span>
        You&apos;re offline — your work is saved locally and will sync when the connection returns
        {queued > 0 ? ` (${queued} waiting)` : ''}
      </span>
    </div>
  );
});
