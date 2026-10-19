import { useState } from 'react';
import { toast } from 'sonner';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from '../../contracts';
import { Badge, Button, Modal, PageHeader, PasswordInput, Spinner, TextInput, Toggle, formatDate } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useSaveUser, useUsers } from '../../lib/queries';
import type { User } from '../../lib/types';

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
                <th>Access</th>
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
                  <td>
                    <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABELS[u.role]}</Badge>
                  </td>
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

/** Badge colour per access level. */
const ROLE_TONE: Record<Role, 'neutral' | 'success' | 'info'> = { EDITOR: 'neutral', PUBLISHER: 'success', ADMIN: 'info' };
/** From least to most access. */
const ACCESS_LEVELS: Role[] = ['EDITOR', 'PUBLISHER', 'ADMIN'];

/** One choice of three, each saying exactly what the person can do. */
function AccessChoice({ value, onChange, disabled }: { value: Role; onChange: (role: Role) => void; disabled: boolean }) {
  return (
    <fieldset className="access-choice" disabled={disabled}>
      <legend className="field-label">What can this person do?</legend>
      {ACCESS_LEVELS.map((role) => (
        <label key={role} className={`access-option ${value === role ? 'on' : ''}`}>
          <input type="radio" name="access" value={role} checked={value === role} onChange={() => onChange(role)} />
          <span>
            <strong>{ROLE_LABELS[role]}</strong>
            <small>{ROLE_DESCRIPTIONS[role]}</small>
          </span>
        </label>
      ))}
      {disabled && <p className="field-hint">You cannot change your own access. Another admin can.</p>}
    </fieldset>
  );
}

function UserModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const save = useSaveUser();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'EDITOR');
  const { user: me, refresh } = useAuth();
  const isMe = user !== null && user.id === me?.id;
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [password, setPassword] = useState('');

  const submit = async () => {
    try {
      const input = user
        ? { name, email, role, isActive, ...(password ? { password } : {}) }
        : { name, email, role, password };
      await save.mutateAsync({ id: user?.id, input });
      if (isMe) await refresh().catch(() => undefined); // the sidebar shows your new name / email
      const newEmail = user !== null && email.trim().toLowerCase() !== user.email.toLowerCase();
      toast.success(
        !user
          ? 'User invited. Share the temporary password securely; they must change it at first sign-in.'
          : newEmail && !isMe
            ? `User updated. They now sign in with ${email.trim().toLowerCase()}.`
            : 'User updated',
      );
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
        <TextInput
          label="Email"
          type="email"
          value={email}
          maxLength={200}
          onChange={setEmail}
          hint={user && !isMe ? 'The address they sign in with. Changing it signs them out; they then sign in with the new one.' : user ? 'The address you sign in with.' : undefined}
        />
        <AccessChoice value={role} onChange={setRole} disabled={isMe} />
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
