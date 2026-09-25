import {
  memo, useCallback, useMemo, useState, type ReactNode, type SyntheticEvent,
} from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Button } from '@/shared/ui/Button/Button';
import { IconButton } from '@/shared/ui/IconButton/IconButton';
import { FileTypeIcon } from '@/shared/ui/FileTypeIcon/FileTypeIcon';
import { extensionOf } from '@/shared/lib/fileType/fileType';
import {
  formatByteSize,
  mediaKindLabel,
  mediaSourceFor,
  type MediaSource,
} from '@/shared/lib/mediaFile/mediaFile';
import cls from './MediaViewer.module.scss';

interface MediaViewerProps {
  className?: string;
  fileName: string;
  /** The file's text: the live buffer when there is one, the last save otherwise. */
  content: string;
  /**
   * The editor for this file, for a format whose text is worth editing by hand
   * — an SVG. Omitted, the viewer shows the picture and nothing else.
   */
  sourceView?: ReactNode;
}

/**
 * Zoom stops, rather than a continuous scale: a button press should land
 * somewhere recognisable, and 100% must be one of the stops.
 */
const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 8];

interface Dimensions {
  width: number;
  height: number;
}

function nextZoom(current: number, direction: 1 | -1): number {
  const stops = direction === 1 ? ZOOM_STEPS : [...ZOOM_STEPS].reverse();
  return stops.find((stop) => (direction === 1 ? stop > current : stop < current)) ?? current;
}

/** Why the browser refused it, in terms of how the file stored it. */
function failureHint(source: MediaSource, fileName: string): string {
  if (source.encoding === 'link') {
    return 'The linked file could not be loaded — check the address, and that the host allows other sites to load it.';
  }
  if (source.encoding === 'markup') {
    return 'The markup in this file is not a drawable SVG.';
  }
  const format = extensionOf(fileName).toUpperCase() || 'file';
  return `The data in this file is not a valid ${format}.`;
}

/**
 * The picture, not the bytes that spell it.
 *
 * An image or a clip in a workspace is still a text document — see
 * `mediaSourceFor` — so opening one used to mean a screen of base64 or of SVG
 * markup. This shows what the file *is*, and keeps the markup one press away
 * for the one format where editing it by hand is the point.
 */
