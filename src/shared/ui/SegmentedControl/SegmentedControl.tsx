import { memo, useCallback } from 'react';
import './SegmentedControl.css';

interface Option {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  className?: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
}

export const SegmentedControl = memo((props: SegmentedControlProps) => {
  const { value, onChange, options } = props;

  const handleClick = useCallback((optValue: string) => {
    onChange(optValue);
  }, [onChange]);

  return (
    <div className="sp-seg">
      {options.map((opt) => (
        <button
          key={opt.value}
          className="sp-seg__btn"
          data-active={value === opt.value}
          onClick={() => handleClick(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
});
