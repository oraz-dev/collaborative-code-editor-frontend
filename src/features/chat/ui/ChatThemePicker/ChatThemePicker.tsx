import { forwardRef, memo, useCallback, useMemo, useState } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icons } from '@/shared/ui/Icon/Icons';
import {
  CHAT_ACCENTS,
  CHAT_SKINS,
  CHAT_SKIN_TAGS,
  type ChatAccentId,
  type ChatSkinId,
  type ChatSkinTag,
} from '../../model/consts/chatSkins';
import type { ChatMessageView } from '../../model/types/chatMessage';
import { ChatMessageGroup } from '../ChatMessageGroup/ChatMessageGroup';
import cls from './ChatThemePicker.module.scss';

interface ChatThemePickerProps {
  className?: string;
  skin: ChatSkinId;
  accent: ChatAccentId;
  onSkinChange: (skin: ChatSkinId) => void;
  onAccentChange: (accent: ChatAccentId) => void;
}

type Filter = 'All' | ChatSkinTag;

const SAMPLE_TIME = '2026-10-17T09:14:00Z';

function sample(clientMsgId: string, userId: string, body: string): ChatMessageView {
  return { id: clientMsgId, clientMsgId, documentId: '', userId, body, createdAt: SAMPLE_TIME, status: 'sent', localSeq: 0, attachments: [] };
}

const THEIRS = [sample('preview-theirs', 'preview-peer', 'did it run?')];
const MINE = [sample('preview-mine', 'preview-self', 'yep, all green')];

/** A grid of live previews, one per skin, plus the Classic bubble colours. */
export const ChatThemePicker = memo(forwardRef<HTMLDivElement, ChatThemePickerProps>((props, ref) => {
  const { className, skin, accent, onSkinChange, onAccentChange } = props;
  const [filter, setFilter] = useState<Filter>('All');

  const shown = useMemo(
    () => (filter === 'All' ? CHAT_SKINS : CHAT_SKINS.filter((entry) => entry.tag === filter)),
    [filter],
  );

  const onSurprise = useCallback(() => {
    const others = CHAT_SKINS.filter((entry) => entry.id !== skin);
    onSkinChange(others[Math.floor(Math.random() * others.length)].id);
  }, [onSkinChange, skin]);

  return (
    <div
      ref={ref}
      className={classNames(cls.picker, {}, [className])}
      role="dialog"
      aria-label="Chat theme"
      data-testid="chat-theme-picker"
    >
      <div className={cls.head}>
        <div className={cls.headText}>
          <h2 className={cls.title}>Chat theme</h2>
          <p className={cls.sub}>{CHAT_SKINS.length} themes · only changes how chat looks for you</p>
        </div>
        <button type="button" className={cls.shuffle} onClick={onSurprise} aria-label="Pick a random theme">
          <Icons.Shuffle size={13} /> Surprise me
        </button>
      </div>

      <div className={cls.filters} role="group" aria-label="Filter themes">
        {(['All', ...CHAT_SKIN_TAGS] as Filter[]).map((tag) => (
          <button
            key={tag}
            type="button"
            className={cls.filter}
            aria-pressed={filter === tag}
            onClick={() => setFilter(tag)}
          >
            {tag}
          </button>
        ))}
      </div>

      <div className={cls.grid}>
        {shown.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={cls.card}
            aria-pressed={entry.id === skin}
            aria-label={`${entry.label} theme`}
            onClick={() => onSkinChange(entry.id)}
            data-testid="chat-theme-option"
          >
            <div className={cls.mini} data-skin={entry.id} data-chat-wall="" aria-hidden="true">
              <div className={cls.miniFeed}>
                <ChatMessageGroup mine={false} messages={THEIRS} authorName="mekan" authorInitials="M" authorColor="#e5684f" />
                <ChatMessageGroup mine messages={MINE} authorName="You" authorInitials="Y" authorColor="#2b9f74" />
              </div>
            </div>
            <span className={cls.cardLabel}>{entry.label}</span>
          </button>
        ))}
      </div>

      {skin === 'classic' && (
        <div className={cls.swatches} role="group" aria-label="Bubble colour">
          <span className={cls.swatchLabel}>Bubble colour</span>
          {CHAT_ACCENTS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={classNames(cls.swatch, {}, [cls[entry.id]])}
              aria-pressed={entry.id === accent}
              aria-label={`${entry.label} bubbles`}
              onClick={() => onAccentChange(entry.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}));
