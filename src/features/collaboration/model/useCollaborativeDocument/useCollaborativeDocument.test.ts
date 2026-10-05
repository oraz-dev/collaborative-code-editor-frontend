import { act, renderHook } from '@testing-library/react';
import * as Y from 'yjs';
import { fetchYjsState, saveYjsState, updateDocumentContent } from '@/entities/Document';
import type { RelayProviderOptions } from '../RelayProvider/RelayProvider';
import type { LocalDocRecord } from '../localDocStore/localDocStore';
import { SHARED_TEXT_KEY, useCollaborativeDocument } from './useCollaborativeDocument';

const { providers, localDocs } = vi.hoisted(() => ({
  providers: [] as { options: RelayProviderOptions }[],
  localDocs: new Map<string, LocalDocRecord>(),
}));

vi.mock('@/entities/Document', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/Document')>()),
  fetchYjsState: vi.fn(),
  saveYjsState: vi.fn(),
  updateDocumentContent: vi.fn(),
  mintWsTicket: vi.fn(),
}));

// The socket is out of scope here; the hook only needs something to tell it
// the connection came and went.
vi.mock('../RelayProvider/RelayProvider', () => ({
  RelayProvider: class {
    options: RelayProviderOptions;

    constructor(options: RelayProviderOptions) {
      this.options = options;
      providers.push(this);
    }

    connect = vi.fn();
    destroy = vi.fn();
    sendRun = vi.fn();
  },
}));

vi.mock('../localDocStore/localDocStore', () => ({
  loadLocalDoc: vi.fn(async (userId: string, documentId: string) => (
    localDocs.get(`${userId}:${documentId}`) ?? null
  )),
  saveLocalDoc: vi.fn(async (userId: string, documentId: string, record: LocalDocRecord) => {
    localDocs.set(`${userId}:${documentId}`, record);
  }),
}));

const USER = { id: 'user-1', name: 'Ada', color: '#fff' };
const DOC_ID = 'doc-1';
const LOCAL_KEY = `${USER.id}:${DOC_ID}`;

/** Past the seed grace period, so the document is ready. */
const BOOT_MS = 1_300;
/** Past the save debounce. */
const SAVE_MS = 2_100;

function stateOf(content: string): Uint8Array {
  const doc = new Y.Doc();
  doc.getText(SHARED_TEXT_KEY).insert(0, content);
  return Y.encodeStateAsUpdate(doc);
}

function textOf(state: Uint8Array): string {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return doc.getText(SHARED_TEXT_KEY).toString();
}

const SAVED = stateOf('saved');

/** The saved state after another client, starting from it, made an edit. */
function editedElsewhere(edit: (text: Y.Text) => void): Uint8Array {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, SAVED);
  edit(doc.getText(SHARED_TEXT_KEY));
  return Y.encodeStateAsUpdate(doc);
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function openDocument() {
  const view = renderHook(() => useCollaborativeDocument({ documentId: DOC_ID, user: USER }));
  await advance(BOOT_MS);
  return view;
}

function lastSavedText(): string {
  const calls = vi.mocked(saveYjsState).mock.calls;
  return textOf(calls[calls.length - 1][1]);
}

