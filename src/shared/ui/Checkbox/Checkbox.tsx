import { memo, type InputHTMLAttributes } from 'react';
import cls from './Checkbox.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icon } from '../Icon/Icon';

type HTMLInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'readOnly'>;

interface CheckboxProps extends HTMLInputProps {
  onChange?: () => void;
  checked?: boolean;
  label?: string;
  readOnly?: boolean;
  className?: string;
}

export const Checkbox = memo((props: CheckboxProps) => {
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
    <label className={classNames(cls.check, mods, [className])}>
      <input
        type="checkbox"
        className={cls.input}
        checked={checked}
        onChange={onChange}
        readOnly={readOnly}
        disabled={disabled}
        {...otherProps}
      />
      <span className={cls.checkbox}>
        {checked && (
          <Icon name="check" size={12} className={cls.icon} />
        )}
      </span>
      {label && <span className={cls.label}>{label}</span>}
    </label>
  );
});
