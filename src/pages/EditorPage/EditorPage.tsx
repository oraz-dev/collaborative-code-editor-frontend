import { useState, useCallback, memo, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Icons } from '@/shared/ui/Icon/Icons';
import { AvatarStack } from '@/shared/ui/AvatarStack/AvatarStack';
import { Kbd } from '@/shared/ui/Kbd/Kbd';
import { IconButton } from '@/shared/ui/IconButton/IconButton';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import { Button } from '@/shared/ui/Button/Button';
import { classNames } from '@/shared/lib/classNames/classNames';
import { logger } from '@/shared/lib/logger/logger';
import { toEditorPath, RoutePaths } from '@/shared/config/routeConfig/routeConfig';
import { useCommandPaletteHotkey } from '@/shared/lib/hotkey/useCommandPaletteHotkey';
import { useIsCompact, useIsPhone } from '@/shared/lib/media/useMediaQuery';
import { ResizeHandle } from '@/shared/ui/ResizeHandle/ResizeHandle';
import {
  DEFAULT_PREFERENCES,
  PREVIEW_WIDTH_RANGE,
  TREE_WIDTH_RANGE,
  preferencesStore,
  useLayoutPreferences,
} from '@/features/preferences';
import { useSession } from '@/features/auth';
import { useEditorPreferences } from '@/features/preferences';
import {
  PreviewPane,
  isRunnable,
  projectTypeInfo,
  useProjectLoader,
  useProjectSnapshot,
} from '@/features/preview';
import { useLanguages, resolveLanguage } from '@/entities/Language';
import { RunOutputPane, chooseRunTarget } from '@/features/codeRun';
import { useDocument, type WorkspaceDocument } from '@/entities/Document';
import {
  CollaborativeEditor,
  ConnectionBadge,
  presenceColorFor,
  useCollaborativeDocument,
  type EditorCursor,
  type EditorProject,
} from '@/features/collaboration';
import {
  EditorBreadcrumbs,
  EditorStatusBar,
  EditorTabs,
  openTab,
  tabAfterClosing,
  type BreadcrumbSegment,
  type EditorTab,
} from '@/widgets/EditorChrome';
import { DocumentTree } from '@/widgets/DocumentTree';
import { ShareDialog } from '@/widgets/ShareDialog';
import { CommandPalette } from '@/widgets/CommandPalette/CommandPalette';
import { WorkspaceSwitcher } from '@/widgets/WorkspaceSwitcher/WorkspaceSwitcher';
import cls from './EditorPage.module.scss';

interface EditorPageProps {
  className?: string;
}

/** Files the editor's TypeScript service checks: it reads JS and TS alike. */
const TYPE_CHECKED_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/i;

