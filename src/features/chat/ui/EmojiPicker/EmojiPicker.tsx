import { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { EMOJI_CATEGORIES } from '../../model/consts/emojiCategories';
import {
  keywordsFor,
  loadEmojiKeywords,
  searchEmoji,
  type EmojiKeywordIndex,
} from '../../model/lib/searchEmoji/searchEmoji';
import cls from './EmojiPicker.module.scss';

interface EmojiPickerProps {
  className?: string;
  /** Most recent first. */
  recent: readonly string[];
  onPick: (emoji: string) => void;
}

const RECENT_ID = 'recent';
const EMPTY_INDEX: EmojiKeywordIndex = {};

const CANDIDATES = EMOJI_CATEGORIES.flatMap((category) =>
  category.emojis.map((emoji) => ({ emoji, category: category.label })),
);

function nameOf(index: EmojiKeywordIndex, emoji: string): string {
  const [first] = keywordsFor(index, emoji);
  return first ? first.replace(/_/g, ' ') : '';
}

/** Search, category tabs, and a scrolling grid — the composer's emoji button opens it. */
export const EmojiPicker = memo(forwardRef<HTMLDivElement, EmojiPickerProps>((props, ref) => {
  const { className, recent, onPick } = props;

  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<EmojiKeywordIndex>(EMPTY_INDEX);
  const [active, setActive] = useState(RECENT_ID);
  const [hovered, setHovered] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef(new Map<string, HTMLDivElement>());
  const searchRef = useRef<HTMLInputElement>(null);

  // Keywords power search and the hover caption; they load once, on first open.
  useEffect(() => {
    let alive = true;
    loadEmojiKeywords().then((loaded) => {
      if (alive) setIndex(loaded);
    });
    searchRef.current?.focus();
    return () => {
      alive = false;
    };
  }, []);

  const sections = useMemo(
    () => [
      { id: RECENT_ID, icon: '🕘', label: 'Recently used', emojis: recent },
      ...EMOJI_CATEGORIES,
    ],
    [recent],
  );

  const results = useMemo(() => searchEmoji(index, CANDIDATES, query), [index, query]);
  const searching = query.trim().length > 0;

  const onScroll = useCallback(() => {
    const grid = gridRef.current;
    if (!grid || searching) return;
    let current = RECENT_ID;
    sections.forEach((section) => {
      const el = sectionRefs.current.get(section.id);
      if (el && el.offsetTop - grid.offsetTop <= grid.scrollTop + 10) current = section.id;
    });
    setActive(current);
  }, [sections, searching]);

  const onTab = useCallback((id: string) => {
    setQuery('');
    setActive(id);
    // Wait a frame so the category grid is back if a search was showing.
    requestAnimationFrame(() => {
      const grid = gridRef.current;
      const el = sectionRefs.current.get(id);
      if (grid && el) grid.scrollTop = el.offsetTop - grid.offsetTop;
    });
  }, []);

  const renderGrid = (emojis: readonly string[]) => (
    <div className={cls.grid}>
      {emojis.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className={cls.emoji}
          onClick={() => onPick(emoji)}
          onMouseEnter={() => setHovered(emoji)}
          onFocus={() => setHovered(emoji)}
          aria-label={nameOf(index, emoji) || emoji}
          data-testid="emoji-option"
        >
          {emoji}
        </button>
      ))}
    </div>
  );

  return (
    <div
      ref={ref}
      className={classNames(cls.picker, {}, [className])}
      role="dialog"
      aria-label="Choose an emoji"
      data-testid="emoji-picker"
    >
      <div className={cls.search}>
        <input
          ref={searchRef}
          type="search"
          className={cls.searchInput}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search emoji"
          aria-label="Search emoji"
          autoComplete="off"
        />
      </div>

      <div className={cls.tabs} role="tablist" aria-label="Emoji categories">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            role="tab"
            className={cls.tab}
            aria-selected={!searching && active === section.id}
            aria-label={section.label}
            title={section.label}
            onClick={() => onTab(section.id)}
          >
            {section.icon}
          </button>
        ))}
      </div>

      <div className={cls.scroll} ref={gridRef} onScroll={onScroll}>
        {searching ? (
          results.length > 0 ? (
            <>
              <div className={cls.label}>Results · {results.length}</div>
              {renderGrid(results)}
            </>
          ) : (
            <div className={cls.empty}>No emoji match “{query.trim()}”</div>
          )
        ) : (
          sections.map((section) => (
            <div
              key={section.id}
              ref={(el) => {
                if (el) sectionRefs.current.set(section.id, el);
                else sectionRefs.current.delete(section.id);
              }}
            >
              <div className={cls.label}>{section.label}</div>
              {renderGrid(section.emojis)}
            </div>
          ))
        )}
      </div>

      <div className={cls.footer} aria-hidden="true">
        {hovered ? (
          <>
            <span className={cls.preview}>{hovered}</span>
            <span className={cls.caption}>{nameOf(index, hovered)}</span>
          </>
        ) : (
          <span className={cls.caption}>Pick an emoji</span>
        )}
      </div>
    </div>
  );
}));
