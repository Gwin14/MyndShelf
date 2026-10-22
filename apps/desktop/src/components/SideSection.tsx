import type { ReactNode } from "react";

export function SideSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="side-section">
      <header className="side-title">
        <span>{title}</span>
        {action}
      </header>
      {children}
    </section>
  );
}

export function SideItem({
  active,
  onClick,
  icon,
  label,
  count,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  label: ReactNode;
  count?: number;
  children?: ReactNode;
}) {
  return (
    <div className="side-item" data-active={active || undefined} onClick={onClick} role="button" tabIndex={0}>
      {icon && <span className="side-icon">{icon}</span>}
      <span className="side-label">{label}</span>
      {count !== undefined && <span className="side-count">{count}</span>}
      {children}
    </div>
  );
}
