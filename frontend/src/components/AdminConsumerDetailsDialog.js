import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Typography, Box, Button } from '@mui/material';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';


const AdminConsumerDetailsDialog = ({ open, consumer, onClose, onEdit, onHide, onUnhide, onPermanentDelete, showHidden }) => (
  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle>Consumer Details</DialogTitle>
    <DialogContent>
      {consumer && (
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 400, mx: 'auto' }}>
          {/* <Typography align="center"><b>S/N:</b> {consumer.sn}</Typography> */}
          <Typography align="center"><b>PELCO METER #:</b> {consumer.pelcoMeterNumber}</Typography>
          <Typography align="center"><b>ACCOUNT #:</b> {consumer.accountNumber}</Typography>
          <Typography align="center"><b>POLE #:</b> {consumer.poleNumber}</Typography>
          {/* <Typography align="center"><b>PELCO SQ.:</b> {consumer.pelcoSq}</Typography> */}
          {/* <Typography align="center"><b>ROVER BOOK:</b> {consumer.roverBook}</Typography> */}
          <Typography align="center"><b>ACCOUNT NAME:</b> {consumer.accountName}</Typography>
          {/* <Typography align="center"><b>S:</b> {consumer.status}</Typography> */}
          <Typography align="center"><b>ADDRESS:</b> {consumer.address}</Typography>
        </Box>
      )}
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} color="primary" variant="contained">Close</Button>
      <Button onClick={() => { onClose(); onEdit(consumer); }} color="info" variant="contained">Edit</Button>
      {!showHidden ? (
        <Button onClick={() => { onClose(); onHide(consumer); }} color="warning" variant="contained" startIcon={<VisibilityOffIcon />}>Hide</Button>
      ) : (
        <>
          <Button onClick={() => { onClose(); onUnhide(consumer); }} color="success" variant="contained" startIcon={<VisibilityIcon />}>Unhide</Button>
          <Button onClick={() => { onClose(); onPermanentDelete(consumer); }} color="error" variant="contained" startIcon={<DeleteForeverIcon />} sx={{ minWidth: 100 }}>Delete</Button>
        </>
      )}
    </DialogActions>
  </Dialog>
);

export default AdminConsumerDetailsDialog;
