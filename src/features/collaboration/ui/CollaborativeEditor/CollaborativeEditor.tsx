import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { MonacoBinding } from 'y-monaco';
import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import { classNames } from '@/shared/lib/classNames/classNames';
import { useIsCompact } from '@/shared/lib/media/useMediaQuery';
import { languageFromFileName } from '@/shared/lib/language/language';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import {
  EDITOR_FONT_STACKS,
  useCollaborationPreferences,
  useEditorPreferences,
  useResolvedTheme,
} from '@/features/preferences';
import { useAiComplete } from '@/features/aiComplete';
import { RemoteCursorStyles } from '../RemoteCursorStyles/RemoteCursorStyles';
import { projectUri } from '../../model/typeSupport/editorLibs/editorLibs';
import {
  useTypeSupport,
  type EditorProject,
} from '../../model/typeSupport/useTypeSupport/useTypeSupport';
import type { PresencePeer } from '../../model/presence/presence';
import {
  defineEditorThemes,
  EDITOR_THEME_DARK,
  EDITOR_THEME_LIGHT,
} from '../../model/editorTheme/editorTheme';
import cls from './CollaborativeEditor.module.scss';

export interface EditorCursor {
  line: number;
  column: number;
  /** Characters currently selected, 0 when the selection is empty. */
  selected: number;
}

interface CollaborativeEditorProps {
  className?: string;
  text: Y.Text | null;
  awareness: Awareness | null;
  fileName: string;
  /**
   * The project around the file, when it is one the type checker can use.
   * Gives the model its real path, so imports of the project's other files
   * and packages resolve, and the editor stops reporting them as missing.
   */
  project?: EditorProject | null;
  readOnly?: boolean;
  peers?: PresencePeer[];
  onCursorChange?: (cursor: EditorCursor) => void;
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
  const {
    className,
    text,
    awareness,
    fileName,
    project = null,
    readOnly = false,
    peers = NO_PEERS,
    onCursorChange,
  } = props;
  const [editorInstance, setEditorInstance] = useState<editor.IStandaloneCodeEditor | null>(null);
  const [model, setModel] = useState<editor.ITextModel | null>(null);

  const preferences = useEditorPreferences();
  const collaboration = useCollaborationPreferences();
  const theme = useResolvedTheme();

  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    defineEditorThemes(monaco);
  }, []);

  const [monacoApi, setMonacoApi] = useState<Parameters<OnMount>[1] | null>(null);

  const handleMount: OnMount = useCallback((instance, monaco) => {
    setEditorInstance(instance);
    setModel(instance.getModel());
    setMonacoApi(monaco);
  }, []);

  useTypeSupport(monacoApi, project, model);

  // Registered alongside the type support and disposed with it: the inline
  // provider and the Cmd+I action both live on Monaco, not on this component.
  // The model's uri is the project path, but the prompt wants the file's real
  // path, which is what the project carries.
  useAiComplete(monacoApi, editorInstance, project?.path ?? fileName);

  // The model changes when the file does, and again when its project path
  // becomes known; the binding below has to follow it each time.
  useEffect(() => {
    if (!editorInstance) return;
    const subscription = editorInstance.onDidChangeModel(() => setModel(editorInstance.getModel()));
    return () => subscription.dispose();
  }, [editorInstance]);

  /**
   * Monaco caches the width of a character when it lays out. A webfont that
   * finishes loading afterwards — or simply picking a different one — leaves
   * that cache describing the previous face, so the caret and selections drift
   * further out of line the further along a row you go.
   */
  useEffect(() => {
    if (!monacoApi) return;

    monacoApi.editor.remeasureFonts();
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) monacoApi.editor.remeasureFonts();
    });

    return () => { cancelled = true; };
  }, [monacoApi, preferences.fontFamily, preferences.fontSize, preferences.ligatures]);

  const isCompact = useIsCompact();

  const options = useMemo((): editor.IStandaloneEditorConstructionOptions => ({
    /*
     * The minimap is a preference, but on a narrow viewport it eats a fifth of
     * the text column to show a thumbnail nobody can read or drag accurately,
     * so it is forced off regardless of the setting.
     */
    minimap: { enabled: preferences.minimap && !isCompact, renderCharacters: false },
    fontSize: preferences.fontSize,
    fontFamily: EDITOR_FONT_STACKS[preferences.fontFamily],
    fontLigatures: preferences.ligatures,
    tabSize: preferences.tabSize,
    /* Horizontal scrolling to read a line is miserable on a phone, and the
       column is too narrow for anything else to work. */
    wordWrap: preferences.wordWrap || isCompact ? 'on' : 'off',
    lineNumbersMinChars: 3,
    lineHeight: 1.6,
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    automaticLayout: true,
    padding: { top: 14, bottom: 14 },
    renderWhitespace: 'selection',
    renderLineHighlight: 'all',
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    bracketPairColorization: { enabled: true },
    /* Ghost text from the AI completion provider; Monaco owns it and Tab. */
    inlineSuggest: { enabled: true },
    guides: { indentation: true, bracketPairs: 'active' },
    /* Sticky scroll costs two or three lines of a very short viewport. */
    stickyScroll: { enabled: !isCompact },
    scrollbar: {
      verticalScrollbarSize: isCompact ? 14 : 11,
      horizontalScrollbarSize: isCompact ? 14 : 11,
      useShadows: false,
    },
    overviewRulerBorder: false,
    roundedSelection: false,
    readOnly,
  }), [isCompact, preferences, readOnly]);

  // Feeds the status bar. Monaco owns the selection, so it is read from the
  // editor rather than mirrored into React state on every keystroke.
  useEffect(() => {
    if (!editorInstance || !onCursorChange) return;

    const report = () => {
      const position = editorInstance.getPosition();
      if (!position) return;

      const selection = editorInstance.getSelection();
      const model = editorInstance.getModel();
      const selected = selection && model && !selection.isEmpty()
        ? model.getValueInRange(selection).length
        : 0;

      onCursorChange({ line: position.lineNumber, column: position.column, selected });
    };

    report();
    const subscription = editorInstance.onDidChangeCursorSelection(report);
    return () => subscription.dispose();
  }, [editorInstance, onCursorChange]);

  useEffect(() => {
    if (!editorInstance || !text || !model || model.isDisposed()) return;

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
      // A model left behind keeps its last text and, being a model, outranks
      // the fresher copy of that file the type checker is given — so once no
      // binding feeds it, it goes. Only after the binding is gone, or a late
      // remote edit would be applied to a disposed model.
      if (editorInstance.getModel() !== model && !model.isDisposed()) model.dispose();
    };
  }, [editorInstance, model, text, awareness, collaboration.liveCursors]);

  // Under its project path, a file's imports resolve the way the project's
  // own tooling resolves them; a file outside any project keeps its name.
  const modelPath = project ? projectUri(project.key, project.path) : fileName;

  return (
    <div className={classNames(cls.root, {}, [className])} data-testid="collaborative-editor">
      {collaboration.liveCursors && (
        <RemoteCursorStyles peers={peers} showLabels={collaboration.cursorLabels} />
      )}
      <Editor
        // `path` gives each document its own model, so switching files does not
        // leak undo history or bindings between them.
        path={modelPath}
        defaultLanguage={languageFromFileName(fileName)}
        theme={theme === 'light' ? EDITOR_THEME_LIGHT : EDITOR_THEME_DARK}
        loading={loading}
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        options={options}
      />
    </div>
  );
});
