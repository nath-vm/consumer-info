import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Container, Box, Typography, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, Pagination,
  Skeleton, Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material';
import ConsumerSearchBar from '../components/ConsumerSearchBar';
import AdminConsumerTable from '../components/AdminConsumerTable';
import api from '../api';
import { logout } from '../ProtectedRoutes';
import ScrollToTop from '../components/ScrollToTop';

const API_BASE      = '/api/consumers';
const ROWS_PER_PAGE = 25;
const DEBOUNCE_MS   = 350;

const UserHome = () => {
  const [consumers, setConsumers]               = useState([]);
  const [total, setTotal]                       = useState(0);
  const [page, setPage]                         = useState(1);
  const [loading, setLoading]                   = useState(false);
  const [error, setError]                       = useState(null);
  const [searchQuery, setSearchQuery]           = useState('');
  const [searchFilter, setSearchFilter]         = useState('all');
  const [selectedConsumer, setSelectedConsumer] = useState(null);
  const [logoutOpen, setLogoutOpen]             = useState(false);

  const debounceRef = useRef(null);
  const abortRef    = useRef(null);

  const fetchPage = useCallback(async (query, filter, pageNum) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ page: pageNum, limit: ROWS_PER_PAGE });
      if (query) {
        params.append('query', query);
        if (filter && filter !== 'all') params.append('field', filter);
      }

      const res = await api.get(`${API_BASE}/search?${params.toString()}`, {
        signal: abortRef.current.signal,
      });

      setConsumers(res.data.consumers);
      setTotal(res.data.total);
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      setError('Error fetching records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPage('', 'all', 1); }, []); // eslint-disable-line

  const handleSearch = ({ query, filter }) => {
    setSearchQuery(query);
    setSearchFilter(filter);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPage(query, filter, 1), DEBOUNCE_MS);
  };

  const handlePageChange = (_, newPage) => {
    setPage(newPage);
    fetchPage(searchQuery, searchFilter, newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogout = async () => { await logout(); };
  const totalPages = Math.ceil(total / ROWS_PER_PAGE);

  return (
    <Container>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h4" gutterBottom>Consumer Information System</Typography>
        <Button variant="contained" color="error" onClick={() => setLogoutOpen(true)}>Logout</Button>
      </Box>

      <ConsumerSearchBar onSearch={handleSearch} />

      {error && <Typography color="error" sx={{ mt: 1, mb: 1 }}>{error}</Typography>}

      <Box sx={{ mt: 2 }}>
        {loading ? (
          <Table size="small">
            <TableHead>
              <TableRow>
                {['PELCO METER #', 'ACCOUNT #', 'ACCOUNT NAME', 'ADDRESS', 'STATUS'].map(h => (
                  <TableCell key={h}><strong>{h}</strong></TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {Array.from({ length: ROWS_PER_PAGE }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j}><Skeleton variant="text" /></TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <AdminConsumerTable
            consumers={consumers}
            page={1}
            rowsPerPage={ROWS_PER_PAGE}
            onRowClick={setSelectedConsumer}
            showHidden={false}
            selectedIds={new Set()}
            onSelectOne={() => {}}
            onSelectAll={() => {}}
            onBulkHide={() => {}}
            onBulkUnhide={() => {}}
            onBulkDelete={() => {}}
            readOnly={true}
          />
        )}

        {!loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {total > 0
                ? `Showing ${((page - 1) * ROWS_PER_PAGE) + 1}–${Math.min(page * ROWS_PER_PAGE, total)} of ${total.toLocaleString()} records`
                : searchQuery ? 'No records found.' : 'No records available.'}
            </Typography>
            {totalPages > 1 && (
              <Pagination
                count={totalPages}
                page={page}
                onChange={handlePageChange}
                color="primary"
                showFirstButton
                showLastButton
              />
            )}
          </Box>
        )}
      </Box>

      <Dialog open={logoutOpen} onClose={() => setLogoutOpen(false)}>
        <DialogTitle>Confirm Logout</DialogTitle>
        <DialogContent>Are you sure you want to log out?</DialogContent>
        <DialogActions>
          <Button onClick={() => setLogoutOpen(false)} color="secondary" variant="outlined">Cancel</Button>
          <Button onClick={handleLogout} color="error" variant="contained">Logout</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!selectedConsumer} onClose={() => setSelectedConsumer(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Consumer Details</DialogTitle>
        <DialogContent>
          {selectedConsumer && (
            <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 400, mx: 'auto' }}>
              <Typography align="center"><b>PELCO METER #:</b> {selectedConsumer.pelcoMeterNumber}</Typography>
              <Typography align="center"><b>ACCOUNT #:</b> {selectedConsumer.accountNumber}</Typography>
              <Typography align="center"><b>POLE #:</b> {selectedConsumer.poleNumber}</Typography>
              <Typography align="center"><b>ACCOUNT NAME:</b> {selectedConsumer.accountName}</Typography>
              <Typography align="center"><b>ADDRESS:</b> {selectedConsumer.address}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedConsumer(null)} color="primary" variant="contained">Close</Button>
        </DialogActions>
      </Dialog>

      <ScrollToTop />
    </Container>
  );
};

export default UserHome;
