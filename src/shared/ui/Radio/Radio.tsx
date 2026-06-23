import { memo, type InputHTMLAttributes } from 'react';
import cls from './Radio.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';

type HTMLInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'readOnly'>;

interface RadioProps extends HTMLInputProps {
  onChange?: () => void;
  checked?: boolean;
  label?: string;
  readOnly?: boolean;
  className?: string;
}

export const Radio = memo((props: RadioProps) => {
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
    <label className={classNames(cls.radioWrapper, mods, [className])}>
      <input
        type="radio"
        className={cls.input}
        checked={checked}
        onChange={onChange}
        readOnly={readOnly}
        disabled={disabled}
        {...otherProps}
      />
      <span className={cls.circle}>
        <span className={cls.dot} />
      </span>
      {label && <span className={cls.label}>{label}</span>}
    </label>
  );
});
