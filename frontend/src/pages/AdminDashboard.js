import React, { useEffect, useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Container, Box, Typography, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, Pagination, Divider,
  Table, TableBody, TableCell, TableHead, TableRow,
  LinearProgress, Stack, Select, MenuItem,
  Tooltip, Alert, CircularProgress,
} from '@mui/material';
import Snackbar        from '@mui/material/Snackbar';
import MuiAlert        from '@mui/material/Alert';
import Chip            from '@mui/material/Chip';
import Radio           from '@mui/material/Radio';
import RadioGroup      from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import SettingsIcon        from '@mui/icons-material/Settings';
import GetAppIcon          from '@mui/icons-material/GetApp';
import PublishIcon         from '@mui/icons-material/Publish';
import WarningIcon         from '@mui/icons-material/Warning';
import CheckCircleIcon     from '@mui/icons-material/CheckCircle';
import PersonAddIcon       from '@mui/icons-material/PersonAdd';
import VisibilityIcon      from '@mui/icons-material/Visibility';
import VisibilityOffIcon   from '@mui/icons-material/VisibilityOff';
import LogoutIcon          from '@mui/icons-material/Logout';
import InfoOutlinedIcon    from '@mui/icons-material/InfoOutlined';

import AdminConsumerTable         from '../components/AdminConsumerTable';
import AdminConsumerDetailsDialog from '../components/AdminConsumerDetailsDialog';
import AddConsumerDialog          from '../components/AddConsumerDialog';
import ConsumerEditDialog         from '../components/EditConsumerDialog';
import ConsumerSearchBar          from '../components/ConsumerSearchBar';
import { logout }                 from '../ProtectedRoutes';
import api                        from '../api';
import ScrollToTop               from '../components/ScrollToTop';

const API_BASE = '/api/consumers';

// ---------------------------------------------------------------------------
// Column pattern matching
// ---------------------------------------------------------------------------
const COLUMN_PATTERNS = [
  // S/N — serial / sequence number
  { fields: ['sn','s/n','serialno','serialnumber','serial','seq','seqno','sequenceno','sequencenumber'], schema: 'sn' },
  // Pelco Meter — seen as "PELCO METER #", "AFC METER #" is a separate meter type we map to same field
  { fields: ['pelcometer','pelcometernumber','pelcono','meternumber','meterno','meter','pelcometer#','pelcometerno','pelcometernum','pelcometr','pelcometernumber','pelcometerno'], schema: 'pelcoMeterNumber' },
  // Account Number — seen as "ACCT. #", "ACCOUNT NUMBER", "ACCT #"
  { fields: ['account','accountnumber','accountno','acct','acctno','acctnumber','acctnum','acct#','account#','accountnum','acct#','acct'], schema: 'accountNumber' },
  // Pole Number
  { fields: ['pole','poleno','polenumber','polenum','pole#'], schema: 'poleNumber' },
  // Pelco Square — seen as "PELCO SQ.", "NEW SQ."
  { fields: ['pelcosq','pelcosquare','sq','square','pelcosq','newsq','newsquare','pelcosqdot'], schema: 'pelcoSq' },
  // Rover Book — seen as "ROVER BOOK" exactly
  { fields: ['roverbook','rover','roverno','roverbook#','roverbooks','roverbook#'], schema: 'roverBook' },
  // Account Name — seen as "ACCOUNT NAME"
  { fields: ['accountname','consumername','customer','fullname','name','clientname','client','subscribername','ownername','accountname'], schema: 'accountName' },
  // Status — seen as "S" (single letter column)
  { fields: ['s','status','stat','connectionstatus','connectionstat'], schema: 'status' },
  // Address — seen as "ADDRESS"
  { fields: ['address','addr','location','loc','area','streetaddress','fulladdress'], schema: 'address' },
];

// The canonical export column order and labels
const EXPORT_COLUMNS = [
  { header: 'S/N',           key: 'sn' },
  { header: 'PELCO METER #', key: 'pelcoMeterNumber' },
  { header: 'ACCOUNT #',     key: 'accountNumber' },
  { header: 'POLE #',        key: 'poleNumber' },
  { header: 'PELCO SQ.',     key: 'pelcoSq' },
  { header: 'ROVER BOOK',    key: 'roverBook' },
  { header: 'ACCOUNT NAME',  key: 'accountName' },
  { header: 'STATUS',        key: 'status' },
  { header: 'ADDRESS',       key: 'address' },
];

