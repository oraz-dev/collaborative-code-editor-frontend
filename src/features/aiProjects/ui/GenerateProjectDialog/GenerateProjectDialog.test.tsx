import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChainModel } from '../../model/modelChain/modelChain';
import type { GeneratorState, ProjectGenerator } from '../../model/useProjectGenerator/useProjectGenerator';
import { GenerateProjectDialog } from './GenerateProjectDialog';

/** A chain of made-up models, so the assertions do not move when the real one does. */
const CHAIN: ChainModel[] = [
  { id: 'alpha:free', label: 'Alpha', structured: true, maxOutput: 32_000, contextLength: 100_000, note: 'The quick one.' },
  { id: 'beta:free', label: 'Beta', structured: true, maxOutput: 32_000, contextLength: 100_000 },
];

const BASE: GeneratorState = {
  phase: 'idle',
  request: '',
  plan: null,
  files: [],
  name: null,
  summary: null,
  report: null,
  progress: {
    files: 0,
    path: null,
    bytes: 0,
    contentStarted: false,
    startedAt: null,
    lastActivityAt: null,
    contentBytes: 0,
  },
  creation: null,
  attempts: [],
  model: null,
  notice: null,
  error: null,
  result: null,
  created: [],
  createdRootName: null,
  repaired: false,
};

const PLAN = {
  name: 'Bare App',
  summary: 'A bare React 19 page.',
  files: [
    { path: 'index.html', purpose: 'The page' },
    { path: 'src/main.tsx', purpose: 'The entry' },
  ],
};

const FILES = [
  { path: 'index.html', content: '<!doctype html>' },
  { path: 'src/main.tsx', content: 'export const App = () => null;' },
];

/** The state machine, scripted: the dialog is a view over exactly this. */
function fakeGenerator(state: Partial<GeneratorState> = {}): ProjectGenerator {
  return {
    state: { ...BASE, ...state },
    plan: vi.fn(async () => undefined),
    generate: vi.fn(async () => undefined),
    repair: vi.fn(async () => undefined),
    create: vi.fn(async () => undefined),
    cancel: vi.fn(),
    reset: vi.fn(),
  };
}

interface RenderOptions {
  onClose?: () => void;
  onOpenDocument?: (id: string) => void;
  onModelChange?: (id: string) => void;
  open?: boolean;
  /** A model saved in Settings, which the chain may not list. */
  modelId?: string;
}

function renderDialog(generator: ProjectGenerator, options: RenderOptions = {}) {
  const props = {
    open: options.open ?? true,
    onClose: options.onClose ?? vi.fn(),
    generator,
    chain: CHAIN,
    modelId: options.modelId ?? 'alpha:free',
    onModelChange: options.onModelChange ?? vi.fn(),
    onOpenDocument: options.onOpenDocument ?? vi.fn(),
  };

  const view = render(<GenerateProjectDialog {...props} />);
  return { ...view, props };
}

