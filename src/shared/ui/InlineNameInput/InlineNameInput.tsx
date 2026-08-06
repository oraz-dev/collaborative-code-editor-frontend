import {
  memo,
  useCallback,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import cls from './InlineNameInput.module.scss';

/** `sm` matches a file-tree row; `md` stands on its own in a card. */
type InlineNameInputSize = 'sm' | 'md';

interface InlineNameInputProps {
  className?: string;
  style?: CSSProperties;
  ariaLabel: string;
  placeholder?: string;
  icon?: ReactNode;
  size?: InlineNameInputSize;
}

interface Handlers {
  onSubmit: (name: string) => void;
  onCancel: () => void;
}

/**
 * Name-it-in-place row, the way editors do it — Enter commits, Escape cancels,
 * blur commits what is there. Avoids a modal interrupting "new file, type,
 * start writing".
 */
export const InlineNameInput = memo((props: InlineNameInputProps & Handlers) => {
  const { className, style, ariaLabel, placeholder, icon, size = 'sm', onSubmit, onCancel } = props;
  const [name, setName] = useState('');

  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setName(event.target.value);
  }, []);

  const commit = useCallback(() => {
    const trimmed = name.trim();
    if (trimmed) onSubmit(trimmed);
    else onCancel();
  }, [name, onCancel, onSubmit]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  }, [commit, onCancel]);

  return (
    <div className={classNames(cls.row, { [cls[size]]: true }, [className])} style={style}>
      {icon}
      <input
        className={cls.input}
        value={name}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        placeholder={placeholder}
        aria-label={ariaLabel}
        data-testid="inline-name-input"
        // the row is rendered solely in response to "new file", so focusing it
        // is the expected continuation of that action
        autoFocus
      />
    </div>
  );
});