// Must match backend normalizeAccountNumber exactly so upsert filter always hits
function normalizeAccountNumber(raw) {
  return String(raw).trim().replace(/\s+/g, '').toUpperCase();
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// DuplicateResolverDialog — handles large duplicate sets efficiently.
// - Stores a single global action (overwrite/skip) as the default
// - Only tracks per-row overrides when they differ from the global default
// - Renders only a paginated slice of rows (PAGE_SIZE at a time) so 11k
//   duplicates never all mount at once
// ---------------------------------------------------------------------------
const DUPE_PAGE_SIZE = 50;

function DuplicateResolverDialog({ open, duplicates, onClose, onConfirm }) {
  // globalAction is the default for all rows
  const [globalAction, setGlobalAction] = useState('overwrite');
  // overrides only stores rows that DIFFER from globalAction
  const overridesRef = useRef({});
  const [dupePage, setDupePage]         = useState(1);
  // forceUpdate trick so radio changes repaint without full state
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (open) {
      setGlobalAction('overwrite');
      overridesRef.current = {};
      setDupePage(1);
      forceUpdate(n => n + 1);
    }
  }, [open, duplicates]);

  const getDecision = (i) =>
    overridesRef.current[i] !== undefined ? overridesRef.current[i] : globalAction;

  const setRowDecision = (i, val) => {
    if (val === globalAction) {
      delete overridesRef.current[i]; // back to default — no need to store
    } else {
      overridesRef.current[i] = val;
    }
    forceUpdate(n => n + 1);
  };

  const setAll = (val) => {
    setGlobalAction(val);
    overridesRef.current = {}; // clear all overrides — everyone follows global
    forceUpdate(n => n + 1);
  };

  const handleConfirm = () => {
    const resolved = duplicates.map((dup, i) => ({ ...dup, action: getDecision(i) }));
    onConfirm(resolved);
  };

  // Count how many are set to overwrite (cheap: count overrides that differ from global)
  const overwriteCount = globalAction === 'overwrite'
    ? duplicates.length - Object.values(overridesRef.current).filter(v => v === 'skip').length
    : Object.values(overridesRef.current).filter(v => v === 'overwrite').length;
  const skipCount = duplicates.length - overwriteCount;

  const [dupeSearch, setDupeSearch] = useState('');

  // filteredDupes carries the original index from `duplicates` so overridesRef
  // keys always refer to the full (unfiltered) list — search never corrupts decisions.
  const filteredDupesWithIdx = (dupeSearch.trim()
    ? duplicates
        .map((d, i) => ({ ...d, _origIdx: i }))
        .filter(d => {
          const q = dupeSearch.toLowerCase();
          return (d.existing.accountNumber || '').toLowerCase().includes(q)
              || (d.existing.accountName   || '').toLowerCase().includes(q)
              || (d.incoming.accountNumber || '').toLowerCase().includes(q)
              || (d.incoming.accountName   || '').toLowerCase().includes(q);
        })
    : duplicates.map((d, i) => ({ ...d, _origIdx: i }))
  );

  const filteredDupes = filteredDupesWithIdx; // alias kept for length/count references
  const totalDupePages = Math.ceil(filteredDupes.length / DUPE_PAGE_SIZE);
  const pageSlice = filteredDupes.slice((dupePage - 1) * DUPE_PAGE_SIZE, dupePage * DUPE_PAGE_SIZE);

  // Reset to page 1 when search changes
  const handleDupeSearch = (val) => { setDupeSearch(val); setDupePage(1); };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth scroll="paper">
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningIcon color="warning" />
          <Typography variant="h6" fontWeight={700}>
            {duplicates.length} Duplicate{duplicates.length !== 1 ? 's' : ''} Found
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Use "Overwrite All" or "Skip All" to apply to everything, or search and adjust individual rows.
        </Typography>
      </DialogTitle>

      <Divider />

      {/* Bulk actions + counts */}
      <Box sx={{ px: 3, py: 1.5, display: 'flex', gap: 2, alignItems: 'center', backgroundColor: '#fafafa', flexWrap: 'wrap' }}>
        <Typography variant="body2" fontWeight={600}>Apply to all:</Typography>
        <Button size="small" variant={globalAction === 'overwrite' ? 'contained' : 'outlined'} color="error"   onClick={() => setAll('overwrite')}>Overwrite All</Button>
        <Button size="small" variant={globalAction === 'skip'      ? 'contained' : 'outlined'} color="inherit" onClick={() => setAll('skip')}>Skip All</Button>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1, alignItems: 'center' }}>
          <Chip label={`${overwriteCount} overwrite`} color="error"   size="small" variant="outlined" />
          <Chip label={`${skipCount} skip`}           color="default" size="small" variant="outlined" />
        </Box>
      </Box>

      {/* Legend */}
      <Box sx={{ px: 3, py: 0.75, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid #e0e0e0', backgroundColor: '#fffde7' }}>
        <Box sx={{ width: 14, height: 14, backgroundColor: '#fff3cd', border: '1px solid #ffe082', borderRadius: 0.5, flexShrink: 0 }} />
        <Typography variant="caption" color="text.secondary">Highlighted cells are the fields that differ between existing and incoming</Typography>
      </Box>

      {/* Search bar */}
      <Box sx={{ px: 3, py: 1, borderBottom: '1px solid #e0e0e0' }}>
        <input
          type="text"
          placeholder="Search by account # or name…"
          value={dupeSearch}
          onChange={e => handleDupeSearch(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '6px 12px', fontSize: 13,
            border: '1px solid #ccc', borderRadius: 4,
            outline: 'none',
          }}
        />
        {dupeSearch && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
            {filteredDupes.length} of {duplicates.length} shown
          </Typography>
        )}
      </Box>

      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 700, backgroundColor: '#f0f0f0', fontSize: 12, whiteSpace: 'nowrap' } }}>
              <TableCell sx={{ minWidth: 120 }}>Account #</TableCell>
              <TableCell sx={{ minWidth: 160 }}>Account Name</TableCell>
              <TableCell sx={{ minWidth: 120 }}>Pelco Meter #</TableCell>
              <TableCell sx={{ minWidth: 80  }}>Pole #</TableCell>
              <TableCell sx={{ minWidth: 90  }}>Pelco SQ.</TableCell>
              <TableCell sx={{ minWidth: 100 }}>Rover Book</TableCell>
              <TableCell sx={{ minWidth: 70  }}>Status</TableCell>
              <TableCell sx={{ minWidth: 60  }}>S/N</TableCell>
              <TableCell sx={{ minWidth: 180 }}>Address</TableCell>
              <TableCell sx={{ minWidth: 200 }}>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pageSlice.map((dup, localIdx) => {
              const origIdx  = dup._origIdx;
              const decision = getDecision(origIdx);

              // Pre-compute which fields differ so we can highlight them
              const DIFF_FIELDS = ['accountNumber', 'accountName', 'pelcoMeterNumber', 'poleNumber', 'pelcoSq', 'roverBook', 'status', 'sn', 'address'];
              const differs = {};
              DIFF_FIELDS.forEach(f => {
                const a = String(dup.incoming[f] ?? '').trim().toLowerCase();
                const b = String(dup.existing[f] ?? '').trim().toLowerCase();
                differs[f] = a !== b;
              });

              // Returns sx highlight props for a cell that has changed
              const diffSx = (field) => differs[field]
                ? { backgroundColor: '#fff3cd', fontWeight: 700 }
                : {};

              return (
                <React.Fragment key={origIdx}>
                  {/* Existing row */}
                  <TableRow sx={{ backgroundColor: '#fff8e1' }}>
                    <TableCell sx={diffSx('accountNumber')}>
                      <Typography variant="caption" color="text.secondary" display="block">Existing</Typography>
                      <Typography variant="body2" fontWeight={600}>{dup.existing.accountNumber || '—'}</Typography>
                    </TableCell>
                    <TableCell sx={diffSx('accountName')}><Typography variant="body2">{dup.existing.accountName     || '—'}</Typography></TableCell>
                    <TableCell sx={diffSx('pelcoMeterNumber')}><Typography variant="body2">{dup.existing.pelcoMeterNumber || '—'}</Typography></TableCell>
                    <TableCell sx={diffSx('poleNumber')}><Typography variant="body2">{dup.existing.poleNumber      || '—'}</Typography></TableCell>
                    <TableCell sx={diffSx('pelcoSq')}><Typography variant="body2">{dup.existing.pelcoSq          || '—'}</Typography></TableCell>
                    <TableCell sx={diffSx('roverBook')}><Typography variant="body2">{dup.existing.roverBook       || '—'}</Typography></TableCell>
                    <TableCell sx={diffSx('status')}><Typography variant="body2">{dup.existing.status           || '—'}</Typography></TableCell>
                    <TableCell sx={diffSx('sn')}><Typography variant="body2">{dup.existing.sn               || '—'}</Typography></TableCell>
                    <TableCell sx={diffSx('address')}><Typography variant="body2">{dup.existing.address          || '—'}</Typography></TableCell>
                    <TableCell rowSpan={2} sx={{ verticalAlign: 'middle', borderLeft: '3px solid #e0e0e0' }}>
                      <RadioGroup value={decision} onChange={e => setRowDecision(origIdx, e.target.value)}>
                        <FormControlLabel value="overwrite" control={<Radio size="small" color="error" />}
                          label={<Typography variant="body2" color="error.main" fontWeight={600}>Overwrite</Typography>} />
                        <FormControlLabel value="skip"      control={<Radio size="small" />}
                          label={<Typography variant="body2">Skip</Typography>} />
                      </RadioGroup>
                    </TableCell>
                  </TableRow>
                  {/* Incoming row */}
                  <TableRow sx={{ backgroundColor: '#e8f5e9', '& td': { borderBottom: '2px solid #bdbdbd' } }}>
                    <TableCell sx={diffSx('accountNumber')}>
                      <Typography variant="caption" color="success.main" display="block">Incoming</Typography>
                      <Typography variant="body2" fontWeight={600}>{dup.incoming.accountNumber || '—'}</Typography>
                    </TableCell>
                    <TableCell sx={diffSx('accountName')}><Typography variant="body2">{dup.incoming.accountName     || '—'}</Typography></TableCell>
                    <TableCell sx={diffSx('pelcoMeterNumber')}><Typography variant="body2">{dup.incoming.pelcoMeterNumber || '—'}</Typography></TableCell>
                    <TableCell sx={diffSx('poleNumber')}><Typography variant="body2">{dup.incoming.poleNumber      || '—'}</Typography></TableCell>
                    <TableCell sx={diffSx('pelcoSq')}><Typography variant="body2">{dup.incoming.pelcoSq          || '—'}</Typography></TableCell>
                    <TableCell sx={diffSx('roverBook')}><Typography variant="body2">{dup.incoming.roverBook       || '—'}</Typography></TableCell>
                    <TableCell sx={diffSx('status')}><Typography variant="body2">{dup.incoming.status           || '—'}</Typography></TableCell>
                    <TableCell sx={diffSx('sn')}><Typography variant="body2">{dup.incoming.sn               || '—'}</Typography></TableCell>
                    <TableCell sx={diffSx('address')}><Typography variant="body2">{dup.incoming.address          || '—'}</Typography></TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
        </Box>
      </DialogContent>

      {/* Pagination for the duplicate list */}
      {totalDupePages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 1, borderTop: '1px solid #e0e0e0', gap: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Showing {(dupePage - 1) * DUPE_PAGE_SIZE + 1}–{Math.min(dupePage * DUPE_PAGE_SIZE, duplicates.length)} of {duplicates.length}
          </Typography>
          <Pagination
            count={totalDupePages} page={dupePage}
            onChange={(_, v) => setDupePage(v)}
            size="small" color="primary"
          />
        </Box>
      )}

      <Divider />
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose} color="inherit" variant="outlined">Cancel Import</Button>
        <Button onClick={handleConfirm} variant="contained" color="primary">
          Proceed with Import
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// SkippedRowsDialog — paginated + searchable so large skip lists don't lag
// ---------------------------------------------------------------------------
const SKIP_PAGE_SIZE = 50;

function SkippedRowsDialog({ open, onClose, skippedRows }) {
  const [skipSearch, setSkipSearch] = useState('');
  const [skipPage,   setSkipPage]   = useState(1);

  useEffect(() => { if (open) { setSkipSearch(''); setSkipPage(1); } }, [open]);

  const filtered = skipSearch.trim()
    ? skippedRows.filter(item => {
        const q = skipSearch.toLowerCase();
        return String(item.index).includes(q)
            || (item.row.accountNumber   || '').toLowerCase().includes(q)
            || (item.row.accountName     || '').toLowerCase().includes(q)
            || (item.row.pelcoMeterNumber|| '').toLowerCase().includes(q);
      })
    : skippedRows;

  const totalSkipPages = Math.ceil(filtered.length / SKIP_PAGE_SIZE);
  const pageSlice      = filtered.slice((skipPage - 1) * SKIP_PAGE_SIZE, skipPage * SKIP_PAGE_SIZE);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <WarningIcon color="warning" />
        <span>Skipped Rows ({skippedRows.length})</span>
      </DialogTitle>
      <DialogContent sx={{ pb: 0 }}>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          These rows were skipped because they are missing a valid account number.
        </Typography>

        {/* Search */}
        <Box sx={{ mb: 1 }}>
          <input
            type="text"
            placeholder="Search by row #, account #, name, or meter #…"
            value={skipSearch}
            onChange={e => { setSkipSearch(e.target.value); setSkipPage(1); }}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '6px 12px', fontSize: 13,
              border: '1px solid #ccc', borderRadius: 4,
              outline: 'none',
            }}
          />
          {skipSearch && (
            <Typography variant="caption" color="text.secondary">
              {filtered.length} of {skippedRows.length} shown
            </Typography>
          )}
        </Box>

        <Box sx={{ overflow: 'auto' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, backgroundColor: '#f5f5f5', fontSize: 12 } }}>
                <TableCell>Row #</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell>PELCO METER #</TableCell>
                <TableCell>ACCOUNT #</TableCell>
                <TableCell>ACCOUNT NAME</TableCell>
                <TableCell>ADDRESS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pageSlice.map((item, idx) => (
                <TableRow key={idx} sx={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <TableCell>{item.index}</TableCell>
                  <TableCell sx={{ color: 'error.main' }}>{item.reason}</TableCell>
                  <TableCell>{item.row.pelcoMeterNumber || '—'}</TableCell>
                  <TableCell>{item.row.accountNumber   || '—'}</TableCell>
                  <TableCell>{item.row.accountName     || '—'}</TableCell>
                  <TableCell>{item.row.address         || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>

        {totalSkipPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', pt: 1, gap: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {(skipPage - 1) * SKIP_PAGE_SIZE + 1}–{Math.min(skipPage * SKIP_PAGE_SIZE, filtered.length)} of {filtered.length}
            </Typography>
            <Pagination count={totalSkipPages} page={skipPage} onChange={(_, v) => setSkipPage(v)} size="small" color="primary" />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// ImportPreviewDialog — shows before any data is written
// Summary + first 20 rows + column mapping + sheet picker + unmapped cols
// ---------------------------------------------------------------------------
function ImportPreviewDialog({ open, previewData, onConfirm, onCancel }) {
  const [colMappings, setColMappings] = useState({});   // overrides for unmapped cols
  const [selectedSheet, setSelectedSheet] = useState(''); // only used if multi-sheet

  useEffect(() => {
    if (open && previewData) {
      setColMappings({});
      setSelectedSheet(previewData.selectedSheet || '');
    }
  }, [open, previewData]);

  if (!previewData) return null;

  const {
    sheets, selectedSheet: defaultSheet,
    mappedHeaders, unmappedHeaders,
    previewRows, validCount, skippedCount,
    totalRows,
  } = previewData;

  const schemaOptions = [
    { value: '', label: '— ignore this column —' },
    { value: 'sn',              label: 'S/N' },
    { value: 'pelcoMeterNumber',label: 'Pelco Meter #' },
    { value: 'accountNumber',   label: 'Account #' },
    { value: 'poleNumber',      label: 'Pole #' },
    { value: 'pelcoSq',         label: 'Pelco SQ.' },
    { value: 'roverBook',       label: 'Rover Book' },
    { value: 'accountName',     label: 'Account Name' },
    { value: 'status',          label: 'Status' },
    { value: 'address',         label: 'Address' },
  ];

  const handleConfirm = () => {
    onConfirm({
      selectedSheet: selectedSheet || defaultSheet,
      extraMappings: colMappings,
    });
  };

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="lg" fullWidth scroll="paper">
      <DialogTitle sx={{ pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <InfoOutlinedIcon color="primary" />
          <Typography variant="h6" fontWeight={700}>Import Preview</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Review before committing. Nothing is saved until you click "Proceed with Import".
        </Typography>
      </DialogTitle>
      <Divider />

      <DialogContent>
        {/* Sheet picker — only shown for multi-sheet files */}
        {sheets && sheets.length > 1 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Workbook has multiple sheets — select which one to import:
            </Typography>
            <Select
              size="small"
              value={selectedSheet || defaultSheet}
              onChange={e => setSelectedSheet(e.target.value)}
              sx={{ minWidth: 240 }}
            >
              {sheets.map(s => (
                <MenuItem key={s} value={s}>{s}</MenuItem>
              ))}
            </Select>
            {(selectedSheet || defaultSheet) !== sheets[0] && (
              <Alert severity="info" sx={{ mt: 1 }}>
                You selected sheet <strong>{selectedSheet || defaultSheet}</strong>. Click "Proceed" to re-scan with this sheet.
              </Alert>
            )}
          </Box>
        )}

        {/* Summary stats */}
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          {[
            { label: 'Total rows found',  value: totalRows,    color: '#1976d2' },
            { label: 'Ready to import',   value: validCount,   color: '#2e7d32' },
            { label: 'Will be skipped',   value: skippedCount, color: '#ed6c02' },
          ].map(({ label, value, color }) => (
            <Box key={label} sx={{ flex: '1 1 140px', backgroundColor: color, color: '#fff', borderRadius: 2, px: 3, py: 1.5, textAlign: 'center', minWidth: 120 }}>
              <Typography variant="h5" fontWeight="bold">{value}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.9 }}>{label}</Typography>
            </Box>
          ))}
        </Box>

        {/* Mapped columns */}
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          Detected columns ({mappedHeaders.length} recognised):
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 3 }}>
          {mappedHeaders.map(({ original, schema }) => (
            <Tooltip key={original} title={`"${original}" → ${schema}`} placement="top">
              <Box sx={{ px: 1.5, py: 0.5, borderRadius: 2, bgcolor: '#e8f5e9', border: '1px solid #a5d6a7', fontSize: 12, fontWeight: 600, color: '#1b5e20' }}>
                {original} → <em>{schema}</em>
              </Box>
            </Tooltip>
          ))}
        </Box>

        {/* Unmapped columns — let admin assign them */}
        {unmappedHeaders.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom color="warning.main">
              Unrecognised columns ({unmappedHeaders.length}) — assign or ignore:
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {unmappedHeaders.map(col => (
                <Box key={col} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant="body2" sx={{ minWidth: 180, fontFamily: 'monospace', fontWeight: 600 }}>
                    "{col}"
                  </Typography>
                  <Select
                    size="small"
                    value={colMappings[col] || ''}
                    onChange={e => setColMappings(m => ({ ...m, [col]: e.target.value }))}
                    sx={{ minWidth: 200 }}
                    displayEmpty
                  >
                    {schemaOptions.map(o => (
                      <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                  </Select>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* Data preview table */}
        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
          Data preview (first {previewRows.length} rows):
        </Typography>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 600 }}>
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: '#f3f4f6', fontSize: 11, whiteSpace: 'nowrap' } }}>
                {['Account #', 'Pelco Meter #', 'Account Name', 'Rover Book', 'Address', 'Status', 'Pole #'].map(h => (
                  <TableCell key={h}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {previewRows.map((row, i) => (
                <TableRow key={i} sx={{ bgcolor: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{row.accountNumber || '—'}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{row.pelcoMeterNumber || '—'}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{row.accountName || '—'}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{row.roverBook || '—'}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{row.address || '—'}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{row.status || '—'}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{row.poleNumber || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
        {totalRows > previewRows.length && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Showing first {previewRows.length} of {validCount} valid rows.
          </Typography>
        )}

        {validCount === 0 && (
          <Alert severity="error" sx={{ mt: 2 }}>
            No valid rows found. Make sure the file has an "Account #" or "ACCT. #" column with data.
          </Alert>
        )}
      </DialogContent>

      <Divider />
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onCancel} color="inherit" variant="outlined">Cancel</Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          color="primary"
          disabled={validCount === 0}
        >
          Proceed with Import ({validCount} records)
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// ImportResultDialog — shown after import finishes
// ---------------------------------------------------------------------------
function ImportResultDialog({ open, onClose, result }) {
  if (!result) return null;

  const handleDownloadFailed = () => {
    if (!result.failedRows || result.failedRows.length === 0) return;
    const exportData = result.failedRows.map(item => ({
      'Row #':        item.index,
      'Reason':       item.reason,
      'Account #':    item.row.accountNumber    || '',
      'Account Name': item.row.accountName      || '',
      'Pelco Meter #':item.row.pelcoMeterNumber  || '',
      'Pole #':       item.row.poleNumber        || '',
      'Rover Book':   item.row.roverBook         || '',
      'Status':       item.row.status            || '',
      'Address':      item.row.address           || '',
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Failed Rows');
    XLSX.writeFile(wb, `import_failed_rows_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CheckCircleIcon color="success" />
        Import Complete
      </DialogTitle>
      <DialogContent>
        <Stack spacing={1} sx={{ mt: 1 }}>
          {result.imported    > 0 && <Typography>✅ <strong>{result.imported}</strong> new records imported</Typography>}
          {result.overwritten > 0 && <Typography>♻️ <strong>{result.overwritten}</strong> records overwritten</Typography>}
          {result.skipped     > 0 && <Typography>⏭️ <strong>{result.skipped}</strong> duplicates skipped (manually)</Typography>}
          {result.autoSkipped > 0 && <Typography>🟰 <strong>{result.autoSkipped}</strong> identical records auto-skipped (no changes)</Typography>}
          {result.invalid     > 0 && (
            <Box>
              <Typography>⚠️ <strong>{result.invalid}</strong> rows skipped (invalid / missing account #)</Typography>
              {result.failedRows?.length > 0 && (
                <Button size="small" variant="outlined" sx={{ mt: 1 }} onClick={handleDownloadFailed} startIcon={<GetAppIcon />}>
                  Download failed rows (.xlsx)
                </Button>
              )}
            </Box>
          )}
          {result.imported === 0 && result.overwritten === 0 && (
            <Typography color="text.secondary">No records were imported.</Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">Done</Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// AdminDashboard
// ---------------------------------------------------------------------------
function AdminDashboard({ onSettings }) {
  const importInputRef = useRef(null);

  const [consumers, setConsumers]                 = useState([]);
  const [selectedConsumer, setSelectedConsumer]   = useState(null);
  const [loading, setLoading]                     = useState(false);
  const [total, setTotal]                         = useState(0);
  const [exporting, setExporting]                 = useState(false);
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
  const [importing, setImporting]                 = useState(false);
  const [error, setError]                         = useState(null);
  const [page, setPage]                           = useState(1);
  const [rowsPerPage]                             = useState(25);
  const [showHidden, setShowHidden]               = useState(false);
  const [searchQuery, setSearchQuery]             = useState('');
  const [addOpen, setAddOpen]                     = useState(false);
  const [editOpen, setEditOpen]                   = useState(false);
  const [unsavedAdd, setUnsavedAdd]               = useState(false);
  const [unsavedEdit, setUnsavedEdit]             = useState(false);
  const [snackbar, setSnackbar]                   = useState({ open: false, message: '', severity: 'info' });
  const [confirmDialog, setConfirmDialog]         = useState({ open: false, action: null, payload: null, message: '' });
  const [stats, setStats]                         = useState({ active: 0, hidden: 0, total: 0 });
  const [selectedIds, setSelectedIds]             = useState(new Set());
  const [bulkProcessing, setBulkProcessing]       = useState(false);
  const [normalizing] = useState(false); // eslint-disable-line no-unused-vars

  // Import state
  const [duplicateDialog, setDuplicateDialog]     = useState({ open: false, duplicates: [] });
  const [skippedRows, setSkippedRows]             = useState([]);
  const [skippedDialogOpen, setSkippedDialogOpen] = useState(false);
  const [importResult, setImportResult]           = useState(null);
  const [importResultOpen, setImportResultOpen]   = useState(false);
  const [importPreview, setImportPreview]         = useState(null);
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const pendingCleanRef                           = useRef([]);
  const pendingAutoSkippedRef                     = useRef([]);
  // Store raw workbook between file-read and preview-confirm so we don't re-read
  const rawWorkbookRef                            = useRef(null);
  const rawFileRef                                = useRef(null);

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------
  const fetchStats = async () => {
    try {
      const [activeRes, hiddenRes] = await Promise.all([
        api.get(`${API_BASE}/search?includeHidden=false&limit=1&page=1`),
        api.get(`${API_BASE}/search?includeHidden=true&limit=1&page=1`),
      ]);
      setStats({
        active: activeRes.data.total,
        hidden: hiddenRes.data.total,
        total:  activeRes.data.total + hiddenRes.data.total,
      });
    } catch (_) {}
  };

  const abortRef = useRef(null);

  // Server-side pagination — only fetch the current page, no background loading.
  const fetchConsumers = async (query = '', hidden = false, pageNum = 1) => {
    // Cancel any in-flight request before starting a new one — this is what
    // prevents the "buggy toggle" race condition.
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({
        includeHidden: hidden ? 'true' : 'false',
        page:  pageNum,
        limit: rowsPerPage,
      });
      if (query) params.append('query', query);
      const res = await api.get(`${API_BASE}/search?${params.toString()}`, {
        signal: abortRef.current.signal,
      });
      setConsumers(res.data.consumers);
      setTotal(res.data.total);
      fetchStats();
    } catch (err) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') return;
      setError(err.response?.data?.message || 'Failed to fetch consumers');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    setSelectedIds(new Set());
    setPage(1);
    fetchConsumers(searchQuery, showHidden, 1);
  }, [showHidden]); // eslint-disable-line

  const handleSearch = ({ query }) => {
    setSearchQuery(query);
    setSelectedIds(new Set());
    setPage(1);
    fetchConsumers(query, showHidden, 1);
  };

  // ---------------------------------------------------------------------------
  // Add consumer
  // ---------------------------------------------------------------------------
  const handleAdd = async (consumer) => {
    // Check duplicates via API — in-memory consumers is only one page now.
    try {
      const dupRes = await api.post(`${API_BASE}/check-duplicates`, { accountNumbers: [consumer.accountNumber] });
      const dupes  = dupRes.data.matches || [];
      if (dupes.length > 0) {
        pendingCleanRef.current = [];
        setDuplicateDialog({
          open: true,
          duplicates: dupes.map(existing => ({ incoming: consumer, existing })),
        });
        return;
      }
    } catch (_) {
      // If duplicate check fails, proceed with add — backend will catch real errors
    }
    await submitAdd(consumer);
  };

  const submitAdd = async (consumer) => {
    try {
      await api.post(`${API_BASE}/`, consumer);
      setSnackbar({ open: true, message: 'Consumer added successfully.', severity: 'success' });
      setAddOpen(false);
      fetchConsumers(searchQuery, showHidden, page);
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.message || err.message, severity: 'error' });
    }
  };

  // ---------------------------------------------------------------------------
  // Import — full pipeline
  // Step 1: read file → build preview data → show ImportPreviewDialog
  // Step 2: user confirms (optionally remaps cols / picks sheet) → process rows
  // Step 3: duplicate check → DuplicateResolverDialog if needed
  // Step 4: submitBatchImport
  // ---------------------------------------------------------------------------

  // Normalise a column header string for matching
  const normCol = (col) => String(col).toLowerCase().replace(/[\s.#_\-/().,']+/g, '');

  // Try to map a normalised column name to a schema field
  const matchCol = (col) => {
    const n = normCol(col);
    for (const pattern of COLUMN_PATTERNS) {
      if (pattern.fields.includes(n)) return pattern.schema;
    }
    return null;
  };

  // Parse a workbook sheet into { mappedHeaders, unmappedHeaders, validRows, skippedRows, previewRows }
  // extraMappings: { [originalColName]: schemaField } — from user overrides in the preview dialog
  const parseSheet = (wb, sheetName, extraMappings = {}) => {
    const ws = wb.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1, raw: false });

    if (!rawRows || rawRows.length === 0) return null;

    // Smart header detection — score the first 20 rows
    let headerRowIndex = 0, bestScore = 0;
    const scanLimit = Math.min(rawRows.length, 20);
    for (let i = 0; i < scanLimit; i++) {
      const score = rawRows[i].reduce((acc, cell) => {
        const v = String(cell).trim();
        return acc + (v && matchCol(v) ? 1 : 0);
      }, 0);
      if (score > bestScore) { bestScore = score; headerRowIndex = i; }
    }

    if (bestScore === 0) return null;

    // Collect which headers matched and which didn't
    const headerValues = rawRows[headerRowIndex];
    const mappedHeaders   = [];
    const unmappedHeaders = [];
    headerValues.forEach(h => {
      const trimmed = String(h).trim();
      if (!trimmed) return;
      const schema = matchCol(trimmed) || extraMappings[trimmed] || null;
      if (schema) mappedHeaders.push({ original: trimmed, schema });
      else unmappedHeaders.push(trimmed);
    });

    // Re-parse with header row detected, raw:false keeps values as strings (no scientific notation)
    let rows = XLSX.utils.sheet_to_json(ws, { defval: '', range: headerRowIndex + 1, header: headerValues, raw: false });

    // Drop if first data row looks like another header (sometimes Excel repeats it)
    const firstRow = rows[0] || {};
    const isHeaderDupe = headerValues.some(h => h && Object.values(firstRow).includes(h));
    if (isHeaderDupe) rows = rows.slice(1);

    // Map columns → schema fields, applying user extraMappings too
    const mapped = rows.map(row => {
      const record = {};
      Object.entries(row).forEach(([k, v]) => {
        const trimmedKey = String(k).trim();
        const schema = matchCol(trimmedKey) || extraMappings[trimmedKey] || null;
        if (schema) {
          // Coerce to string; strip scientific notation for numeric IDs
          let val = v !== undefined && v !== null ? String(v).trim() : '';
          // If looks like scientific notation (e.g. 1.23E+8), convert properly
          if (/^-?\d+(\.\d+)?[eE][+-]?\d+$/.test(val)) {
            try { val = String(Math.round(parseFloat(val))); } catch (_) {}
          }
          // Normalize accountNumber the same way the backend does —
          // trim + collapse internal whitespace + uppercase — so the upsert
          // filter always matches what's stored in MongoDB.
          if (schema === 'accountNumber' && val) {
            val = normalizeAccountNumber(val);
          }
          record[schema] = val;
        }
      });
      return record;
    });

    // Section break rows in files like list.xlsx — rows that only have 1-2 cells
    // (rover-book header rows like "050101  NATIONAL ROAD MASANTOL 050101") are
    // detected by having no accountNumber after mapping. They'll fall into skipped
    // which is fine — they get silently dropped as they're empty after mapping.

    const validRows = [], skipped = [];
    mapped.forEach((row, idx) => {
      const acct    = (row.accountNumber || '').toString().trim(); // already normalized above
      const isEmpty = Object.values(row).every(v => !v || String(v).trim() === '');
      if (isEmpty) return; // silently drop blank rows

      const badAcct = !acct || ['#N/A','N/A','NULL','NONE','ACCT#','ACCT.#','ACCOUNT#'].includes(acct);
      if (badAcct) {
        skipped.push({ row, reason: 'Missing or invalid account number', index: idx + headerRowIndex + 2 });
      } else {
        validRows.push(row);
      }
    });

    return { mappedHeaders, unmappedHeaders, validRows, skippedRows: skipped, previewRows: validRows.slice(0, 20), totalRows: mapped.filter(r => !Object.values(r).every(v => !v || String(v).trim() === '')).length };
  };

  const handleImportClick = () => {
    if (importInputRef.current) importInputRef.current.value = '';
    importInputRef.current.click();
  };

  // Step 1 — read file, build preview, open preview dialog
  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    rawFileRef.current = file;
    setImporting(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array', raw: false });
        rawWorkbookRef.current = wb;

        // Pick the best sheet — prefer one with the highest header score
        const sheets = wb.SheetNames;
        let bestSheet = sheets[0], bestSheetScore = 0;
        for (const sName of sheets) {
          const ws = wb.Sheets[sName];
          const rr = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1, raw: false });
          const limit = Math.min(rr.length, 20);
          for (let i = 0; i < limit; i++) {
            const score = rr[i].reduce((acc, cell) => acc + (String(cell).trim() && matchCol(String(cell).trim()) ? 1 : 0), 0);
            if (score > bestSheetScore) { bestSheetScore = score; bestSheet = sName; }
          }
        }

        const parsed = parseSheet(wb, bestSheet, {});

        if (!parsed) {
          setSnackbar({ open: true, message: 'No recognisable column headers found in this file.', severity: 'error' });
          setImporting(false);
          return;
        }

        setImportPreview({
          sheets,
          selectedSheet: bestSheet,
          ...parsed,
          validCount:   parsed.validRows.length,
          skippedCount: parsed.skippedRows.length,
        });
        setImportPreviewOpen(true);
      } catch (err) {
        setSnackbar({ open: true, message: `Failed to read file: ${err.message}`, severity: 'error' });
      } finally {
        setImporting(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Step 2 — user confirmed preview (possibly with a different sheet or extra column mappings)
  const handlePreviewConfirm = async ({ selectedSheet, extraMappings }) => {
    setImportPreviewOpen(false);
    setImporting(true);

    try {
      const wb = rawWorkbookRef.current;
      const parsed = parseSheet(wb, selectedSheet, extraMappings);
      if (!parsed) {
        setSnackbar({ open: true, message: 'No valid data found in selected sheet.', severity: 'error' });
        setImporting(false);
        return;
      }

      const { validRows, skippedRows: skipped } = parsed;
      setSkippedRows(skipped);

      if (validRows.length === 0) {
        setSnackbar({ open: true, message: 'No valid records found after mapping.', severity: 'warning' });
        if (skipped.length > 0) setSkippedDialogOpen(true);
        setImporting(false);
        return;
      }

      // Rover Book auto-fill — isolated, never blocks import
      try {
        const roverNumbersToLookup = [
          ...new Set(validRows.filter(r => r.roverBook && r.roverBook.trim() && !r.address).map(r => r.roverBook.trim().toUpperCase()))
        ];
        if (roverNumbersToLookup.length > 0) {
          const rvRes = await api.post('/api/rover-book/bulk-lookup', { roverNumbers: roverNumbersToLookup });
          const rvMap = new Map((rvRes.data.entries || []).map(e => [e.roverNumber.toUpperCase(), e.address]));
          validRows.forEach(row => {
            if (row.roverBook && !row.address) {
              const addr = rvMap.get(row.roverBook.trim().toUpperCase());
              if (addr) row.address = addr;
            }
          });
        }
      } catch (_) { /* rover lookup failed — import continues without auto-fill */ }

      // Duplicate detection — chunked to handle files > 5000 rows
      const CHUNK = 4000;
      let allMatches = [];
      try {
        const accountNumbers = validRows.map(r => String(r.accountNumber).trim());
        for (let i = 0; i < accountNumbers.length; i += CHUNK) {
          const chunk = accountNumbers.slice(i, i + CHUNK);
          const res = await api.post(`${API_BASE}/check-duplicates`, { accountNumbers: chunk });
          allMatches = [...allMatches, ...(res.data.matches || [])];
        }
      } catch (err) {
        setSnackbar({ open: true, message: 'Duplicate check failed: ' + (err.response?.data?.message || err.message), severity: 'error' });
        setImporting(false);
        return;
      }

      // Fields used for field-by-field equality comparison.
      // Must match every field returned by the checkDuplicates projection.
      const COMPARE_FIELDS = ['sn', 'pelcoMeterNumber', 'accountNumber', 'poleNumber', 'pelcoSq', 'roverBook', 'accountName', 'status', 'address'];

      // Returns true when every comparable field is the same between incoming and existing.
      // Both values are normalised to trimmed lowercase strings so whitespace / case
      // differences (which are invisible to the user) never trigger a false conflict.
      const isIdentical = (incoming, existing) =>
        COMPARE_FIELDS.every(field => {
          const a = String(incoming[field] ?? '').trim().toLowerCase();
          const b = String(existing[field]  ?? '').trim().toLowerCase();
          return a === b;
        });

      const dbMap = new Map(allMatches.map(c => [String(c.accountNumber).trim(), c]));
      const dupeRows = [], cleanRows = [], autoSkippedRows = [];
      validRows.forEach(incoming => {
        const key = String(incoming.accountNumber).trim();
        const existing = dbMap.get(key);
        if (!existing) {
          cleanRows.push(incoming);
        } else if (isIdentical(incoming, existing)) {
          // Exact match — nothing would change, no need to bother the admin
          autoSkippedRows.push({ incoming, existing });
        } else {
          // Same account number but at least one field differs — needs human decision
          dupeRows.push({ incoming, existing });
        }
      });
      // Carry auto-skipped count through to the result dialog
      pendingAutoSkippedRef.current = autoSkippedRows;

      if (dupeRows.length > 0) {
        // Show the duplicate dialog so the user can choose per-record
        pendingCleanRef.current = cleanRows;
        setDuplicateDialog({ open: true, duplicates: dupeRows });
      } else {
        // No real conflicts — straight to upsert (safe atomic insert)
        await submitBatchImport(cleanRows, [], skipped, autoSkippedRows.length);
        pendingAutoSkippedRef.current = [];
      }

      if (skipped.length > 0) {
        setTimeout(() => setSkippedDialogOpen(true), dupeRows.length > 0 ? 700 : 0);
      }
    } catch (err) {
      const msg = err.response
        ? `Import failed: ${err.response.data?.message || err.response.statusText} (${err.response.status})`
        : `Import error: ${err.message}`;
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setImporting(false);
    }
  };
  const handleDuplicateConfirm = async (resolved) => {
    setDuplicateDialog({ open: false, duplicates: [] });
    await submitBatchImport(pendingCleanRef.current, resolved, skippedRows, pendingAutoSkippedRef.current.length);
    pendingCleanRef.current = [];
    pendingAutoSkippedRef.current = [];
  };

  const submitBatchImport = async (cleanRecords, resolvedDuplicates, skipped = [], autoSkippedCount = 0) => {
    try {
      let imported = 0, overwritten = 0, skippedCount = 0;
      const CHUNK = 4000;

      const toOverwrite = resolvedDuplicates.filter(d => d.action === 'overwrite');
      const toSkip      = resolvedDuplicates.filter(d => d.action !== 'overwrite');
      skippedCount = toSkip.length;

      // Combine clean records + records to overwrite into one upsert call.
      // batch-upsert uses bulkWrite with upsert:true keyed on accountNumber —
      // inserts if new, updates if exists. Eliminates the race condition where
      // a record slips through the duplicate check and gets inserted twice.
      const allToUpsert = [
        ...cleanRecords,
        ...toOverwrite.map(d => d.incoming),
      ];

      if (allToUpsert.length > 0) {
        for (let i = 0; i < allToUpsert.length; i += CHUNK) {
          const res = await api.post(`${API_BASE}/batch-upsert`, allToUpsert.slice(i, i + CHUNK));
          imported    += res.data.inserted  || 0;
          // modifiedCount = docs where data actually changed.
          // total - inserted = all records that matched an existing doc (changed or not).
          // We report that as "overwritten" so the count matches what the user expects.
          const chunkTotal    = res.data.total    || (res.data.inserted || 0) + (res.data.modified || 0);
          const chunkMatched  = chunkTotal - (res.data.inserted || 0);
          overwritten += chunkMatched;
        }
      }

      setImportResult({
        imported,
        overwritten,
        skipped: skippedCount,
        autoSkipped: autoSkippedCount,
        invalid: Array.isArray(skipped) ? skipped.length : skipped,
        failedRows: Array.isArray(skipped) ? skipped : [],
      });
      setImportResultOpen(true);
      fetchConsumers(searchQuery, showHidden, page);
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.message || err.message, severity: 'error' });
    }
  };

  // ---------------------------------------------------------------------------
  // Shared helper — fetches every record from DB (active + hidden).
  // Backend treats includeHidden=true as "only hidden" and false as "only active",
  // so we run both in parallel and merge.
  // ---------------------------------------------------------------------------
  const fetchAllFromDB = async () => {
    const CHUNK = 500;
    const fetchSet = async (hiddenFlag) => {
      let all = [], p = 1;
      while (true) {
        const res = await api.get(`${API_BASE}/search`, {
          params: { includeHidden: hiddenFlag ? 'true' : 'false', page: p, limit: CHUNK, allPages: 'true' },
        });
        const { consumers: chunk, hasMore } = res.data;
        all = [...all, ...chunk];
        if (!hasMore) break;
        p++;
      }
      return all;
    };
    const [active, hidden] = await Promise.all([fetchSet(false), fetchSet(true)]);
    return [...active, ...hidden];
  };

  // ---------------------------------------------------------------------------
  // Export — all consumers, date-stamped filename
  // ---------------------------------------------------------------------------
  const handleExport = async () => {
    setExporting(true);
    try {
      const all = await fetchAllFromDB();

      if (all.length === 0) {
        setSnackbar({ open: true, message: 'No consumers found in the database.', severity: 'warning' });
        return;
      }

      const exportData = all.map(c => {
        const row = {};
        EXPORT_COLUMNS.forEach(({ header, key }) => { row[header] = c[key] || ''; });
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(exportData, { header: EXPORT_COLUMNS.map(c => c.header) });
      ws['!cols'] = [
        { wch: 6 }, { wch: 16 }, { wch: 14 }, { wch: 10 },
        { wch: 10 }, { wch: 12 }, { wch: 30 }, { wch: 10 }, { wch: 35 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Consumers');
      XLSX.writeFile(wb, `consumers_${todayStamp()}.xlsx`);

      setSnackbar({ open: true, message: `Exported ${all.length} records successfully.`, severity: 'success' });
    } catch (err) {
      setSnackbar({ open: true, message: 'Export failed: ' + err.message, severity: 'error' });
    } finally {
      setExporting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Edit
  // ---------------------------------------------------------------------------
  const handleEdit     = (c) => { setSelectedConsumer(c); setEditOpen(true); };
  const handleEditSave = async (consumer) => {
    try {
      await api.put(`${API_BASE}/${consumer._id}`, consumer);
      setSnackbar({ open: true, message: 'Consumer updated successfully.', severity: 'success' });
      setEditOpen(false);
      setSelectedConsumer(null);
      fetchConsumers(searchQuery, showHidden, page);
    } catch (err) {
      setSnackbar({ open: true, message: err.response?.data?.message || err.message, severity: 'error' });
    }
  };

  // ---------------------------------------------------------------------------
  // Hide / Unhide / Delete
  // ---------------------------------------------------------------------------
  const handleHide            = (c) => setConfirmDialog({ open: true, action: 'hide',            payload: c, message: `Hide "${c.accountName}"?` });
  const handleUnhide          = (c) => setConfirmDialog({ open: true, action: 'unhide',          payload: c, message: `Unhide "${c.accountName}"?` });
  const handlePermanentDelete = (c) => setConfirmDialog({ open: true, action: 'permanentDelete', payload: c, message: `Permanently delete "${c.accountName}"? This cannot be undone.` });

  const confirmHide = async () => {
    try {
      await api.put(`${API_BASE}/${confirmDialog.payload._id}/hide`);
      setSnackbar({ open: true, message: 'Consumer hidden.', severity: 'warning' });
      fetchConsumers(searchQuery, showHidden, page);
    } catch (err) { setSnackbar({ open: true, message: err.message, severity: 'error' }); }
    finally { setConfirmDialog({ open: false, action: null, payload: null, message: '' }); setSelectedConsumer(null); }
  };

  const confirmUnhide = async () => {
    try {
      await api.put(`${API_BASE}/${confirmDialog.payload._id}/unhide`);
      setSnackbar({ open: true, message: 'Consumer unhidden.', severity: 'success' });
      fetchConsumers(searchQuery, showHidden, page);
    } catch (err) { setSnackbar({ open: true, message: err.message, severity: 'error' }); }
    finally { setConfirmDialog({ open: false, action: null, payload: null, message: '' }); setSelectedConsumer(null); }
  };

  const confirmPermanentDelete = async () => {
    try {
      await api.delete(`${API_BASE}/${confirmDialog.payload._id}/permanent`);
      setSnackbar({ open: true, message: 'Permanently deleted.', severity: 'error' });
      fetchConsumers(searchQuery, showHidden, page);
    } catch (err) { setSnackbar({ open: true, message: err.message, severity: 'error' }); }
    finally { setConfirmDialog({ open: false, action: null, payload: null, message: '' }); setSelectedConsumer(null); }
  };

  const handleCancelDialog = () => setConfirmDialog({ open: false, action: null, payload: null, message: '' });

  // ── Bulk selection helpers ────────────────────────────────────────────────
  const handleSelectOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSelectAll = (ids, checked, clearAll = false) => {
    if (clearAll || (ids.length === 0 && !checked)) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) ids.forEach(id => next.add(id));
      else ids.forEach(id => next.delete(id));
      return next;
    });
  };

  // ── Bulk actions ──────────────────────────────────────────────────────────
  const handleBulkHide = (ids) => {
    setConfirmDialog({
      open: true, action: 'bulkHide', payload: ids,
      message: `Hide ${ids.length} selected consumer${ids.length !== 1 ? 's' : ''}? They can be unhidden later.`,
    });
  };

  const handleBulkUnhide = (ids) => {
    setConfirmDialog({
      open: true, action: 'bulkUnhide', payload: ids,
      message: `Unhide ${ids.length} selected consumer${ids.length !== 1 ? 's' : ''}?`,
    });
  };

  const handleBulkDelete = (ids) => {
    setConfirmDialog({
      open: true, action: 'bulkDelete', payload: ids,
      message: `Permanently delete ${ids.length} selected consumer${ids.length !== 1 ? 's' : ''}? This cannot be undone.`,
    });
  };

  const confirmBulkHide = async () => {
    const ids = confirmDialog.payload;
    setBulkProcessing(true);
    try {
      // Sequential to avoid overwhelming the server with concurrent requests
      for (const id of ids) await api.put(`${API_BASE}/${id}/hide`);
      setSnackbar({ open: true, message: `${ids.length} consumers hidden.`, severity: 'warning' });
      setSelectedIds(new Set());
      fetchConsumers(searchQuery, showHidden, page);
    } catch (err) { setSnackbar({ open: true, message: err.message, severity: 'error' }); }
    finally { setBulkProcessing(false); setConfirmDialog({ open: false, action: null, payload: null, message: '' }); }
  };

  const confirmBulkUnhide = async () => {
    const ids = confirmDialog.payload;
    setBulkProcessing(true);
    try {
      for (const id of ids) await api.put(`${API_BASE}/${id}/unhide`);
      setSnackbar({ open: true, message: `${ids.length} consumers unhidden.`, severity: 'success' });
      setSelectedIds(new Set());
      fetchConsumers(searchQuery, showHidden, page);
    } catch (err) { setSnackbar({ open: true, message: err.message, severity: 'error' }); }
    finally { setBulkProcessing(false); setConfirmDialog({ open: false, action: null, payload: null, message: '' }); }
  };

  const confirmBulkDelete = async () => {
    const ids = confirmDialog.payload;
    setBulkProcessing(true);
    try {
      for (const id of ids) await api.delete(`${API_BASE}/${id}/permanent`);
      setSnackbar({ open: true, message: `${ids.length} consumers permanently deleted.`, severity: 'error' });
      setSelectedIds(new Set());
      fetchConsumers(searchQuery, showHidden, page);
    } catch (err) { setSnackbar({ open: true, message: err.message, severity: 'error' }); }
    finally { setBulkProcessing(false); setConfirmDialog({ open: false, action: null, payload: null, message: '' }); }
  };
  const handleLogout        = async () => { await logout(); };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <Container maxWidth="xl" sx={{ mt: 4 }}>
      <input type="file" accept=".xlsx,.xls" ref={importInputRef} style={{ display: 'none' }} onChange={handleImportFile} />

      {/* Header bar */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="h5" fontWeight="bold">Admin Dashboard</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="contained" color="primary" startIcon={<PersonAddIcon />} onClick={() => setAddOpen(true)}>
            Add Consumer
          </Button>
          <Button
            variant="contained" color="info"
            startIcon={<PublishIcon />}
            onClick={handleImportClick}
            disabled={importing}
          >
            {importing ? 'Reading…' : 'Import Excel'}
          </Button>
          <Button
            variant="contained" color="success"
            startIcon={<GetAppIcon />}
            onClick={() => setExportConfirmOpen(true)}
            disabled={exporting}
          >
            {exporting ? 'Exporting…' : 'Export Excel'}
          </Button>
          <Button
            variant="contained"
            color={showHidden ? 'warning' : 'secondary'}
            startIcon={showHidden ? <VisibilityIcon /> : <VisibilityOffIcon />}
            onClick={() => setShowHidden(p => !p)}
          >
            {showHidden ? 'Show Active' : 'Show Hidden'}
          </Button>
          <Button variant="contained" color="inherit" startIcon={<SettingsIcon />} onClick={onSettings}>
            Settings
          </Button>
          <Button variant="contained" color="error" startIcon={<LogoutIcon />} onClick={handleLogout}>Logout</Button>
        </Box>
      </Box>

      {/* Progress bars */}
      {(importing || exporting) && <LinearProgress sx={{ mb: 1, borderRadius: 1 }} />}

      <ConsumerSearchBar onSearch={handleSearch} />



      {/* Add consumer dialog */}
      <AddConsumerDialog
        open={addOpen}
        onClose={(event, reason) => {
          if (unsavedAdd && (reason === 'backdropClick' || reason === 'escapeKeyDown')) {
            setConfirmDialog({ open: true, action: 'cancelAdd', message: 'Discard changes and close?' });
          } else if (!unsavedAdd) { setAddOpen(false); setUnsavedAdd(false); }
        }}
        onAdd={(consumer) => { handleAdd(consumer); setUnsavedAdd(false); }}
        onChange={() => setUnsavedAdd(true)}
        onCancelConfirmed={() => { setAddOpen(false); setUnsavedAdd(false); setSnackbar({ open: true, message: 'Add cancelled.', severity: 'info' }); }}
      />

      {loading && <Typography sx={{ mb: 1 }}>Loading…</Typography>}
      {error   && <Typography color="error" sx={{ mb: 1 }}>{error}</Typography>}

      {/* Stats cards */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        {[
          { label: 'Total',  value: stats.total,  bg: '#1976d2' },
          { label: 'Active', value: stats.active, bg: '#2e7d32' },
          { label: 'Hidden', value: stats.hidden, bg: '#ed6c02' },
        ].map(({ label, value, bg }) => (
          <Box key={label} sx={{ flex: '1 1 140px', backgroundColor: bg, color: '#fff', borderRadius: 2, px: 3, py: 1.5, display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 120 }}>
            <Typography variant="h5" fontWeight="bold">{value}</Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }}>{label}</Typography>
          </Box>
        ))}
      </Box>

      {/* Consumer table */}
      <Box sx={{ mt: 2 }}>
        <AdminConsumerTable
          consumers={consumers} page={1} rowsPerPage={rowsPerPage}
          onRowClick={setSelectedConsumer} onEdit={handleEdit}
          onHide={handleHide} onUnhide={handleUnhide} onPermanentDelete={handlePermanentDelete}
          showHidden={showHidden}
          selectedIds={selectedIds}
          onSelectOne={handleSelectOne}
          onSelectAll={handleSelectAll}
          onBulkHide={handleBulkHide}
          onBulkUnhide={handleBulkUnhide}
          onBulkDelete={handleBulkDelete}
        />
        <AdminConsumerDetailsDialog
          open={!!selectedConsumer && !editOpen} consumer={selectedConsumer}
          onClose={() => setSelectedConsumer(null)} onEdit={handleEdit}
          onHide={handleHide} onUnhide={handleUnhide} onPermanentDelete={handlePermanentDelete}
          showHidden={showHidden}
        />
        {total > rowsPerPage && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, flexWrap: 'wrap', gap: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {total > 0
                ? `Showing ${((page - 1) * rowsPerPage) + 1}–${Math.min(page * rowsPerPage, total)} of ${total.toLocaleString()} records`
                : 'No records found.'}
            </Typography>
            <Pagination
              count={Math.ceil(total / rowsPerPage)} page={page}
              onChange={(_, v) => { setPage(v); fetchConsumers(searchQuery, showHidden, v); }}
              color="primary" showFirstButton showLastButton
            />
          </Box>
        )}
      </Box>

      {/* Edit consumer dialog */}
      <ConsumerEditDialog
        open={editOpen}
        onClose={(event, reason) => {
          if (unsavedEdit && (reason === 'backdropClick' || reason === 'escapeKeyDown')) {
            setConfirmDialog({ open: true, action: 'cancelEdit', message: 'Discard changes?' });
          } else if (!unsavedEdit) { setEditOpen(false); setSelectedConsumer(null); setUnsavedEdit(false); }
        }}
        consumer={selectedConsumer}
        onSave={(consumer) => setConfirmDialog({ open: true, action: 'saveEdit', payload: consumer, message: 'Save changes?' })}
        onChange={() => setUnsavedEdit(true)}
        onCancelConfirmed={() => { setEditOpen(false); setSelectedConsumer(null); setUnsavedEdit(false); setSnackbar({ open: true, message: 'Edit cancelled.', severity: 'info' }); }}
      />

      {/* General confirm dialog */}
      <Dialog open={confirmDialog.open} onClose={bulkProcessing ? undefined : handleCancelDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Confirmation</DialogTitle>
        <DialogContent>
          <Typography>{confirmDialog.message}</Typography>
          {bulkProcessing && (
            <Box sx={{ mt: 2 }}>
              <LinearProgress />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                Processing, please wait…
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDialog} color="secondary" variant="outlined" disabled={bulkProcessing}>Cancel</Button>
          {confirmDialog.action === 'hide'            && <Button onClick={confirmHide}            color="warning" variant="contained" disabled={bulkProcessing}>Hide</Button>}
          {confirmDialog.action === 'unhide'          && <Button onClick={confirmUnhide}          color="success" variant="contained" disabled={bulkProcessing}>Unhide</Button>}
          {confirmDialog.action === 'permanentDelete' && <Button onClick={confirmPermanentDelete} color="error"   variant="contained" disabled={bulkProcessing}>Delete</Button>}
          {confirmDialog.action === 'bulkHide'   && <Button onClick={confirmBulkHide}   color="warning" variant="contained" disabled={bulkProcessing}>{bulkProcessing ? 'Hiding…'   : 'Hide'}</Button>}
          {confirmDialog.action === 'bulkUnhide' && <Button onClick={confirmBulkUnhide} color="success" variant="contained" disabled={bulkProcessing}>{bulkProcessing ? 'Unhiding…' : 'Unhide'}</Button>}
          {confirmDialog.action === 'bulkDelete' && <Button onClick={confirmBulkDelete} color="error"   variant="contained" disabled={bulkProcessing}>{bulkProcessing ? 'Deleting…' : 'Delete All'}</Button>}
          {confirmDialog.action === 'cancelAdd'  && (
            <Button onClick={() => { setAddOpen(false); setUnsavedAdd(false); setConfirmDialog({ open: false, action: null, payload: null, message: '' }); setSnackbar({ open: true, message: 'Add cancelled.', severity: 'info' }); }} color="error" variant="contained">Discard</Button>
          )}
          {confirmDialog.action === 'cancelEdit' && (
            <Button onClick={() => { setEditOpen(false); setSelectedConsumer(null); setUnsavedEdit(false); setConfirmDialog({ open: false, action: null, payload: null, message: '' }); setSnackbar({ open: true, message: 'Edit cancelled.', severity: 'info' }); }} color="error" variant="contained">Discard</Button>
          )}
          {confirmDialog.action === 'saveEdit' && (
            <Button onClick={async () => { await handleEditSave(confirmDialog.payload); setUnsavedEdit(false); setConfirmDialog({ open: false, action: null, payload: null, message: '' }); }} color="primary" variant="contained">Save</Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Import preview dialog */}
      <ImportPreviewDialog
        open={importPreviewOpen}
        previewData={importPreview}
        onConfirm={handlePreviewConfirm}
        onCancel={() => { setImportPreviewOpen(false); rawWorkbookRef.current = null; }}
      />

      {/* Duplicate resolver dialog */}
      <DuplicateResolverDialog
        open={duplicateDialog.open}
        duplicates={duplicateDialog.duplicates}
        onClose={() => { setDuplicateDialog({ open: false, duplicates: [] }); pendingCleanRef.current = []; }}
        onConfirm={handleDuplicateConfirm}
      />

      {/* Skipped rows dialog */}
      <SkippedRowsDialog
        open={skippedDialogOpen}
        onClose={() => setSkippedDialogOpen(false)}
        skippedRows={skippedRows}
      />

      {/* Import result dialog */}
      <ImportResultDialog
        open={importResultOpen}
        onClose={() => setImportResultOpen(false)}
        result={importResult}
      />

      {/* Export confirm dialog */}
      <Dialog open={exportConfirmOpen} onClose={() => setExportConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Export All Records</DialogTitle>
        <DialogContent>
          <Typography>
            This will export <strong>{stats.total.toLocaleString()}</strong> records
            ({stats.active.toLocaleString()} active + {stats.hidden.toLocaleString()} hidden)
            to an Excel file. Proceed?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportConfirmOpen(false)} color="inherit" variant="outlined">Cancel</Button>
          <Button
            onClick={() => { setExportConfirmOpen(false); handleExport(); }}
            color="success" variant="contained" startIcon={<GetAppIcon />}
          >
            Export
          </Button>
        </DialogActions>
      </Dialog>

      {/* Normalization loading overlay */}
      <Dialog open={normalizing} maxWidth="xs" fullWidth PaperProps={{ sx: { textAlign: 'center', py: 3, px: 4 } }}>
        <DialogContent>
          <CircularProgress size={52} sx={{ mb: 2 }} />
          <Typography variant="h6" fontWeight={700} gutterBottom>Normalizing Account Numbers</Typography>
          <Typography variant="body2" color="text.secondary">
            Cleaning up all account numbers in the database. Please wait — do not close this page.
          </Typography>
        </DialogContent>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <MuiAlert elevation={6} variant="filled" onClose={() => setSnackbar(s => ({ ...s, open: false }))} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </MuiAlert>
      </Snackbar>
      <ScrollToTop />
    </Container>
  );
}

export default AdminDashboard;