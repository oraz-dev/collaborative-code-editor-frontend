import { memo } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import {
  useCompleteSettings,
  type CompleteSettings,
} from '../../model/completeSettings/completeSettings';
import {
  useCompletionStatus,
  type CompletionStatus,
} from '../../model/inlineCompletions/inlineCompletions';
import cls from './AiCompleteStatus.module.scss';

/**
 * Whether completion is doing anything, and when it is not, why.
 *
 * The one thing this item exists for: as-you-type can be switched on while
 * there is no fast provider key behind the site, and without a word on screen
 * that looks exactly like a feature that does not work. So the reason is the
 * item's own text, not a tooltip.
 */

type Tone = 'idle' | 'busy' | 'inactive';

interface Shown {
  tone: Tone;
  /** The words in the bar. */
  text: string;
  /** The fuller sentence on hover and for the label. */
  detail: string;
  /** Said once, politely, when it changes — never per keystroke. */
  announce: string;
}

export const FAST_KEY_HINT = 'Typing-triggered suggestions need a fast provider key on the server.';

function describe(settings: CompleteSettings, status: CompletionStatus): Shown | null {
  if (settings.mode === 'off') return null;

  if (status.working) {
    return {
      tone: 'busy',
      text: 'Completing…',
      detail: 'Asking the model for a completion. Press Escape to cancel.',
      announce: 'Completing',
    };
  }

  if (settings.mode === 'onDemand') {
    return {
      tone: 'idle',
      text: 'AI: on demand',
      detail: `Press Cmd+I (Ctrl+I) to complete at the cursor. ${FAST_KEY_HINT}`,
      announce: '',
    };
  }

  switch (status.backend) {
    case 'available':
      return {
        tone: 'idle',
        text: 'AI: as you type',
        detail: 'Suggestions appear when you pause. Tab accepts one.',
        announce: 'Completion as you type is on',
      };
    case 'unconfigured':
      return {
        tone: 'inactive',
        text: 'AI: typing suggestions inactive',
        detail: `${FAST_KEY_HINT} Cmd+I still completes on demand.`,
        announce: 'Completion as you type is inactive: no fast provider key',
      };
    case 'unauthenticated':
      return {
        tone: 'inactive',
        text: 'AI: signed out',
        detail: 'Sign in again to use completions.',
        announce: 'Completion is inactive: sign in again',
      };
    default:
      return {
        tone: 'inactive',
        text: 'AI: offline',
        detail: `The completion service could not be reached. ${FAST_KEY_HINT}`,
        announce: 'Completion is inactive: the service could not be reached',
      };
  }
}

interface AiCompleteStatusProps {
  className?: string;
  /** Injected in tests; the app reads the live stores. */
  settings?: CompleteSettings;
  status?: CompletionStatus;
}

export const AiCompleteStatus = memo((props: AiCompleteStatusProps) => {
  const { className, settings: injectedSettings, status: injectedStatus } = props;

  const liveSettings = useCompleteSettings();
  const liveStatus = useCompletionStatus();
  const settings = injectedSettings ?? liveSettings;
  const status = injectedStatus ?? liveStatus;

  const shown = describe(settings, status);
  if (!shown) return null;

  return (
    <span
      className={classNames(cls.slot, { [cls[shown.tone]]: true }, [className])}
      // The bar around this is a live region. Counters and busy flags change
      // far too often to be read out, so the milestone line below does it.
      aria-live="off"
      data-testid="ai-complete-status"
      data-tone={shown.tone}
    >
      {/* `note` so the fuller sentence is actually exposed: an aria-label on a
          plain span is not reliably read out. */}
      <span className={cls.item} role="note" title={shown.detail} aria-label={shown.detail}>
        {shown.tone === 'busy'
          ? <Spinner size="small" className={cls.spinner} />
          : <Icons.Sparkle size={12} aria-hidden />}
        <span className={cls.text}>{shown.text}</span>
      </span>

      <span className={cls.srOnly} role="status" aria-live="polite">{shown.announce}</span>
    </span>
  );
});
