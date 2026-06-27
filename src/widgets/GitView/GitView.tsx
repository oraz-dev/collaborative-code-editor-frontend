import { useState, useCallback, memo } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { Button } from '@/shared/ui/Button/Button';
import { COMMITS, COMMIT_FILES, GIT_STATUS, GIT_LANE_COLOR, byId } from '@/shared/data/demo';
import { initials } from '@/shared/lib/initials/initials';
import cls from './GitView.module.scss';

const GitGraph = memo(({ lane, first, last }: { lane: number; first?: boolean; last?: boolean }) => {
  const color = GIT_LANE_COLOR[lane % GIT_LANE_COLOR.length];
  return (
    <svg width="48" height="54" className={cls.commitGraph}>
      {!first && <line x1="24" y1="0" x2="24" y2="20" stroke={color} strokeWidth="2" />}
      <circle cx="24" cy="27" r="5" fill={color} />
      {!last && <line x1="24" y1="34" x2="24" y2="54" stroke={color} strokeWidth="2" />}
    </svg>
  );
});

interface GitViewProps {
  className?: string;
}

export const GitView = memo((_props: GitViewProps) => {
  const [sel, setSel] = useState(COMMITS[0]?.hash || '');
  const selCommit = COMMITS.find(c => c.hash === sel) || COMMITS[0];
  const files = COMMIT_FILES[sel] || COMMIT_FILES[COMMITS[0]?.hash] || [];

  const handleSelectCommit = useCallback((hash: string) => {
    setSel(hash);
  }, []);

  return (
    <div className={cls.git}>
      <div className={cls.gitMain}>
        <div className={cls.gitToolbar}>
          <span className={cls.gitTitle}>Git</span>
          <span className={cls.gitBranch}><Icons.Branch size={14} /> {GIT_STATUS.branch}</span>
          <span className={cls.gitSp} />
          <span className={cls.gitSync}>
            <Icons.GitPush size={13} /> {GIT_STATUS.ahead}
            <Icons.GitPull size={13} /> {GIT_STATUS.behind}
          </span>
          <Button variant="primary" size="small"><Icons.GitPush size={14} /> Push</Button>
        </div>
        <div className={cls.gitList}>
          {COMMITS.map((c, i) => {
            const author = byId(c.who);
            return (
              <div key={c.hash} className={cls.commitrow} data-active={sel === c.hash} onClick={() => handleSelectCommit(c.hash)}>
                <GitGraph lane={c.lane} first={i === 0} last={i === COMMITS.length - 1} />
                <div className={cls.commitBody}>
                  <Avatar size="sm" initials={initials(author.name)} color={author.presence} />
                  <div className={cls.commitMsg}>
                    <div className={cls.commitMsgT}>{c.msg}</div>
                    <div className={cls.commitMeta}>
                      <span>{author.short}</span>
                      <span>· {c.time}</span>
                      <div className={cls.commitRefs}>
                        {c.refs.map(r => {
                          const refCls = r.type === 'head' ? cls.refHead : r.type === 'remote' ? cls.refRemote : r.type === 'tag' ? cls.refTag : cls.refBranch;
                          return <span key={r.name} className={classNames(cls.gitref, {}, [refCls])}>{r.name}</span>;
                        })}
                      </div>
                    </div>
                  </div>
                  <span className={cls.commitHash}>{c.hash}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className={cls.commitDetail}>
        <div className={cls.cdetailHead}>
          <div className={cls.cdetailMsg}>{selCommit.msg}</div>
          <div className={cls.cdetailWho}>
            <Avatar size="sm" initials={initials(byId(selCommit.who).name)} color={byId(selCommit.who).presence} />
            <div>
              <div className={cls.cdetailWhoName}>{byId(selCommit.who).name}</div>
              <div className={cls.cdetailWhoSub}>{selCommit.time}</div>
            </div>
            <span className={cls.cdetailHash}><Icons.Copy size={11} /> {selCommit.hash}</span>
          </div>
        </div>
        <div className={cls.cdetailLabel}>Changed files</div>
        <div className={cls.cdetailFiles}>
          {files.map(f => {
            const total = f.add + f.del;
            const bars = Math.min(total, 5);
            const addBars = Math.round((f.add / total) * bars);
            const statusCls = f.status === 'M' ? cls.cfM : f.status === 'A' ? cls.cfA : cls.cfD;
            return (
              <div className={cls.changefile} key={f.path}>
                <span className={classNames(cls.cfStatus, {}, [statusCls])}>{f.status}</span>
                <span className={cls.cfPath}>{f.path}</span>
                <span className={cls.cfStat}>
                  <span className={cls.cfAdd}>+{f.add}</span>
                  <span className={cls.cfDel}>-{f.del}</span>
                  <span className={cls.cfBars}>
                    {Array.from({ length: bars }, (_, i) => (
                      <span key={i} className={i < addBars ? cls.cfBarAdd : cls.cfBarDel} />
                    ))}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
