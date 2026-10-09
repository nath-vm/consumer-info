import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import Container      from '@mui/material/Container';
import Typography     from '@mui/material/Typography';
import Box            from '@mui/material/Box';
import Tabs           from '@mui/material/Tabs';
import Tab            from '@mui/material/Tab';
import IconButton     from '@mui/material/IconButton';
import Paper          from '@mui/material/Paper';
import Table          from '@mui/material/Table';
import TableBody      from '@mui/material/TableBody';
import TableHead      from '@mui/material/TableHead';
import TableRow       from '@mui/material/TableRow';
import TableCell      from '@mui/material/TableCell';
import CircularProgress from '@mui/material/CircularProgress';
import Alert          from '@mui/material/Alert';
import Button         from '@mui/material/Button';
import TextField      from '@mui/material/TextField';
import MenuItem       from '@mui/material/MenuItem';
import Divider        from '@mui/material/Divider';
import Chip           from '@mui/material/Chip';
import Tooltip        from '@mui/material/Tooltip';
import Pagination     from '@mui/material/Pagination';
import InputAdornment from '@mui/material/InputAdornment';
import Collapse       from '@mui/material/Collapse';
import Dialog         from '@mui/material/Dialog';
import DialogTitle    from '@mui/material/DialogTitle';
import DialogContent  from '@mui/material/DialogContent';
import DialogActions  from '@mui/material/DialogActions';
import ArrowBackIcon           from '@mui/icons-material/ArrowBack';
import EmailIcon               from '@mui/icons-material/Email';
import LockIcon                from '@mui/icons-material/Lock';
import AdminPanelSettingsIcon  from '@mui/icons-material/AdminPanelSettings';
import DeleteIcon              from '@mui/icons-material/Delete';
import AddIcon                 from '@mui/icons-material/Add';
import SendIcon                from '@mui/icons-material/Send';
import ContentCopyIcon         from '@mui/icons-material/ContentCopy';
import HistoryIcon             from '@mui/icons-material/History';
import SearchIcon              from '@mui/icons-material/Search';
import RefreshIcon             from '@mui/icons-material/Refresh';
import CheckCircleIcon         from '@mui/icons-material/CheckCircle';
import CancelIcon              from '@mui/icons-material/Cancel';
import ExpandMoreIcon          from '@mui/icons-material/ExpandMore';
import ExpandLessIcon          from '@mui/icons-material/ExpandLess';
import FilterListIcon          from '@mui/icons-material/FilterList';
import EditIcon                from '@mui/icons-material/Edit';
import MenuBookIcon            from '@mui/icons-material/MenuBook';
import UploadFileIcon          from '@mui/icons-material/UploadFile';
import Radio           from '@mui/material/Radio';
import RadioGroup      from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import api from '../api';
import ScrollToTop from '../components/ScrollToTop';

// ── Toast notification (no extra deps) ────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((message, severity = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, message, severity }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);
  return { toasts, add };
}

function ToastContainer({ toasts }) {
  return (
    <Box sx={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 1 }}>
      {toasts.map(t => (
        <Alert key={t.id} severity={t.severity} variant="filled" sx={{ minWidth: 280, boxShadow: 3 }}>
          {t.message}
        </Alert>
      ))}
    </Box>
  );
}

// ── Action type label + color mapping ─────────────────────────────────────────
const ACTION_META = {
  ADMIN_LOGIN_SUCCESS:         { label: 'Admin Login',        color: 'success' },
  ADMIN_LOGIN_FAILED:          { label: 'Admin Login Failed', color: 'error'   },
  USER_LOGIN_SUCCESS:          { label: 'User Login',         color: 'success' },
  USER_LOGIN_FAILED:           { label: 'User Login Failed',  color: 'error'   },
  USER_LOGIN_BLOCKED:          { label: 'User Blocked',       color: 'error'   },
  USER_PASSWORD_CHANGED:       { label: 'Password Changed',   color: 'warning' },
  USER_PASSWORD_AUTO_ROTATED:  { label: 'Auto-Rotated',       color: 'info'    },
  PASSWORD_ROTATION_UPDATED:   { label: 'Rotation Updated',   color: 'info'    },
  USER_ACCESS_TOGGLED:         { label: 'Access Toggled',     color: 'warning' },
  ADMIN_GMAIL_ADDED:           { label: 'Gmail Added',        color: 'success' },
  ADMIN_GMAIL_REMOVED:         { label: 'Gmail Removed',      color: 'warning' },
  NOTIFICATION_EMAILS_UPDATED: { label: 'Notif. Emails',      color: 'info'    },
  NOTIFICATION_TEST_SENT:      { label: 'Test Email Sent',    color: 'success' },
  LOGOUT:                      { label: 'Logout',             color: 'default' },
  CONSUMER_ADDED:              { label: 'Consumer Added',     color: 'success' },
  CONSUMER_UPDATED:            { label: 'Consumer Updated',   color: 'info'    },
  CONSUMER_HIDDEN:             { label: 'Consumer Hidden',    color: 'warning' },
  CONSUMER_UNHIDDEN:           { label: 'Consumer Unhidden',  color: 'success' },
  CONSUMER_DELETED:            { label: 'Consumer Deleted',   color: 'error'   },
  CONSUMER_BULK_IMPORT:        { label: 'Bulk Import',        color: 'success' },
  CONSUMER_BULK_UPDATE:        { label: 'Bulk Update',        color: 'info'    },
  CONSUMER_BULK_HIDDEN:        { label: 'Bulk Hidden',        color: 'warning' },
  CONSUMER_BULK_UNHIDDEN:      { label: 'Bulk Unhidden',      color: 'success' },
  ROVERBOOK_ADDED:             { label: 'RoverBook Add',    color: 'success' },
  ROVERBOOK_UPDATED:           { label: 'RoverBook Edit',   color: 'info'    },
  ROVERBOOK_DELETED:           { label: 'RoverBook Del',    color: 'error'   },
  ROVERBOOK_BULK_UPSERT:       { label: 'RoverBook Import', color: 'success' },
};

