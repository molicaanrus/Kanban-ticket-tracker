import { useCallback, useEffect, useState } from 'react';
import { api, setUnauthenticatedHandler } from './api.js';
import { AppProvider, navigate, useLocation } from './app-state.jsx';
import { AuthLayout, LoginPage, SignupPage, VerifyEmailPage } from './pages/AuthPages.jsx';
import Shell from './components/Shell.jsx';

const PUBLIC_PATHS = ['/login', '/signup', '/verify-email'];

export default function App() {
  const loc = useLocation();
  const [user, setUser] = useState(undefined); // undefined = checking, null = signed out

  useEffect(() => {
    api.get('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null));
  }, []);

  const onLoggedOut = useCallback(() => {
    setUser(null);
    navigate('/login', { replace: true });
  }, []);

  useEffect(() => {
    setUnauthenticatedHandler(onLoggedOut);
  }, [onLoggedOut]);

  if (user === undefined) return <div className="center-note">Loading…</div>;

  const isPublic = PUBLIC_PATHS.includes(loc.path);

  // Signed-out users only see the public auth screens
  if (!user) {
    if (!isPublic) {
      navigate('/login', { replace: true });
      return null;
    }
    return (
      <AuthLayout>
        {loc.path === '/signup' ? (
          <SignupPage />
        ) : loc.path === '/verify-email' ? (
          <VerifyEmailPage search={loc.search} />
        ) : (
          <LoginPage onLoggedIn={(u) => { setUser(u); navigate('/', { replace: true }); }} />
        )}
      </AuthLayout>
    );
  }

  // Signed-in users: the verification link still works, everything else is the app
  if (loc.path === '/verify-email') {
    return (
      <AuthLayout>
        <VerifyEmailPage search={loc.search} />
      </AuthLayout>
    );
  }
  if (isPublic) {
    navigate('/', { replace: true });
    return null;
  }
  return (
    <AppProvider user={user} onLoggedOut={onLoggedOut}>
      <Shell loc={loc} />
    </AppProvider>
  );
}