export const EditorPage = memo((props: EditorPageProps) => {
  const { className } = props;
  const { documentId } = useParams<{ documentId?: string }>();
  const navigate = useNavigate();

  /*
   * Below 1024px there is no room for tree | editor | preview side by side, so
   * the tree becomes a drawer and the preview an overlay. This is a behaviour
   * change rather than a style one — the resize handles stop existing, the
   * drawer traps Escape, and picking a file dismisses it — so it is driven from
   * JS instead of a media query.
   */
  const isCompact = useIsCompact();
  const isPhone = useIsPhone();

  const [treeOpen, setTreeOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [outputOpen, setOutputOpen] = useState(false);

  const layout = useLayoutPreferences();

  const onOpenTree = useCallback(() => {
    setTreeOpen(true);
  }, []);

  const onCloseTree = useCallback(() => {
    setTreeOpen(false);
  }, []);

  // Going back to a desktop width while the drawer is open would otherwise
  // leave it stacked on top of the pane it turned back into.
  useEffect(() => {
    if (!isCompact) setTreeOpen(false);
  }, [isCompact]);

  useEffect(() => {
    if (!treeOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTreeOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [treeOpen]);

  const onResizeTree = useCallback((next: number) => {
    preferencesStore.setLayout({ treeWidth: next });
  }, []);

  const onResetTree = useCallback(() => {
    preferencesStore.setLayout({ treeWidth: DEFAULT_PREFERENCES.layout.treeWidth });
  }, []);

  const onResizePreview = useCallback((next: number) => {
    preferencesStore.setLayout({ previewWidth: next });
  }, []);

  const onResetPreview = useCallback(() => {
    preferencesStore.setLayout({ previewWidth: DEFAULT_PREFERENCES.layout.previewWidth });
  }, []);

  const { user } = useSession();
  const documentQuery = useDocument(documentId);
  const activeDocument = documentQuery.data;
  const isFolder = activeDocument?.kind === 'folder';

  const editorPreferences = useEditorPreferences();
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [cursor, setCursor] = useState<EditorCursor | null>(null);

  // One level of ancestry is enough for a useful trail; anything above it is
  // shown as an ellipsis rather than firing a request per level on open.
  const parentQuery = useDocument(activeDocument?.parentId);

  // Presence identity for the awareness protocol.
  const collaborator = useMemo(() => (
    user
      ? { id: user.id, name: user.displayName, color: presenceColorFor(user.id) }
      : null
  ), [user]);

  const {
    text, awareness, status, peers, isReady, error, canEdit, role, runState, run,
  } = useCollaborativeDocument({
    documentId: isFolder ? null : documentId,
    user: collaborator,
    initialContent: activeDocument?.content,
    // Wait for the document itself, so a fresh file is seeded from real content.
    enabled: Boolean(activeDocument) && !isFolder,
  });

  const others = useMemo(() => peers.filter((peer) => !peer.isSelf), [peers]);

  /**
   * Who started the run, when it was not this viewer. The socket carries a
   * user id; a name only exists for someone currently in the room, so this is
   * null for a run started by a peer who has since left.
   */
  const runRequestedByName = useMemo(() => {
    const requester = runState.requestedBy;
    if (!requester || requester === user?.id) return null;
    return others.find((peer) => peer.userId === requester)?.name ?? null;
  }, [others, runState.requestedBy, user?.id]);

  // Only files get a tab — a folder is a place, not something you edit.
  useEffect(() => {
    if (!activeDocument || activeDocument.kind === 'folder') return;
    setTabs((current) => openTab(current, { id: activeDocument.id, name: activeDocument.name }));
  }, [activeDocument]);

  // A file that was deleted or revoked while open should not linger in the strip.
  useEffect(() => {
    if (!documentId || !documentQuery.isError) return;
    setTabs((current) => current.filter((tab) => tab.id !== documentId));
  }, [documentId, documentQuery.isError]);

  useEffect(() => {
    setCursor(null);
  }, [documentId]);

  const onSelectDocument = useCallback((document: WorkspaceDocument) => {
    navigate(toEditorPath(document.id));
    // On a phone the drawer covers the editor it just navigated to.
    setTreeOpen(false);
  }, [navigate]);

  const onSelectTab = useCallback((id: string) => {
    navigate(toEditorPath(id));
  }, [navigate]);

  const onCloseTab = useCallback((id: string) => {
    const next = tabAfterClosing(tabs, id);
    setTabs((current) => current.filter((tab) => tab.id !== id));

    // Closing the file you are looking at has to move you somewhere real.
    if (id !== documentId) return;
    navigate(next ? toEditorPath(next.id) : RoutePaths.editor);
  }, [documentId, navigate, tabs]);

  const breadcrumbs = useMemo((): BreadcrumbSegment[] => {
    if (!activeDocument) return [];

    const trail: BreadcrumbSegment[] = [];
    const parent = parentQuery.data;

    if (parent) {
      if (parent.parentId) {
        trail.push({ id: 'elided', name: '…', kind: 'folder', elided: true });
      }
      trail.push({ id: parent.id, name: parent.name, kind: 'folder' });
    }

    trail.push({
      id: activeDocument.id,
      name: activeDocument.name,
      kind: activeDocument.kind === 'folder' ? 'folder' : 'file',
    });
    return trail;
  }, [activeDocument, parentQuery.data]);

  const onSelectCrumb = useCallback((segment: BreadcrumbSegment) => {
    navigate(toEditorPath(segment.id));
  }, [navigate]);

  const fileName = activeDocument?.name ?? '';
  const isFile = Boolean(activeDocument) && !isFolder;

  // Only asked for once an editor is open — the answer is per deployment, not
  // per document, and a stalled sandbox must not delay the dashboard.
  const languagesQuery = useLanguages(isFile);

  const runTarget = useMemo(() => {
    if (!isFile) return null;
    return chooseRunTarget({
      previewable: isRunnable(fileName),
      language: resolveLanguage(fileName, languagesQuery.data ?? []),
    });
  }, [fileName, isFile, languagesQuery.data]);

  // The sandbox runs code as the document's owner and refuses everyone else,
  // so a collaborator is shown the button disabled rather than left to
  // discover the rule by being refused. The in-browser preview is local and
  // has no such rule.
  const isOwner = role === 'owner';
  const canTriggerRun = runTarget?.engine === 'preview' || isOwner;
  const canRun = Boolean(runTarget);

  /**
   * The preview runs the open file's whole project, so an import from any
   * folder in it resolves. Loaded per Run — see `onRunPreview`.
   */
  const { state: projectState, load: loadPreviewProject, cancel: cancelPreviewProject } = (
    useProjectLoader()
  );
  const loadedProject = projectState.status === 'ready' ? projectState.project : null;
  const previewFiles = useMemo(() => loadedProject?.files ?? [], [loadedProject]);

  /**
   * What is on screen now, not what was last flushed to the database.
   *
   * Until the CRDT session is ready the shared buffer is legitimately empty,
   * and `??` would not fall back through an empty string — so a run fired in
   * that window would submit nothing and be rejected for a missing source.
   * Once the buffer is live it is the truth, including when it is empty.
   */
  const liveSource = useCallback(
    () => (isReady && text ? text.toString() : activeDocument?.content ?? ''),
    [activeDocument, isReady, text],
  );

  // The editor's type checker sees the files the open one imports, and the
  // packages it uses, the way the preview resolves them.
  const typeCheckable = Boolean(activeDocument && !isFolder && TYPE_CHECKED_FILE.test(activeDocument.name));
  const projectSnapshot = useProjectSnapshot(activeDocument ?? null, liveSource, typeCheckable);
  const editorProject = useMemo((): EditorProject | null => {
    if (!projectSnapshot) return null;
    const info = projectTypeInfo(projectSnapshot.files);
    return {
      key: projectSnapshot.rootId ?? 'workspace',
      path: projectSnapshot.entry,
      files: projectSnapshot.files,
      packages: info.packages,
      paths: info.paths,
      strict: info.strict,
      usesJsx: info.usesJsx,
    };
  }, [projectSnapshot]);

  /**
   * A run takes a snapshot rather than tracking the buffer live: recomputing
   * the document on every keystroke would re-render the frame continuously,
   * and reloading a page mid-keystroke is not what anyone means by "run".
   *
   * The rest of the project is fetched fresh on every Run, as last saved:
   * your own edits to another file are waited for (see `useProjectLoader`),
   * and a teammate's are picked up once their editor has saved them — a
   * couple of seconds after they stop typing. The pane opens straight away and
   * shows the load, then its outcome; a newer Run cancels an older one. The
   * loader settles every failure into its state, so nothing escapes here —
   * the catch is for the unexpected, which must still reach the pane.
   */
  const onRunPreview = useCallback(async () => {
    if (!activeDocument) return;

    setPreviewOpen(true);
    try {
      await loadPreviewProject(activeDocument, liveSource());
    } catch (loadError) {
      logger.error('Preview project load failed', loadError);
    }
  }, [activeDocument, liveSource, loadPreviewProject]);

  /**
   * Sends the file to the server's sandbox over the collaboration socket.
   *
   * The pane opens immediately rather than on the server's acknowledgement:
   * the request may be refused, and the refusal is itself something to show.
   */
  const onRunSandbox = useCallback(() => {
    const language = runTarget?.language;
    if (!language) return;

    setOutputOpen(true);
    run({ languageId: language.id, sourceCode: liveSource() });
  }, [liveSource, run, runTarget]);

  const onRun = useCallback(() => {
    if (runTarget?.engine === 'sandbox') onRunSandbox();
    else void onRunPreview();
  }, [onRunPreview, onRunSandbox, runTarget]);

  const onClosePreview = useCallback(() => {
    setPreviewOpen(false);
    // Nobody is waiting for it any more.
    cancelPreviewProject();
  }, [cancelPreviewProject]);

  const onCloseOutput = useCallback(() => {
    setOutputOpen(false);
  }, []);

  /*
   * A run is broadcast to the whole room, so a collaborator's pane opens when
   * the owner presses Run — everyone watches the same execution rather than
   * only the person who started it.
   *
   * It keys on the run's sequence rather than on the phase: React batches, so
   * a run that starts and finishes in one tick never renders as `running`, and
   * a watcher looking for that transition would miss the run entirely. Keying
   * on the sequence also leaves the pane closed for the rest of a run the user
   * dismissed, while still opening for the next one.
   */
  const shownRunSequence = useRef(runState.sequence);
  useEffect(() => {
    if (runState.sequence !== shownRunSequence.current) {
      shownRunSequence.current = runState.sequence;
      if (runState.sequence > 0) setOutputOpen(true);
    }
  }, [runState.sequence]);

  // A pane full of another file's output would be worse than an empty one.
  useEffect(() => {
    setOutputOpen(false);
    setPreviewOpen(false);
    cancelPreviewProject();
  }, [documentId, cancelPreviewProject]);

  const handleOpenCmd = useCallback(() => {
    setCmdOpen(true);
  }, []);

  const handleCloseCmd = useCallback(() => {
    setCmdOpen(false);
  }, []);

  const onOpenShare = useCallback(() => {
    setShareOpen(true);
  }, []);

  const onCloseShare = useCallback(() => {
    setShareOpen(false);
  }, []);

  useCommandPaletteHotkey(handleOpenCmd);

  const onBackToDashboard = useCallback(() => {
    navigate(RoutePaths.main);
  }, [navigate]);

  const onOpenSettings = useCallback(() => {
    navigate(RoutePaths.settings);
  }, [navigate]);

  const renderEditorArea = () => {
    if (!documentId) {
      return (
        <div className={cls.placeholder} data-animated data-testid="editor-empty">
          <Icons.Files size={28} />
          <p>Pick a file to start editing.</p>
          <span className={cls.placeholderHint}>Everything you type is shared with your team instantly.</span>
        </div>
      );
    }

    if (documentQuery.isPending) {
      return <div className={cls.placeholder}><Spinner size="large" label="Opening the file" /></div>;
    }

    if (documentQuery.isError) {
      return (
        <div className={cls.placeholder} data-animated data-testid="editor-error">
          <p>We couldn&apos;t open that file.</p>
          <Button
            size="small"
            variant="secondary"
            onClick={() => documentQuery.refetch()}
            isLoading={documentQuery.isFetching}
            aria-label="Retry opening the file"
          >
            Try again
          </Button>
        </div>
      );
    }

    if (isFolder) {
      return (
        <div className={cls.placeholder} data-animated data-testid="editor-folder">
          <Icons.Folder size={28} />
          <p>{activeDocument?.name} is a folder.</p>
          <span className={cls.placeholderHint}>Open a file inside it to start editing.</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className={cls.placeholder} data-animated data-testid="editor-sync-error">
          <p>We couldn&apos;t load this document&apos;s history.</p>
          <span className={cls.placeholderHint}>
            Reload the page to try again — your saved work is safe.
          </span>
        </div>
      );
    }

    if (!isReady) {
      return <div className={cls.placeholder}><Spinner size="large" label="Preparing the editor" /></div>;
    }

    return (
      <CollaborativeEditor
        text={text}
        awareness={awareness}
        fileName={activeDocument?.name ?? 'untitled'}
        project={editorProject}
        readOnly={!canEdit}
        peers={peers}
        onCursorChange={setCursor}
      />
    );
  };

  const showsEditorChrome = Boolean(activeDocument) && !isFolder;

  return (
    <div className={classNames(cls.canvas, {}, [className])}>
      <div className={cls.topnav}>
        {isCompact && user && (
          <IconButton
            size="sm"
            onClick={onOpenTree}
            aria-label="Open file tree"
            aria-expanded={treeOpen}
            data-testid="open-tree"
          >
            <Icons.Sidebar size={16} />
          </IconButton>
        )}
        <WorkspaceSwitcher />
        <div className={cls.div} />
        <button type="button" className={cls.cmdPill} onClick={handleOpenCmd} aria-label="Search files">
          <Icons.Search size={14} />
          <span className={cls.cmdLabel}>Search files…</span>
          {/* A shortcut hint is noise on a device with no keyboard. */}
          {!isPhone && <Kbd keys={['⌘', 'K']} />}
        </button>
        <div className={cls.sp} />
        <div className={cls.right}>
          {activeDocument && !isFolder && (
            <>
              <ConnectionBadge status={status} peerCount={others.length} />
              {!canEdit && (
                <span className={cls.viewOnly} title="You have view-only access to this document">
                  View only
                </span>
              )}
            </>
          )}
          {canRun && (
            <button
              type="button"
              className={cls.runBtn}
              onClick={onRun}
              disabled={!canTriggerRun || runState.phase === 'running'}
              // Spelled out rather than left to a refusal: the sandbox accepts
              // runs from the owner alone.
              title={canTriggerRun ? undefined : 'Only the owner can run this file'}
              aria-label={
                canTriggerRun
                  ? `Run ${fileName}`
                  : `Run ${fileName} — only the owner can run this file`
              }
              data-testid="run-button"
            >
              <Icons.Play size={12} />
              {runState.phase === 'running' && runTarget?.engine === 'sandbox' ? 'Running…' : 'Run'}
            </button>
          )}
          {activeDocument && (
            <IconButton size="sm" onClick={onOpenShare} aria-label="Share this document">
              <Icons.Share size={16} />
            </IconButton>
          )}
          <IconButton size="sm" onClick={onBackToDashboard} aria-label="Back to dashboard">
            <Icons.Grid size={16} />
          </IconButton>
          <IconButton size="sm" onClick={onOpenSettings} aria-label="Settings">
            <Icons.Settings size={16} />
          </IconButton>
          {others.length > 0 && (
            <>
              <div className={cls.div} />
              <div className={cls.here}>
                <span className={cls.hereLbl}>{others.length} here</span>
                <AvatarStack
                  people={others.map((peer) => ({
                    id: String(peer.clientId),
                    name: peer.name,
                    // Feeds --avatar-bg, so it has to be a colour: the same one
                    // this peer's cursor carries, not a status word.
                    presence: peer.color,
                  }))}
                  max={isPhone ? 2 : 4}
                  size="xs"
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div className={cls.work}>
        {user && !isCompact && (
          <>
            <DocumentTree
              style={{ width: layout.treeWidth }}
              ownerId={user.id}
              activeDocumentId={documentId ?? null}
              onSelectDocument={onSelectDocument}
            />
            <ResizeHandle
              axis="x"
              size={layout.treeWidth}
              min={TREE_WIDTH_RANGE.min}
              max={TREE_WIDTH_RANGE.max}
              label="Resize file tree"
              onResize={onResizeTree}
              onReset={onResetTree}
            />
          </>
        )}

        {/* The same tree, slid in over the editor. Kept unmounted while closed
            so its queries and the drawer's focus trap do not run in the
            background. */}
        {user && isCompact && treeOpen && (
          <div className={cls.drawerRoot} data-testid="tree-drawer">
            <div className={cls.scrim} onClick={onCloseTree} aria-hidden="true" />
            <div className={cls.drawer} role="dialog" aria-modal="true" aria-label="Files">
              <div className={cls.drawerBar}>
                <span className={cls.drawerTitle}>Files</span>
                <IconButton size="sm" onClick={onCloseTree} aria-label="Close file tree">
                  <Icons.X size={16} />
                </IconButton>
              </div>
              <DocumentTree
                className={cls.drawerTree}
                ownerId={user.id}
                activeDocumentId={documentId ?? null}
                onSelectDocument={onSelectDocument}
              />
            </div>
          </div>
        )}
        <div className={cls.viewpanel}>
          <EditorTabs
            tabs={tabs}
            activeId={documentId ?? null}
            onSelect={onSelectTab}
            onClose={onCloseTab}
          />
          {showsEditorChrome && (
            <EditorBreadcrumbs segments={breadcrumbs} onSelect={onSelectCrumb} />
          )}

          <div className={cls.editorArea}>
            {renderEditorArea()}
          </div>

          {showsEditorChrome && (
            <EditorStatusBar
              fileName={activeDocument?.name ?? ''}
              cursor={cursor}
              tabSize={editorPreferences.tabSize}
              readOnly={!canEdit}
              peerCount={others.length}
            />
          )}
        </div>

        {previewOpen && activeDocument && !isCompact && (
          <>
            <ResizeHandle
              axis="x"
              size={layout.previewWidth}
              min={PREVIEW_WIDTH_RANGE.min}
              max={PREVIEW_WIDTH_RANGE.max}
              // The preview sits after the handle, so dragging right shrinks it.
              reversed
              label="Resize preview"
              onResize={onResizePreview}
              onReset={onResetPreview}
            />
            <PreviewPane
              style={{ width: layout.previewWidth }}
              className={cls.preview}
              files={previewFiles}
              entry={loadedProject?.entry ?? activeDocument.name}
              loading={projectState.status === 'loading'}
              loadError={projectState.status === 'error' ? projectState.message : null}
              notices={loadedProject?.warnings}
              onRerun={onRun}
              onClose={onClosePreview}
            />
          </>
        )}

        {/* Splitting a 390px viewport in two leaves neither half usable, so the
            preview takes the whole work area and the editor waits behind it. */}
        {outputOpen && activeDocument && !isCompact && (
          <>
            <ResizeHandle
              axis="x"
              size={layout.previewWidth}
              min={PREVIEW_WIDTH_RANGE.min}
              max={PREVIEW_WIDTH_RANGE.max}
              reversed
              label="Resize output"
              onResize={onResizePreview}
              onReset={onResetPreview}
            />
            <RunOutputPane
              style={{ width: layout.previewWidth }}
              className={cls.preview}
              runState={runState}
              language={runTarget?.language ?? null}
              fileName={fileName}
              requestedByName={runRequestedByName}
              canRerun={isOwner}
              onRerun={onRunSandbox}
              onClose={onCloseOutput}
            />
          </>
        )}

        {outputOpen && activeDocument && isCompact && (
          <div className={cls.previewOverlay} data-testid="output-overlay">
            <RunOutputPane
              className={cls.previewSheet}
              runState={runState}
              language={runTarget?.language ?? null}
              fileName={fileName}
              requestedByName={runRequestedByName}
              canRerun={isOwner}
              onRerun={onRunSandbox}
              onClose={onCloseOutput}
            />
          </div>
        )}

        {previewOpen && activeDocument && isCompact && (
          <div className={cls.previewOverlay} data-testid="preview-overlay">
            <PreviewPane
              className={cls.previewSheet}
              files={previewFiles}
              entry={loadedProject?.entry ?? activeDocument.name}
              loading={projectState.status === 'loading'}
              loadError={projectState.status === 'error' ? projectState.message : null}
              notices={loadedProject?.warnings}
              onRerun={onRun}
              onClose={onClosePreview}
            />
          </div>
        )}
      </div>

      <CommandPalette open={cmdOpen} onClose={handleCloseCmd} />

      <ShareDialog
        open={shareOpen}
        onClose={onCloseShare}
        document={activeDocument ?? null}
        isOwner={Boolean(user && activeDocument && activeDocument.ownerId === user.id)}
        currentUserId={user?.id ?? null}
      />
    </div>
  );
});
