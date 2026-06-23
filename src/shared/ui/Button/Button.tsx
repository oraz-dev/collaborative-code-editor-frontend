import { memo, type ButtonHTMLAttributes, type ReactNode } from "react"
import cls from "./Button.module.scss"
import { classNames } from "../../lib/classNames/classNames"
import { Spinner } from "../Spinner/Spinner"
import { Icon, type IconName } from "@/shared/ui/Icon/Icon"

export type ButtonVarant = 'primary' | 'secondary' | 'ghost' | 'link' | 'destructive'

export type ButtonSize = 'small' | 'large'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean
  variant?: ButtonVarant
  size?: ButtonSize
  icon?: IconName
  disabled?: boolean
  theme?: string
  className?: string
  children: ReactNode
}

export const Button = memo((props: ButtonProps) => {
  const { 
    icon,
    isLoading, 
    size, 
    variant = 'primary', 
    disabled, 
    theme,
    className,
    children,
    ...otherProps
  } = props

  const mods: Record<string, boolean | undefined> = {
    ...(theme && { [cls[theme]]: true }),
    ...(size && { [cls[size]]: true }),
    [cls.disabled]: disabled,
    [cls[variant]]: true
  };

  return (
    <button 
      className={classNames(cls.button, mods, [className])} 
      disabled={disabled} 
      {...otherProps} 
    >
      {icon && <Icon name={icon} />}
      {isLoading && <Spinner />}
      {children}
    </button>
  )
});