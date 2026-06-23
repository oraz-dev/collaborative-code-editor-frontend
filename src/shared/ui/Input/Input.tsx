import React, {
  memo, useCallback, useEffect, useRef,
} from 'react';
import cls from './Input.module.scss';
import { classNames, type Mods } from '@/shared/lib/classNames/classNames';
import type { InputHTMLAttributes } from 'react'
import { Icon, type IconName } from '@/shared/ui/Icon/Icon';

type HTMLInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'readOnly'>;

interface InputProps extends HTMLInputProps {
  className?: string;
  value?: string | number;
  onChange?: (value: string) => void;
  autofocus?: boolean;
  readonly?: boolean;
  label?: string;
  error?: string;
  icon?: IconName;
}

export const Input = memo((props: InputProps) => {
  const {
    className,
    value,
    onChange,
    type = 'text',
    placeholder,
    autofocus,
    readonly,
    label,
    error,
    icon,
    ...otherProps
  } = props;
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autofocus) {
      ref.current?.focus();
    }
  }, [autofocus]);

  const onChangeHandler = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.value);
  }, [onChange]);

  const mods: Mods = {
    [cls.readonly]: readonly,
    [cls.isError]: !!error,
  };

  return (
    <div className={cls.inputWrapper} >
      {label && (
        <span className={cls.label} >
          {label}
        </span>
      )}
      <div className={classNames(cls.input, mods, [className])}>
        {icon && <Icon className={cls.icon} name={icon}/>}
        <input
          ref={ref}
          type={type}
          value={value}
          onChange={onChangeHandler}
          readOnly={readonly}
          placeholder={placeholder}
          {...otherProps}
        />
      </div>
      {error && <span className={cls.error} >{error}</span>}
    </div>
  );
});
