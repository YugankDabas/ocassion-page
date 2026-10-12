import { useState } from 'react';
import { toast } from 'sonner';
import { Button, PageHeader, TextInput } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';

export function AccountPage() {
  const { user, logout } = useAuth();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const change = async () => {
    if (newPassword !== confirm) return toast.error('New passwords do not match');
    setLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      toast.success('Password changed. Please sign in again.');
      await logout();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const logoutAll = async () => {
    await api.post('/auth/logout-all').catch(() => undefined);
    await logout();
  };

  return (
    <>
      <PageHeader title="Your account" description={`${user?.name} · ${user?.email} · ${user?.role.toLowerCase()}`} />
      <div className="card card-body stack" style={{ maxWidth: 480 }}>
        <h2>Change password</h2>
        <TextInput label="Current password" type="password" autoComplete="current-password" value={currentPassword} onChange={setCurrent} />
        <TextInput label="New password" type="password" autoComplete="new-password" value={newPassword} onChange={setNew} hint="12+ characters with letters and numbers" />
        <TextInput label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={setConfirm} />
        <div className="row">
          <Button variant="primary" loading={loading} onClick={() => void change()} disabled={!currentPassword || !newPassword}>
            Change password
          </Button>
          <Button variant="ghost" onClick={() => void logoutAll()}>
            Sign out of all devices
          </Button>
        </div>
      </div>
    </>
  );
}
