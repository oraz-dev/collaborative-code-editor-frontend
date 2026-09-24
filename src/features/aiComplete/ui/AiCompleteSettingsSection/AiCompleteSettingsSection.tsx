import { memo, useCallback, useEffect, useState } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { logger } from '@/shared/lib/logger/logger';
import { Button } from '@/shared/ui/Button/Button';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Select } from '@/shared/ui/Select/Select';
import { Toggle } from '@/shared/ui/Toggle/Toggle';
import type { FastBackendState, FastProbe } from '../../model/completionBackend/completionBackend';
import {
  completeSettingsStore,
  useCompleteSettings,
  type CompleteMode,
} from '../../model/completeSettings/completeSettings';
import { useCompletionStatus } from '../../model/inlineCompletions/inlineCompletions';
import { ensureFastBackend, refreshFastBackend } from '../../model/useAiComplete/useAiComplete';
import cls from './AiCompleteSettingsSection.module.scss';

/**
 * Where completion is turned on, and where the awkward truth about it is told.
 *
 * Two backends, one of which does not exist yet: as-you-type needs a fast
 * provider key the server does not have, and the on-demand path is a free tier
 * of fifty requests a day. Both facts are on this screen, because a setting
 * that can be chosen and cannot work has to say so where it is chosen.
 */

const MODE_OPTIONS: { value: CompleteMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'onDemand', label: 'On demand (Cmd+I)' },
  { value: 'asYouType', label: 'As you type' },
];

const MODE_NOTES: Record<CompleteMode, string> = {
  off: 'No suggestions and no requests.',
  onDemand: 'Nothing runs until you press Cmd+I (Ctrl+I) at the cursor.',
  asYouType: 'Ghost text after a short pause in typing. Needs the fast backend.',
};

const BACKEND_NOTES: Record<FastBackendState, string> = {
  available: 'The fast backend is live, so as-you-type suggestions will run.',
  unconfigured: 'The fast backend has no provider key on the server yet, so as-you-type cannot run. On demand still works.',
  unauthenticated: 'Your session was refused. Sign in again.',
  offline: 'The fast backend could not be reached just now.',
};

interface AiCompleteSettingsSectionProps {
  className?: string;
  /** Injected in tests, so no request ever leaves. */
  probe?: () => Promise<FastProbe>;
}

export const AiCompleteSettingsSection = memo((props: AiCompleteSettingsSectionProps) => {
  const { className, probe } = props;

  const settings = useCompleteSettings();
  const status = useCompletionStatus();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    // Whichever mode is chosen, the screen should say what is actually live.
    // The probe reports a failure as a state rather than by throwing, but a
    // rejection must not become an unhandled one either.
    (probe ?? ensureFastBackend)().catch((error: unknown) => {
      logger.warn('Could not probe the fast completion backend', error);
    });
  }, [probe]);

  const onCheckBackend = useCallback(async () => {
    setChecking(true);
    try {
      await (probe ?? refreshFastBackend)();
    } catch (error) {
      logger.warn('Could not probe the fast completion backend', error);
    } finally {
      setChecking(false);
    }
  }, [probe]);

  const onModeChange = useCallback((value: string) => {
    completeSettingsStore.setMode(value as CompleteMode);
  }, []);

  const onToggleSingleLine = useCallback(() => {
    completeSettingsStore.setSingleLine(!settings.singleLine);
  }, [settings.singleLine]);

  const inactive = settings.mode === 'asYouType' && status.backend !== 'available';

  return (
    <div className={classNames(cls.section, {}, [className])} data-testid="ai-complete-settings-section">
      <div className={cls.head}>
        <span className={cls.title}>Code completion</span>
        <span className={cls.hint}>Included with your account</span>
      </div>

      <div className={cls.body}>
        <div className={cls.row}>
          <div className={cls.rowLabel}>
            <div className={cls.rowTitle}>Suggestions</div>
            <div className={cls.rowDesc}>{MODE_NOTES[settings.mode]}</div>
            {inactive && (
              <div className={cls.warn} role="status" data-testid="ai-complete-inactive">
                <Icons.Warning size={13} aria-hidden />
                As-you-type is selected but inactive: {BACKEND_NOTES[status.backend]}
              </div>
            )}
          </div>
          <div className={cls.rowControl}>
            <Select
              className={cls.control}
              value={settings.mode}
              onChange={onModeChange}
              options={MODE_OPTIONS}
              aria-label="When to suggest completions"
            />
          </div>
        </div>

        <div className={cls.row}>
          <div className={cls.rowLabel}>
            <div className={cls.rowTitle}>Single line only</div>
            <div className={cls.rowDesc}>
              Keep a suggestion to the line you are on. Off, a completion may
              write a whole block.
            </div>
          </div>
          <div className={cls.rowControl}>
            <Toggle
              checked={settings.singleLine}
              onChange={onToggleSingleLine}
              aria-label="Keep suggestions to a single line"
            />
          </div>
        </div>

        <div className={cls.block}>
          <div className={cls.blockLabel}>
            <div className={cls.rowTitle}>Which backend is live</div>
            <div className={cls.rowDesc} data-testid="ai-complete-backend">
              {BACKEND_NOTES[status.backend]}
            </div>
            <div className={cls.rowNote}>
              On demand runs on the shared free tier: about fifty completions a
              day for this account, so Cmd+I is worth spending on the lines that
              matter. Neither backend ever sees a key from this browser — both
              keys live in the server&rsquo;s environment.
            </div>
          </div>

          <div className={cls.actions}>
            <Button
              variant="secondary"
              size="small"
              onClick={onCheckBackend}
              disabled={checking}
              isLoading={checking}
              aria-label="Check which completion backend is live"
            >
              <Icons.Retry size={13} aria-hidden /> Check again
            </Button>
          </div>

          {status.lastError && (
            <p className={cls.result} role="status" data-testid="ai-complete-last-error">
              <Icons.Warning size={13} aria-hidden />
              Last completion problem: {status.lastError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
});
