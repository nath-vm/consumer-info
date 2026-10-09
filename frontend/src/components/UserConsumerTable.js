import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography, Pagination, Box } from '@mui/material';

const ConsumerResults = ({ consumers, onEntryClick }) => {
  const [page, setPage] = useState(1);
  const rowsPerPage = 50;
  if (!consumers) return null;
  if (consumers.length === 0) return <Typography>No results found.</Typography>;
  if (consumers.length === 1) {
    const consumer = consumers[0];
    return (
      <Paper sx={{ p: 2, mt: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 400, mx: 'auto', cursor: onEntryClick ? 'pointer' : 'default' }}
        onClick={onEntryClick ? () => onEntryClick(consumer) : undefined}
      >
        <Typography variant="h6" align="center">Consumer Details</Typography>
        {/* <Typography align="center"><b>S/N:</b> {consumer.sn}</Typography> */}
        <Typography align="center"><b>PELCO METER #:</b> {consumer.pelcoMeterNumber}</Typography>
        <Typography align="center"><b>ACCOUNT #:</b> {consumer.accountNumber}</Typography>
        <Typography align="center"><b>POLE #:</b> {consumer.poleNumber}</Typography>
        {/* <Typography align="center"><b>PELCO SQ.:</b> {consumer.pelcoSq}</Typography> */}
        {/* <Typography align="center"><b>ROVER BOOK:</b> {consumer.roverBook}</Typography> */}
        <Typography align="center"><b>ACCOUNT NAME:</b> {consumer.accountName}</Typography>
        {/* <Typography align="center"><b>S:</b> {consumer.status}</Typography> */}
        <Typography align="center"><b>ADDRESS:</b> {consumer.address}</Typography>
      </Paper>
    );
  }
  const paged = consumers.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  return (
    <>
      <TableContainer component={Paper} sx={{ mt: 2, maxHeight: 'none', overflow: 'visible' }}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: '#1976d2' }}>
              {/* <TableCell sx={{ width: 80, color: '#fff', fontWeight: 'bold', position: 'sticky', top: 0, backgroundColor: '#1976d2', zIndex: 2 }}>S/N</TableCell> */}
              <TableCell sx={{ width: 100, color: '#fff', fontWeight: 'bold', position: 'sticky', top: 0, backgroundColor: '#1976d2', zIndex: 2 }}>PELCO METER #</TableCell>
              <TableCell sx={{ width: 90, color: '#fff', fontWeight: 'bold', position: 'sticky', top: 0, backgroundColor: '#1976d2', zIndex: 2 }}>ACCOUNT #</TableCell>
              <TableCell sx={{ width: 70, color: '#fff', fontWeight: 'bold', position: 'sticky', top: 0, backgroundColor: '#1976d2', zIndex: 2 }}>POLE #</TableCell>
              {/* <TableCell sx={{ width: 100, color: '#fff', fontWeight: 'bold', position: 'sticky', top: 0, backgroundColor: '#1976d2', zIndex: 2 }}>PELCO SQ.</TableCell> */}
              {/* <TableCell sx={{ width: 120, color: '#fff', fontWeight: 'bold', position: 'sticky', top: 0, backgroundColor: '#1976d2', zIndex: 2 }}>ROVER BOOK</TableCell> */}
              <TableCell sx={{ width: 300, color: '#fff', fontWeight: 'bold', position: 'sticky', top: 0, backgroundColor: '#1976d2', zIndex: 2 }}>ACCOUNT NAME</TableCell>
              {/* <TableCell sx={{ width: 50, color: '#fff', fontWeight: 'bold', position: 'sticky', top: 0, backgroundColor: '#1976d2', zIndex: 2 }}>S</TableCell> */}
              <TableCell sx={{ width: 180, color: '#fff', fontWeight: 'bold', position: 'sticky', top: 0, backgroundColor: '#1976d2', zIndex: 2 }}>ADDRESS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.map((consumer, idx) => (
              <TableRow
                key={consumer._id}
                hover
                sx={{
                  cursor: onEntryClick ? 'pointer' : 'default',
                  backgroundColor: idx % 2 === 0 ? '#f5f5f5' : '#fff',
                  transition: 'background-color 0.2s',
                  '&:hover': {
                    backgroundColor: 'rgba(33, 150, 243, 0.18) !important'
                  }
                }}
                onClick={onEntryClick ? () => onEntryClick(consumer) : undefined}
              >
                {/* <TableCell sx={{ width: 80 }}>{consumer.sn}</TableCell> */}
                <TableCell sx={{ width: 90 }}>{consumer.pelcoMeterNumber}</TableCell>
                <TableCell sx={{ width: 90 }}>{consumer.accountNumber}</TableCell>
                <TableCell sx={{ width: 70 }}>{consumer.poleNumber}</TableCell>
                {/* <TableCell sx={{ width: 100 }}>{consumer.pelcoSq}</TableCell> */}
                {/* <TableCell sx={{ width: 120 }}>{consumer.roverBook}</TableCell> */}
                <TableCell sx={{ width: 300 }}>{consumer.accountName}</TableCell>
                {/* <TableCell sx={{ width: 50 }}>{consumer.status}</TableCell> */}
                <TableCell sx={{ width: 180 }}>{consumer.address}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {consumers.length > rowsPerPage && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Pagination
            count={Math.ceil(consumers.length / rowsPerPage)}
            page={page}
            onChange={(_, value) => { setPage(value); }}
            color="primary"
            showFirstButton
            showLastButton
          />
        </Box>
      )}
    </>
  );
};

export default ConsumerResults;
