import logo from '../../assets/gyftr-logo.png';
import { Button } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { ChangePasswordForm } from './ChangePasswordForm';

/**
 * Shown instead of the panel while the account still has the password it was
 * given (the first administrator's default, or one set by an administrator).
 * The API refuses everything else until the password is changed.
 */
export function ForcePasswordChangePage() {
  const { user, logout } = useAuth();
  return (
    <div className="login-screen">
      <div className="card login-card">
        <img src={logo} alt="GyFTR" className="login-logo" />
        <h1>Set your password</h1>
        <p className="muted" style={{ margin: 0 }}>
          {user?.email} is still using the password it was given. Choose your own to continue.
        </p>
        <div className="stack" style={{ marginTop: 18 }}>
          <ChangePasswordForm currentLabel="Password you were given" />
          <Button variant="ghost" onClick={() => void logout()}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
