import { memo, useCallback, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal/Modal';
import { Button } from '@/shared/ui/Button/Button';
import { Input } from '@/shared/ui/Input/Input';
import { Select } from '@/shared/ui/Select/Select';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import { Icons } from '@/shared/ui/Icon/Icons';
import { initials } from '@/shared/lib/initials/initials';
import { isApiError } from '@/shared/api';
import { useUserSearch, useUsersByIds, type User } from '@/entities/User';
import {
  GRANTABLE_ROLES,
  GRANTABLE_ROLE_LABELS,
  toGrantableRole,
  useCollaborators,
  useRemoveCollaborator,
  useShareDocument,
  useUpdateCollaboratorRole,
  type Collaborator,
  type GrantableRole,
  type WorkspaceDocument,
} from '@/entities/Document';
import cls from './ShareDialog.module.scss';

interface ShareDialogProps {
  className?: string;
  open: boolean;
  onClose: () => void;
  document: WorkspaceDocument | null;
  /** Only the owner may change who has access. */
  isOwner: boolean;
  currentUserId: string | null;
}

const ROLE_OPTIONS = GRANTABLE_ROLES.map((role) => ({
  value: role,
  label: GRANTABLE_ROLE_LABELS[role],
}));

function describeError(error: unknown): string {
  if (!isApiError(error)) return 'Something went wrong. Please try again.';
  if (error.kind === 'network') return 'Cannot reach the server. Check your connection.';
  if (error.status === 403) return 'Only the owner can change who has access.';
  if (error.status === 404) return 'That user could not be found.';
  return error.message;
}

export const ShareDialog = memo((props: ShareDialogProps) => {
  const { open, onClose, document, isOwner, currentUserId } = props;

  const [query, setQuery] = useState('');
  const [role, setRole] = useState<GrantableRole>('editor');

  const documentId = document?.id ?? null;
  const collaboratorsQuery = useCollaborators(documentId, open);
  const userSearch = useUserSearch(query, open && isOwner);

  const shareMutation = useShareDocument();
  const roleMutation = useUpdateCollaboratorRole();
  const removeMutation = useRemoveCollaborator();

  const rawCollaborators = collaboratorsQuery.data ?? [];

  // The document service returns collaborators with empty username and
  // display_name, so anyone unresolved is looked up in a single batch against
  // the auth service rather than being rendered as a bare uuid.
  const unresolvedIds = useMemo(
    () => rawCollaborators.filter((entry) => !entry.username).map((entry) => entry.userId),
    [rawCollaborators],
  );
  const profilesQuery = useUsersByIds(unresolvedIds, open);

  const collaborators = useMemo(() => {
    const profiles = new Map((profilesQuery.data ?? []).map((user) => [user.id, user]));
    if (profiles.size === 0) return rawCollaborators;

    return rawCollaborators.map((entry) => {
      const profile = profiles.get(entry.userId);
      if (!profile) return entry;
      return {
        ...entry,
        username: entry.username || profile.username,
        displayName: profile.displayName || entry.displayName,
        avatarUrl: entry.avatarUrl ?? profile.avatarUrl,
      };
    });
  }, [profilesQuery.data, rawCollaborators]);

  const existingIds = useMemo(
    () => new Set(collaborators.map((entry) => entry.userId)),
    [collaborators],
  );

  const handleRoleChange = useCallback((value: string) => {
    setRole(toGrantableRole(value));
  }, []);

  const onInvite = useCallback((user: User) => {
    if (!documentId) return;
    shareMutation.mutate({ documentId, userId: user.id, role });
    setQuery('');
  }, [documentId, role, shareMutation]);

  const onChangeExistingRole = useCallback((collaborator: Collaborator, value: string) => {
    if (!documentId) return;
    roleMutation.mutate({
      documentId,
      userId: collaborator.userId,
      role: toGrantableRole(value),
    });
  }, [documentId, roleMutation]);

  const onRevoke = useCallback((collaborator: Collaborator) => {
    if (!documentId) return;
    removeMutation.mutate({ documentId, userId: collaborator.userId });
  }, [documentId, removeMutation]);

  const onLeave = useCallback(() => {
    if (!documentId || !currentUserId) return;
    removeMutation.mutate(
      { documentId, userId: currentUserId },
      { onSuccess: onClose },
    );
  }, [currentUserId, documentId, onClose, removeMutation]);

  const mutationError = shareMutation.error ?? roleMutation.error ?? removeMutation.error;
  const results = (userSearch.data ?? []).filter((user) => user.id !== currentUserId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={document ? `Share “${document.name}”` : 'Share'}
    >
      <div className={cls.root} data-testid="share-dialog">
        {document?.kind === 'folder' && (
          <p className={cls.note}>
            Everyone you add here also gets access to everything inside this folder.
          </p>
        )}

        {isOwner && (
          <div className={cls.invite}>
            <div className={cls.inviteRow}>
              <Input
                className={cls.inviteInput}
                value={query}
                onChange={setQuery}
                placeholder="Search by username or email"
                aria-label="Search people to share with"
                data-testid="share-search"
              />
              <Select
                className={cls.roleSelect}
                value={role}
                onChange={handleRoleChange}
                options={ROLE_OPTIONS}
              />
            </div>

            {userSearch.isFetching && (
              <div className={cls.searchState}><Spinner /></div>
            )}

            {userSearch.isError && (
              <div className={cls.searchState}>
                <span className={cls.error}>
                  {/* The lookup lives on the auth service, which may be down separately. */}
                  Couldn&apos;t search for people right now.
                </span>
              </div>
            )}

            {!userSearch.isFetching && query.trim().length >= 2 && results.length === 0 && !userSearch.isError && (
              <div className={cls.searchState}>
                <span className={cls.muted}>Nobody matches “{query.trim()}”.</span>
              </div>
            )}

            {results.length > 0 && (
              <div className={cls.results}>
                {results.map((user) => (
                  <div className={cls.result} key={user.id}>
                    <Avatar size="sm" initials={initials(user.displayName)} />
                    <div className={cls.resultText}>
                      <span className={cls.resultName}>{user.displayName}</span>
                      <span className={cls.resultSub}>{user.username || user.email}</span>
                    </div>
                    <Button
                      size="small"
                      variant="secondary"
                      onClick={() => onInvite(user)}
                      isLoading={shareMutation.isPending}
                      aria-label={`Share with ${user.displayName}`}
                    >
                      {existingIds.has(user.id) ? 'Update' : 'Invite'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={cls.listHead}>People with access</div>

        {collaboratorsQuery.isPending && (
          <div className={cls.searchState}><Spinner /></div>
        )}

        {collaboratorsQuery.isError && (
          <div className={cls.searchState}>
            <span className={cls.error}>Couldn&apos;t load who has access.</span>
            <Button
              size="small"
              variant="secondary"
              onClick={() => collaboratorsQuery.refetch()}
              aria-label="Retry loading collaborators"
            >
              Retry
            </Button>
          </div>
        )}

        <div className={cls.list}>
          {collaborators.map((collaborator) => {
            const isSelf = collaborator.userId === currentUserId;
            const isDocumentOwner = collaborator.role === 'owner';

            return (
              <div className={cls.row} key={collaborator.userId} data-testid={`collaborator-${collaborator.userId}`}>
                <Avatar size="sm" initials={initials(collaborator.displayName)} />
                <div className={cls.rowText}>
                  <span className={cls.rowName}>
                    {collaborator.displayName}{isSelf && <span className={cls.you}> (you)</span>}
                  </span>
                  {collaborator.username && (
                    <span className={cls.rowSub}>{collaborator.username}</span>
                  )}
                </div>

                {isDocumentOwner ? (
                  <span className={cls.ownerTag}>Owner</span>
                ) : isOwner ? (
                  <>
                    <Select
                      className={cls.roleSelect}
                      value={collaborator.role}
                      onChange={(value) => onChangeExistingRole(collaborator, value)}
                      options={ROLE_OPTIONS}
                    />
                    <button
                      type="button"
                      className={cls.revoke}
                      onClick={() => onRevoke(collaborator)}
                      aria-label={`Remove ${collaborator.displayName}`}
                    >
                      <Icons.X size={14} />
                    </button>
                  </>
                ) : (
                  <span className={cls.roleTag}>
                    {collaborator.role === 'editor' ? 'Can edit' : 'Can view'}
                  </span>
                )}
              </div>
            );
          })}

          {!collaboratorsQuery.isPending && collaborators.length === 0 && (
            <p className={cls.muted}>Only you so far.</p>
          )}
        </div>

        {Boolean(mutationError) && (
          <div className={cls.errorBox} role="alert" data-testid="share-error">
            {describeError(mutationError)}
          </div>
        )}

        {!isOwner && currentUserId && (
          <div className={cls.leave}>
            <Button
              size="small"
              variant="secondary"
              onClick={onLeave}
              isLoading={removeMutation.isPending}
              aria-label="Leave this document"
            >
              Leave this document
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
});
