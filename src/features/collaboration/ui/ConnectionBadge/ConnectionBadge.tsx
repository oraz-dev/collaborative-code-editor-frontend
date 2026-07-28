import { memo } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import type { ConnectionStatus } from '../../model/RelayProvider/RelayProvider';
import cls from './ConnectionBadge.module.scss';

interface ConnectionBadgeProps {
  className?: string;
  status: ConnectionStatus;
  peerCount?: number;
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  connected: 'Live',
  offline: 'Reconnecting…',
  error: 'Reconnecting…',
};

const STATUS_HINT: Record<ConnectionStatus, string> = {
  connecting: 'Joining the collaboration session',
  connected: 'Your edits are shared in real time',
  offline: 'Connection lost — your edits are kept and will sync automatically',
  error: 'Connection problem — retrying automatically',
};

/**
 * Never says "disconnected" as a dead end: the provider always retries, so the
 * copy stays reassuring and tells the user their work is safe.
 */
export const ConnectionBadge = memo((props: ConnectionBadgeProps) => {
  const { className, status, peerCount = 0 } = props;

  return (
    <span
      className={classNames(cls.badge, { [cls[status]]: true }, [className])}
      title={STATUS_HINT[status]}
      role="status"
      aria-live="polite"
      aria-label={STATUS_HINT[status]}
      data-testid="connection-badge"
    >
      <span className={cls.dot} aria-hidden="true" />
      {STATUS_LABEL[status]}
      {status === 'connected' && peerCount > 0 && (
        <span className={cls.peers}>
          {peerCount} {peerCount === 1 ? 'other' : 'others'}
        </span>
      )}
    </span>
  );
});
