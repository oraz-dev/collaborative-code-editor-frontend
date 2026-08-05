import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { MonacoBinding } from 'y-monaco';
import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import { classNames } from '@/shared/lib/classNames/classNames';
import { languageFromFileName } from '@/shared/lib/language/language';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import {
  EDITOR_FONT_STACKS,
  useCollaborationPreferences,
  useEditorPreferences,
  useResolvedTheme,
} from '@/features/preferences';
import { RemoteCursorStyles } from '../RemoteCursorStyles/RemoteCursorStyles';
import type { PresencePeer } from '../../model/presence/presence';
import cls from './CollaborativeEditor.module.scss';

interface CollaborativeEditorProps {
  className?: string;
  text: Y.Text | null;
  awareness: Awareness | null;
  fileName: string;
  readOnly?: boolean;
  peers?: PresencePeer[];
}

const loading = (
  <div className={cls.loading} role="status" aria-live="polite" aria-label="Loading editor">
    <Spinner size="large" />
  </div>
);

const NO_PEERS: PresencePeer[] = [];

/**
 * Monaco driven entirely by the shared Y.Text — no `value` prop, because a
 * controlled value would fight the CRDT binding for ownership of the buffer.
 */
export const CollaborativeEditor = memo((props: CollaborativeEditorProps) => {
  const { className, text, awareness, fileName, readOnly = false, peers = NO_PEERS } = props;
  const [editorInstance, setEditorInstance] = useState<editor.IStandaloneCodeEditor | null>(null);

  const preferences = useEditorPreferences();
  const collaboration = useCollaborationPreferences();
  const theme = useResolvedTheme();

  const handleMount: OnMount = useCallback((instance) => {
    setEditorInstance(instance);
  }, []);

  const options = useMemo((): editor.IStandaloneEditorConstructionOptions => ({
    minimap: { enabled: preferences.minimap },
    fontSize: preferences.fontSize,
    fontFamily: EDITOR_FONT_STACKS[preferences.fontFamily],
    fontLigatures: preferences.ligatures,
    tabSize: preferences.tabSize,
    wordWrap: preferences.wordWrap ? 'on' : 'off',
    lineNumbersMinChars: 3,
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    automaticLayout: true,
    padding: { top: 12, bottom: 12 },
    renderWhitespace: 'selection',
    readOnly,
  }), [preferences, readOnly]);

  useEffect(() => {
    if (!editorInstance || !text) return;

    const model = editorInstance.getModel();
    if (!model) return;

    // Withholding awareness is what actually turns remote cursors off — the
    // binding renders selections only for the awareness it is given.
    const binding = new MonacoBinding(
      text,
      model,
      new Set([editorInstance]),
      collaboration.liveCursors ? awareness : null,
    );

    return () => {
      binding.destroy();
    };
  }, [editorInstance, text, awareness, collaboration.liveCursors]);

  return (
    <div className={classNames(cls.root, {}, [className])} data-testid="collaborative-editor">
      {collaboration.liveCursors && (
        <RemoteCursorStyles peers={peers} showLabels={collaboration.cursorLabels} />
      )}
      <Editor
        // `path` gives each document its own model, so switching files does not
        // leak undo history or bindings between them.
        path={fileName}
        defaultLanguage={languageFromFileName(fileName)}
        theme={theme === 'light' ? 'light' : 'vs-dark'}
        loading={loading}
        onMount={handleMount}
        options={options}
      />
    </div>
  );
});
