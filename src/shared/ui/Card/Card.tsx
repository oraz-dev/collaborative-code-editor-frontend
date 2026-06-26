import { memo, type ReactNode } from 'react';
import cls from './Card.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';

interface CardProps {
  title?: ReactNode;
  description?: ReactNode;
  image?: boolean;
  horizontal?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export const Card = memo((props: CardProps) => {
  const { title, description, image, horizontal, actions, children, className } = props;

  return (
    <div className={classNames(cls.card, { [cls.horizontal]: !!horizontal }, [className])}>
      {image && <div className={cls.image} />}
      <div className={cls.body}>
        {title && <div className={cls.title}>{title}</div>}
        {description && <div className={cls.text}>{description}</div>}
        {children}
      </div>
      {actions && <div className={cls.actions}>{actions}</div>}
    </div>
  );
});
