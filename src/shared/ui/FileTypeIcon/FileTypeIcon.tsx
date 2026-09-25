import { memo } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { fileTypeFor, type FileGlyph } from '@/shared/lib/fileType/fileType';
import cls from './FileTypeIcon.module.scss';

interface FileTypeIconProps {
  className?: string;
  /** File name including its extension — the colour comes from that. */
  name: string;
  size?: number;
  /** Folders get an open/closed folder instead of a language glyph. */
  variant?: 'file' | 'folder';
  expanded?: boolean;
}

const GLYPH_PATHS: Record<FileGlyph, string[]> = {
  braces: [
    'M10 4H9.5A2.5 2.5 0 0 0 7 6.5v3A2.5 2.5 0 0 1 4.5 12 2.5 2.5 0 0 1 7 14.5v3A2.5 2.5 0 0 0 9.5 20h.5',
    'M14 4h.5A2.5 2.5 0 0 1 17 6.5v3a2.5 2.5 0 0 0 2.5 2.5 2.5 2.5 0 0 0-2.5 2.5v3a2.5 2.5 0 0 1-2.5 2.5H14',
  ],
  hash: ['M5 9h14', 'M5 15h14', 'M11 4 9 20', 'M17 4l-2 16'],
  angles: ['m9 8-5 4 5 4', 'm15 8 5 4-5 4'],
  terminal: ['m5 8 4 4-4 4', 'M12 17h7'],
  doc: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5'],
  docLines: [
    'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z',
    'M14 3v5h5',
    'M9 13h6',
    'M9 17h4',
  ],
  sliders: ['M4 8h9', 'M17 8h3', 'M15 6v4', 'M4 16h5', 'M13 16h7', 'M11 14v4'],
  database: [
    'M12 8c4.4 0 8-1.1 8-2.5S16.4 3 12 3 4 4.1 4 5.5 7.6 8 12 8Z',
    'M20 5.5v13c0 1.4-3.6 2.5-8 2.5s-8-1.1-8-2.5v-13',
    'M20 12c0 1.4-3.6 2.5-8 2.5S4 13.4 4 12',
  ],
  image: [
    'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
    'M8.5 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
    'm4 16 4.5-4 4 3.5L16 12l4 4',
  ],
  film: [
    'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z',
    'M8 4v16',
    'M16 4v16',
    'M4 12h16',
  ],
  wave: ['M4 11v2', 'M8 8v8', 'M12 4v16', 'M16 7v10', 'M20 11v2'],
  binary: ['m21 8-9-5-9 5 9 5 9-5z', 'M3 8v8l9 5 9-5V8', 'M12 13v8'],
  // Drawn as text, not paths — see the `mark` branch below.
  mark: [],
};

/** Shrinks the lettermark as it gets longer so three characters still fit. */
function markFontSize(text: string): number {
  if (text.length <= 1) return 13;
  if (text.length === 2) return 10.5;
  return 8;
}

const FOLDER_CLOSED = 'M3 7.5A2.5 2.5 0 0 1 5.5 5h3.2a2 2 0 0 1 1.5.7L11.5 7h7A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z';
const FOLDER_OPEN_PATHS = [
  'M3 8.5A2.5 2.5 0 0 1 5.5 6h3.2a2 2 0 0 1 1.5.7L11.5 8h5A2.5 2.5 0 0 1 19 10.5v1',
  'M3 17.2 5.2 12a2 2 0 0 1 1.8-1.2h13a1.4 1.4 0 0 1 1.3 1.9l-1.9 5.1a2 2 0 0 1-1.9 1.2H5a2 2 0 0 1-2-2z',
];

/**
 * The explorer's file icons. Colour is derived from the name so the same file
 * looks identical in the tree, its tab and the breadcrumb trail.
 */
export const FileTypeIcon = memo((props: FileTypeIconProps) => {
  const { className, name, size = 16, variant = 'file', expanded = false } = props;

  const isFolder = variant === 'folder';
  const type = fileTypeFor(name);
  const paths = isFolder
    ? (expanded ? FOLDER_OPEN_PATHS : [FOLDER_CLOSED])
    : GLYPH_PATHS[type.glyph];

  // Languages that would otherwise share a silhouette are drawn as a
  // lettermark: at 15px a hue change alone does not separate .ts from .js.
  if (!isFolder && type.glyph === 'mark' && type.text) {
    return (
      <svg
        className={classNames(cls.icon, {}, [className])}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <text
          x="12"
          y="12.5"
          textAnchor="middle"
          dominantBaseline="central"
          fill={type.color}
          fontSize={markFontSize(type.text)}
          fontWeight={700}
          letterSpacing="-0.4"
          fontFamily="var(--font-mono)"
        >
          {type.text}
        </text>
      </svg>
    );
  }

  return (
    <svg
      className={classNames(cls.icon, { [cls.folder]: isFolder }, [className])}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={isFolder ? 'currentColor' : type.color}
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  );
});
