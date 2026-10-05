import { memo } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import type { ConnectionStatus } from '../../model/RelayProvider/RelayProvider';
import cls from './ConnectionBadge.module.scss';

interface ConnectionBadgeProps {
  className?: string;
  status: ConnectionStatus;
  peerCount?: number;
  /** Edits are waiting on a server that could not be reached. */
  unsynced?: boolean;
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

const UNSYNCED_LABEL = 'Unsynced changes';
const UNSYNCED_HINT = 'Some edits have not reached the server yet — syncing will retry automatically';

/**
 * Never says "disconnected" as a dead end: the provider always retries, so the
 * copy stays reassuring and tells the user their work is safe.
 *
 * The one thing it will not do is say "Live" over edits the server has not
 * taken: the socket can be up while saving is failing, and that is exactly
 * when someone would close the tab believing everything had landed.
 */
export const ConnectionBadge = memo((props: ConnectionBadgeProps) => {
  const { className, status, peerCount = 0, unsynced = false } = props;

  // A dropped connection already says the edits are kept and will sync.
  const showUnsynced = unsynced && status === 'connected';
  const hint = showUnsynced ? UNSYNCED_HINT : STATUS_HINT[status];

  return (
    <span
      className={classNames(cls.badge, { [cls[status]]: true, [cls.unsynced]: showUnsynced }, [className])}
      title={hint}
      role="status"
      aria-live="polite"
      aria-label={hint}
      data-testid="connection-badge"
    >
      <span className={cls.dot} aria-hidden="true" />
      {showUnsynced ? UNSYNCED_LABEL : STATUS_LABEL[status]}
      {status === 'connected' && peerCount > 0 && (
        <span className={cls.peers}>
          {peerCount} {peerCount === 1 ? 'other' : 'others'}
        </span>
      )}
    </span>
  );
});
