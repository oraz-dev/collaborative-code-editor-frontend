import { memo, type ReactNode } from 'react';
import cls from './Navbar.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';

export interface NavbarLink {
  key: string;
  label: ReactNode;
  active?: boolean;
  onClick?: () => void;
}

interface NavbarProps {
  logo?: ReactNode;
  links?: NavbarLink[];
  actions?: ReactNode;
  className?: string;
}

export const Navbar = memo((props: NavbarProps) => {
  const { logo, links, actions, className } = props;

  return (
    <nav className={classNames(cls.navbar, {}, [className])}>
      {logo && <span className={cls.logo}>{logo}</span>}
      {links && (
        <div className={cls.links}>
          {links.map((link) => (
            <button
              key={link.key}
              className={classNames(cls.link, { [cls.linkActive]: !!link.active })}
              onClick={link.onClick}
              aria-current={link.active ? 'page' : undefined}
            >
              {link.label}
            </button>
          ))}
        </div>
      )}
      <span className={cls.spacer} />
      {actions && <div className={cls.actions}>{actions}</div>}
    </nav>
  );
});
