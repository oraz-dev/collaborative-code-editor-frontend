import { memo } from 'react';
import cls from './Pagination.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icon } from '@/shared/ui/Icon/Icon';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export const Pagination = memo((props: PaginationProps) => {
  const { currentPage, totalPages, onPageChange, className } = props;

  const pages: (number | '...')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  return (
    <nav className={classNames(cls.pagination, {}, [className])}>
      <button
        className={cls.button}
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Previous"
      >
        <Icon name="chevron" className={cls.iconPrev} />
      </button>
      {pages.map((page, i) =>
        page === '...' ? (
          <button key={`ellipsis-${i}`} className={cls.button} disabled>
            …
          </button>
        ) : (
          <button
            key={page}
            className={classNames(cls.button, { [cls.active]: page === currentPage })}
            onClick={() => onPageChange(page)}
            aria-current={page === currentPage ? 'page' : undefined}
          >
            {page}
          </button>
        ),
      )}
      <button
        className={cls.button}
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Next"
      >
        <Icon name="arrow" className={cls.icon} />
      </button>
    </nav>
  );
});
