import { act, render, screen } from '@testing-library/react';
import * as Y from 'yjs';
import type { EditorProject } from '../../model/typeSupport/useTypeSupport/useTypeSupport';
import { CollaborativeEditor } from './CollaborativeEditor';

interface FakeModel {
  uri: string;
  disposed: boolean;
  isDisposed: () => boolean;
  dispose: () => void;
}

function fakeModel(uri: string): FakeModel {
  const model: FakeModel = {
    uri,
    disposed: false,
    isDisposed: () => model.disposed,
    dispose: () => {
      model.disposed = true;
      events.push(`dispose ${uri}`);
    },
  };
  return model;
}

const events: string[] = [];
let modelListeners: Array<() => void> = [];
let current: FakeModel = fakeModel('first');

const fakeEditor = {
  getModel: () => current,
  onDidChangeModel: (listener: () => void) => {
    modelListeners.push(listener);
    return { dispose: () => { modelListeners = modelListeners.filter((item) => item !== listener); } };
  },
  onDidChangeCursorSelection: () => ({ dispose: () => undefined }),
  getPosition: () => null,
  getSelection: () => null,
};

const editorProps = vi.hoisted(() => ({ last: null as null | { path: string } }));

vi.mock('@monaco-editor/react', () => ({
  default: (props: { path: string; onMount: (editor: unknown, monaco: unknown) => void }) => {
    editorProps.last = props;
    // Mounted once, like Monaco: the model is what changes afterwards.
    if (!(globalThis as { mounted?: boolean }).mounted) {
      (globalThis as { mounted?: boolean }).mounted = true;
      queueMicrotask(() => props.onMount(fakeEditor, { editor: { remeasureFonts: () => undefined }, languages: {} }));
    }
    return <div data-testid="monaco-stub" />;
  },
}));

vi.mock('y-monaco', () => ({
  MonacoBinding: class {
    private readonly model: FakeModel;

    constructor(_text: unknown, model: FakeModel) {
      this.model = model;
      events.push(`bind ${model.uri}`);
    }

    destroy() {
      events.push(`unbind ${this.model.uri}`);
    }
  },
}));

const project: EditorProject = {
  key: 'root',
  path: 'src/components/Clock.tsx',
  files: [],
  packages: [],
  paths: {},
  strict: false,
  usesJsx: false,
};

function switchModel(uri: string) {
  current = fakeModel(uri);
  act(() => modelListeners.forEach((listener) => listener()));
}

beforeEach(() => {
  events.length = 0;
  modelListeners = [];
  current = fakeModel('first');
  (globalThis as { mounted?: boolean }).mounted = false;
});

describe('CollaborativeEditor', () => {
  const text = new Y.Doc().getText('t');

  test('a file outside any project keeps its name as the model path', () => {
    render(<CollaborativeEditor text={text} awareness={null} fileName="Clock.tsx" />);

    expect(screen.getByTestId('collaborative-editor')).toBeInTheDocument();
    expect(editorProps.last?.path).toBe('Clock.tsx');
  });

  test('a project file gets its real path, so its imports resolve', () => {
    render(<CollaborativeEditor text={text} awareness={null} fileName="Clock.tsx" project={project} />);

    expect(editorProps.last?.path).toBe('file:///p/root/src/components/Clock.tsx');
  });

  test('the binding follows the model, and the old model goes only after its binding', async () => {
    render(<CollaborativeEditor text={text} awareness={null} fileName="Clock.tsx" />);
    await act(async () => { await Promise.resolve(); });
    expect(events).toEqual(['bind first']);

    switchModel('second');

    expect(events).toEqual(['bind first', 'unbind first', 'dispose first', 'bind second']);
  });
});
