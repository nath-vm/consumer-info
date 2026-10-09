import React, { useState } from 'react';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import api from '../api';

const UserLogin = () => {
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/api/auth/user-login', { password });
      window.location.reload();
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'ACCESS_DISABLED') {
        setError('System currently unavailable. Contact your administrator.');
      } else {
        setError(err.response?.data?.message || 'Login failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container
      maxWidth="xs"
      sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}
    >
      <Paper elevation={3} sx={{ p: 4, width: '100%', textAlign: 'center' }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Consumer Information System
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Enter the access password to continue.
        </Typography>

        <Box
          component="form"
          onSubmit={handleLogin}
          autoComplete="off"
          sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          <TextField
            label="Password"
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            fullWidth
            required
            autoFocus
            autoComplete="current-password"
            inputProps={{
              style: {
                // Hide the browser's native password reveal button (Edge/IE/Chrome)
                MsRevealButton: 'none',
              },
            }}
            sx={{
              '& input::-ms-reveal':        { display: 'none' },
              '& input::-ms-clear':         { display: 'none' },
              '& input::-webkit-contacts-auto-fill-button': { display: 'none' },
            }}
          />

          {/* Show/hide toggle — lives outside the field, always visible */}
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: -1 }}>
            <ToggleButton
              value="showPw"
              selected={showPw}
              onChange={() => setShowPw(s => !s)}
              tabIndex={-1}
              size="small"
              sx={{
                border: '1px solid',
                borderColor: showPw ? 'primary.main' : 'divider',
                borderRadius: '20px',
                px: 1.5,
                py: 0.5,
                fontSize: '0.75rem',
                textTransform: 'none',
                color: showPw ? 'primary.main' : 'text.secondary',
                gap: 0.5,
                '&.Mui-selected': {
                  backgroundColor: 'primary.50',
                  color: 'primary.main',
                },
              }}
            >
              {showPw ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
              {showPw ? 'Hide password' : 'Show password'}
            </ToggleButton>
          </Box>

          {error && <Alert severity="error">{error}</Alert>}

          <Button type="submit" variant="contained" size="large" fullWidth disabled={loading}>
            {loading ? <CircularProgress size={22} color="inherit" /> : 'Enter'}
          </Button>
        </Box>
      </Paper>
    </Container>
  );
};

export default UserLogin;