function actionChip(action) {
  const meta = ACTION_META[action] || { label: action, color: 'default' };
  return <Chip label={meta.label} color={meta.color} size="small" sx={{ fontWeight: 600, fontSize: 11 }} />;
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// ── Detail expander row ───────────────────────────────────────────────────────
function DetailRow({ log }) {
  const [open, setOpen] = useState(false);
  const hasDetail = log.detail && Object.keys(log.detail).length > 0;

  return (
    <>
      <TableRow
        sx={{
          cursor: hasDetail ? 'pointer' : 'default',
          '&:hover': { bgcolor: hasDetail ? 'action.hover' : 'transparent' },
          bgcolor: !log.success ? '#fff5f5' : 'transparent',
        }}
        onClick={() => hasDetail && setOpen(o => !o)}
      >
        <TableCell sx={{ whiteSpace: 'nowrap', fontSize: 12, color: 'text.secondary', fontFamily: 'monospace' }}>
          {formatTimestamp(log.timestamp)}
        </TableCell>
        <TableCell>{actionChip(log.action)}</TableCell>
        <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <Tooltip title={log.actor || 'system'} placement="top">
            <span>{log.actor || 'system'}</span>
          </Tooltip>
        </TableCell>
        <TableCell>
          {log.ip ? (
            <Chip label={log.ip} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: 11 }} />
          ) : (
            <Typography variant="caption" color="text.disabled">—</Typography>
          )}
        </TableCell>
        <TableCell>
          {log.success
            ? <CheckCircleIcon fontSize="small" color="success" />
            : <CancelIcon      fontSize="small" color="error"   />
          }
        </TableCell>
        <TableCell sx={{ width: 36, p: 0.5 }}>
          {hasDetail && (
            <IconButton size="small" onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>
              {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </IconButton>
          )}
        </TableCell>
      </TableRow>

      {hasDetail && (
        <TableRow>
          <TableCell colSpan={6} sx={{ py: 0, bgcolor: '#f9fafb' }}>
            <Collapse in={open} timeout="auto">
              <Box sx={{ px: 2, py: 1 }}>
                <pre style={{ margin: 0, fontSize: 12, fontFamily: 'monospace', color: '#374151', overflowX: 'auto' }}>
                  {JSON.stringify(log.detail, null, 2)}
                </pre>
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ── Audit Log Panel ───────────────────────────────────────────────────────────
const AuditLogPanel = () => {
  const [logs,    setLogs]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [pages,   setPages]   = useState(1);
  const [page,    setPage]    = useState(1);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [showFilter,    setShowFilter]    = useState(false);
  const [filterAction,  setFilterAction]  = useState('');
  const [filterActor,   setFilterActor]   = useState('');
  const [filterSuccess, setFilterSuccess] = useState('');

  const LIMIT = 100; // fetch more so client-side filter has enough to work with

  const fetchLogs = useCallback(async (pg = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: pg, limit: LIMIT });
      const res = await api.get(`/api/auth/audit-log?${params.toString()}`);
      setLogs(res.data.logs);
      setTotal(res.data.total);
      setPages(res.data.pages);
    } catch (err) {
      setError('Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  const handlePageChange = (_, newPage) => { setPage(newPage); fetchLogs(newPage); };
  const clearFilters = () => { setFilterAction(''); setFilterActor(''); setFilterSuccess(''); };
  const hasActiveFilters = filterAction || filterActor || filterSuccess;

  // Client-side filtering on the loaded page — instant, no round-trip needed
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (filterAction && !log.action?.toLowerCase().includes(filterAction.toLowerCase())) return false;
      if (filterActor  && !log.actor?.toLowerCase().includes(filterActor.toLowerCase()))   return false;
      if (filterSuccess === 'true'  && !log.success)  return false;
      if (filterSuccess === 'false' &&  log.success)  return false;
      return true;
    });
  }, [logs, filterAction, filterActor, filterSuccess]);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1 }}>
          Audit Log
          {total > 0 && (
            <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
              ({total.toLocaleString()} {total === 1 ? 'entry' : 'entries'})
            </Typography>
          )}
          {hasActiveFilters && filteredLogs.length !== logs.length && (
            <Typography component="span" variant="body2" color="warning.main" sx={{ ml: 1 }}>
              · {filteredLogs.length} shown
            </Typography>
          )}
        </Typography>
        <Tooltip title="Refresh">
          <span>
            <IconButton size="small" onClick={() => { setPage(1); fetchLogs(1); }} disabled={loading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Button
          size="small"
          variant={showFilter ? 'contained' : 'outlined'}
          startIcon={<FilterListIcon />}
          onClick={() => setShowFilter(s => !s)}
          color={hasActiveFilters ? 'warning' : 'primary'}
        >
          Filter{hasActiveFilters ? ' •' : ''}
        </Button>
      </Box>

      <Collapse in={showFilter}>
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <TextField
              size="small" label="Action type" placeholder="e.g. LOGIN"
              value={filterAction} onChange={e => setFilterAction(e.target.value)}
              sx={{ minWidth: 160 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
            />
            <TextField
              size="small" label="Actor" placeholder="e.g. admin@gmail.com"
              value={filterActor} onChange={e => setFilterActor(e.target.value)}
              sx={{ minWidth: 200 }}
            />
            <TextField
              select size="small" label="Status"
              value={filterSuccess} onChange={e => setFilterSuccess(e.target.value)}
              sx={{ minWidth: 130 }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="true">Success only</MenuItem>
              <MenuItem value="false">Failed only</MenuItem>
            </TextField>
            {hasActiveFilters && (
              <Button size="small" color="inherit" variant="outlined" onClick={clearFilters}>Clear</Button>
            )}
          </Box>
        </Paper>
      </Collapse>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        )}
        {!loading && filteredLogs.length === 0 && (
          <Box sx={{ py: 6, textAlign: 'center' }}>
            <HistoryIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              {hasActiveFilters ? 'No entries match your filters.' : 'No audit log entries found.'}
            </Typography>
          </Box>
        )}
        {!loading && filteredLogs.length > 0 && (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f3f4f6', fontSize: 12, whiteSpace: 'nowrap' } }}>
                  <TableCell>Timestamp</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Actor</TableCell>
                  <TableCell>IP Address</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell sx={{ width: 36 }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredLogs.map(log => <DetailRow key={log._id} log={log} />)}
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>

      {pages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Pagination count={pages} page={page} onChange={handlePageChange} color="primary" size="small" />
        </Box>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
        Showing {LIMIT} entries per page · Filters apply to loaded entries · Click a row to expand detail
      </Typography>
    </Box>
  );
};

// ── Gmail Management Panel
const GmailPanel = ({ config, onRefresh, toast }) => {
  const [newGmail, setNewGmail] = useState('');
  const [saving, setSaving]     = useState(false);

  const handleAdd = async () => {
    const trimmed = newGmail.trim().toLowerCase();
    if (!trimmed) return;
    setSaving(true);
    try {
      await api.post('/api/auth/admin-gmails', { email: trimmed });
      toast(`${trimmed} added to admin list.`, 'success');
      setNewGmail('');
      onRefresh();
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to add Gmail.', 'error');
    } finally { setSaving(false); }
  };

  const handleRemove = async (email) => {
    if (!window.confirm(`Remove ${email} from admin access? They will be logged out immediately.`)) return;
    setSaving(true);
    try {
      await api.delete(`/api/auth/admin-gmails/${encodeURIComponent(email)}`);
      toast(`${email} removed.`, 'success');
      onRefresh();
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to remove Gmail.', 'error');
    } finally { setSaving(false); }
  };

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>Approved Admin Accounts</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Only Google accounts listed here can log in as admin. Removing an account immediately revokes their access.
      </Typography>

      {config?.adminGmails?.length > 0 ? (
        <Paper variant="outlined" sx={{ mb: 3 }}>
          <Table size="small">
            <TableBody>
              {config.adminGmails.map(email => (
                <TableRow key={email}>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{email}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" color="error" onClick={() => handleRemove(email)} disabled={saving}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ) : (
        <Alert severity="warning" sx={{ mb: 3 }}>No admin accounts configured yet.</Alert>
      )}

      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          size="small" label="Add Gmail address" placeholder="admin@gmail.com"
          value={newGmail} onChange={e => setNewGmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          sx={{ flex: 1 }} inputProps={{ autoComplete: 'off' }}
        />
        <Button variant="contained" onClick={handleAdd} disabled={saving || !newGmail.trim()} startIcon={<AddIcon />}>
          Add
        </Button>
      </Box>
    </Box>
  );
};

// ── User Password Panel ───────────────────────────────────────────────────────
const PasswordPanel = ({ config, onRefresh, toast }) => {
  const [newPassword, setNewPassword]   = useState('');
  const [rotation, setRotation]         = useState(config?.passwordRotation || 'manual');
  const [saving, setSaving]             = useState(false);
  const [copied, setCopied]             = useState(false);

  useEffect(() => {
    if (config?.passwordRotation) setRotation(config.passwordRotation);
  }, [config]);

  const handleChangePassword = async () => {
    if (!newPassword.trim()) return;
    setSaving(true);
    try {
      await api.post('/api/auth/user-password', { userPassword: newPassword.trim() });
      toast('User password updated. All user sessions logged out.', 'success');
      setNewPassword('');
      onRefresh();
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to update password.', 'error');
    } finally { setSaving(false); }
  };

  const handleRotationChange = async (value) => {
    setRotation(value);
    setSaving(true);
    try {
      await api.post('/api/auth/password-rotation', { passwordRotation: value });
      toast('Rotation schedule updated.', 'success');
      onRefresh();
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to update rotation.', 'error');
      setRotation(config?.passwordRotation || 'manual');
    } finally { setSaving(false); }
  };

  const handleCopy = () => {
    // The password is hashed server-side and cannot be retrieved.
    // Copy is only meaningful right after setting a new password.
    if (newPassword.trim()) {
      navigator.clipboard.writeText(newPassword.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>User Access Password</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        This shared password is used by all users to log in. Change it here, or let the scheduler rotate it automatically.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="caption" color="text.secondary">Current Password</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
          <Typography variant="body1" fontFamily="monospace" fontSize={18} sx={{ flex: 1 }}>
            {config?.userPasswordSet ? '(password is set — not retrievable)' : '(not set)'}
          </Typography>

          <Tooltip title={copied ? 'Copied!' : 'Copy password'}>
            <IconButton size="small" onClick={handleCopy}>
              <ContentCopyIcon fontSize="small" color={copied ? 'success' : 'inherit'} />
            </IconButton>
          </Tooltip>
        </Box>
        {config?.lastPasswordChange && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            Last changed: {new Date(config.lastPasswordChange).toLocaleString()}
          </Typography>
        )}
        {config?.nextPasswordChange && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            Next rotation: {new Date(config.nextPasswordChange).toLocaleString()}
          </Typography>
        )}
      </Paper>

      <Typography variant="subtitle2" fontWeight={600} gutterBottom>Set New Password</Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
        <TextField
          size="small" label="New password"
          value={newPassword} onChange={e => setNewPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
          sx={{ flex: 1 }} inputProps={{ autoComplete: 'off' }}
        />
        <Button variant="contained" onClick={handleChangePassword} disabled={saving || !newPassword.trim()}>
          Update
        </Button>
      </Box>

      <Divider sx={{ my: 3 }} />

      <Typography variant="subtitle2" fontWeight={600} gutterBottom>Password Rotation Schedule</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Passwords rotate automatically on schedule. The server checks every 30 minutes and rotates when due,
        then emails the new password to your notification addresses.
      </Typography>
      <TextField
        select size="small" label="Rotation schedule"
        value={rotation} onChange={e => handleRotationChange(e.target.value)}
        sx={{ minWidth: 240 }} disabled={saving}
      >
        <MenuItem value="daily">Daily</MenuItem>
        <MenuItem value="weekly">Weekly</MenuItem>
        <MenuItem value="monthly">Monthly</MenuItem>
        <MenuItem value="manual">Manual (no auto-rotation)</MenuItem>
      </TextField>

      {rotation !== 'manual' && config?.nextPasswordChange && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Next auto-rotation: <strong>{new Date(config.nextPasswordChange).toLocaleString()}</strong>
        </Alert>
      )}
    </Box>
  );
};

// ── Notification Emails Panel ─────────────────────────────────────────────────
const NotificationPanel = ({ config, onRefresh, toast }) => {
  const [emails, setEmails]     = useState(config?.notificationEmails || []);
  const [newEmail, setNewEmail] = useState('');
  const [saving, setSaving]     = useState(false);
  const [testing, setTesting]   = useState(false);

  useEffect(() => {
    if (config?.notificationEmails) setEmails(config.notificationEmails);
  }, [config]);

  const saveEmails = async (updated) => {
    setSaving(true);
    try {
      await api.put('/api/auth/notification-emails', { notificationEmails: updated });
      toast('Notification emails updated.', 'success');
      onRefresh();
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to update.', 'error');
    } finally { setSaving(false); }
  };

  const handleAdd = () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed || emails.includes(trimmed)) return;
    const updated = [...emails, trimmed];
    setEmails(updated);
    setNewEmail('');
    saveEmails(updated);
  };

  const handleRemove = (email) => {
    const updated = emails.filter(e => e !== email);
    setEmails(updated);
    saveEmails(updated);
  };

  const handleSendTest = async () => {
    setTesting(true);
    try {
      const res = await api.post('/api/auth/test-notification');
      toast(res.data.message || 'Test email sent!', 'success');
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to send test email.', 'error');
    } finally { setTesting(false); }
  };

  return (
    <Box sx={{ maxWidth: 560 }}>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>Notification Emails</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        These addresses receive email alerts when the user password changes, user access is toggled,
        admin accounts are modified, or a scheduled rotation occurs (with the new password included).
      </Typography>

      {emails.length > 0 ? (
        <Paper variant="outlined" sx={{ mb: 3 }}>
          <Table size="small">
            <TableBody>
              {emails.map(email => (
                <TableRow key={email}>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{email}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" color="error" onClick={() => handleRemove(email)} disabled={saving}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ) : (
        <Alert severity="info" sx={{ mb: 3 }}>No notification emails set. No alerts will be sent.</Alert>
      )}

      <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
        <TextField
          size="small" label="Add email address" placeholder="notify@gmail.com"
          value={newEmail} onChange={e => setNewEmail(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          sx={{ flex: 1 }} inputProps={{ autoComplete: 'off' }}
        />
        <Button variant="contained" onClick={handleAdd} disabled={saving || !newEmail.trim()} startIcon={<AddIcon />}>
          Add
        </Button>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle2" fontWeight={600} gutterBottom>Test Notifications</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Send a test email to all configured addresses to verify your SMTP settings are working.
      </Typography>
      <Button
        variant="outlined"
        color="primary"
        onClick={handleSendTest}
        disabled={testing || emails.length === 0}
        startIcon={testing ? <CircularProgress size={16} /> : <SendIcon />}
      >
        {testing ? 'Sending…' : 'Send Test Email'}
      </Button>
      {emails.length === 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Add at least one email address above to enable test sending.
        </Typography>
      )}
    </Box>
  );
};



// ── RoverDuplicateDialog ───────────────────────────────────────────────────────
function RoverDuplicateDialog({ open, duplicates, onClose, onConfirm }) {
  const [globalAction, setGlobalAction] = React.useState('overwrite');
  const overridesRef = React.useRef({});
  const [, forceUpdate] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 50;

  React.useEffect(() => {
    if (open) {
      setGlobalAction('overwrite');
      overridesRef.current = {};
      setPage(1);
      forceUpdate(n => n + 1);
    }
  }, [open, duplicates]);

  const getDecision = (i) =>
    overridesRef.current[i] !== undefined ? overridesRef.current[i] : globalAction;

  const setRowDecision = (i, val) => {
    if (val === globalAction) delete overridesRef.current[i];
    else overridesRef.current[i] = val;
    forceUpdate(n => n + 1);
  };

  const setAll = (val) => {
    setGlobalAction(val);
    overridesRef.current = {};
    forceUpdate(n => n + 1);
  };

  const overwriteCount = globalAction === 'overwrite'
    ? duplicates.length - Object.values(overridesRef.current).filter(v => v === 'skip').length
    : Object.values(overridesRef.current).filter(v => v === 'overwrite').length;
  const skipCount = duplicates.length - overwriteCount;

  const totalPages = Math.ceil(duplicates.length / PAGE_SIZE);
  const pageSlice  = duplicates.map((d, i) => ({ ...d, _origIdx: i }))
                               .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleConfirm = () => {
    const resolved = duplicates.map((dup, i) => ({ ...dup, action: getDecision(i) }));
    onConfirm(resolved);
  };

  // Highlight cell if address differs (rover number never differs — it's the key)
  const addrDiffSx = (dup) => {
    const a = String(dup.incoming.address ?? '').trim().toLowerCase();
    const b = String(dup.existing.address ?? '').trim().toLowerCase();
    return a !== b ? { backgroundColor: '#fff3cd', fontWeight: 700 } : {};
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6" fontWeight={700}>
            {duplicates.length} Rover Book Conflict{duplicates.length !== 1 ? 's' : ''} Found
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          These rover numbers already exist with a different address. Choose to overwrite or skip each one.
        </Typography>
      </DialogTitle>

      <Divider />

      {/* Bulk actions */}
      <Box sx={{ px: 3, py: 1.5, display: 'flex', gap: 2, alignItems: 'center', backgroundColor: '#fafafa', flexWrap: 'wrap' }}>
        <Typography variant="body2" fontWeight={600}>Apply to all:</Typography>
        <Button size="small" variant={globalAction === 'overwrite' ? 'contained' : 'outlined'} color="error"   onClick={() => setAll('overwrite')}>Overwrite All</Button>
        <Button size="small" variant={globalAction === 'skip'      ? 'contained' : 'outlined'} color="inherit" onClick={() => setAll('skip')}>Skip All</Button>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
          <Chip label={`${overwriteCount} overwrite`} color="error"   size="small" variant="outlined" />
          <Chip label={`${skipCount} skip`}           color="default" size="small" variant="outlined" />
        </Box>
      </Box>

      {/* Legend */}
      <Box sx={{ px: 3, py: 0.75, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid #e0e0e0', backgroundColor: '#fffde7' }}>
        <Box sx={{ width: 14, height: 14, backgroundColor: '#fff3cd', border: '1px solid #ffe082', borderRadius: 0.5, flexShrink: 0 }} />
        <Typography variant="caption" color="text.secondary">Highlighted cells are the fields that differ</Typography>
      </Box>

      <DialogContent sx={{ p: 0 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 700, backgroundColor: '#f0f0f0', fontSize: 12 } }}>
              <TableCell sx={{ minWidth: 120 }}>Rover Book #</TableCell>
              <TableCell sx={{ minWidth: 240 }}>Address</TableCell>
              <TableCell sx={{ minWidth: 180 }}>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pageSlice.map((dup) => {
              const origIdx  = dup._origIdx;
              const decision = getDecision(origIdx);
              return (
                <React.Fragment key={origIdx}>
                  <TableRow sx={{ backgroundColor: '#fff8e1' }}>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary" display="block">Existing</Typography>
                      <Typography variant="body2" fontWeight={600}>{dup.existing.roverNumber}</Typography>
                    </TableCell>
                    <TableCell sx={addrDiffSx(dup)}>
                      <Typography variant="body2">{dup.existing.address || '—'}</Typography>
                    </TableCell>
                    <TableCell rowSpan={2} sx={{ verticalAlign: 'middle', borderLeft: '3px solid #e0e0e0' }}>
                      <RadioGroup value={decision} onChange={e => setRowDecision(origIdx, e.target.value)}>
                        <FormControlLabel value="overwrite" control={<Radio size="small" color="error" />}
                          label={<Typography variant="body2" color="error.main" fontWeight={600}>Overwrite</Typography>} />
                        <FormControlLabel value="skip"      control={<Radio size="small" />}
                          label={<Typography variant="body2">Skip</Typography>} />
                      </RadioGroup>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: '#e8f5e9', '& td': { borderBottom: '2px solid #bdbdbd' } }}>
                    <TableCell>
                      <Typography variant="caption" color="success.main" display="block">Incoming</Typography>
                      <Typography variant="body2" fontWeight={600}>{dup.incoming.roverNumber}</Typography>
                    </TableCell>
                    <TableCell sx={addrDiffSx(dup)}>
                      <Typography variant="body2">{dup.incoming.address || '—'}</Typography>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </DialogContent>

      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 1, borderTop: '1px solid #e0e0e0', gap: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, duplicates.length)} of {duplicates.length}
          </Typography>
          <Pagination count={totalPages} page={page} onChange={(_, v) => setPage(v)} size="small" color="primary" />
        </Box>
      )}

      <Divider />
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose} color="inherit" variant="outlined">Cancel Import</Button>
        <Button onClick={handleConfirm} variant="contained" color="primary">Proceed with Import</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── RoverBookPanel ─────────────────────────────────────────────────────────────
function RoverBookPanel() {
  const [entries,       setEntries]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [deleting,      setDeleting]      = useState(null);
  const [error,         setError]         = useState(null);
  const [filter,        setFilter]        = useState('');
  const [editingId,     setEditingId]     = useState(null);
  const [formOpen,      setFormOpen]      = useState(false);
  const [form,          setForm]          = useState({ roverNumber: '', address: '' });
  const [formErr,       setFormErr]       = useState('');
  const [saveNotice,    setSaveNotice]    = useState('');
  const [confirmDel,    setConfirmDel]    = useState(null);
  const [page,          setPage]          = useState(1);

  // Import pipeline state — mirrors the consumer import flow
  const [importing,          setImporting]          = useState(false);
  const [importPreview,      setImportPreview]      = useState(null);   // parsed data before commit
  const [importPreviewOpen,  setImportPreviewOpen]  = useState(false);
  const [importResult,       setImportResult]       = useState(null);
  const [importResultOpen,   setImportResultOpen]   = useState(false);
  const rawWorkbookRef        = useRef(null);
  const importInputRef        = useRef(null);
  const pendingCleanRef       = useRef([]);
  const pendingAutoSkippedRef = useRef([]);
  const [duplicateDialog,    setDuplicateDialog]    = useState({ open: false, duplicates: [] });
  const ROWS = 15;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get('/api/rover-book');
      setEntries(res.data);
    } catch { setError('Failed to load rover book entries.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return entries;
    const q = filter.toLowerCase();
    return entries.filter(e =>
      e.roverNumber.toLowerCase().includes(q) ||
      e.address.toLowerCase().includes(q)
    );
  }, [entries, filter]);

  const totalPages = Math.ceil(filtered.length / ROWS);
  const paged      = filtered.slice((page - 1) * ROWS, page * ROWS);

  const openAdd = () => {
    setEditingId(null);
    setForm({ roverNumber: '', address: '' });
    setFormErr('');
    setFormOpen(true);
  };

  const openEdit = (entry) => {
    setEditingId(entry._id);
    setForm({ roverNumber: entry.roverNumber, address: entry.address });
    setFormErr('');
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.roverNumber.trim()) { setFormErr('Rover number is required.'); return; }
    if (!form.address.trim())     { setFormErr('Address is required.'); return; }
    setSaving(true); setFormErr('');
    try {
      if (editingId) {
        const res = await api.put(`/api/rover-book/${editingId}`, form);
        const updated = res.data?.consumersUpdated || 0;
        if (updated > 0) {
          // Brief toast-style alert — reuse the error state with a success message
          setSaveNotice(`✅ Saved — ${updated} consumer address${updated === 1 ? '' : 'es'} updated automatically.`);
          setTimeout(() => setSaveNotice(''), 5000);
          setFormOpen(false);
        } else {
          setFormOpen(false);
        }
      } else {
        await api.post('/api/rover-book', form);
        setFormOpen(false);
      }
      load();
    } catch (err) {
      setFormErr(err.response?.data?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    setDeleting(confirmDel._id);
    try {
      await api.delete(`/api/rover-book/${confirmDel._id}`);
      setConfirmDel(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Delete failed.');
      setConfirmDel(null);
    } finally {
      setDeleting(null);
    }
  };

  // ── Parse a workbook into preview data ──────────────────────────────────────
  // Tries every sheet and picks the one with the best rover/address column score.
  const parseWorkbook = (wb) => {
    let bestSheet = wb.SheetNames[0];
    let bestRows  = null;
    let bestScore = 0;

    for (const sheetName of wb.SheetNames) {
      const ws      = wb.Sheets[sheetName];
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1, raw: false });
      if (!rawRows || rawRows.length < 2) continue;

      // Score first 20 rows — find the one most likely to be the header
      let headerIdx = 0, headerScore = 0;
      for (let i = 0; i < Math.min(rawRows.length, 20); i++) {
        const score = rawRows[i].reduce((acc, cell) => {
          const c = String(cell).toLowerCase().replace(/[^a-z0-9]/g, '');
          return acc + (c.includes('rover') || c.includes('address') || c.includes('addr') || c === 'route' || c.includes('route') ? 1 : 0);
        }, 0);
        if (score > headerScore) { headerScore = score; headerIdx = i; }
      }

      if (headerScore > bestScore) {
        bestScore = headerScore;
        bestSheet = sheetName;

        const headerValues = rawRows[headerIdx];
        const rows = XLSX.utils.sheet_to_json(ws, {
          defval: '', range: headerIdx + 1, header: headerValues, raw: false,
        });

        // Map columns → { roverNumber, address }
        bestRows = rows.map(row => {
          const rec = {};
          Object.entries(row).forEach(([k, v]) => {
            const key = String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
            const val = String(v).trim();
            if (key.includes('rover') || key === 'roverno' || key === 'roverbook' || key === 'rovernumber') {
              rec.roverNumber = val;
            }
            if (key.includes('address') || key === 'addr' || key === 'location' || key === 'route' || key.includes('route')) {
              rec.address = val;
            }
          });
          return rec;
        });
      }
    }

    if (!bestRows) return null;

    const validRows   = bestRows.filter(r => r.roverNumber && r.roverNumber.trim() && r.address && r.address.trim());
    const skippedRows = bestRows.filter(r => !r.roverNumber || !r.roverNumber.trim() || !r.address || !r.address.trim());

    return { validRows, skippedRows, previewRows: validRows.slice(0, 20), sheet: bestSheet };
  };

  // ── Step 1: read file → show preview ────────────────────────────────────────
  const handleImportClick = () => {
    if (importInputRef.current) importInputRef.current.value = '';
    importInputRef.current.click();
  };

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImporting(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array', raw: false });
        rawWorkbookRef.current = wb;

        const parsed = parseWorkbook(wb);
        if (!parsed || parsed.validRows.length === 0) {
          setError('No valid rows found. Make sure the file has "Rover" and "Address" columns with data.');
          setImporting(false);
          return;
        }

        setImportPreview(parsed);
        setImportPreviewOpen(true);
      } catch (err) {
        setError(`Failed to read file: ${err.message}`);
      } finally {
        setImporting(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // ── Step 2: user confirms preview → duplicate check → upsert ────────────────
  const handlePreviewConfirm = async () => {
    setImportPreviewOpen(false);
    setImporting(true);

    try {
      const { validRows } = importPreview;

      // Fetch all existing rover numbers in one call so we can do the same
      // identical-row check the consumer import does.
      let existingEntries = [];
      try {
        const roverNumbers = validRows.map(r => String(r.roverNumber).trim().toUpperCase());
        const res = await api.post('/api/rover-book/bulk-lookup', { roverNumbers });
        existingEntries = res.data.entries || [];
      } catch (err) {
        setError('Duplicate check failed: ' + (err.response?.data?.message || err.message));
        setImporting(false);
        return;
      }

      const dbMap = new Map(existingEntries.map(e => [e.roverNumber.toUpperCase(), e]));

      const dupeRows = [], cleanRows = [], autoSkippedRows = [];
      validRows.forEach(incoming => {
        const key      = String(incoming.roverNumber).trim().toUpperCase();
        const existing = dbMap.get(key);
        if (!existing) {
          cleanRows.push(incoming);
        } else {
          // Identical check — same logic as consumer import
          const inAddr = String(incoming.address ?? '').trim().toLowerCase();
          const exAddr = String(existing.address  ?? '').trim().toLowerCase();
          if (inAddr === exAddr) {
            autoSkippedRows.push({ incoming, existing });
          } else {
            dupeRows.push({ incoming, existing });
          }
        }
      });

      pendingAutoSkippedRef.current = autoSkippedRows;

      if (dupeRows.length > 0) {
        pendingCleanRef.current = cleanRows;
        setDuplicateDialog({ open: true, duplicates: dupeRows });
      } else {
        await submitRoverImport(cleanRows, [], autoSkippedRows.length);
        pendingAutoSkippedRef.current = [];
      }
    } catch (err) {
      setError(err.response?.data?.message || `Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleDuplicateConfirm = async (resolved) => {
    setDuplicateDialog({ open: false, duplicates: [] });
    await submitRoverImport(pendingCleanRef.current, resolved, pendingAutoSkippedRef.current.length);
    pendingCleanRef.current = [];
    pendingAutoSkippedRef.current = [];
  };

  const submitRoverImport = async (cleanRecords, resolvedDuplicates, autoSkippedCount = 0) => {
    try {
      setImporting(true);
      const toOverwrite = resolvedDuplicates.filter(d => d.action === 'overwrite');
      const toSkip      = resolvedDuplicates.filter(d => d.action !== 'overwrite');

      const allToUpsert = [...cleanRecords, ...toOverwrite.map(d => d.incoming)];

      const CHUNK = 500;
      let inserted = 0, modified = 0, invalid = 0, consumersUpdated = 0;

      if (allToUpsert.length > 0) {
        for (let i = 0; i < allToUpsert.length; i += CHUNK) {
          const res = await api.post('/api/rover-book/batch-upsert', allToUpsert.slice(i, i + CHUNK));
          inserted         += res.data.inserted         || 0;
          modified         += res.data.modified         || 0;
          invalid          += res.data.invalid          || 0;
          consumersUpdated += res.data.consumersUpdated || 0;
        }
      }

      setImportResult({
        imported:      inserted,
        updated:       modified,
        skipped:       toSkip.length,
        autoSkipped:   autoSkippedCount,
        failed:        invalid + (importPreview?.skippedRows?.length || 0),
        consumersUpdated,
      });
      setImportResultOpen(true);
      load();
    } catch (err) {
      setError(err.response?.data?.message || `Import failed: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Box>
      {/* hidden file input */}
      <input
        type="file"
        accept=".xlsx,.xls"
        ref={importInputRef}
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h6" fontWeight={700}>Rover Book — Address Mapping</Typography>
          <Typography variant="body2" color="text.secondary">
            Map rover book numbers to addresses. When adding or importing consumers, the address is auto-filled based on the rover number.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={importing ? <CircularProgress size={16} /> : <UploadFileIcon />}
            onClick={handleImportClick}
            disabled={importing}
          >
            {importing ? 'Reading…' : 'Import Excel'}
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>Add Entry</Button>
        </Box>
      </Box>

      {error      && <Alert severity="error"   sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {saveNotice && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSaveNotice('')}>{saveNotice}</Alert>}

      <TextField
        size="small" placeholder="Search rover number or address…"
        value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}
        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        sx={{ mb: 2, maxWidth: 340 }}
        fullWidth
      />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : filtered.length === 0 ? (
        <Alert severity="info">
          {filter ? 'No entries match your search.' : 'No rover book entries yet. Click "Add Entry" to get started.'}
        </Alert>
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell><strong>Rover Book #</strong></TableCell>
                <TableCell><strong>Address</strong></TableCell>
                <TableCell align="right" sx={{ width: 100 }}><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paged.map(entry => (
                <TableRow key={entry._id} hover>
                  <TableCell sx={{ fontWeight: 600, fontFamily: 'monospace' }}>{entry.roverNumber}</TableCell>
                  <TableCell>{entry.address}</TableCell>
                  <TableCell align="right">
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => openEdit(entry)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" onClick={() => setConfirmDel(entry)} disabled={deleting === entry._id}>
                        {deleting === entry._id ? <CircularProgress size={16} /> : <DeleteIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Pagination count={totalPages} page={page} onChange={(_, v) => setPage(v)} color="primary" size="small" />
        </Box>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        {filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'}{filter ? ' found' : ' total'}
      </Typography>

      {/* ── Import Preview Dialog ── */}
      <Dialog open={importPreviewOpen} onClose={() => { setImportPreviewOpen(false); rawWorkbookRef.current = null; }} maxWidth="md" fullWidth scroll="paper">
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="h6" fontWeight={700}>Import Preview — Rover Book</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Nothing is saved until you click "Proceed with Import". Existing rover numbers will be overwritten with the new address.
          </Typography>
        </DialogTitle>
        <Divider />
        <DialogContent>
          {importPreview && (
            <>
              {/* Summary stats */}
              <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                {[
                  { label: 'Ready to import',   value: importPreview.validRows.length,   color: '#2e7d32' },
                  { label: 'Will be skipped',   value: importPreview.skippedRows.length, color: '#ed6c02' },
                ].map(({ label, value, color }) => (
                  <Box key={label} sx={{ flex: '1 1 140px', backgroundColor: color, color: '#fff', borderRadius: 2, px: 3, py: 1.5, textAlign: 'center', minWidth: 120 }}>
                    <Typography variant="h5" fontWeight="bold">{value}</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.9 }}>{label}</Typography>
                  </Box>
                ))}
              </Box>

              {importPreview.skippedRows.length > 0 && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  {importPreview.skippedRows.length} row{importPreview.skippedRows.length !== 1 ? 's' : ''} will be skipped because they are missing a rover number or address.
                </Alert>
              )}

              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Data preview (first {importPreview.previewRows.length} rows):
              </Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f3f4f6', fontSize: 11 } }}>
                      <TableCell>Rover Book #</TableCell>
                      <TableCell>Address</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {importPreview.previewRows.map((row, i) => (
                      <TableRow key={i} sx={{ bgcolor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>{row.roverNumber}</TableCell>
                        <TableCell sx={{ fontSize: 12 }}>{row.address}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
              {importPreview.validRows.length > importPreview.previewRows.length && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Showing first {importPreview.previewRows.length} of {importPreview.validRows.length} valid rows.
                </Typography>
              )}
            </>
          )}
        </DialogContent>
        <Divider />
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button onClick={() => { setImportPreviewOpen(false); rawWorkbookRef.current = null; }} color="inherit" variant="outlined">Cancel</Button>
          <Button
            onClick={handlePreviewConfirm}
            variant="contained" color="primary"
            disabled={!importPreview || importPreview.validRows.length === 0}
          >
            Proceed with Import ({importPreview?.validRows.length ?? 0} entries)
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Importing loading overlay ── */}
      <Dialog open={importing} maxWidth="xs" fullWidth PaperProps={{ sx: { textAlign: 'center', py: 3, px: 4 } }}>
        <DialogContent>
          <CircularProgress size={52} sx={{ mb: 2 }} />
          <Typography variant="h6" fontWeight={700} gutterBottom>Importing Rover Book</Typography>
          <Typography variant="body2" color="text.secondary">
            Saving entries to the database. Please wait — do not close this page.
          </Typography>
        </DialogContent>
      </Dialog>

      {/* ── Duplicate resolver dialog ── */}
      <RoverDuplicateDialog
        open={duplicateDialog.open}
        duplicates={duplicateDialog.duplicates}
        onClose={() => { setDuplicateDialog({ open: false, duplicates: [] }); pendingCleanRef.current = []; pendingAutoSkippedRef.current = []; }}
        onConfirm={handleDuplicateConfirm}
      />

      {/* Add / Edit dialog */}
      <Dialog open={formOpen} onClose={() => !saving && setFormOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editingId ? 'Edit Entry' : 'Add Rover Book Entry'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Rover Book Number"
              value={form.roverNumber}
              onChange={e => setForm(p => ({ ...p, roverNumber: e.target.value }))}
              fullWidth autoFocus
              disabled={saving}
              helperText="The rover book number (e.g. 01, 02A, 15)"
            />
            <TextField
              label="Address"
              value={form.address}
              onChange={e => setForm(p => ({ ...p, address: e.target.value }))}
              fullWidth multiline rows={2}
              disabled={saving}
              helperText="The full address this rover number corresponds to"
            />
            {formErr && <Alert severity="error">{formErr}</Alert>}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormOpen(false)} disabled={saving} variant="outlined" color="secondary">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} variant="contained">
            {saving ? <CircularProgress size={18} sx={{ mr: 1 }} /> : null}
            {editingId ? 'Save Changes' : 'Add Entry'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!confirmDel} onClose={() => setConfirmDel(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Entry</DialogTitle>
        <DialogContent>
          <Typography>
            Delete rover number <strong>{confirmDel?.roverNumber}</strong> → <em>{confirmDel?.address}</em>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This won't affect existing consumer records — only future auto-fills.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDel(null)} variant="outlined" color="secondary">Cancel</Button>
          <Button onClick={handleDelete} variant="contained" color="error">Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Import result dialog */}
      <Dialog open={importResultOpen} onClose={() => setImportResultOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircleIcon color="success" /> Import Complete
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 0.5 }}>
            {importResult?.imported > 0 && (
              <Typography>✅ <strong>{importResult.imported}</strong> new {importResult.imported === 1 ? 'entry' : 'entries'} added</Typography>
            )}
            {importResult?.updated > 0 && (
              <Typography>♻️ <strong>{importResult.updated}</strong> existing {importResult.updated === 1 ? 'entry' : 'entries'} overwritten</Typography>
            )}
            {importResult?.skipped > 0 && (
              <Typography>⏭️ <strong>{importResult.skipped}</strong> conflicts skipped (manually)</Typography>
            )}
            {importResult?.autoSkipped > 0 && (
              <Typography>🟰 <strong>{importResult.autoSkipped}</strong> identical {importResult.autoSkipped === 1 ? 'entry' : 'entries'} auto-skipped (no changes)</Typography>
            )}
            {importResult?.failed > 0 && (
              <Typography>⚠️ <strong>{importResult.failed}</strong> {importResult.failed === 1 ? 'row' : 'rows'} skipped (missing rover # or address)</Typography>
            )}
            {importResult?.consumersUpdated > 0 && (
              <Typography>🔄 <strong>{importResult.consumersUpdated}</strong> consumer address{importResult.consumersUpdated === 1 ? '' : 'es'} updated to match</Typography>
            )}
            {importResult?.imported === 0 && importResult?.updated === 0 && importResult?.skipped === 0 && (
              <Typography color="text.secondary">No entries were imported.</Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportResultOpen(false)} variant="contained">Done</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ── AdminSettings ─────────────────────────────────────────────────────────────
const AdminSettings = ({ onBack }) => {
  const [tab,     setTab]     = useState(0);
  const [config,  setConfig]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const { toasts, add: toast } = useToast();

  const fetchConfig = useCallback(async () => {
    try {
      const res = await api.get('/api/auth/app-config');
      setConfig(res.data);
    } catch {
      setError('Failed to load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <ToastContainer toasts={toasts} />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <IconButton onClick={onBack}><ArrowBackIcon /></IconButton>
        <Typography variant="h5" fontWeight={700}>Admin Settings</Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }} variant="scrollable" scrollButtons="auto">
        <Tab icon={<MenuBookIcon />}          iconPosition="start" label="Rover Book"     />
        <Tab icon={<AdminPanelSettingsIcon />} iconPosition="start" label="Admin Accounts" />
        <Tab icon={<LockIcon />}              iconPosition="start" label="User Password"  />
        <Tab icon={<EmailIcon />}             iconPosition="start" label="Notifications"  />
        <Tab icon={<HistoryIcon />}           iconPosition="start" label="Audit Log"      />
      </Tabs>

      {tab === 0 && <RoverBookPanel />}
      {tab === 1 && <GmailPanel        config={config} onRefresh={fetchConfig} toast={toast} />}
      {tab === 2 && <PasswordPanel     config={config} onRefresh={fetchConfig} toast={toast} />}
      {tab === 3 && <NotificationPanel config={config} onRefresh={fetchConfig} toast={toast} />}
      {tab === 4 && <AuditLogPanel />}
      <ScrollToTop />
    </Container>
  );
};

export default AdminSettings;