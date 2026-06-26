import { memo } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import cls from './AvatarStack.module.scss';

interface Person {
  id: string;
  name: string;
  presence?: string;
}

interface AvatarStackProps {
  className?: string;
  people: Person[];
  max?: number;
  size?: 'xs' | 'sm' | 'md';
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

export const AvatarStack = memo((props: AvatarStackProps) => {
  const { className, people, max = 4, size = 'sm' } = props;
  const shown = people.slice(0, max);
  const extra = people.length - max;

  return (
    <div className={classNames(cls.stack, { [cls[size]]: true }, [className])}>
      {shown.map((p) => (
        <span
          key={p.id}
          className={cls.avatar}
          style={{ '--avatar-bg': p.presence || 'var(--ink-700)' } as React.CSSProperties}
          title={p.name}
        >
          {getInitials(p.name)}
        </span>
      ))}
      {extra > 0 && (
        <span className={cls.extra}>+{extra}</span>
      )}
    </div>
  );
});
