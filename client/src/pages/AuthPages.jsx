import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Link, navigate } from '../app-state.jsx';
import { ThemeToggle } from '../theme.jsx';

export function AuthLayout({ children }) {
  return (
    <div className="auth-page">
      <div className="auth-theme"><ThemeToggle /></div>
      <h1 className="brand-big">TICKET TRACKER</h1>
      <div className="auth-card">{children}</div>
    </div>
  );
}

function Field({ label, hint, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function ResendBox({ initialEmail = '', token = null, label = 'Account not verified?' }) {
  const [email, setEmail] = useState(initialEmail);
  const [state, setState] = useState({ busy: false, msg: '', error: '' });
  useEffect(() => setEmail(initialEmail), [initialEmail]);
  const resend = async () => {
    setState({ busy: true, msg: '', error: '' });
    try {
      const d = await api.post('/auth/resend-verification', token ? { token } : { email });
      setState({ busy: false, msg: d.message, error: '' });
    } catch (e) {
      setState({ busy: false, msg: '', error: e.message });
    }
  };
  return (
    <div className="resend">
      <div className="muted">{label}</div>
      {!token && (
        <input type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email for the verification message" />
      )}
      <button type="button" className="btn" onClick={resend} disabled={state.busy || (!token && !email.trim())}>
        {state.busy ? 'Sending…' : 'Resend email'}
      </button>
      {state.msg && <div className="success-box" role="status">{state.msg}</div>}
      {state.error && <div className="error-box" role="alert">{state.error}</div>}
    </div>
  );
}

export function LoginPage({ onLoggedIn }) {
  const [v, setV] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [notVerified, setNotVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotVerified(false);
    try {
      const d = await api.post('/auth/login', v);
      onLoggedIn(d.user);
    } catch (err) {
      setError(err.message);
      setNotVerified(err.code === 'EMAIL_NOT_VERIFIED');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <form onSubmit={submit} className="stack">
        <h2>Log in</h2>
        <p className="muted">Use your verified account.</p>
        <Field label="Email" type="email" required autoFocus placeholder="name@example.com" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        <Field label="Password" type="password" required value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />
        {error && <div className="error-box" role="alert">{error}</div>}
        <button className="btn primary big" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
      <ResendBox initialEmail={v.email} label={notVerified ? 'Your email is not verified yet.' : 'Account not verified?'} />
      <p className="center"><Link to="/signup">Create an account →</Link></p>
    </>
  );
}

export function SignupPage() {
  const [v, setV] = useState({ email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (v.password.length < 8) return setError('Password must be at least 8 characters');
    if (v.password !== v.confirm) return setError('Passwords do not match');
    setBusy(true);
    try {
      setDone(await api.post('/auth/signup', { email: v.email, password: v.password }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  if (done) {
    return (
      <div className="stack">
        <h2>Check your email</h2>
        <div className={done.emailSent ? 'success-box' : 'error-box'} role="status">{done.message}</div>
        <ResendBox initialEmail={v.email} label="Did not get the email?" />
        <p className="center"><Link to="/login">Go to log in →</Link></p>
      </div>
    );
  }
  return (
    <>
      <form onSubmit={submit} className="stack">
        <h2>Create account</h2>
        <p className="muted">Email verification is required.</p>
        <Field label="Email" type="email" required autoFocus placeholder="name@example.com" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        <Field label="Password" type="password" required minLength={8} placeholder="Minimum 8 characters" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} />
        <Field label="Confirm password" type="password" required value={v.confirm} onChange={(e) => setV({ ...v, confirm: e.target.value })} />
        {error && <div className="error-box" role="alert">{error}</div>}
        <button className="btn primary big" disabled={busy}>{busy ? 'Creating…' : 'Sign up'}</button>
      </form>
      <p className="center"><Link to="/login">Already registered? Log in →</Link></p>
    </>
  );
}

export function VerifyEmailPage({ search }) {
  const token = new URLSearchParams(search).get('token') || '';
  const [state, setState] = useState({ status: 'loading', message: '' });
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; // React StrictMode would otherwise spend the single-use token twice
    started.current = true;
    if (!token) return setState({ status: 'error', message: 'The verification link is incomplete.' });
    api
      .post('/auth/verify-email', { token })
      .then((d) => setState({ status: 'ok', message: d.message }))
      .catch((e) => setState({ status: 'error', message: e.message }));
  }, [token]);

  return (
    <div className="stack center-stack">
      <h2>Email verification</h2>
      {state.status === 'loading' && <p className="muted">Verifying your email…</p>}
      {state.status === 'ok' && (
        <>
          <div className="check-circle" aria-hidden>✓</div>
          <h3>Email verified</h3>
          <p className="muted">Your account is ready to use.</p>
          <button className="btn primary big" onClick={() => navigate('/login')}>Continue to login</button>
        </>
      )}
      {state.status === 'error' && (
        <>
          <div className="error-box" role="alert"><b>Expired or invalid link</b><br />{state.message}</div>
          <ResendBox token={token || null} initialEmail="" label="Get a new verification email" />
          {!token && <p className="muted">Enter your email on the login screen to request a new link.</p>}
          <p className="center"><Link to="/login">Back to log in</Link></p>
        </>
      )}
    </div>
  );
}
