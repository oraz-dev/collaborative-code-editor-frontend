import { memo } from 'react';
import cls from './ButtonGroup.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';

export interface ButtonGroupOption {
  value: string;
  label: string;
}

interface ButtonGroupProps {
  options: ButtonGroupOption[];
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

export const ButtonGroup = memo((props: ButtonGroupProps) => {
  const { options, value, onChange, className, disabled } = props;

  return (
    <div className={classNames(cls.btnGroup, {}, [className])}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={classNames(cls.btn, { [cls.active]: option.value === value })}
          onClick={() => onChange?.(option.value)}
          disabled={disabled}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
});
