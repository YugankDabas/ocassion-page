import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import logo from '../../assets/gyftr-logo.png';
import { Button, TextInput } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { useAuth } from '../../lib/auth';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? '/pages';

  if (user) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="card login-card">
        <img src={logo} alt="GyFTR" className="login-logo" />
        <h1>Occasion Pages</h1>
        <p className="muted" style={{ margin: 0 }}>
          Sign in to build and publish occasion pages.
        </p>
        <form className="stack" onSubmit={submit} noValidate>
          <TextInput label="Work email" type="email" autoComplete="username" required value={email} onChange={setEmail} autoFocus />
          <TextInput label="Password" type="password" autoComplete="current-password" required value={password} onChange={setPassword} />
          {error && (
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          )}
          <Button type="submit" variant="primary" loading={loading} disabled={!email || !password}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
