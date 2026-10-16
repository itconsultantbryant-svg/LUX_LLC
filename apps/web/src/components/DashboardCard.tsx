import { type ReactNode } from 'react';
import type { IconName } from './icons/Icon';
import { Icon } from './icons/Icon';

export function DashboardCard({
  title,
  description,
  icon,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon?: IconName;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <article className={`panel dashboard-card ${className ?? ''}`}>
      <header className="dashboard-card__header">
        <div className="dashboard-card__title-group">
          {icon && (
            <div className="dashboard-card__icon">
              <Icon name={icon} size={22} />
            </div>
          )}
          <div>
            <h2 className="dashboard-card__title">{title}</h2>
            {description && <p className="dashboard-card__description">{description}</p>}
          </div>
        </div>
        {action}
      </header>
      {children && <div className="dashboard-card__content">{children}</div>}
    </article>
  );
}
