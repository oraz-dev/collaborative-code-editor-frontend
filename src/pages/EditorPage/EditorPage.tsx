import { useState, useCallback, memo, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Icons } from '@/shared/ui/Icon/Icons';
import { AvatarStack } from '@/shared/ui/AvatarStack/AvatarStack';
import { SegmentedControl } from '@/shared/ui/SegmentedControl/SegmentedControl';
import { Kbd } from '@/shared/ui/Kbd/Kbd';
import { IconButton } from '@/shared/ui/IconButton/IconButton';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import { Button } from '@/shared/ui/Button/Button';
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
import { Terminal } from '@/widgets/Terminal/Terminal';
import { CommandPalette } from '@/widgets/CommandPalette/CommandPalette';
import { WorkspaceSwitcher } from '@/widgets/WorkspaceSwitcher/WorkspaceSwitcher';
import { SearchView } from '@/widgets/SearchView/SearchView';
import { GitView } from '@/widgets/GitView/GitView';
import cls from './EditorPage.module.scss';

type SubView = 'code' | 'search' | 'git';

interface EditorPageProps {
  className?: string;
  onSettings?: () => void;
}

export const EditorPage = memo((props: EditorPageProps) => {
  const { onSettings } = props;
  const { documentId } = useParams<{ documentId?: string }>();
  const navigate = useNavigate();

  const [view, setView] = useState<SubView>('code');
  const [termOpen, setTermOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

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

  const { text, awareness, status, peers, isReady, error } = useCollaborativeDocument({
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

  const handleViewChange = useCallback((v: string) => {
    setView(v as SubView);
  }, []);

  const handleToggleTerm = useCallback(() => {
    setTermOpen((open) => !open);
  }, []);

  const handleCloseTerm = useCallback(() => {
    setTermOpen(false);
  }, []);

  const handleOpenCmd = useCallback(() => {
    setCmdOpen(true);
  }, []);

  const handleCloseCmd = useCallback(() => {
    setCmdOpen(false);
  }, []);

  useCommandPaletteHotkey(handleOpenCmd);

  const onBackToDashboard = useCallback(() => {
    navigate(RoutePaths.main);
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
      />
    );
  };

  return (
    <div className={cls.canvas}>
      <div className={cls.topnav}>
        <WorkspaceSwitcher />
        <div className={cls.div} />
        <div className={cls.seg}>
          <SegmentedControl
            value={view}
            onChange={handleViewChange}
            options={[
              { value: 'code', label: 'Code' },
              { value: 'search', label: 'Search' },
              { value: 'git', label: 'Git' },
            ]}
          />
        </div>
        <div className={cls.div} />
        <div className={cls.cmdPill} onClick={handleOpenCmd}>
          <Icons.Search size={14} /> Search files… <Kbd keys={['⌘', 'K']} />
        </div>
        <div className={cls.sp} />
        <div className={cls.right}>
          {activeDocument && !isFolder && (
            <ConnectionBadge status={status} peerCount={others.length} />
          )}
          <IconButton size="sm" onClick={onBackToDashboard} aria-label="Back to dashboard">
            <Icons.Grid size={16} />
          </IconButton>
          <IconButton size="sm" onClick={handleToggleTerm} aria-label="Toggle terminal">
            <Icons.Term size={16} />
          </IconButton>
          <IconButton size="sm" onClick={onSettings} aria-label="Settings">
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
        {view === 'code' && (
          <>
            {user && (
              <DocumentTree
                ownerId={user.id}
                activeDocumentId={documentId ?? null}
                onSelectDocument={onSelectDocument}
              />
            )}
            <div className={cls.viewpanel}>
              {renderEditorArea()}
              <Terminal open={termOpen} onClose={handleCloseTerm} />
            </div>
          </>
        )}
        {view === 'search' && (
          <div className={cls.viewpanel}>
            <SearchView />
          </div>
        )}
        {view === 'git' && (
          <div className={cls.viewpanel}>
            <GitView />
          </div>
        )}
      </div>

      <CommandPalette open={cmdOpen} onClose={handleCloseCmd} />
    </div>
  );
});
