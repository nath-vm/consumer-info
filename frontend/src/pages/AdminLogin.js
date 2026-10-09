import React, { useState } from 'react';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import CircularProgress from '@mui/material/CircularProgress';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import api from '../api';

// Production uses Google's REDIRECT mode: the whole page navigates to Google and back, so
// popup blockers / privacy extensions cannot stop it. Google posts the result to our API
// (through the Vercel /api proxy). Local development keeps the popup mode, because the
// Create React App dev server cannot receive that form post.
const USE_REDIRECT = process.env.NODE_ENV === 'production';

const REDIRECT_ERRORS = {
  csrf: 'Sign-in could not be verified. Please try again (and make sure cookies are enabled).',
  invalid: 'Google sign-in failed or your email is not verified. Please try again.',
  not_approved: 'Your Google account is not approved for admin access.',
};

const AdminLogin = () => {
  // After a redirect-mode sign-in the API sends us back here with ?login_error=<code>
  const [error, setError] = useState(() => {
    const code = new URLSearchParams(window.location.search).get('login_error');
    return code ? (REDIRECT_ERRORS[code] || 'Sign-in failed. Please try again.') : null;
  });
  const [loading, setLoading] = useState(false);

  const handleGoogleSuccess = async (credentialResponse) => {
    setError(null);
    setLoading(true);
    try {
      await api.post('/api/auth/admin-login', {
        credential: credentialResponse.credential,
      });
      // Auth is cookie-based — server sets httpOnly cookies automatically
      window.location.reload();
    } catch (err) {
      if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else if (err.code === 'ERR_NETWORK' || !err.response) {
        setError('Unable to reach the server. It may be starting up — please wait a moment and try again.');
      } else {
        setError(`Login failed (${err.response?.status ?? 'unknown error'}). Please try again.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    setError('Google sign-in was cancelled or failed. Please try again.');
  };

  return (
    <GoogleOAuthProvider clientId={process.env.REACT_APP_GOOGLE_CLIENT_ID}>
      <Container
        maxWidth="xs"
        sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}
      >
        <Paper elevation={4} sx={{ p: 4, width: '100%', textAlign: 'center' }}>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Admin Access
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
            Sign in with your approved Google account.
          </Typography>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={handleGoogleError}
                useOneTap={false}
                {...(USE_REDIRECT && {
                  ux_mode: 'redirect',
                  login_uri: `${window.location.origin}/api/auth/admin-login-redirect`,
                })}
                theme="outline"
                size="large"
                text="signin_with"
                shape="rectangular"
              />
            </Box>
          )}

          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
            Only approved Google accounts can access this panel.
          </Typography>
        </Paper>
      </Container>
    </GoogleOAuthProvider>
  );
};

export default AdminLogin;