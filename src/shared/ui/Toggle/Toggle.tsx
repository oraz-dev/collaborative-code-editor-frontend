import { memo, type InputHTMLAttributes } from 'react';
import cls from './Toggle.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';

type HTMLInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'readOnly'>;

interface ToggleProps extends HTMLInputProps {
  onChange?: () => void;
  checked?: boolean;
  label?: string;
  readOnly?: boolean;
  className?: string;
}

export const Toggle = memo((props: ToggleProps) => {
  const {
    className,
    onChange,
    checked = false,
    label,
    readOnly,
    disabled,
    ...otherProps
  } = props;

  const mods = {
    [cls.checked]: checked,
    [cls.disabled]: disabled || readOnly,
  };

  return (
    <label className={classNames(cls.toggleWrapper, mods, [className])}>
      <input
        type="checkbox"
        className={cls.input}
        checked={checked}
        onChange={onChange}
        readOnly={readOnly}
        disabled={disabled}
        {...otherProps}
      />
      <span className={cls.track}>
        <span className={cls.thumb} />
      </span>
      {label && <span className={cls.label}>{label}</span>}
    </label>
  );
});