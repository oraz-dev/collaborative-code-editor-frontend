import { memo } from 'react';
import { Icons } from '@/shared/ui/Icon/Icons';
import { SEARCH, LANG_COLOR } from '@/shared/data/demo';
import cls from './SearchView.module.scss';

interface SearchViewProps {
  className?: string;
}

export const SearchView = memo((_props: SearchViewProps) => {
  return (
    <div className={cls.search}>
      <div className={cls.searchHead}>
        <div className={cls.searchTitle}>Search</div>
        <div className={cls.searchField}>
          <Icons.Search size={16} />
          <input defaultValue={SEARCH.query} placeholder="Search files…" aria-label="Search files" />
          <div className={cls.searchToggles}>
            <button className={cls.stgl} aria-label="Match case"><Icons.CaseAa size={14} /></button>
            <button className={cls.stgl} aria-label="Match whole word"><Icons.WholeWord size={14} /></button>
            <button className={cls.stgl} data-active="true" aria-label="Use regex"><Icons.Regex size={14} /></button>
          </div>
        </div>
        <div className={cls.searchField}>
          <Icons.Replace size={16} />
          <input defaultValue={SEARCH.replace} placeholder="Replace…" aria-label="Replace" />
        </div>
      </div>
      <div className={cls.searchSummary}>
        <Icons.Search size={12} />
        {SEARCH.files.reduce((n, f) => n + f.matches.length, 0)} results in {SEARCH.files.length} files
      </div>
      <div className={cls.searchResults}>
        {SEARCH.files.map(f => (
          <div key={f.id} className={cls.sfile}>
            <div className={cls.sfileHead}>
              <span className={cls.sfileChev}><Icons.ChevD size={14} /></span>
              <span
                className={cls.sfileDot}
                style={{ '--dot-color': LANG_COLOR[f.lang] || undefined } as React.CSSProperties}
              />
              <span className={cls.sfileName}>{f.id}</span>
              <span className={cls.sfilePath}>{f.path}</span>
              <span className={cls.sfileCount}>{f.matches.length}</span>
            </div>
            {f.matches.map((m, i) => (
              <div className={cls.smatch} key={i}>
                <span className={cls.smatchLn}>{m.line}</span>
                <span className={cls.smatchCode}>
                  {m.before}<span className={cls.smatchHit}>{m.match}</span>{m.after}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
});