export const MediaViewer = memo((props: MediaViewerProps) => {
  const { className, fileName, content, sourceView } = props;

  const source = useMemo(() => mediaSourceFor(fileName, content), [fileName, content]);

  /** null until the user picks a side, so a file that cannot be drawn opens on its text. */
  const [chosenView, setChosenView] = useState<'preview' | 'source' | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [natural, setNatural] = useState<Dimensions | null>(null);
  /** What failed, not that something did: an edit can fix what broke a keystroke ago. */
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const showsSource = chosenView
    ? chosenView === 'source'
    : Boolean(sourceView) && !source;
  const failed = Boolean(source) && failedSrc === source?.src;

  const onZoomIn = useCallback(() => {
    setZoom((current) => nextZoom(current ?? 1, 1));
  }, []);

  const onZoomOut = useCallback(() => {
    setZoom((current) => nextZoom(current ?? 1, -1));
  }, []);

  const onToggleFit = useCallback(() => {
    setZoom((current) => (current === null ? 1 : null));
  }, []);

  const onToggleSource = useCallback(() => {
    setChosenView(showsSource ? 'preview' : 'source');
  }, [showsSource]);

  const onImageLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    // An SVG sized only by its viewBox has no intrinsic pixels to report.
    setNatural(naturalWidth && naturalHeight ? { width: naturalWidth, height: naturalHeight } : null);
  }, []);

  const onVideoLoad = useCallback((event: SyntheticEvent<HTMLVideoElement>) => {
    const { videoWidth, videoHeight } = event.currentTarget;
    setNatural(videoWidth && videoHeight ? { width: videoWidth, height: videoHeight } : null);
  }, []);

  const onFailed = useCallback(() => {
    setFailedSrc(source?.src ?? null);
  }, [source?.src]);

  /*
   * Real pixels when the file has any, otherwise a scale of what fits. The
   * distinction matters for SVG: there is no "100%" of a drawing that has no
   * intrinsic size, so scaling what is on screen is the honest answer.
   */
  const zoomStyle = useMemo(() => {
    if (zoom === null) return undefined;
    if (natural) return { width: natural.width * zoom, height: natural.height * zoom };
    return { transform: `scale(${zoom})` };
  }, [natural, zoom]);

  const kindLabel = mediaKindLabel(source?.kind ?? 'image');

  const renderStage = () => {
    if (!source) {
      return (
        <div className={cls.blocked} data-testid="media-empty">
          <FileTypeIcon name={fileName} size={28} />
          <p>There is no {kindLabel.toLowerCase()} in this file yet.</p>
          <span className={cls.hint}>
            Workspace files are stored as text, so a picture or a clip has to be SVG markup,
            a data: URL, a link, or base64.
          </span>
        </div>
      );
    }

    if (failed) {
      return (
        <div className={cls.blocked} role="alert" data-testid="media-failed">
          <Icons.Warning size={24} />
          <p>This file could not be displayed.</p>
          <span className={cls.hint}>{failureHint(source, fileName)}</span>
        </div>
      );
    }

    if (source.kind === 'video') {
      return (
        <div className={cls.stage}>
          <video
            className={cls.video}
            src={source.src}
            controls
            playsInline
            aria-label={fileName}
            onLoadedMetadata={onVideoLoad}
            onError={onFailed}
            data-testid="media-video"
          />
        </div>
      );
    }

    if (source.kind === 'audio') {
      return (
        <div className={cls.stage}>
          <div className={cls.audio}>
            <FileTypeIcon name={fileName} size={28} />
            <span className={cls.audioName}>{fileName}</span>
            <audio
              className={cls.player}
              src={source.src}
              controls
              aria-label={fileName}
              onError={onFailed}
              data-testid="media-audio"
            />
          </div>
        </div>
      );
    }

    return (
      <div className={cls.stage} data-testid="media-stage">
        <img
          className={classNames(cls.image, { [cls.fitted]: zoom === null })}
          style={zoomStyle}
          src={source.src}
          alt={fileName}
          onLoad={onImageLoad}
          onError={onFailed}
          data-testid="media-image"
        />
      </div>
    );
  };

  const zoomable = Boolean(source) && source?.kind === 'image' && !failed && !showsSource;

  return (
    <div className={classNames(cls.viewer, {}, [className])} data-testid="media-viewer">
      <div className={cls.bar}>
        <span className={cls.title}>{kindLabel}</span>
        {natural && (
          <span className={cls.meta} data-testid="media-dimensions">
            {natural.width} × {natural.height}
          </span>
        )}
        {source && source.byteSize > 0 && (
          <span className={cls.meta} data-testid="media-size">{formatByteSize(source.byteSize)}</span>
        )}
        <span className={cls.spacer} />

        {zoomable && (
          <>
            <IconButton size="sm" onClick={onZoomOut} aria-label="Zoom out">
              <Icons.Minus size={14} />
            </IconButton>
            <button
              type="button"
              className={cls.zoom}
              onClick={onToggleFit}
              aria-label={zoom === null ? 'Fit to window: switch to actual size' : 'Actual size: switch to fit'}
              data-testid="media-zoom"
            >
              {zoom === null ? 'Fit' : `${Math.round(zoom * 100)}%`}
            </button>
            <IconButton size="sm" onClick={onZoomIn} aria-label="Zoom in">
              <Icons.Plus size={14} />
            </IconButton>
          </>
        )}

        {source && (
          <a
            className={cls.download}
            href={source.src}
            download={fileName}
            target="_blank"
            rel="noreferrer"
            aria-label={`Download ${fileName}`}
            title={`Download ${fileName}`}
            data-testid="media-download"
          >
            <Icons.Download size={14} />
          </a>
        )}

        {sourceView && (
          <Button
            size="small"
            variant="ghost"
            className={classNames(cls.sourceToggle, { [cls.sourceToggleOn]: showsSource })}
            onClick={onToggleSource}
            // The name stays put; aria-pressed carries the state.
            aria-pressed={showsSource}
            aria-label={`Source: ${showsSource ? 'hide' : 'show'} the text of ${fileName}`}
            data-testid="media-source-toggle"
          >
            Source
          </Button>
        )}
      </div>

      {showsSource ? <div className={cls.source}>{sourceView}</div> : renderStage()}
    </div>
  );
});
