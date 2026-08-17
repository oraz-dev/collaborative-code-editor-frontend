import React, { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import cls from './Select.module.scss';
import { classNames, type Mods } from '@/shared/lib/classNames/classNames';
import { Icon } from '@/shared/ui/Icon/Icon';

export interface SelectOption {
  value: string;
  label: string;
}

export type SelectVariant = 'default' | 'ghost';
export type SelectSize = 'sm' | 'md';

interface SelectProps {
  className?: string;
  value?: string;
  onChange?: (value: string) => void;
  options: SelectOption[];
  label?: string;
  error?: string;
  readonly?: boolean;
  placeholder?: string;
  /** `ghost` drops the box, for a control that sits inside a list row. */
  variant?: SelectVariant;
  size?: SelectSize;
  'aria-label'?: string;
}

interface MenuRect {
  top: number;
  left: number;
  width: number;
  /** Set when the menu had to open upwards to stay on screen. */
  above: boolean;
}

const MENU_GAP = 6;
const MENU_MAX_HEIGHT = 220;
const MENU_MIN_WIDTH = 150;

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
    variant = 'default',
    size = 'md',
    'aria-label': ariaLabel,
  } = props;

  const [isOpen, setIsOpen] = useState(false);
  const [rect, setRect] = useState<MenuRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  /**
   * The menu is measured off the trigger and rendered into `document.body`.
   * Anchoring it inside the tree was fine until a select ended up in a
   * scrolling list or a modal, where an ancestor's `overflow` sliced the
   * options in half — a portal is the only thing that reliably escapes that.
   */
  const position = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const bounds = trigger.getBoundingClientRect();
    const below = window.innerHeight - bounds.bottom;
    const above = below < MENU_MAX_HEIGHT + MENU_GAP && bounds.top > below;

    setRect({
      top: above ? bounds.top - MENU_GAP : bounds.bottom + MENU_GAP,
      left: bounds.left,
      width: bounds.width,
      above,
    });
  }, []);

  useLayoutEffect(() => {
    if (isOpen) position();
  }, [isOpen, position]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    // Anything that moves the trigger has to move the menu with it, now that
    // the menu is no longer a child of the thing it points at.
    const handleReflow = () => position();

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', handleReflow);
    window.addEventListener('scroll', handleReflow, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', handleReflow);
      window.removeEventListener('scroll', handleReflow, true);
    };
  }, [isOpen, position]);

  const handleToggle = useCallback(() => {
    if (readonly) return;
    setIsOpen((prev) => !prev);
  }, [readonly]);

  const handleSelect = useCallback((optionValue: string) => {
    onChange?.(optionValue);
    setIsOpen(false);
    triggerRef.current?.focus();
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen) {
      // Otherwise the modal listening for Escape closes out from under it.
      e.stopPropagation();
      setIsOpen(false);
    }
  }, [isOpen]);

  const selectedOption = options.find((opt) => opt.value === value);

  const mods: Mods = {
    [cls.readonly]: readonly,
    [cls.isError]: !!error,
    [cls.isOpen]: isOpen,
    [cls.ghost]: variant === 'ghost',
    [cls.sm]: size === 'sm',
  };

  const menu = isOpen && rect && createPortal(
    <ul
      ref={menuRef}
      className={classNames(cls.dropdown, { [cls.above]: rect.above })}
      style={{ top: rect.top, left: rect.left, minWidth: Math.max(rect.width, MENU_MIN_WIDTH) }}
      role="listbox"
    >
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
            <span className={cls.optionLabel}>{option.label}</span>
            {isSelected && <Icon name="check" size={14} />}
          </li>
        );
      })}
    </ul>,
    document.body,
  );

  return (
    // Sizing lands on the wrapper — it is the flex/grid item the caller lays
    // out, so a width on the trigger alone would leave the wrapper claiming
    // whatever space it liked and crushing its siblings.
    <div className={classNames(cls.selectWrapper, {}, [className])} onKeyDown={handleKeyDown}>
      {label && <span className={cls.label}>{label}</span>}

      <button
        ref={triggerRef}
        type="button"
        className={classNames(cls.trigger, mods)}
        onClick={handleToggle}
        disabled={readonly}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
      >
        <span className={classNames(cls.value, { [cls.placeholder]: !selectedOption })}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <Icon
          name="chevron"
          size={size === 'sm' ? 14 : 16}
          className={classNames(cls.icon, { [cls.isOpen]: isOpen })}
        />
      </button>

      {menu}

      {error && <span className={cls.error}>{error}</span>}
    </div>
  );
});
