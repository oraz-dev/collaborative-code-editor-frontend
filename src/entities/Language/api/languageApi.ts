import { docsHttp } from '@/shared/api';
import type { Language } from '../model/types/language';

/**
 * The languages this deployment will run.
 *
 * The service has already narrowed the list to what it accepts, so every entry
 * is one a run will take — there is no second allowlist to apply here.
 */
export async function fetchLanguages(signal?: AbortSignal): Promise<Language[]> {
  const languages = await docsHttp<Language[] | null>('/languages', { method: 'GET', signal });
  // The service answers `null` rather than `[]` when it has nothing to offer.
  return languages ?? [];
}
