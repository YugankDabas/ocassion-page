import { useState } from 'react';
import { toast } from 'sonner';
import { Button, TextInput } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';

/** Change the signed-in user's password. On success every session ends and the user signs in again. */
export function ChangePasswordForm({ currentLabel = 'Current password' }: { currentLabel?: string }) {
  const { logout } = useAuth();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const change = async () => {
    if (newPassword !== confirm) return toast.error('New passwords do not match');
    setLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      toast.success('Password changed. Please sign in with your new password.');
      await logout();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <TextInput label={currentLabel} type="password" autoComplete="current-password" value={currentPassword} onChange={setCurrent} />
      <TextInput label="New password" type="password" autoComplete="new-password" value={newPassword} onChange={setNew} hint="12+ characters with letters and numbers" />
      <TextInput label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={setConfirm} />
      <Button variant="primary" loading={loading} onClick={() => void change()} disabled={!currentPassword || !newPassword || !confirm}>
        Change password
      </Button>
    </>
  );
}