describe('GenerateProjectDialog', () => {
  describe('asking', () => {
    test('asks for a description, with presets and the model chain', () => {
      renderDialog(fakeGenerator());

      expect(screen.getByTestId('ai-request')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Use the React + Tailwind starter preset' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Model to generate with' })).toHaveTextContent('Alpha');
      expect(screen.getByText('The quick one.')).toBeInTheDocument();
    });

    test('a preset fills the request in', async () => {
      const user = userEvent.setup();
      renderDialog(fakeGenerator());

      await user.click(screen.getByRole('button', { name: 'Use the TypeScript canvas game preset' }));

      const field = screen.getByTestId('ai-request') as HTMLTextAreaElement;
      expect(field.value).toContain('canvas game');
    });

    test('Generate asks the model for a plan', async () => {
      const user = userEvent.setup();
      const generator = fakeGenerator();
      renderDialog(generator);

      await user.type(screen.getByTestId('ai-request'), 'a bare react app');
      await user.click(screen.getByRole('button', { name: 'Generate a plan for this project' }));

      expect(generator.plan).toHaveBeenCalledWith('a bare react app');
    });

    test('will not generate an empty request', async () => {
      renderDialog(fakeGenerator());
      expect(screen.getByRole('button', { name: 'Generate a plan for this project' })).toBeDisabled();
    });

    test('asks for nothing to be set up first — a typed request is enough', async () => {
      const user = userEvent.setup();
      renderDialog(fakeGenerator());

      // No credential, so no notice about one and no route out to Settings.
      expect(screen.queryByText(/key/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /settings/i })).not.toBeInTheDocument();

      await user.type(screen.getByTestId('ai-request'), 'anything');
      expect(screen.getByRole('button', { name: 'Generate a plan for this project' })).toBeEnabled();
    });
  });

  describe('the plan', () => {
    test('shows the planned files and an editable name', () => {
      renderDialog(fakeGenerator({ phase: 'plan', plan: PLAN, name: PLAN.name, summary: PLAN.summary }));

      expect(screen.getByTestId('ai-project-name')).toHaveValue('Bare App');
      expect(screen.getByText('src/main.tsx')).toBeInTheDocument();
      expect(screen.getByText('The entry')).toBeInTheDocument();
    });

    test('generates the files under the name the user edited', async () => {
      const user = userEvent.setup();
      const generator = fakeGenerator({ phase: 'plan', plan: PLAN, name: PLAN.name });
      renderDialog(generator);

      await user.clear(screen.getByTestId('ai-project-name'));
      await user.type(screen.getByTestId('ai-project-name'), 'My App');
      await user.click(screen.getByRole('button', { name: 'Generate the project files' }));

      expect(generator.generate).toHaveBeenCalledWith({ ...PLAN, name: 'My App' });
    });

    test('Back drops the plan and keeps the request', async () => {
      const user = userEvent.setup();
      const generator = fakeGenerator({ phase: 'plan', plan: PLAN });
      renderDialog(generator);

      await user.click(screen.getByRole('button', { name: 'Back' }));
      expect(generator.reset).toHaveBeenCalled();
    });
  });

  describe('generating', () => {
    const generating = () => fakeGenerator({
      phase: 'generating',
      plan: PLAN,
      files: FILES,
      model: 'beta:free',
      progress: {
        files: 2,
        path: 'src/App.tsx',
        bytes: 400,
        contentStarted: true,
        startedAt: 1_000,
        lastActivityAt: 4_000,
        contentBytes: 400,
      },
      notice: 'Alpha was busy — Beta answered.',
    });

    test('lists the files as they arrive, with sizes and the model that answered', () => {
      renderDialog(generating());

      const list = screen.getByTestId('ai-file-list');
      expect(within(list).getAllByTestId('ai-file-row')).toHaveLength(2);
      expect(within(list).getByText('15 B')).toBeInTheDocument();
      expect(screen.getByText(/Writing files with Beta/)).toBeInTheDocument();
      expect(screen.getByTestId('ai-notice')).toHaveTextContent('Alpha was busy — Beta answered.');
    });

    test('shows the file being written now, and the overall bar', () => {
      renderDialog(generating());

      expect(screen.getByTestId('ai-file-pending')).toHaveTextContent('src/App.tsx');
      expect(screen.getByRole('progressbar', { name: 'Project generation' }))
        .toHaveAttribute('aria-valuenow', '99');
    });

    test('the file list is not announced; a status line carries the milestone', () => {
      renderDialog(generating());

      expect(screen.getByTestId('ai-file-list')).toHaveAttribute('aria-live', 'off');
      expect(screen.getByRole('status')).toHaveTextContent('Writing the project files.');
    });

    test('Cancel stops the generation', async () => {
      const user = userEvent.setup();
      const generator = generating();
      renderDialog(generator);

      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(generator.cancel).toHaveBeenCalled();
    });

    test('says how much has arrived, now that there is something to size', () => {
      renderDialog(generating());

      expect(screen.getByTestId('ai-content-bytes')).toHaveTextContent('400 B written so far');
    });
  });

  /**
   * The four minutes before the first byte: the screen that used to read as a
   * hang, with a static "0 / 5" and an empty list.
   */
  describe('while the model is only thinking', () => {
    const thinking = (startedAgo = 5_000) => fakeGenerator({
      phase: 'generating',
      plan: PLAN,
      files: [],
      model: 'beta:free',
      progress: {
        ...BASE.progress,
        startedAt: Date.now() - startedAgo,
        lastActivityAt: Date.now(),
      },
    });

    test('says what is happening, names the model and shows the time', () => {
      renderDialog(thinking());

      const panel = screen.getByTestId('ai-thinking');
      expect(panel).toHaveTextContent('Beta');
      expect(panel).toHaveTextContent(/No files yet/);
      // The keep-alives are the evidence the connection is alive; say so.
      expect(panel).toHaveTextContent(/keep-alives/);
      expect(screen.getByText(/Beta is reading the plan and thinking/)).toBeInTheDocument();
      expect(screen.getByTestId('ai-working-count')).toHaveTextContent('5s');
    });

    test('shows no file list and no "0 / 5", which would both be lies', () => {
      renderDialog(thinking());

      expect(screen.queryByTestId('ai-file-list')).not.toBeInTheDocument();
      expect(screen.queryByText('0 / 2')).not.toBeInTheDocument();
      // Indeterminate: there is no share of the work to report yet.
      expect(screen.getByRole('progressbar', { name: 'Project generation' }))
        .not.toHaveAttribute('aria-valuenow');
    });

    test('the elapsed time counts up, and the live region does not', () => {
      vi.useFakeTimers();
      try {
        const generator = fakeGenerator({
          phase: 'generating',
          plan: PLAN,
          files: [],
          model: 'beta:free',
          progress: { ...BASE.progress, startedAt: Date.now(), lastActivityAt: Date.now() },
        });
        renderDialog(generator);

        expect(screen.getByTestId('ai-working-count')).toHaveTextContent('0s');
        const announced = screen.getByRole('status').textContent;

        act(() => { vi.advanceTimersByTime(65_000); });

        expect(screen.getByTestId('ai-working-count')).toHaveTextContent('1m 05s');
        // A tick is not a milestone: the one announced line has not moved.
        expect(screen.getByRole('status').textContent).toBe(announced);
        expect(announced).toMatch(/thinking/);
      } finally {
        vi.useRealTimers();
      }
    });

    test('after a long silence it says the model is slow and where to go instead', () => {
      renderDialog(thinking(95_000));

      const warning = screen.getByTestId('ai-slow-model');
      expect(warning).toHaveTextContent('Beta is slow to start');
      expect(warning).toHaveTextContent(/Cancel/);
      // The faster model by name, with the chain's own note about it.
      expect(warning).toHaveTextContent(/Alpha is quicker/);
      expect(warning).toHaveTextContent(/the quick one/);
    });

    test('a short wait is left alone', () => {
      renderDialog(thinking(20_000));

      expect(screen.queryByTestId('ai-slow-model')).not.toBeInTheDocument();
    });

    test('the first file ends it: the list and the real bar come back', () => {
      renderDialog(fakeGenerator({
        phase: 'generating',
        plan: PLAN,
        files: FILES,
        model: 'beta:free',
        progress: {
          ...BASE.progress,
          contentStarted: true,
          contentBytes: 2_048,
          startedAt: Date.now() - 95_000,
        },
      }));

      expect(screen.queryByTestId('ai-thinking')).not.toBeInTheDocument();
      // The warning is about a silent model, so content ends it too.
      expect(screen.queryByTestId('ai-slow-model')).not.toBeInTheDocument();
      expect(screen.getByTestId('ai-file-list')).toBeInTheDocument();
      expect(screen.getByTestId('ai-content-bytes')).toHaveTextContent('2.0 KB');
      expect(screen.getByRole('progressbar', { name: 'Project generation' }))
        .toHaveAttribute('aria-valuenow', '99');
    });
  });

  describe('review', () => {
    const report = {
      errors: [{ path: 'package.json', message: 'tailwindcss is a build tool and cannot be installed here.', hint: 'Remove it.' }],
      warnings: [{ path: 'src/main.tsx', message: 'This file is over 150 lines.', hint: 'Split it.' }],
    };

    test('groups the problems by file and offers a fix', async () => {
      const user = userEvent.setup();
      const generator = fakeGenerator({ phase: 'ready', files: FILES, report, name: 'Bare App' });
      renderDialog(generator);

      const problems = screen.getByTestId('ai-problems');
      expect(within(problems).getByText('package.json')).toBeInTheDocument();
      expect(within(problems).getByText(/tailwindcss is a build tool/)).toBeInTheDocument();
      expect(within(problems).getByText(/over 150 lines/)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Ask the AI to fix the problems' }));
      expect(generator.repair).toHaveBeenCalled();
    });

    test('errors make creating an explicit "anyway"', async () => {
      const user = userEvent.setup();
      const generator = fakeGenerator({ phase: 'ready', files: FILES, report, name: 'Bare App' });
      renderDialog(generator);

      await user.click(screen.getByRole('button', { name: 'Create the project documents' }));
      expect(screen.getByRole('button', { name: 'Create the project documents' })).toHaveTextContent('Create anyway');
      expect(generator.create).toHaveBeenCalledWith('Bare App');
    });

    test('a clean report just offers to create it', () => {
      renderDialog(fakeGenerator({
        phase: 'ready',
        files: FILES,
        report: { errors: [], warnings: [] },
      }));

      expect(screen.getByRole('button', { name: 'Create the project documents' })).toHaveTextContent('Create project');
      expect(screen.queryByRole('button', { name: 'Ask the AI to fix the problems' })).not.toBeInTheDocument();
      expect(screen.getByText(/Everything checks out/)).toBeInTheDocument();
    });
  });

  describe('a cancelled generation', () => {
    test('offers the files that arrived without claiming they are good', () => {
      renderDialog(fakeGenerator({
        phase: 'ready',
        files: FILES,
        report: null,
        notice: 'Cancelled — these are the files that had arrived.',
      }));

      expect(screen.getByText(/were not checked/)).toBeInTheDocument();
      expect(screen.queryByText(/Everything checks out/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create the project documents' })).toBeInTheDocument();
    });
  });

  describe('creating and done', () => {
    test('counts the documents as they are created', () => {
      renderDialog(fakeGenerator({
        phase: 'creating',
        files: FILES,
        creation: { done: 2, total: 4, path: 'src/main.tsx', kind: 'file' },
      }));

      expect(screen.getByText('2 / 4')).toBeInTheDocument();
      expect(screen.getByTestId('ai-creating-path')).toHaveTextContent('src/main.tsx');
      expect(screen.getByRole('progressbar', { name: 'Creating documents' }))
        .toHaveAttribute('aria-valuenow', '50');
    });

    test('opens the entry file when it is done, and says Run works anywhere', async () => {
      const user = userEvent.setup();
      const onOpenDocument = vi.fn();
      const onClose = vi.fn();
      const generator = fakeGenerator({
        phase: 'done',
        files: FILES,
        result: {
          rootId: 'root-1',
          rootName: 'Bare App',
          entryId: 'doc-main',
          created: [
            { path: '', id: 'root-1', kind: 'folder' },
            { path: 'src/main.tsx', id: 'doc-main', kind: 'file' },
          ],
        },
      });
      renderDialog(generator, { onOpenDocument, onClose });

      expect(screen.getByText(/2 documents created/)).toBeInTheDocument();
      expect(screen.getByText(/Run works from any file/)).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Open the new project' }));
      expect(onOpenDocument).toHaveBeenCalledWith('doc-main');
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('reopening', () => {
    test('a finished run is cleared when the dialog is opened again', () => {
      const generator = fakeGenerator({
        phase: 'done',
        files: FILES,
        result: { rootId: 'root-1', rootName: 'Bare App', entryId: 'doc-main', created: [] },
      });
      const { rerender, props } = renderDialog(generator, { open: false });

      expect(generator.reset).not.toHaveBeenCalled();

      rerender(<GenerateProjectDialog {...props} open />);
      expect(generator.reset).toHaveBeenCalled();
    });

    test('a run still going is left alone', () => {
      const generator = fakeGenerator({ phase: 'generating', plan: PLAN, files: FILES });
      const { rerender, props } = renderDialog(generator, { open: false });

      rerender(<GenerateProjectDialog {...props} open />);
      expect(generator.reset).not.toHaveBeenCalled();
      expect(screen.getByTestId('ai-file-list')).toBeInTheDocument();
    });
  });

  describe('failures', () => {
    test('names the models that were tried and offers a retry', async () => {
      const user = userEvent.setup();
      const generator = fakeGenerator({
        phase: 'error',
        request: 'a bare react app',
        error: 'No free model could answer right now.',
        attempts: [
          { id: 'alpha:free', label: 'Alpha', outcome: 'busy' },
          { id: 'beta:free', label: 'Beta', outcome: 'busy' },
        ],
      });
      renderDialog(generator);

      // Twice on purpose: in the alert, and in the polite status line.
      expect(screen.getByText('The generation stopped')).toBeInTheDocument();
      expect(screen.getAllByText('No free model could answer right now.').length).toBeGreaterThan(0);
      const attempts = screen.getByTestId('ai-attempts');
      expect(attempts).toHaveTextContent('Alpha — busy');
      expect(attempts).toHaveTextContent('Beta — busy');

      await user.type(screen.getByTestId('ai-request'), 'a bare react app');
      await user.click(screen.getByRole('button', { name: 'Try generating again' }));
      expect(generator.plan).toHaveBeenCalledWith('a bare react app');
    });

    test('a failure after the files arrived retries the generation, not the plan', async () => {
      const user = userEvent.setup();
      const generator = fakeGenerator({
        phase: 'error',
        plan: PLAN,
        files: FILES,
        error: 'The fix-up pass could not run.',
      });
      renderDialog(generator);

      await user.click(screen.getByRole('button', { name: 'Try generating again' }));
      expect(generator.generate).toHaveBeenCalled();
      expect(generator.plan).not.toHaveBeenCalled();
    });
  });

  describe('closing', () => {
    test('Escape closes straight away when nothing is running', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      renderDialog(fakeGenerator(), { onClose });

      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalled();
    });

    test('Escape mid-generation asks first', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      const generator = fakeGenerator({ phase: 'generating', plan: PLAN, files: FILES });
      renderDialog(generator, { onClose });

      await user.keyboard('{Escape}');

      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByTestId('ai-confirm-close')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Keep going' }));
      expect(screen.queryByTestId('ai-confirm-close')).not.toBeInTheDocument();

      await user.keyboard('{Escape}');
      await user.click(screen.getByRole('button', { name: 'Stop and close' }));
      expect(generator.cancel).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('a model the chain does not list', () => {
    test('is shown as chosen rather than as the placeholder', () => {
      renderDialog(fakeGenerator(), { modelId: 'someone/brand-new-coder:free' });

      const select = screen.getByRole('button', { name: 'Model to generate with' });
      expect(select).toHaveTextContent('someone/brand-new-coder:free (not listed)');
      // Not the chain head's description, which is a different model.
      expect(screen.queryByText('The quick one.')).not.toBeInTheDocument();
    });

    test('is the model the plan is asked of', () => {
      renderDialog(
        fakeGenerator({ phase: 'planning' }),
        { modelId: 'someone/brand-new-coder:free' },
      );

      expect(screen.getByText(/Asking someone\/brand-new-coder:free for a plan/)).toBeInTheDocument();
    });
  });

  describe('the name the user typed', () => {
    test('survives a name the model invents later', async () => {
      const user = userEvent.setup();
      const generator = fakeGenerator({ phase: 'plan', plan: PLAN, name: PLAN.name });
      const { rerender, props } = renderDialog(generator);

      await user.clear(screen.getByTestId('ai-project-name'));
      await user.type(screen.getByTestId('ai-project-name'), 'My App');

      // The generation answers with a name of its own.
      const answered = fakeGenerator({ phase: 'ready', files: FILES, name: 'Counter Demo', report: { errors: [], warnings: [] } });
      rerender(<GenerateProjectDialog {...props} generator={answered} />);

      expect(screen.getByTestId('ai-project-name')).toHaveValue('My App');

      await user.click(screen.getByRole('button', { name: 'Create the project documents' }));
      expect(answered.create).toHaveBeenCalledWith('My App');
    });

    test('is editable on the review step too', () => {
      renderDialog(fakeGenerator({ phase: 'ready', files: FILES, name: 'Counter Demo', report: { errors: [], warnings: [] } }));

      expect(screen.getByTestId('ai-project-name')).toHaveValue('Counter Demo');
    });
  });

  describe('a half-created project', () => {
    const halfCreated = () => fakeGenerator({
      phase: 'error',
      files: FILES,
      report: { errors: [], warnings: [] },
      error: 'Could not create "src/App.tsx": the service said no.',
      notice: '3 documents had already been created.',
      created: [
        { path: '', id: 'root-1', kind: 'folder' as const },
        { path: 'index.html', id: 'doc-1', kind: 'file' as const },
        { path: 'src', id: 'doc-2', kind: 'folder' as const },
      ],
      createdRootName: 'My App',
    });

    test('says what already exists, alongside the failure', () => {
      renderDialog(halfCreated());

      expect(screen.getByTestId('ai-notice')).toHaveTextContent('3 documents had already been created.');
      expect(screen.getByTestId('ai-partial')).toHaveTextContent('3 documents of this project already exist in “My App”');
    });

    test('offers to finish that project rather than to create a second one', async () => {
      const user = userEvent.setup();
      const generator = halfCreated();
      renderDialog(generator);

      const primary = screen.getByRole('button', { name: 'Finish creating the project documents' });
      expect(primary).toHaveTextContent('Resume creating');
      expect(screen.queryByRole('button', { name: 'Create the project documents' })).not.toBeInTheDocument();

      await user.click(primary);
      expect(generator.create).toHaveBeenCalled();
    });

    test('opens what exists so the orphan can be found', async () => {
      const user = userEvent.setup();
      const onOpenDocument = vi.fn();
      renderDialog(halfCreated(), { onOpenDocument });

      await user.click(screen.getByRole('button', { name: 'Open what was already created' }));
      expect(onOpenDocument).toHaveBeenCalledWith('root-1');
    });
  });

  describe('closing', () => {
    test('a run that finishes on its own takes the question back', () => {
      const generator = fakeGenerator({ phase: 'generating', plan: PLAN, files: [FILES[0]] });
      const { rerender, props } = renderDialog(generator);

      // Escape while the last file is streaming.
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getByTestId('ai-confirm-close')).toBeInTheDocument();

      const finished = fakeGenerator({ phase: 'ready', files: FILES, report: { errors: [], warnings: [] } });
      rerender(<GenerateProjectDialog {...props} generator={finished} />);

      // "The files written so far will be lost" is no longer true, and the
      // footer it was hiding is the only way to create the project.
      expect(screen.queryByTestId('ai-confirm-close')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create the project documents' })).toBeInTheDocument();
    });
  });

  describe('a generation the user does not want', () => {
    test('can be abandoned from the review step', async () => {
      const user = userEvent.setup();
      const generator = fakeGenerator({ phase: 'ready', files: FILES, report: { errors: [], warnings: [] } });
      renderDialog(generator);

      await user.click(screen.getByRole('button', { name: 'Start over with a new description' }));
      expect(generator.reset).toHaveBeenCalled();
    });

    test('is cleared when the dialog is opened again', () => {
      const generator = fakeGenerator({ phase: 'ready', files: FILES, report: { errors: [], warnings: [] } });
      const { rerender, props } = renderDialog(generator, { open: false });

      rerender(<GenerateProjectDialog {...props} open />);
      expect(generator.reset).toHaveBeenCalled();
    });

    test('and so is a failed one that left files behind', () => {
      const generator = fakeGenerator({ phase: 'error', plan: PLAN, files: FILES, error: 'It went wrong.' });
      const { rerender, props } = renderDialog(generator, { open: false });

      rerender(<GenerateProjectDialog {...props} open />);
      expect(generator.reset).toHaveBeenCalled();
    });
  });

  describe('focus', () => {
    test('comes back into the dialog when the step changes under it', () => {
      const generator = fakeGenerator({ phase: 'plan', plan: PLAN });
      const { rerender, props } = renderDialog(generator);

      const generate = screen.getByRole('button', { name: 'Generate the project files' });
      generate.focus();
      expect(document.activeElement).toBe(generate);

      // The footer becomes a single Cancel button, unmounting the focused one.
      rerender(<GenerateProjectDialog {...props} generator={fakeGenerator({ phase: 'generating', plan: PLAN, files: FILES })} />);

      const dialog = screen.getByTestId('generate-project-dialog');
      expect(dialog.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).not.toBe(document.body);
    });

    test('moves into the dialog on open and back out on close', async () => {
      const opener = document.createElement('button');
      document.body.appendChild(opener);
      opener.focus();

      const { rerender, props } = renderDialog(fakeGenerator(), { open: true });

      const dialog = screen.getByTestId('generate-project-dialog');
      expect(dialog.contains(document.activeElement)).toBe(true);

      rerender(<GenerateProjectDialog {...props} open={false} />);
      expect(document.activeElement).toBe(opener);

      opener.remove();
    });
  });
});
