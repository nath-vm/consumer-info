import React, { useState, useEffect } from 'react';
import { Pagination } from '@mui/material';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Checkbox, List, ListItem,
  Typography, Box, FormControlLabel, Chip, Divider
} from '@mui/material'; // ✅ removed ListItemText

const DuplicateConsumersDialog = ({ open, duplicates, onClose, onConfirm }) => {
  const [selected, setSelected] = useState([]);
  const [allChecked, setAllChecked] = useState(false);
  // Pagination state
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  const pageCount = Math.ceil(selected.length / PAGE_SIZE);

  // Reinitialize state whenever duplicates change
  useEffect(() => {
    if (open && duplicates.length > 0) {
      setSelected(duplicates.map((d) => ({ ...d, action: 'skip', checked: false })));
      setAllChecked(false);
      setPage(1);
    }
  }, [open, duplicates]);

  // Only operate on current page
  const pagedSelected = selected.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleCheck = (idx) => {
    const globalIdx = (page - 1) * PAGE_SIZE + idx;
    const updated = [...selected];
    updated[globalIdx] = { ...updated[globalIdx], checked: !updated[globalIdx].checked };
    setSelected(updated);
    // Only check allChecked for current page
    setAllChecked(updated.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).every((d) => d.checked));
  };

  const handleBulkCheck = (e) => {
    const checked = e.target.checked;
    setAllChecked(checked);
    const updated = [...selected];
    for (let i = (page - 1) * PAGE_SIZE; i < Math.min(page * PAGE_SIZE, selected.length); i++) {
      updated[i] = { ...updated[i], checked };
    }
    setSelected(updated);
  };

  const handleBulkAction = (action) => {
    const updated = [...selected];
    for (let i = (page - 1) * PAGE_SIZE; i < Math.min(page * PAGE_SIZE, selected.length); i++) {
      if (updated[i].checked) updated[i] = { ...updated[i], action };
    }
    setSelected(updated);
  };

  const handleActionChange = (idx, action) => {
    const globalIdx = (page - 1) * PAGE_SIZE + idx;
    const updated = [...selected];
    updated[globalIdx] = { ...updated[globalIdx], action };
    setSelected(updated);
  };

  const handleConfirm = () => {
    onConfirm(selected);
  };

  const skipCount = selected.filter((d) => d.action === 'skip').length;
  const overwriteCount = selected.filter((d) => d.action === 'overwrite').length;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Duplicate Consumers Detected
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {duplicates.length} conflict{duplicates.length !== 1 ? 's' : ''} found. Choose to Skip or Overwrite each record.
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        {/* Bulk action toolbar */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <FormControlLabel
            control={<Checkbox checked={allChecked} onChange={handleBulkCheck} />}
            label="Select All (Page)"
          />
          <Button
            variant="outlined"
            size="small"
            onClick={() => handleBulkAction('skip')}
            disabled={!selected.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).some((d) => d.checked)}
          >
            Skip Selected
          </Button>
          <Button
            variant="outlined"
            size="small"
            color="error"
            onClick={() => handleBulkAction('overwrite')}
            disabled={!selected.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).some((d) => d.checked)}
          >
            Overwrite Selected
          </Button>
          {/* Resolve All buttons */}
          <Button
            variant="contained"
            size="small"
            color="default"
            onClick={() => setSelected(selected.map(d => ({ ...d, action: 'skip' })))}
            sx={{ ml: 2 }}
          >
            Skip All
          </Button>
          <Button
            variant="contained"
            size="small"
            color="error"
            onClick={() => setSelected(selected.map(d => ({ ...d, action: 'overwrite' })))}
          >
            Overwrite All
          </Button>
          <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
            <Chip label={`${skipCount} Skip`} color="default" size="small" />
            <Chip label={`${overwriteCount} Overwrite`} color="error" size="small" />
          </Box>
        </Box>

        <Divider sx={{ mb: 1 }} />

        <List disablePadding>
          {pagedSelected.map((dup, idx) => (
            <ListItem
              key={idx + (page - 1) * PAGE_SIZE}
              divider
              alignItems="flex-start"
              sx={{
                flexDirection: 'column',
                gap: 1,
                py: 1.5,
                backgroundColor: dup.action === 'overwrite' ? 'rgba(211,47,47,0.04)' : 'inherit',
              }}
            >
              {/* Row: checkbox + account info + action buttons */}
              <Box sx={{ display: 'flex', alignItems: 'flex-start', width: '100%', gap: 1 }}>
                <Checkbox
                  checked={dup.checked}
                  onChange={() => handleCheck(idx)}
                  sx={{ mt: 0.5 }}
                />
                <Box sx={{ flex: 1 }}>
                  {/* Incoming (from file) */}
                  <Typography variant="body2" fontWeight="bold" color="primary">
                    Incoming (from file):
                  </Typography>
                  <Typography variant="body2">
                    Account #: {dup.incoming.accountNumber} &nbsp;|&nbsp;
                    Name: {dup.incoming.accountName} &nbsp;|&nbsp;
                    Meter #: {dup.incoming.pelcoMeterNumber}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Address: {dup.incoming.address}
                  </Typography>

                  {/* Existing (in DB) */}
                  <Typography variant="body2" fontWeight="bold" color="text.secondary" sx={{ mt: 0.75 }}>
                    Existing (in database):
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Account #: {dup.existing.accountNumber} &nbsp;|&nbsp;
                    Name: {dup.existing.accountName} &nbsp;|&nbsp;
                    Meter #: {dup.existing.pelcoMeterNumber}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Address: {dup.existing.address}
                  </Typography>
                </Box>

                {/* Skip / Overwrite toggle */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 110 }}>
                  <Button
                    variant={dup.action === 'skip' ? 'contained' : 'outlined'}
                    size="small"
                    onClick={() => handleActionChange(idx, 'skip')}
                    fullWidth
                  >
                    Skip
                  </Button>
                  <Button
                    variant={dup.action === 'overwrite' ? 'contained' : 'outlined'}
                    size="small"
                    color="error"
                    onClick={() => handleActionChange(idx, 'overwrite')}
                    fullWidth
                  >
                    Overwrite
                  </Button>
                </Box>
              </Box>
            </ListItem>
          ))}
        </List>
            {/* Pagination controls */}
            {pageCount > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                <Pagination
                  count={pageCount}
                  page={page}
                  onChange={(_, v) => setPage(v)}
                  color="primary"
                  showFirstButton
                  showLastButton
                />
              </Box>
            )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {skipCount} will be skipped · {overwriteCount} will be overwritten
        </Typography>
        <Button onClick={onClose} variant="outlined" color="secondary">Cancel</Button>
        <Button onClick={handleConfirm} variant="contained" color="primary">
          Proceed with Import
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DuplicateConsumersDialog;
