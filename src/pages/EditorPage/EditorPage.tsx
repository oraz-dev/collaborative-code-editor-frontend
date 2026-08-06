import { useState, useCallback, memo, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Icons } from '@/shared/ui/Icon/Icons';
import { AvatarStack } from '@/shared/ui/AvatarStack/AvatarStack';
import { Kbd } from '@/shared/ui/Kbd/Kbd';
import { IconButton } from '@/shared/ui/IconButton/IconButton';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import { Button } from '@/shared/ui/Button/Button';
import { classNames } from '@/shared/lib/classNames/classNames';
import { toEditorPath, RoutePaths } from '@/shared/config/routeConfig/routeConfig';
import { useCommandPaletteHotkey } from '@/shared/lib/hotkey/useCommandPaletteHotkey';
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
import { PreviewPane, isRunnable, type PreviewFile } from '@/features/preview';
import { useDocument, useDocumentChildren, type WorkspaceDocument } from '@/entities/Document';
import {
  CollaborativeEditor,
  ConnectionBadge,
  presenceColorFor,
  useCollaborativeDocument,
  type EditorCursor,
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

export const EditorPage = memo((props: EditorPageProps) => {
  const { className } = props;
  const { documentId } = useParams<{ documentId?: string }>();
  const navigate = useNavigate();

  const [cmdOpen, setCmdOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFiles, setPreviewFiles] = useState<PreviewFile[]>([]);

  const layout = useLayoutPreferences();

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

  const { text, awareness, status, peers, isReady, error, canEdit } = useCollaborativeDocument({
    documentId: isFolder ? null : documentId,
    user: collaborator,
    initialContent: activeDocument?.content,
    // Wait for the document itself, so a fresh file is seeded from real content.
    enabled: Boolean(activeDocument) && !isFolder,
  });

  const others = useMemo(() => peers.filter((peer) => !peer.isSelf), [peers]);

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

  const canRun = Boolean(activeDocument) && !isFolder && isRunnable(activeDocument?.name ?? '');

  // Siblings supply the modules the open file imports. Same query key the tree
  // uses, so an expanded folder has usually already paid for it.
  const siblingsQuery = useDocumentChildren(
    activeDocument?.parentId ?? null,
    canRun && Boolean(activeDocument?.parentId),
  );

  /**
   * A run takes a snapshot rather than tracking the buffer live: recomputing
   * the document on every keystroke would re-render the frame continuously,
   * and reloading a page mid-keystroke is not what anyone means by "run".
   */
  const onRun = useCallback(() => {
    if (!activeDocument) return;

    const siblings = (siblingsQuery.data ?? [])
      .filter((document) => document.kind === 'file' && document.id !== activeDocument.id)
      .map((document) => ({ path: document.name, content: document.content }));

    setPreviewFiles([
      ...siblings,
      {
        path: activeDocument.name,
        // What is on screen now, not what was last saved.
        content: text?.toString() ?? activeDocument.content,
      },
    ]);
    setPreviewOpen(true);
  }, [activeDocument, siblingsQuery.data, text]);

  const onClosePreview = useCallback(() => {
    setPreviewOpen(false);
  }, []);

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
        <div className={cls.placeholder} data-testid="editor-empty">
          <Icons.Files size={28} />
          <p>Pick a file to start editing.</p>
          <span className={cls.placeholderHint}>Everything you type is shared with your team instantly.</span>
        </div>
      );
    }

    if (documentQuery.isPending) {
      return <div className={cls.placeholder}><Spinner size="large" /></div>;
    }

    if (documentQuery.isError) {
      return (
        <div className={cls.placeholder} data-testid="editor-error">
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
        <div className={cls.placeholder} data-testid="editor-folder">
          <Icons.Folder size={28} />
          <p>{activeDocument?.name} is a folder.</p>
          <span className={cls.placeholderHint}>Open a file inside it to start editing.</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className={cls.placeholder} data-testid="editor-sync-error">
          <p>We couldn&apos;t load this document&apos;s history.</p>
          <span className={cls.placeholderHint}>
            Reload the page to try again — your saved work is safe.
          </span>
        </div>
      );
    }

    if (!isReady) {
      return <div className={cls.placeholder}><Spinner size="large" /></div>;
    }

    return (
      <CollaborativeEditor
        text={text}
        awareness={awareness}
        fileName={activeDocument?.name ?? 'untitled'}
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
        <WorkspaceSwitcher />
        <div className={cls.div} />
        <button type="button" className={cls.cmdPill} onClick={handleOpenCmd} aria-label="Search files">
          <Icons.Search size={14} /> Search files… <Kbd keys={['⌘', 'K']} />
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
              aria-label={`Run ${activeDocument?.name}`}
              data-testid="run-button"
            >
              <Icons.Play size={12} />
              Run
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
                    presence: 'online',
                  }))}
                  max={4}
                  size="xs"
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div className={cls.work}>
        {user && (
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

        {previewOpen && activeDocument && (
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
              entry={activeDocument.name}
              onRerun={onRun}
              onClose={onClosePreview}
            />
          </>
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
