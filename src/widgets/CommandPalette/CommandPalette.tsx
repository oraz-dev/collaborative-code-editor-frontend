import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Kbd } from '@/shared/ui/Kbd/Kbd';
import { RoutePaths, toEditorPath } from '@/shared/config/routeConfig/routeConfig';
import { useDocumentSearch, type WorkspaceDocument } from '@/entities/Document';
import cls from './CommandPalette.module.scss';

interface CommandPaletteProps {
  className?: string;
  open: boolean;
  onClose: () => void;
}

interface PaletteAction {
  id: string;
  label: string;
  hint: string;
  icon: typeof Icons.Grid;
  path: string;
}

/**
 * Built lazily rather than at module scope: routeConfig imports the pages,
 * which import this widget, so reading RoutePaths eagerly would land on a
 * half-initialised module.
 */
function buildActions(): PaletteAction[] {
  return [
    { id: 'dashboard', label: 'Go to dashboard', hint: '', icon: Icons.Grid, path: RoutePaths.main },
    { id: 'profile', label: 'Open profile', hint: '', icon: Icons.User, path: RoutePaths.profile },
    { id: 'settings', label: 'Open settings', hint: '⌘,', icon: Icons.Settings, path: RoutePaths.settings },
  ];
}

function matchesAction(action: PaletteAction, query: string): boolean {
  if (!query.trim()) return true;
  return action.label.toLowerCase().includes(query.trim().toLowerCase());
}

/**
 * Searches the documents already loaded in the cache — the service has no
 * search endpoint, so results are instant and widen as the user browses.
 */
export const CommandPalette = memo((props: CommandPaletteProps) => {
  const { open, onClose } = props;
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const documents = useDocumentSearch(query);
  const actions = useMemo(
    () => buildActions().filter((action) => matchesAction(action, query)),
    [query],
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
      const document = documents[index];
      navigate(toEditorPath(document.id));
      onClose();
      return;
    }

    const action = actions[index - documents.length];
    if (!action) return;
    navigate(action.path);
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

  const renderDocument = (document: WorkspaceDocument, index: number) => (
    <div
      className={cls.row}
      key={document.id}
      data-active={index === activeIndex}
      onClick={() => runItem(index)}
      onMouseEnter={() => setActiveIndex(index)}
      role="option"
      aria-selected={index === activeIndex}
      tabIndex={-1}
      data-testid={`palette-doc-${document.name}`}
    >
      <span className={cls.ico}>
        {document.kind === 'folder' ? <Icons.Folder size={16} /> : <Icons.Files size={16} />}
      </span>
      <span className={cls.lbl}>{document.name}</span>
      <span className={cls.meta}>{document.kind === 'folder' ? 'Folder' : 'File'}</span>
    </div>
  );

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
