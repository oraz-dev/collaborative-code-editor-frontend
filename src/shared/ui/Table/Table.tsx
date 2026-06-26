import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import cls from './Table.module.scss';
import { classNames } from '@/shared/lib/classNames/classNames';

interface TableProps {
  children: ReactNode;
  className?: string;
}

export function Table({ children, className }: TableProps) {
  return (
    <table className={classNames(cls.table, {}, [className])}>
      {children}
    </table>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  return <thead>{children}</thead>;
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

interface TrProps {
  children: ReactNode;
  striped?: boolean;
}

export function Tr({ children, striped }: TrProps) {
  return <tr className={striped ? cls.striped : undefined}>{children}</tr>;
}

export function Th({ children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th {...props}>{children}</th>;
}

export function Td({ children, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props}>{children}</td>;
}
