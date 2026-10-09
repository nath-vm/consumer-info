import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import UserHome       from './pages/UserHome';
import NotFound       from './pages/NotFound';
import AdminDashboard from './pages/AdminDashboard';
import AdminSettings  from './pages/AdminSettings';
import UserLogin      from './pages/UserLogin';
import AdminLogin     from './pages/AdminLogin';
import { useAuthCheck } from './ProtectedRoutes';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';
import API_BASE_URL from './config';

const ADMIN = process.env.REACT_APP_ADMIN_ROUTE || 'p3-admin';

function LoadingScreen() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <CircularProgress />
    </Box>
  );
}

// Renders at / — shows UserLogin or UserHome, never changes URL
function RootRoute() {
  const { loading, authenticated, role } = useAuthCheck();
  if (loading) return <LoadingScreen />;
  if (!authenticated) return <UserLogin />;
  if (role === 'admin') return <Navigate to={`/${ADMIN}`} replace />;
  return <UserHome />;
}

// Renders at /p3-admin — shows AdminLogin, Dashboard, or Settings.
// AdminDashboard is ALWAYS mounted once authenticated — we hide it with
// display:none when Settings is active. This preserves its full state
// (consumers, page, search, etc.) so navigating to Settings and back
// is instant with no re-fetch.
function AdminRootRoute() {
  const { loading, authenticated, role } = useAuthCheck();
  const [view, setView] = React.useState('dashboard');

  if (loading) return <LoadingScreen />;
  if (!authenticated) return <AdminLogin />;
  if (role === 'user') return <Navigate to="/" replace />;

  return (
    <Box>
      <Box sx={{ display: view === 'dashboard' ? 'block' : 'none' }}>
        <AdminDashboard onSettings={() => setView('settings')} />
      </Box>
      {view === 'settings' && (
        <AdminSettings onBack={() => setView('dashboard')} />
      )}
    </Box>
  );
}

function App() {
  useEffect(() => {
    const ping = () => fetch(`${API_BASE_URL}/api/health`).catch(() => {});
    ping();
    const interval = setInterval(ping, 14 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/"           element={<RootRoute />} />
        <Route path={`/${ADMIN}`} element={<AdminRootRoute />} />
        <Route path="*"           element={<NotFound />} />
      </Routes>
    </Router>
  );
}

export default App;