describe('useCollaborativeDocument', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    providers.length = 0;
    localDocs.clear();
    vi.mocked(fetchYjsState).mockReset().mockResolvedValue(SAVED);
    vi.mocked(saveYjsState).mockReset().mockResolvedValue(undefined);
    vi.mocked(updateDocumentContent).mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('opens from the saved state', async () => {
    const { result } = await openDocument();

    expect(result.current.isReady).toBe(true);
    expect(result.current.text?.toString()).toBe('saved');
    expect(result.current.hasUnsyncedChanges).toBe(false);
  });

  test('keeps a local copy of every edit, flagged until the server has it', async () => {
    const { result } = await openDocument();

    await act(async () => {
      result.current.text?.insert(5, '!');
    });
    expect(textOf(localDocs.get(LOCAL_KEY)!.state)).toBe('saved!');
    expect(localDocs.get(LOCAL_KEY)!.dirty).toBe(true);

    await advance(SAVE_MS);
    expect(lastSavedText()).toBe('saved!');
    expect(localDocs.get(LOCAL_KEY)!.dirty).toBe(false);
  });

  test('opens from the local copy when the server cannot be reached', async () => {
    localDocs.set(LOCAL_KEY, { state: stateOf('typed offline'), dirty: true, updatedAt: 1 });
    vi.mocked(fetchYjsState).mockRejectedValue(new Error('offline'));

    const { result } = await openDocument();

    expect(result.current.error).toBeNull();
    expect(result.current.isReady).toBe(true);
    expect(result.current.text?.toString()).toBe('typed offline');
    expect(result.current.hasUnsyncedChanges).toBe(true);
    expect(saveYjsState).not.toHaveBeenCalled();
  });

  test('still refuses to open blank when there is no copy anywhere', async () => {
    vi.mocked(fetchYjsState).mockRejectedValue(new Error('offline'));

    const { result } = await openDocument();

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.isReady).toBe(false);
  });

  test('sends edits left over from an earlier session as soon as it opens', async () => {
    localDocs.set(LOCAL_KEY, { state: stateOf('never sent'), dirty: true, updatedAt: 1 });
    vi.mocked(fetchYjsState).mockResolvedValue(null);

    const { result } = await openDocument();

    expect(lastSavedText()).toBe('never sent');
    expect(localDocs.get(LOCAL_KEY)!.dirty).toBe(false);
    expect(result.current.hasUnsyncedChanges).toBe(false);
  });

  test('never seeds over a document it has not heard from the server about', async () => {
    localDocs.set(LOCAL_KEY, { state: Y.encodeStateAsUpdate(new Y.Doc()), dirty: false, updatedAt: 1 });
    vi.mocked(fetchYjsState).mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useCollaborativeDocument({
      documentId: DOC_ID,
      user: USER,
      initialContent: 'seed text',
    }));
    await advance(BOOT_MS);

    expect(result.current.text?.toString()).toBe('');
  });

  test('retries a failed save until it lands, and says so meanwhile', async () => {
    const { result } = await openDocument();
    vi.mocked(saveYjsState).mockRejectedValueOnce(new Error('offline'));

    await act(async () => {
      result.current.text?.insert(5, '!');
    });
    await advance(SAVE_MS);
    expect(result.current.hasUnsyncedChanges).toBe(true);

    // No further typing: the retry has to come from the hook itself.
    await advance(2_100);
    expect(lastSavedText()).toBe('saved!');
    expect(result.current.hasUnsyncedChanges).toBe(false);
  });

  test('merges what the server holds before retrying, rather than overwriting it', async () => {
    const { result } = await openDocument();
    vi.mocked(saveYjsState).mockRejectedValueOnce(new Error('offline'));

    await act(async () => {
      result.current.text?.insert(0, 'mine ');
    });
    await advance(SAVE_MS);

    // Someone else saved while this client was cut off.
    vi.mocked(fetchYjsState).mockResolvedValue(editedElsewhere((text) => text.insert(5, ' theirs')));

    await advance(2_100);

    expect(lastSavedText()).toBe('mine saved theirs');
    expect(result.current.text?.toString()).toBe('mine saved theirs');
  });

  test('pulls the saved state again after a reconnect', async () => {
    const { result } = await openDocument();
    const { onStatusChange } = providers[0].options;

    await act(async () => {
      onStatusChange?.('connected');
      onStatusChange?.('offline');
    });

    vi.mocked(fetchYjsState).mockResolvedValue(
      editedElsewhere((text) => text.insert(5, ' while away')),
    );

    await act(async () => {
      onStatusChange?.('connected');
    });
    await advance(0);

    expect(result.current.text?.toString()).toBe('saved while away');
    // Nothing of ours was pending, so there was nothing to write back.
    expect(saveYjsState).not.toHaveBeenCalled();
  });

  test('stops asking once the server refuses outright', async () => {
    const { ApiError } = await import('@/shared/api');
    const { result } = await openDocument();
    vi.mocked(saveYjsState).mockRejectedValue(
      new ApiError({ message: 'gone', kind: 'http', status: 404 }),
    );

    await act(async () => {
      result.current.text?.insert(5, '!');
    });
    await advance(SAVE_MS);
    expect(saveYjsState).toHaveBeenCalledTimes(1);

    await advance(60_000);
    expect(saveYjsState).toHaveBeenCalledTimes(1);
    expect(result.current.hasUnsyncedChanges).toBe(true);
  });

  test('a viewer\'s local copy is never treated as pending work', async () => {
    localDocs.set(LOCAL_KEY, {
      state: stateOf('read only'),
      dirty: true,
      access: { role: 'viewer', canEdit: false },
      updatedAt: 1,
    });

    const { result } = await openDocument();

    expect(result.current.canEdit).toBe(false);
    expect(saveYjsState).not.toHaveBeenCalled();
    expect(result.current.hasUnsyncedChanges).toBe(false);
  });
});
