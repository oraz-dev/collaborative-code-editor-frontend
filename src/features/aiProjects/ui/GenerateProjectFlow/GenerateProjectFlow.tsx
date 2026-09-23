import { memo, useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { toEditorPath } from '@/shared/config/routeConfig/routeConfig';
import { useSession } from '@/features/auth';
import {
  useCreateDocument,
  useDocumentRoots,
  type CreateDocumentInput,
} from '@/entities/Document';
import { useAiSettings } from '../../model/aiSettings/aiSettings';
import { useOpenRouterClient } from '../../model/useOpenRouterClient/useOpenRouterClient';
import { useProjectGenerator } from '../../model/useProjectGenerator/useProjectGenerator';
import { GenerateProjectDialog } from '../GenerateProjectDialog/GenerateProjectDialog';

/**
 * The dialog, wired to this app.
 *
 * Everything the generator needs comes from somewhere different — the model
 * from settings, the owner from the session, the create call from the
 * documents mutation, the sibling names from the roots query — so the joining
 * happens here and the dialog itself stays a pure view over one state machine.
 *
 * Nothing gates on a credential. The assistant is reached through this app's
 * proxy with the session the user is already signed in with, so there is no
 * "set this up first" state: a session that has ended is found out on the
 * request, which fails saying exactly that.
 */

interface GenerateProjectFlowProps {
  className?: string;
  open: boolean;
  onClose: () => void;
}

export const GenerateProjectFlow = memo((props: GenerateProjectFlowProps) => {
  const { className, open, onClose } = props;

  const navigate = useNavigate();
  const { user } = useSession();
  const settings = useAiSettings();
  const client = useOpenRouterClient();

  const rootsQuery = useDocumentRoots();
  const createMutation = useCreateDocument();

  /**
   * A model chosen in the dialog applies to this generation only; the saved
   * preference is the starting point, and changing the default belongs in
   * Settings where it will be remembered.
   */
  const [modelOverride, setModelOverride] = useState<string | null>(null);
  const modelId = modelOverride ?? settings.modelId;

  // The optimistic mutation is the same one the dashboard uses, so a generated
  // project appears in the grid as it is created rather than after a refetch.
  const createDocument = useCallback(
    (input: CreateDocumentInput) => createMutation.mutateAsync(input),
    [createMutation],
  );

  const existingNames = useMemo(
    () => (rootsQuery.data ?? []).map((document) => document.name),
    [rootsQuery.data],
  );

  const generator = useProjectGenerator({
    client,
    modelId,
    fallbackEnabled: settings.fallbackEnabled,
    ownerId: user?.id ?? '',
    createDocument,
    existingNames,
  });

  const onOpenDocument = useCallback((documentId: string) => {
    navigate(toEditorPath(documentId));
  }, [navigate]);

  return (
    <GenerateProjectDialog
      className={className}
      open={open}
      onClose={onClose}
      generator={generator}
      modelId={modelId}
      onModelChange={setModelOverride}
      onOpenDocument={onOpenDocument}
    />
  );
});
