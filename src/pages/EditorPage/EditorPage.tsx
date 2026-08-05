import { useState, useCallback, memo, useMemo } from 'react';
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
import { useSession } from '@/features/auth';
import { useDocument, type WorkspaceDocument } from '@/entities/Document';
import {
  CollaborativeEditor,
  ConnectionBadge,
  presenceColorFor,
  useCollaborativeDocument,
} from '@/features/collaboration';
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

  const { user } = useSession();
  const documentQuery = useDocument(documentId);
  const activeDocument = documentQuery.data;
  const isFolder = activeDocument?.kind === 'folder';

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

  const onSelectDocument = useCallback((document: WorkspaceDocument) => {
    navigate(toEditorPath(document.id));
  }, [navigate]);

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
      />
    );
  };

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
          <DocumentTree
            ownerId={user.id}
            activeDocumentId={documentId ?? null}
            onSelectDocument={onSelectDocument}
          />
        )}
        <div className={cls.viewpanel}>
          {renderEditorArea()}
        </div>
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
