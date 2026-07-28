import { memo, useCallback, useEffect, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { MonacoBinding } from 'y-monaco';
import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import { classNames } from '@/shared/lib/classNames/classNames';
import { languageFromFileName } from '@/shared/lib/language/language';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import cls from './CollaborativeEditor.module.scss';

interface CollaborativeEditorProps {
  className?: string;
  text: Y.Text | null;
  awareness: Awareness | null;
  fileName: string;
  readOnly?: boolean;
}

const EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  minimap: { enabled: false },
  fontSize: 13,
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
  lineNumbersMinChars: 3,
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  automaticLayout: true,
  padding: { top: 12, bottom: 12 },
  renderWhitespace: 'selection',
  tabSize: 2,
};

const loading = (
  <div className={cls.loading} role="status" aria-live="polite" aria-label="Loading editor">
    <Spinner size="large" />
  </div>
);

/**
 * Monaco driven entirely by the shared Y.Text — no `value` prop, because a
 * controlled value would fight the CRDT binding for ownership of the buffer.
 */
export const CollaborativeEditor = memo((props: CollaborativeEditorProps) => {
  const { className, text, awareness, fileName, readOnly = false } = props;
  const [editorInstance, setEditorInstance] = useState<editor.IStandaloneCodeEditor | null>(null);

  const handleMount: OnMount = useCallback((instance) => {
    setEditorInstance(instance);
  }, []);

  useEffect(() => {
    if (!editorInstance || !text || !awareness) return;

    const model = editorInstance.getModel();
    if (!model) return;

    // Binds the buffer and renders remote selections from awareness.
    const binding = new MonacoBinding(text, model, new Set([editorInstance]), awareness);

    return () => {
      binding.destroy();
    };
  }, [editorInstance, text, awareness]);

  return (
    <div className={classNames(cls.root, {}, [className])} data-testid="collaborative-editor">
      <Editor
        // `path` gives each document its own model, so switching files does not
        // leak undo history or bindings between them.
        path={fileName}
        defaultLanguage={languageFromFileName(fileName)}
        theme="vs-dark"
        loading={loading}
        onMount={handleMount}
        options={{ ...EDITOR_OPTIONS, readOnly }}
      />
    </div>
  );
});
