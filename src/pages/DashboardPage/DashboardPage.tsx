import { useState, useCallback, memo, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Button } from '@/shared/ui/Button/Button';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import { InlineNameInput } from '@/shared/ui/InlineNameInput/InlineNameInput';
import { relativeTime } from '@/shared/lib/relativeTime/relativeTime';
import { toEditorPath } from '@/shared/config/routeConfig/routeConfig';
import { useSession } from '@/features/auth';
import {
  useCreateDocument,
  useDeleteDocument,
  useDocumentRoots,
  type DocumentKind,
  type WorkspaceDocument,
} from '@/entities/Document';
import { AppBar } from '@/widgets/AppBar/AppBar';
import { DocumentCard } from '@/widgets/DocumentCard/DocumentCard';
import cls from './DashboardPage.module.scss';

function greetingFor(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export const DashboardPage = memo(() => {
  const navigate = useNavigate();
  const { user } = useSession();

  const rootsQuery = useDocumentRoots();
  const createMutation = useCreateDocument();
  const deleteMutation = useDeleteDocument();

  const [creatingKind, setCreatingKind] = useState<DocumentKind | null>(null);

  const documents = rootsQuery.data ?? [];

  // Newest activity first, for the side rail.
  const recentlyUpdated = useMemo(() => (
    [...documents]
      .filter((document) => Boolean(document.updatedAt))
      .sort((a, b) => Date.parse(b.updatedAt ?? '') - Date.parse(a.updatedAt ?? ''))
      .slice(0, 6)
  ), [documents]);

  const onOpenDocument = useCallback((document: WorkspaceDocument) => {
    navigate(toEditorPath(document.id));
  }, [navigate]);

  const onStartFolder = useCallback(() => {
    setCreatingKind('folder');
  }, []);

  const onStartFile = useCallback(() => {
    setCreatingKind('file');
  }, []);

  const onCancelCreate = useCallback(() => {
    setCreatingKind(null);
  }, []);

  const onSubmitCreate = useCallback((name: string) => {
    if (!user || !creatingKind) return;

    createMutation.mutate({
      name,
      kind: creatingKind,
      ownerId: user.id,
      parentId: null,
      content: '',
    });
    setCreatingKind(null);
  }, [createMutation, creatingKind, user]);

  const onDeleteDocument = useCallback((document: WorkspaceDocument) => {
    deleteMutation.mutate({ documentId: document.id, parentId: null });
  }, [deleteMutation]);

  return (
    <div className={cls.canvas}>
      <AppBar showNew onNew={onStartFolder} />
      <div className={cls.dash}>
        <div className={cls.wrap}>
          <div className={cls.hero}>
            <div className={cls.greeting}>
              <div className={cls.eyebrow}>Welcome back</div>
              <h1 className={cls.h1}>
                {greetingFor()}, <em>{user?.displayName ?? 'there'}.</em>
              </h1>
            </div>
          </div>

          <div className={cls.cols}>
            <div>
              <div className={cls.secHead}>
                <span className={cls.secTitle}>Projects</span>
                {!rootsQuery.isPending && <span className={cls.secCt}>{documents.length}</span>}
                <span className={cls.secSp} />
                <Button size="small" variant="secondary" onClick={onStartFile} aria-label="New file">
                  New file
                </Button>
              </div>

              {rootsQuery.isPending && (
                <div className={cls.state}><Spinner size="large" /></div>
              )}

              {rootsQuery.isError && (
                <div className={cls.state} data-testid="dashboard-error">
                  <p className={cls.stateText}>We couldn&apos;t load your projects.</p>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => rootsQuery.refetch()}
                    isLoading={rootsQuery.isFetching}
                    aria-label="Retry loading projects"
                  >
                    Try again
                  </Button>
                </div>
              )}

              {!rootsQuery.isPending && !rootsQuery.isError && (
                <div className={cls.projgrid}>
                  {documents.map((document) => (
                    <DocumentCard
                      key={document.id}
                      document={document}
                      onOpen={onOpenDocument}
                      onDelete={onDeleteDocument}
                    />
                  ))}

                  {creatingKind && (
                    <InlineNameInput
                      className={cls.createCard}
                      ariaLabel={creatingKind === 'folder' ? 'New project name' : 'New file name'}
                      placeholder={creatingKind === 'folder' ? 'project name' : 'file name'}
                      icon={creatingKind === 'folder' ? <Icons.Folder size={14} /> : <Icons.Files size={14} />}
                      onSubmit={onSubmitCreate}
                      onCancel={onCancelCreate}
                    />
                  )}

                  {!creatingKind && (
                    <div
                      className={cls.projNew}
                      onClick={onStartFolder}
                      role="button"
                      tabIndex={0}
                      aria-label="New project"
                      data-testid="new-project"
                    >
                      <div className={cls.plus}><Icons.Plus size={18} /></div>
                      <span>New project</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className={cls.side}>
              <div className={cls.cardSoft}>
                <div className={cls.cardHead}>
                  <span className={cls.cardTitle}>Recently updated</span>
                </div>

                {recentlyUpdated.length === 0 && (
                  <p className={cls.sideEmpty}>Nothing yet — create a project to get started.</p>
                )}

                {recentlyUpdated.map((document) => (
                  <div
                    className={cls.actrow}
                    key={document.id}
                    onClick={() => onOpenDocument(document)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${document.name}`}
                  >
                    <span className={cls.sideIcon} aria-hidden="true">
                      {document.kind === 'folder' ? <Icons.Folder size={14} /> : <Icons.Files size={14} />}
                    </span>
                    <div className={cls.actTxt}><b>{document.name}</b></div>
                    <span className={cls.actTime}>{relativeTime(document.updatedAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
