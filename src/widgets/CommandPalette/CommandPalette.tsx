import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Kbd } from '@/shared/ui/Kbd/Kbd';
import { FileTypeIcon } from '@/shared/ui/FileTypeIcon/FileTypeIcon';
import { RoutePaths, toEditorPath } from '@/shared/config/routeConfig/routeConfig';
import { useDocumentSearch, type DocumentHit } from '@/entities/Document';
import cls from './CommandPalette.module.scss';

/**
 * Something the palette can run. Navigation is expressed this way too, so a
 * page can hand in an action of its own — "Generate project with AI" — without
 * the palette knowing what it does.
 */
export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Icons.Grid;
  run: () => void;
}

interface CommandPaletteProps {
  className?: string;
  open: boolean;
  onClose: () => void;
  /** Page-specific commands, listed before the navigation ones. */
  commands?: PaletteCommand[];
}

/**
 * Built lazily rather than at module scope: routeConfig imports the pages,
 * which import this widget, so reading RoutePaths eagerly would land on a
 * half-initialised module.
 */
function buildActions(navigate: (path: string) => void): PaletteCommand[] {
  return [
    { id: 'dashboard', label: 'Go to dashboard', icon: Icons.Grid, run: () => navigate(RoutePaths.main) },
    { id: 'profile', label: 'Open profile', icon: Icons.User, run: () => navigate(RoutePaths.profile) },
    { id: 'settings', label: 'Open settings', hint: '⌘,', icon: Icons.Settings, run: () => navigate(RoutePaths.settings) },
  ];
}

function matchesAction(action: PaletteCommand, query: string): boolean {
  if (!query.trim()) return true;
  return action.label.toLowerCase().includes(query.trim().toLowerCase());
}

/**
 * Searches the documents already loaded in the cache — the service has no
 * search endpoint, so results are instant and widen as the user browses.
 */
export const CommandPalette = memo((props: CommandPaletteProps) => {
  const { open, onClose, commands } = props;
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const documents = useDocumentSearch(query);
  const actions = useMemo(
    () => [...(commands ?? []), ...buildActions(navigate)]
      .filter((action) => matchesAction(action, query)),
    [commands, navigate, query],
  );

  // Both groups share one selection cursor so the arrow keys run straight through.
  const totalItems = documents.length + actions.length;

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const runItem = useCallback((index: number) => {
    if (index < documents.length) {
      const { document } = documents[index];
      navigate(toEditorPath(document.id));
      onClose();
      return;
    }

    const action = actions[index - documents.length];
    if (!action) return;
    action.run();
    onClose();
  }, [actions, documents, navigate, onClose]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (totalItems === 0 ? 0 : (current + 1) % totalItems));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (totalItems === 0 ? 0 : (current - 1 + totalItems) % totalItems));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      runItem(activeIndex);
    }
  }, [activeIndex, onClose, runItem, totalItems]);

  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  }, []);

  if (!open) return null;

  const renderDocument = (hit: DocumentHit, index: number) => {
    const { document, location } = hit;
    const where = location.join(' / ');

    return (
      <div
        className={cls.row}
        key={document.id}
        data-active={index === activeIndex}
        onClick={() => runItem(index)}
        onMouseEnter={() => setActiveIndex(index)}
        role="option"
        aria-selected={index === activeIndex}
        // Four folders called `src` read identically to a screen reader too,
        // so the location is part of the name, not decoration beside it.
        aria-label={where ? `${document.name}, in ${where}` : document.name}
        tabIndex={-1}
        data-testid={`palette-doc-${document.name}`}
      >
        <span className={cls.ico}>
          {/* Same icon system as the tree — Icons.Files draws a folder, which
              made every file in here look like one. */}
          <FileTypeIcon
            name={document.name}
            variant={document.kind === 'folder' ? 'folder' : 'file'}
            size={16}
          />
        </span>
        <span className={cls.lbl}>
          <span className={cls.name}>{document.name}</span>
          {where && <span className={cls.where} title={where}>{where}</span>}
        </span>
        <span className={cls.meta}>{document.kind === 'folder' ? 'Folder' : 'File'}</span>
      </div>
    );
  };

  return (
    <div className={cls.scrim} onClick={onClose}>
      <div
        className={cls.palette}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        <div className={cls.input}>
          <Icons.Search size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Search files or run a command…"
            aria-label="Search files or run a command"
            data-testid="command-palette-input"
            autoFocus
          />
          <Kbd keys={['esc']} />
        </div>

        <div className={cls.list} role="listbox" aria-label="Results">
          {documents.length > 0 && <div className={cls.group}>Files</div>}
          {documents.map(renderDocument)}

          {actions.length > 0 && <div className={cls.group}>Actions</div>}
          {actions.map((action, offset) => {
            const index = documents.length + offset;
            const Ico = action.icon;
            return (
              <div
                className={cls.row}
                key={action.id}
                data-active={index === activeIndex}
                onClick={() => runItem(index)}
                onMouseEnter={() => setActiveIndex(index)}
                role="option"
                aria-selected={index === activeIndex}
                tabIndex={-1}
              >
                <span className={cls.ico}><Ico size={16} /></span>
                <span className={cls.lbl}>{action.label}</span>
                {action.hint && <span className={cls.meta}>{action.hint}</span>}
              </div>
            );
          })}

          {totalItems === 0 && (
            <div className={cls.group} data-testid="command-palette-empty">
              Nothing matches “{query.trim()}”
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
