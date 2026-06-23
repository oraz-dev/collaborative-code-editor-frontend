import React, {
  useEffect, useRef,
} from 'react';
import cls from './Textarea.module.scss';
import { classNames, type Mods } from '@/shared/lib/classNames/classNames';
import { memo, type TextareaHTMLAttributes } from 'react'
import { Icon, type IconName } from '@/shared/ui/Icon/Icon';

type HTMLInputProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'readOnly'>;

interface TextareaProps extends HTMLInputProps {
  className?: string;
  value?: string | number;
  onChange?: (value: string) => void;
  autofocus?: boolean;
  readonly?: boolean;
  label?: string;
  error?: string;
  icon?: IconName;
}

export const Textarea = memo((props: TextareaProps) => {
  const {
    className,
    value,
    onChange,
    placeholder,
    autofocus,
    readonly,
    label,
    error,
    icon,
    ...otherProps
  } = props;
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autofocus) {
      ref.current?.focus();
    }
  }, [autofocus]);

  const onChangeHandler = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange?.(e.target.value);
  };

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
        <textarea
          ref={ref}
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
