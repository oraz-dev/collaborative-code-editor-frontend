import { memo, useMemo } from 'react';
import type { PresencePeer } from '../../model/presence/presence';

interface RemoteCursorStylesProps {
  peers: PresencePeer[];
  /** Draw the name badge attached to each caret. */
  showLabels: boolean;
}

/** Keeps a collaborator's name out of the CSS parser as anything but text. */
function escapeCssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

/**
 * y-monaco tags each remote selection with `yRemoteSelection-<clientId>` and
 * `yRemoteSelectionHead-<clientId>` but leaves the appearance entirely to the
 * app. This emits one rule per connected peer so carets carry that person's own
 * colour and, optionally, their name — otherwise every cursor renders identical
 * and anonymous.
 */
export const RemoteCursorStyles = memo((props: RemoteCursorStylesProps) => {
  const { peers, showLabels } = props;

  const css = useMemo(() => peers
    .filter((peer) => !peer.isSelf)
    .map((peer) => {
      const selection = `.yRemoteSelection-${peer.clientId}`;
      const head = `.yRemoteSelectionHead-${peer.clientId}`;

      const label = showLabels
        ? `${head}::after {
             content: "${escapeCssString(peer.name)}";
             background: ${peer.color};
           }`
        : '';

      return `
        ${selection} { background-color: color-mix(in srgb, ${peer.color} 30%, transparent); }
        ${head} { border-left-color: ${peer.color}; }
        ${label}
      `;
    })
    .join('\n'), [peers, showLabels]);

  if (!css.trim()) return null;

  return <style data-testid="remote-cursor-styles">{css}</style>;
});
