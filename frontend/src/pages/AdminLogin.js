import React, { useState } from 'react';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Paper from '@mui/material/Paper';
import CircularProgress from '@mui/material/CircularProgress';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import api from '../api';

const AdminLogin = () => {
  const [error, setError]     = useState(null);
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