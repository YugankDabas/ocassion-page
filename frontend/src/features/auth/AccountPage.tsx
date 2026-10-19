import { ROLE_LABELS } from '../../contracts';
import { Button, PageHeader } from '../../components/ui';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ChangePasswordForm } from './ChangePasswordForm';

export function AccountPage() {
  const { user, logout } = useAuth();

  const logoutAll = async () => {
    await api.post('/auth/logout-all').catch(() => undefined);
    await logout();
  };

  return (
    <>
      <PageHeader title="Your account" description={`${user?.name} · ${user?.email} · ${user ? ROLE_LABELS[user.role].toLowerCase() : ''}`} />
      <div className="card card-body stack" style={{ maxWidth: 480 }}>
        <h2>Change password</h2>
        <ChangePasswordForm />
        <div className="row">
          <Button variant="ghost" onClick={() => void logoutAll()}>
            Sign out of all devices
          </Button>
        </div>
      </div>
    </>
  );
}
