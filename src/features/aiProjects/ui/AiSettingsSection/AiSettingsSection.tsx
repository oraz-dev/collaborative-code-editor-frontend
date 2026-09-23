import { memo, useCallback, useMemo, useState } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Button } from '@/shared/ui/Button/Button';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Select } from '@/shared/ui/Select/Select';
import { Toggle } from '@/shared/ui/Toggle/Toggle';
import { redact, type OpenRouterClient } from '../../model/openrouter/openrouter';
import {
  FREE_MODEL_CHAIN,
  findModel,
  rankFreeModels,
  type ChainModel,
} from '../../model/modelChain/modelChain';
import { useOpenRouterClient } from '../../model/useOpenRouterClient/useOpenRouterClient';
import { aiSettingsStore, useAiSettings } from '../../model/aiSettings/aiSettings';
import cls from './AiSettingsSection.module.scss';

/**
 * The assistant's settings: which model to start from, and whether a busy
 * model may fall through to the next.
 *
 * There is no key to manage. The OpenRouter key is held by this app's server
 * and attached by the proxy every request goes through, so the browser never
 * sees one — which is why this section can only ever ask "is the assistant
 * reachable from here", never "is your key any good". What does come back
 * from the service still goes through `redact` before it is shown, and the
 * `/key` response's label is not rendered at all: it is the server's account,
 * not the user's, and nothing about it belongs on this screen.
 */

interface AiSettingsSectionProps {
  className?: string;
  /** Injected in tests, so no request ever leaves. */
  client?: OpenRouterClient;
}

interface TestResult {
  ok: boolean;
  message: string;
}

/** Whatever went wrong, said once and with nothing credential-shaped left in it. */
function describeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redact(message) || 'The assistant could not be reached.';
}

export const AiSettingsSection = memo((props: AiSettingsSectionProps) => {
  const { className, client: injectedClient } = props;

  const settings = useAiSettings();
  const appClient = useOpenRouterClient();
  const client = injectedClient ?? appClient;

  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  /**
   * The live catalogue, once asked for. Not persisted: which free models exist
   * changes by the day, and a stale list saved in this browser would be worse
   * than the measured chain the app ships with.
   */
  const [liveChain, setLiveChain] = useState<ChainModel[] | null>(null);

  const chain = liveChain ?? FREE_MODEL_CHAIN;

  const modelOptions = useMemo(() => {
    const options = chain.map((model) => ({ value: model.id, label: model.label }));
    // A saved model the refreshed catalogue no longer lists would otherwise
    // leave the select blank, hiding what is actually configured.
    if (!options.some((option) => option.value === settings.modelId)) {
      options.push({ value: settings.modelId, label: `${settings.modelId} (not listed)` });
    }
    return options;
  }, [chain, settings.modelId]);

  const selectedModel = findModel(settings.modelId, chain);

  const onTestConnection = useCallback(async () => {
    setTesting(true);
    setTest(null);
    try {
      const info = await client.verifyKey();
      // Only whether it answered. The label belongs to the server's account.
      setTest(info.valid
        ? { ok: true, message: 'The assistant is reachable.' }
        : { ok: false, message: 'Your session has expired. Sign in again to use the assistant.' });
    } catch (error) {
      setTest({ ok: false, message: describeFailure(error) });
    } finally {
      setTesting(false);
    }
  }, [client]);

  const onRefreshModels = useCallback(async () => {
    setRefreshing(true);
    setRefreshNote(null);
    try {
      const listed = await client.listFreeModels();
      const ranked = rankFreeModels(listed);
      if (ranked.length === 0) {
        setRefreshNote('OpenRouter listed no usable free models just now.');
        return;
      }
      setLiveChain(ranked);
      setRefreshNote(`${ranked.length} free models available right now.`);
    } catch (error) {
      setRefreshNote(describeFailure(error));
    } finally {
      setRefreshing(false);
    }
  }, [client]);

  const onModelChange = useCallback((value: string) => {
    aiSettingsStore.setModelId(value);
  }, []);

  const onToggleFallback = useCallback(() => {
    aiSettingsStore.setFallbackEnabled(!settings.fallbackEnabled);
  }, [settings.fallbackEnabled]);

  return (
    <div className={classNames(cls.section, {}, [className])} data-testid="ai-settings-section">
      <div className={cls.head}>
        <span className={cls.title}>AI assistant</span>
        <span className={cls.hint}>Included with your account</span>
      </div>

      <div className={cls.body}>
        <div className={cls.block}>
          <div className={cls.blockLabel}>
            <div className={cls.rowTitle}>Connection</div>
            <div className={cls.rowDesc}>
              The assistant runs on a key held by the server. Requests go through
              this app while you are signed in, so there is no key to enter here
              and nothing to pay for.
            </div>
          </div>

          <div className={cls.actions}>
            <Button
              variant="secondary"
              size="small"
              onClick={onTestConnection}
              disabled={testing}
              isLoading={testing}
              aria-label="Test the connection to the assistant"
            >
              Test connection
            </Button>
          </div>

          {test && (
            <p
              className={classNames(cls.result, { [cls.bad]: !test.ok })}
              role="status"
              data-testid="ai-test-result"
            >
              {test.ok
                ? <Icons.Check size={13} aria-hidden />
                : <Icons.Warning size={13} aria-hidden />}
              {test.message}
            </p>
          )}
        </div>

        <div className={cls.row}>
          <div className={cls.rowLabel}>
            <div className={cls.rowTitle}>Model</div>
            <div className={cls.rowDesc}>
              {selectedModel?.note ?? 'Where a generation starts. Free models are shared, so the first choice is often busy.'}
            </div>
            {refreshNote && <div className={cls.rowNote} data-testid="ai-models-note">{refreshNote}</div>}
          </div>
          <div className={cls.rowControl}>
            <Select
              className={cls.control}
              value={settings.modelId}
              onChange={onModelChange}
              options={modelOptions}
              aria-label="Model to generate with"
            />
            <Button
              variant="ghost"
              size="small"
              onClick={onRefreshModels}
              disabled={refreshing}
              isLoading={refreshing}
              aria-label="Refresh the list of free models"
            >
              <Icons.Retry size={13} aria-hidden /> Refresh
            </Button>
          </div>
        </div>

        <div className={cls.row}>
          <div className={cls.rowLabel}>
            <div className={cls.rowTitle}>Try other free models</div>
            <div className={cls.rowDesc}>
              When the chosen model is rate-limited, walk down the list instead of
              failing. The dialog says which model answered.
            </div>
          </div>
          <div className={cls.rowControl}>
            <Toggle
              checked={settings.fallbackEnabled}
              onChange={onToggleFallback}
              aria-label="Try other free models"
            />
          </div>
        </div>
      </div>
    </div>
  );
});
