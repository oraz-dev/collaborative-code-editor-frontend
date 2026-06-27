import { useState, useRef, useCallback, useMemo, memo } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor as monacoEditor } from 'monaco-editor';
import { Badge } from '@/shared/ui/Badge/Badge';
import { LIVE_CURSORS, COMMENTS, byId, type FileData, type CodeSegment } from '@/shared/data/demo';
import cls from './CodeView.module.scss';

const LANG_MAP: Record<string, string> = {
  tsx: 'typescript',
  ts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  css: 'css',
  json: 'json',
  md: 'markdown',
};

function linesToText(lines: CodeSegment[][]): string {
  return lines.map(segs => segs.map(([, txt]) => txt).join('')).join('\n');
}

interface CodeViewProps {
  className?: string;
  file: FileData;
  activeLine: number;
  onFileChange?: (lines: CodeSegment[][]) => void;
}

export const CodeView = memo((props: CodeViewProps) => {
  const { file, activeLine: initialActiveLine, onFileChange } = props;
  const [cursorLine, setCursorLine] = useState(initialActiveLine);
  const [cursorCol, setCursorCol] = useState(1);
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);

  const cursors = LIVE_CURSORS[file.name] || [];
  const comments = COMMENTS[file.name] || [];

  const text = useMemo(() => linesToText(file.lines), [file.lines]);
  const language = LANG_MAP[file.lang] || file.lang;

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    monaco.editor.defineTheme('space-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '5a6074', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'a98bff' },
        { token: 'string', foreground: '5fd6a4' },
        { token: 'number', foreground: 'e7ab43' },
        { token: 'type', foreground: '5fc9d6' },
        { token: 'identifier', foreground: 'c9cdd8' },
        { token: 'delimiter', foreground: '828ca2' },
      ],
      colors: {
        'editor.background': '#00000000',
        'editor.lineHighlightBackground': '#ffffff06',
        'editor.selectionBackground': '#4d9eff33',
        'editorCursor.foreground': '#4d9eff',
        'editorLineNumber.foreground': '#3a3f4d',
        'editorLineNumber.activeForeground': '#828ca2',
        'editorGutter.background': '#00000000',
        'editor.lineHighlightBorder': '#00000000',
        'editorOverviewRuler.border': '#00000000',
        'scrollbarSlider.background': '#ffffff10',
        'scrollbarSlider.hoverBackground': '#ffffff18',
        'editorWidget.background': '#141720',
        'editorWidget.border': '#1e2230',
        'editorSuggestWidget.background': '#141720',
        'editorSuggestWidget.border': '#1e2230',
        'editorSuggestWidget.selectedBackground': '#1e2a40',
        'editorSuggestWidget.highlightForeground': '#4d9eff',
        'editorSuggestWidget.focusHighlightForeground': '#4d9eff',
      },
    });
    monaco.editor.setTheme('space-dark');

    editor.onDidChangeCursorPosition((e) => {
      setCursorLine(e.position.lineNumber);
      setCursorCol(e.position.column);
    });

    editor.onDidChangeModelContent(() => {
      const value = editor.getValue();
      const newLines: CodeSegment[][] = value.split('\n').map(line =>
        line.length > 0 ? [['p', line]] : [],
      );
      onFileChange?.(newLines);
    });

    if (cursors.length > 0) {
      const decorations: monacoEditor.IModelDeltaDecoration[] = cursors.map(c => {
        const who = byId(c.who);
        return {
          range: new monaco.Range(c.line, c.col, c.line, c.col),
          options: {
            className: cls.remoteCursor,
            hoverMessage: { value: who.short },
            before: {
              content: '​',
              inlineClassName: cls.remoteCursorLine,
            },
            after: {
              content: ` ${who.short}`,
              inlineClassName: cls.remoteCursorLabel,
            },
          },
        };
      });
      editor.createDecorationsCollection(decorations);
    }

    if (comments.length > 0) {
      const commentDecorations: monacoEditor.IModelDeltaDecoration[] = comments.map(c => ({
        range: new monaco.Range(c.line, 1, c.line, 1),
        options: {
          isWholeLine: true,
          linesDecorationsClassName: cls.commentGutterDot,
          className: cls.commentLineHighlight,
        },
      }));
      editor.createDecorationsCollection(commentDecorations);
    }

    editor.setPosition({ lineNumber: initialActiveLine, column: 1 });
    editor.revealLineInCenter(initialActiveLine);
    editor.focus();
  }, [cursors, comments, initialActiveLine, onFileChange]);

  return (
    <div className={cls.root}>
      <div className={cls.head}>
        <div className={cls.crumb}>
          {file.path.map((p, i) => (
            <span key={i}>{p} <span className={cls.crumbSep}>/</span></span>
          ))}
          <span className={cls.crumbName}>{file.name}</span>
        </div>
        <div className={cls.titleRow}>
          <span className={cls.title}>{file.name}</span>
          <Badge variant="info" size="sm">{file.lang.toUpperCase()}</Badge>
          <div className={cls.meta}>
            <span>Edited by {byId(file.editedBy).short}</span>
            <span>· {file.editedAt}</span>
          </div>
        </div>
      </div>
      <div className={cls.editorWrap}>
        <Editor
          height="100%"
          language={language}
          value={text}
          onMount={handleMount}
          options={{
            fontSize: 13.5,
            fontFamily: 'var(--font-mono)',
            lineHeight: 30,
            padding: { top: 18, bottom: 28 },
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            renderLineHighlight: 'line',
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            smoothScrolling: true,
            tabSize: 2,
            wordWrap: 'off',
            automaticLayout: true,
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
              useShadows: false,
            },
            glyphMargin: false,
            folding: true,
            lineNumbersMinChars: 3,
            contextmenu: true,
            bracketPairColorization: { enabled: true },
            suggest: {
              showKeywords: true,
              showSnippets: true,
              showFunctions: true,
              showVariables: true,
              showClasses: true,
              showInterfaces: true,
              showModules: true,
              showProperties: true,
              showMethods: true,
              preview: true,
            },
            quickSuggestions: {
              other: true,
              comments: false,
              strings: false,
            },
            parameterHints: { enabled: true },
            acceptSuggestionOnCommitCharacter: true,
            wordBasedSuggestions: 'currentDocument',
          }}
          loading={<div className={cls.loading}>Loading editor…</div>}
        />
      </div>
      <div className={cls.foot}>
        <span className={cls.live}><span className={cls.liveDot} /> {cursors.length + 1} editing</span>
        <span className={cls.sp} />
        <span>{file.lang.toUpperCase()}</span>
        <span>Ln {cursorLine}, Col {cursorCol}</span>
        <span>UTF-8</span>
      </div>
    </div>
  );
});
