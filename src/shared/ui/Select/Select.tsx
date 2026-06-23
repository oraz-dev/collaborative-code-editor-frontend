import React, { memo, useEffect, useRef, useState } from 'react';
import cls from './Select.module.scss';
import { classNames, type Mods } from '@/shared/lib/classNames/classNames';
import { Icon } from '@/shared/ui/Icon/Icon';

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  className?: string;
  value?: string;
  onChange?: (value: string) => void;
  options: SelectOption[];
  label?: string;
  error?: string;
  readonly?: boolean;
  placeholder?: string;
}

export const Select = memo((props: SelectProps) => {
  const {
    className,
    value,
    onChange,
    options,
    label,
    error,
    readonly,
    placeholder = 'Select an option...',
  } = props;

  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown if clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleToggle = () => {
    if (readonly) return;
    setIsOpen((prev) => !prev);
  };

  const handleSelect = (optionValue: string) => {
    onChange?.(optionValue);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen) {
      setIsOpen(false);
    }
  };

  const selectedOption = options.find((opt) => opt.value === value);

  const mods: Mods = {
    [cls.readonly]: readonly,
    [cls.isError]: !!error,
    [cls.isOpen]: isOpen,
  };

  return (
    <div className={cls.selectWrapper} ref={wrapperRef} onKeyDown={handleKeyDown}>
      {label && <span className={cls.label}>{label}</span>}

      <button
        type="button"
        className={classNames(cls.trigger, mods, [className])}
        onClick={handleToggle}
        disabled={readonly}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className={classNames('', { [cls.placeholder]: !selectedOption })}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <Icon
          name="chevron"
          size={16}
          className={classNames(cls.icon, { [cls.isOpen]: isOpen })}
        />
      </button>

      {isOpen && (
        <ul className={cls.dropdown} role="listbox">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={isSelected}
                className={classNames(cls.option, { [cls.selected]: isSelected })}
                onClick={() => handleSelect(option.value)}
              >
                {option.label}
                {isSelected && <Icon name="check" size={14} />}
              </li>
            );
          })}
        </ul>
      )}

      {error && <span className={cls.error}>{error}</span>}
    </div>
  );
});
