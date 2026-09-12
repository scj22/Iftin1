import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { ServiceStatusProvider } from './components/layout/ServiceStatus.jsx';
import { AppShell } from './components/layout/AppShell.jsx';
import { Spinner } from './components/ui/index.jsx';

import Landing from './pages/Landing.jsx';
import Navigate2 from './pages/Navigate.jsx';
import Dashboard from './pages/Dashboard.jsx';

// Split the heavier, less-visited screens out of the initial bundle.
const Traffic = lazy(() => import('./pages/Traffic.jsx'));
const HistoryPage = lazy(() => import('./pages/History.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const SettingsPage = lazy(() => import('./pages/Settings.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Register = lazy(() => import('./pages/Register.jsx'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

function PageFallback() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Spinner className="size-7" label="Loading page" />
    </div>
  );
}

/** Sends unauthenticated visitors to sign in, remembering where they wanted to go. */
function RequireAuth({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <PageFallback />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

/** Keeps signed-in users out of the auth screens. */
function RedirectIfAuthed({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <PageFallback />;
  if (isAuthenticated) return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <ServiceStatusProvider>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/" element={<Landing />} />

                <Route
                  path="/login"
                  element={
                    <RedirectIfAuthed>
                      <Login />
                    </RedirectIfAuthed>
                  }
                />
                <Route
                  path="/register"
                  element={
                    <RedirectIfAuthed>
                      <Register />
                    </RedirectIfAuthed>
                  }
                />
                <Route path="/forgot-password" element={<ForgotPassword />} />

                <Route path="/app" element={<AppShell />}>
                  <Route index element={<Dashboard />} />
                  <Route path="navigate" element={<Navigate2 />} />
                  <Route path="traffic" element={<Traffic />} />
                  <Route
                    path="history"
                    element={
                      <RequireAuth>
                        <HistoryPage />
                      </RequireAuth>
                    }
                  />
                  <Route
                    path="profile"
                    element={
                      <RequireAuth>
                        <Profile />
                      </RequireAuth>
                    }
                  />
                  <Route path="settings" element={<SettingsPage />} />
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ServiceStatusProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
