import { memo } from 'react';

interface LogoProps {
  size?: number;
  className?: string;
}

export const Logo = memo((props: LogoProps) => {
  const { size = 26, className } = props;

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
      <rect x="13" y="41" width="38" height="5" rx="2.5" fill="#3b4254"/>
      <rect x="22" y="15" width="6" height="31" rx="3" fill="#4d9eff"/>
      <circle cx="25" cy="9" r="4" fill="#4d9eff"/>
      <rect x="37" y="21" width="6" height="25" rx="3" fill="#2fc88e"/>
      <circle cx="40" cy="15" r="4" fill="#2fc88e"/>
    </svg>
  );
});
