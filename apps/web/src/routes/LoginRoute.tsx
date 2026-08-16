import { Navigate, useLocation } from 'react-router';

import { useAuth } from '../auth/AuthProvider';
import { LoginScreen } from '../features/login/LoginScreen';
import { resolvePostLoginDestination } from './destinations';
import { SessionRecoverableErrorScreen, SessionRestoringScreen } from './SessionScreens';

/**
 * Public login route. While the session is resolving it shows the same stable
 * loading/error screens as private routes (no flash of the form); an
 * authenticated session redirects to the validated post-login destination (or
 * `/`); otherwise it renders the login screen. Login navigation is driven
 * entirely by the AuthProvider state — the router only observes it.
 */
export function LoginRoute() {
  const { state, retrySessionRestore } = useAuth();
  const location = useLocation();

  if (state.status === 'restoring') {
    return <SessionRestoringScreen />;
  }

  if (state.status === 'recoverable-error') {
    return <SessionRecoverableErrorScreen onRetry={retrySessionRestore} />;
  }

  if (state.status === 'authenticated') {
    return <Navigate to={resolvePostLoginDestination(location.state)} replace />;
  }

  return <LoginScreen />;
}
