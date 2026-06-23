import type { ComponentPropsWithoutRef } from 'react';

import ArrowIcon from '@/shared/assets/arrow.svg?react';
import BellIcon from '@/shared/assets/bell.svg?react';
import BranchIcon from '@/shared/assets/branch.svg?react';
import CheckIcon from '@/shared/assets/check.svg?react';
import ChevronIcon from '@/shared/assets/chevron.svg?react';
import CloseIcon from '@/shared/assets/close.svg?react';
import DownloadIcon from '@/shared/assets/download.svg?react';
import EditIcon from '@/shared/assets/edit.svg?react';
import EyeIcon from '@/shared/assets/eye.svg?react';
import MenuIcon from '@/shared/assets/menu.svg?react';
import MinusIcon from '@/shared/assets/minus.svg?react';
import PlusIcon from '@/shared/assets/plus.svg?react';
import SearchIcon from '@/shared/assets/search.svg?react';
import SettingsIcon from '@/shared/assets/settings.svg?react';
import TrashIcon from '@/shared/assets/trash.svg?react';
import UploadIcon from '@/shared/assets/upload.svg?react';
import UserIcon from '@/shared/assets/user.svg?react';

const icons = {
  arrow: ArrowIcon,
  bell: BellIcon,
  branch: BranchIcon,
  check: CheckIcon,
  chevron: ChevronIcon,
  close: CloseIcon,
  download: DownloadIcon,
  edit: EditIcon,
  eye: EyeIcon,
  menu: MenuIcon,
  minus: MinusIcon,
  plus: PlusIcon,
  search: SearchIcon,
  settings: SettingsIcon,
  trash: TrashIcon,
  upload: UploadIcon,
  user: UserIcon,
} as const;

export type IconName = keyof typeof icons;

interface IconProps extends ComponentPropsWithoutRef<'svg'> {
  name: IconName;
  size?: number | string;
  className?: string;
}

export function Icon({ name, size = 24, className, ...props }: IconProps) {
  const SvgIcon = icons[name];
  return <SvgIcon className={className} width={size} height={size} {...props} />;
}
