import { ForcePasswordChangePage } from '../features/auth/ForcePasswordChangePage';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router';
import logoWhite from '../assets/gyftr-logo-white.png';
import type { Permission } from '../contracts';
import { useAuth } from '../lib/auth';
import { Spinner } from './ui';

const NAV: { to: string; label: string; icon: string; permission?: Permission; section?: string }[] = [
  { to: '/pages', label: 'Pages', icon: '📄', section: 'Content' },
  { to: '/brands', label: 'Brands', icon: '🏷️' },
  { to: '/media', label: 'Media library', icon: '🖼️' },
  { to: '/templates', label: 'Templates', icon: '🧩' },
  { to: '/occasions', label: 'Occasions', icon: '🎉', section: 'Configuration' },
  { to: '/settings', label: 'Header & footer', icon: '⚙️' },
  { to: '/users', label: 'Users', icon: '👥', permission: 'users.manage', section: 'Administration' },
  { to: '/audit', label: 'Audit log', icon: '🧾', permission: 'audit.read' },
];

export function ProtectedLayout() {
  const { user, loading, logout, can } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // A given password (first administrator, invitation, reset) must be replaced before anything else.
  if (user.mustChangePassword) return <ForcePasswordChangePage />;

  // The page editor needs the full width; it has its own "← Pages" navigation.
  const fullscreen = /^\/pages\/[^/]+$/.test(location.pathname);

  return (
    <div className={`app-shell ${fullscreen ? 'fullscreen' : ''}`}>
      <aside className="sidebar" hidden={fullscreen}>
        <div className="brand-mark">
          <img src={logoWhite} alt="GyFTR" className="brand-logo-img" />
          <small>Occasion page builder</small>
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.filter((n) => !n.permission || can(n.permission)).map((n) => (
            <div key={n.to}>
              {n.section && <div className="nav-section">{n.section}</div>}
              <NavLink to={n.to}>
                <span aria-hidden>{n.icon}</span> {n.label}
              </NavLink>
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <strong>{user.name}</strong>
          <span>
            {user.email} · {user.role.toLowerCase()}
          </span>
          <div className="row">
            <NavLink to="/account">Account</NavLink>
            <button type="button" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className={`main ${fullscreen ? 'flush' : ''}`}>
        <Outlet />
      </main>
    </div>
  );
}

export function RequirePermission({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const { can } = useAuth();
  if (!can(permission)) return <p className="muted">You do not have access to this page.</p>;
  return <>{children}</>;
}
