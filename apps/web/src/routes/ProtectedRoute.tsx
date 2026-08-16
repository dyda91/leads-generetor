import { Navigate, Outlet, useLocation } from 'react-router';

import { useAuth } from '../auth/AuthProvider';
import { SessionRecoverableErrorScreen, SessionRestoringScreen } from './SessionScreens';

/**
 * Route guard for private routes. It observes the AuthProvider state only —
 * it never restores, stores or duplicates the session. While restoring it
 * renders a stable loading screen (no redirect, no protected content); on a
 * recoverable error it keeps the user on the route with a controlled retry;
 * when unauthenticated it redirects to `/login`, carrying only the pathname as
 * the post-login destination. When authenticated it renders the protected
 * subtree.
 */
export function ProtectedRoute() {
  const { state, retrySessionRestore } = useAuth();
  const location = useLocation();

  if (state.status === 'restoring') {
    return <SessionRestoringScreen />;
  }

  if (state.status === 'recoverable-error') {
    return <SessionRecoverableErrorScreen onRetry={retrySessionRestore} />;
  }

  if (state.status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
