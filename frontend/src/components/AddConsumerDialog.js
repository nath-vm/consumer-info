import React, { useState, useEffect, useRef } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import CircularProgress from '@mui/material/CircularProgress';
import Tooltip from '@mui/material/Tooltip';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import api from '../api';

const initialForm = {
  sn: '',
  pelcoMeterNumber: '',
  accountNumber: '',
  poleNumber: '',
  pelcoSq: '',
  roverBook: '',
  accountName: '',
  status: '',
  address: '',
};

const AddConsumerDialog = ({ open, onClose, onAdd, onChange, onCancelConfirmed }) => {
  const [form, setForm]             = useState(initialForm);
  const [unsaved, setUnsaved]       = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lookingUp, setLookingUp]   = useState(false);
  const [autoFilled, setAutoFilled] = useState(false); // true = address was auto-filled
  const debounceRef                 = useRef(null);

  useEffect(() => {
    if (!open) {
      setForm(initialForm);
      setUnsaved(false);
      setAutoFilled(false);
    }
  }, [open]);

  // Auto-fill address when rover book number changes
  const lookupRoverBook = async (roverNumber) => {
    if (!roverNumber.trim()) { setAutoFilled(false); return; }
    setLookingUp(true);
    try {
      const res = await api.get(`/api/rover-book/lookup/${encodeURIComponent(roverNumber.trim())}`);
      if (res.data?.address) {
        setForm(prev => ({ ...prev, address: res.data.address }));
        setAutoFilled(true);
      } else {
        setAutoFilled(false);
      }
    } catch {
      setAutoFilled(false); // not found — leave address as is
    } finally {
      setLookingUp(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    setUnsaved(true);
    if (onChange) onChange();

    if (name === 'roverBook') {
      setAutoFilled(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => lookupRoverBook(value), 400);
    }
    // If user manually edits address, clear the auto-filled indicator
    if (name === 'address') setAutoFilled(false);
  };

  const handleClose = (event, reason) => {
    if (unsaved && (reason === 'backdropClick' || reason === 'escapeKeyDown')) {
      setConfirmOpen(true);
    } else if (!unsaved) {
      onClose();
    }
  };

  const handleCancel = () => {
    setConfirmOpen(false);
    setForm(initialForm);
    setUnsaved(false);
    setAutoFilled(false);
    if (onCancelConfirmed) onCancelConfirmed();
    else onClose();
  };

  const handleSubmit = () => {
    onAdd(form);
    setForm(initialForm);
    setUnsaved(false);
    setAutoFilled(false);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Consumer</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField name="pelcoMeterNumber" label="PELCO METER #"  value={form.pelcoMeterNumber} onChange={handleChange} fullWidth />
          <TextField name="accountNumber"    label="ACCOUNT #"      value={form.accountNumber}    onChange={handleChange} fullWidth />
          <TextField name="poleNumber"       label="POLE #"         value={form.poleNumber}        onChange={handleChange} fullWidth />
          <TextField
            name="roverBook"
            label="ROVER BOOK"
            value={form.roverBook}
            onChange={handleChange}
            fullWidth
            InputProps={{
              endAdornment: lookingUp ? (
                <InputAdornment position="end"><CircularProgress size={16} /></InputAdornment>
              ) : null,
            }}
            helperText="Enter a rover number to auto-fill the address"
          />
          <TextField name="accountName" label="ACCOUNT NAME" value={form.accountName} onChange={handleChange} fullWidth />
          <Tooltip
            title={autoFilled ? 'Address auto-filled from Rover Book — you can still edit it' : ''}
            placement="top-start"
          >
            <TextField
              name="address"
              label="ADDRESS"
              value={form.address}
              onChange={handleChange}
              fullWidth
              InputProps={{
                endAdornment: autoFilled ? (
                  <InputAdornment position="end">
                    <AutoFixHighIcon fontSize="small" color="primary" />
                  </InputAdornment>
                ) : null,
              }}
            />
          </Tooltip>
        </Box>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'flex-end', gap: 1 }}>
        <Button onClick={() => { if (unsaved) setConfirmOpen(true); else onClose(); }} variant="outlined" color="secondary">Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" color="primary">Add Consumer</Button>
      </DialogActions>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Confirmation</DialogTitle>
        <DialogContent>Discard changes and close Add Consumer dialog?</DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} color="secondary" variant="outlined">Cancel</Button>
          <Button onClick={handleCancel} color="error" variant="contained">Discard</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
};

export default AddConsumerDialog;