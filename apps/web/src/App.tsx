import { Route, Routes } from 'react-router';

import { AppShell } from './components/layout/AppShell';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { SecurityPage } from './features/security/SecurityPage';
import { LoginRoute } from './routes/LoginRoute';
import { NotFoundPage } from './routes/NotFoundPage';
import { ProtectedRoute } from './routes/ProtectedRoute';

/**
 * Route tree. `/login` is public; `/` and `/settings/security` are protected by
 * `ProtectedRoute` and rendered inside the authenticated `AppShell` (driven
 * exclusively by the AuthProvider state — no duplicated session/user state in
 * the router); any other path renders the public 404.
 */
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/settings/security" element={<SecurityPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
