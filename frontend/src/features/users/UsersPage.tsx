import { useState } from 'react';
import { toast } from 'sonner';
import { ROLES, type Role } from '../../contracts';
import { Badge, Button, Modal, PageHeader, PasswordInput, Select, Spinner, TextInput, Toggle, formatDate } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useSaveUser, useUsers } from '../../lib/queries';
import type { User } from '../../lib/types';

const ROLE_HELP: Record<Role, string> = {
  ADMIN: 'Everything, incl. users, occasions and header/footer',
  PUBLISHER: 'Edit & publish pages, manage brands and templates',
  EDITOR: 'Edit drafts and upload media (cannot publish)',
};

export function UsersPage() {
  const users = useUsers();
  const { user: me } = useAuth();
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  return (
    <>
      <PageHeader title="Users" description="Who can access the page builder." actions={<Button variant="primary" onClick={() => setEditing('new')}>+ Invite user</Button>} />
      <div className="card">
        {users.isLoading ? (
          <Spinner />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last sign-in</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.data?.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name}</strong> {u.id === me?.id && <Badge tone="info">you</Badge>}
                    <div className="muted small">{u.email}</div>
                  </td>
                  <td>{u.role.toLowerCase()}</td>
                  <td>{u.isActive ? <Badge tone="success">active</Badge> : <Badge tone="danger">disabled</Badge>}</td>
                  <td>{formatDate(u.lastLoginAt)}</td>
                  <td className="actions">
                    <Button size="sm" onClick={() => setEditing(u)}>
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editing && <UserModal user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function UserModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const save = useSaveUser();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'EDITOR');
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [password, setPassword] = useState('');

  const submit = async () => {
    try {
      const input = user
        ? { name, role, isActive, ...(password ? { password } : {}) }
        : { name, email, role, password };
      await save.mutateAsync({ id: user?.id, input });
      toast.success(user ? 'User updated' : 'User invited. Share the temporary password securely; they must change it at first sign-in.');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={user ? `Edit ${user.name}` : 'Invite user'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={() => void submit()}>
            Save
          </Button>
        </>
      }
    >
      <div className="stack">
        <TextInput label="Name" value={name} onChange={setName} maxLength={120} />
        {!user && <TextInput label="Email" type="email" value={email} onChange={setEmail} />}
        <Select label="Role" value={role} onChange={setRole} options={ROLES.map((r) => ({ value: r, label: r.toLowerCase() }))} hint={ROLE_HELP[role]} />
        <PasswordInput
          label={user ? 'Reset password (optional)' : 'Temporary password'}
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          hint="At least 12 characters with letters and numbers. The user is signed out everywhere and must choose their own password at the next sign-in."
        />
        {user && <Toggle label="Account active" checked={isActive} onChange={setIsActive} />}
      </div>
    </Modal>
  );
}
