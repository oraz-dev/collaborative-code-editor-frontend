import { useState, useCallback, memo } from 'react';
import { Icons } from '@/shared/ui/Icon/Icons';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { AvatarStack } from '@/shared/ui/AvatarStack/AvatarStack';
import { IconButton } from '@/shared/ui/IconButton/IconButton';
import { PROJECTS, LIVE_SESSIONS, ACTIVITY, byId } from '@/shared/data/demo';
import { initials } from '@/shared/lib/initials/initials';
import { AppBar } from '@/widgets/AppBar/AppBar';
import { ProjectCard } from '@/widgets/ProjectCard/ProjectCard';
import { NewProjectModal } from '@/widgets/NewProjectModal/NewProjectModal';
import cls from './DashboardPage.module.scss';
import { AppLink } from '@/shared/ui/AppLink/AppLink';
import { AppRoutes } from '@/shared/config/routeConfig/routeConfig';

export const DashboardPage = memo(() => {
  const [newOpen, setNewOpen] = useState(false);

  const handleOpenNew = useCallback(() => {
    setNewOpen(true);
  }, []);

  const handleCloseNew = useCallback(() => {
    setNewOpen(false);
  }, []);

  return (
    <div className={cls.canvas}>
      <AppBar showNew onNew={handleOpenNew} />
      <div className={cls.dash}>
        <div className={cls.wrap}>
          <div className={cls.hero}>
            <div className={cls.greeting}>
              <div className={cls.eyebrow}>Welcome back</div>
              <h1 className={cls.h1}>Good evening, <em>You.</em></h1>
            </div>
          </div>
          <div className={cls.cols}>
            <div>
              <div className={cls.secHead}>
                <span className={cls.secTitle}>Projects</span>
                <span className={cls.secCt}>{PROJECTS.length}</span>
                <span className={cls.secSp} />
                <IconButton size="sm" aria-label="Toggle grid view"><Icons.Grid size={15} /></IconButton>
              </div>
              <div className={cls.projgrid}>
                {PROJECTS.map(p => <ProjectCard key={p.id} project={p} />)}
                <div className={cls.projNew} onClick={handleOpenNew}>
                  <div className={cls.plus}><Icons.Plus size={18} /></div>
                  <span>New project</span>
                </div>
              </div>
            </div>
            <div className={cls.side}>
              <div className={cls.cardSoft}>
                <div className={cls.cardHead}>
                  <span className={cls.cardTitle}>Live sessions</span>
                  <span className={cls.cardLive}><span className={cls.cardLiveDot} /> {LIVE_SESSIONS.length} active</span>
                </div>
                {LIVE_SESSIONS.map((sess, i) => (
                  <AppLink className={cls.sessrow} key={i} to={AppRoutes.EDITOR}>
                    <AvatarStack people={sess.people.map(id => { const u = byId(id); return { id, name: u.name, presence: u.presence }; })} max={3} size="xs" />
                    <div className={cls.sessTxt}>
                      <div className={cls.sessT}>{sess.project}</div>
                      <div className={cls.sessS}>{sess.file} · {sess.started}</div>
                    </div>
                  </AppLink>
                ))}
              </div>
              <div className={cls.cardSoft}>
                <div className={cls.cardHead}>
                  <span className={cls.cardTitle}>Activity</span>
                </div>
                {ACTIVITY.map((a, i) => {
                  const who = byId(a.who);
                  return (
                    <div className={cls.actrow} key={i}>
                      <Avatar size="sm" initials={initials(who.name)} color={who.presence} />
                      <div className={cls.actTxt}><b>{who.short}</b> {a.action} <span className={cls.actTarget}>{a.target}</span></div>
                      <span className={cls.actTime}>{a.time}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
      <NewProjectModal open={newOpen} onClose={handleCloseNew} />
    </div>
  );
});
