import { memo } from 'react';
import { classNames } from '@/shared/lib/classNames/classNames';
import { Icons } from '@/shared/ui/Icon/Icons';
import { AvatarStack } from '@/shared/ui/AvatarStack/AvatarStack';
import { Badge } from '@/shared/ui/Badge/Badge';
import { LANG_COLOR, LANG_LABEL, byId } from '@/shared/data/demo';
import type { Project } from '@/shared/data/demo';
import cls from './ProjectCard.module.scss';
import { AppLink } from '@/shared/ui/AppLink/AppLink';
import { AppRoutes } from '@/shared/config/routeConfig/routeConfig';

interface ProjectCardProps {
  className?: string;
  project: Project;
}

export const ProjectCard = memo((props: ProjectCardProps) => {
  const { className, project } = props;

  return (
    <AppLink to={AppRoutes.EDITOR} className={classNames(cls.projcard, {}, [className])}>
      <div className={cls.projBody}>
        <div className={cls.projTop}>
          <span
            className={cls.projDot}
            style={{ '--dot-color': LANG_COLOR[project.langs[0]] || 'var(--ink-400)' } as React.CSSProperties}
          />
          <span className={cls.projName}>{project.name}</span>
          <span className={cls.projStar} data-on={project.stars > 0}><Icons.Star size={14} /></span>
        </div>
        <div className={cls.projDesc}>{project.desc}</div>
        <div className={cls.projLangs}>
          {project.langs.map(l => (
            <span key={l} className={cls.langChip}>
              <span
                className={cls.langDot}
                style={{ '--dot-color': LANG_COLOR[l] } as React.CSSProperties}
              />
              {LANG_LABEL[l] || l}
            </span>
          ))}
        </div>
      </div>
      <div className={cls.projFoot}>
        <span className={cls.projMeta}>{project.branch} · {project.updated}</span>
        <span className={cls.projFootSp} />
        {project.here.length > 0 && (
          <AvatarStack people={project.here.map(id => { const u = byId(id); return { id, name: u.name, presence: u.presence }; })} max={3} size="xs" />
        )}
        {project.here.length > 0 && <Badge variant="success" dot size="sm">{project.here.length} live</Badge>}
      </div>
    </AppLink>
  );
});
