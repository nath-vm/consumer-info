import React from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, IconButton, Checkbox, Box, Button, Typography, Tooltip,
} from '@mui/material';
import EditIcon            from '@mui/icons-material/Edit';
import VisibilityOffIcon   from '@mui/icons-material/VisibilityOff';
import VisibilityIcon      from '@mui/icons-material/Visibility';
import DeleteForeverIcon   from '@mui/icons-material/DeleteForever';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';

// Row height of the bulk toolbar when visible, used to offset the sticky header
const TOOLBAR_HEIGHT = 44; // px — keep in sync with the toolbar py/minHeight below

const AdminConsumerTable = ({
  consumers, page, rowsPerPage,
  onRowClick, onEdit, onHide, onUnhide, onPermanentDelete,
  showHidden,
  selectedIds, onSelectOne, onSelectAll, onBulkHide, onBulkUnhide, onBulkDelete,
  readOnly = false,
}) => {
  const paged        = consumers.slice((page - 1) * rowsPerPage, page * rowsPerPage);
  const pagedIds     = paged.map(c => c._id);
  const allSelected  = pagedIds.length > 0 && pagedIds.every(id => selectedIds.has(id));
  const someSelected = pagedIds.some(id => selectedIds.has(id));
  const selectedCount = selectedIds.size;

  const handleSelectAll = (e) => {
    onSelectAll(pagedIds, e.target.checked);
  };

  // Clear passes an empty Set directly — bypasses the add/remove loop in the
  // parent's handleSelectAll which does nothing when given an empty array.
  const handleClear = () => onSelectAll([], false, /* clearAll */ true);

  // How far from the top the sticky header should sit.
  // When the toolbar is visible it's pinned above the header, so the header
  // needs to be offset by the toolbar height so they don't overlap.
  const headerTop = selectedCount > 0 ? TOOLBAR_HEIGHT : 0;

  return (
    <TableContainer
      component={Paper}
      sx={{
        // overflow must NOT be 'hidden' or 'auto' — that breaks position:sticky.
        // We let the page scroll, exactly like UserConsumerTable does.
        overflow: 'visible',
        maxHeight: 'none',
        borderRadius: '8px',
      }}
    >
      <Table>
        <TableHead>
          {/* ── Bulk action toolbar row — sticky, sits just above the header ── */}
          {selectedCount > 0 && !readOnly && (
            <TableRow
              sx={{
                // Sticky so it scrolls with the header
                position: 'sticky',
                top: 0,
                zIndex: 4, // above the header row (zIndex 3)
                backgroundColor: '#e3f2fd',
                // Suppress default TableRow borders/hover on this meta-row
                '& td, & th': { border: 0 },
              }}
            >
              <TableCell
                colSpan={7}
                sx={{
                  p: 0,
                  border: '1px solid #90caf9',
                  borderBottom: 'none',
                  borderRadius: '8px 8px 0 0',
                }}
              >
                <Box sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5,
                  px: 2, minHeight: TOOLBAR_HEIGHT, flexWrap: 'wrap',
                }}>
                  <Typography variant="body2" fontWeight={600} sx={{ mr: 1 }}>
                    {selectedCount} selected
                  </Typography>
                  {!showHidden ? (
                    <Button
                      size="small" variant="contained" color="warning"
                      startIcon={<VisibilityOffIcon />}
                      onClick={() => onBulkHide(Array.from(selectedIds))}
                    >
                      Hide Selected
                    </Button>
                  ) : (
                    <>
                      <Button
                        size="small" variant="contained" color="success"
                        startIcon={<VisibilityIcon />}
                        onClick={() => onBulkUnhide(Array.from(selectedIds))}
                      >
                        Unhide Selected
                      </Button>
                      <Button
                        size="small" variant="contained" color="error"
                        startIcon={<DeleteForeverIcon />}
                        onClick={() => onBulkDelete(Array.from(selectedIds))}
                      >
                        Delete Selected
                      </Button>
                    </>
                  )}
                  <Button
                    size="small" color="inherit" variant="outlined"
                    sx={{ ml: 'auto' }}
                    onClick={handleClear}
                  >
                    Clear
                  </Button>
                </Box>
              </TableCell>
            </TableRow>
          )}

          {/* ── Column header row — sticky, sits just below the toolbar ── */}
          <TableRow
            sx={{
              '& th': {
                backgroundColor: '#1976d2',
                color: '#fff',
                fontWeight: 'bold',
                // Sticky each cell individually — same pattern as UserConsumerTable
                position: 'sticky',
                top: headerTop,
                zIndex: 3,
              },
            }}
          >
            {!readOnly && (
            <TableCell padding="checkbox" sx={{ width: 48 }}>
              <Tooltip title={allSelected ? 'Deselect page' : 'Select page'}>
                <Checkbox
                  size="small"
                  indeterminate={someSelected && !allSelected}
                  checked={allSelected}
                  onChange={handleSelectAll}
                  sx={{
                    color: '#fff',
                    '&.Mui-checked': { color: '#fff' },
                    '&.MuiCheckbox-indeterminate': { color: '#fff' },
                  }}
                  icon={<CheckBoxOutlineBlankIcon sx={{ color: 'rgba(255,255,255,0.7)' }} />}
                />
              </Tooltip>
            </TableCell>
            )}
            <TableCell sx={{ width: 100 }}>PELCO METER #</TableCell>
            <TableCell sx={{ width: 90 }}>ACCOUNT #</TableCell>
            <TableCell sx={{ width: 70 }}>POLE #</TableCell>
            <TableCell sx={{ width: 300 }}>ACCOUNT NAME</TableCell>
            <TableCell sx={{ width: 180 }}>ADDRESS</TableCell>
            {!readOnly && <TableCell sx={{ width: 140 }}>Actions</TableCell>}
          </TableRow>
        </TableHead>

        <TableBody>
          {paged.map((consumer, idx) => {
            const isSelected = selectedIds.has(consumer._id);
            return (
              <TableRow
                key={consumer._id}
                hover
                selected={isSelected}
                sx={{
                  cursor: 'pointer',
                  backgroundColor: isSelected
                    ? 'rgba(25, 118, 210, 0.08) !important'
                    : idx % 2 === 0 ? '#f5f5f5' : '#fff',
                  transition: 'background-color 0.15s',
                  '&:hover': { backgroundColor: 'rgba(33, 150, 243, 0.12) !important' },
                }}
                onClick={() => onRowClick(consumer)}
              >
                {!readOnly && (
                <TableCell padding="checkbox" onClick={e => { e.stopPropagation(); onSelectOne(consumer._id); }}>
                  <Checkbox
                    size="small"
                    checked={isSelected}
                    onChange={() => {}}
                    color="primary"
                  />
                </TableCell>
                )}
                <TableCell>{consumer.pelcoMeterNumber}</TableCell>
                <TableCell>{consumer.accountNumber}</TableCell>
                <TableCell>{consumer.poleNumber}</TableCell>
                <TableCell>{consumer.accountName}</TableCell>
                <TableCell>{consumer.address}</TableCell>
                {!readOnly && (
                <TableCell onClick={e => e.stopPropagation()}>
                  <IconButton color="primary" size="small" title="Edit" onClick={() => onEdit(consumer)}>
                    <EditIcon />
                  </IconButton>
                  {!showHidden ? (
                    <IconButton color="warning" size="small" title="Hide" onClick={() => onHide(consumer)}>
                      <VisibilityOffIcon />
                    </IconButton>
                  ) : (
                    <>
                      <IconButton color="success" size="small" title="Unhide" onClick={() => onUnhide(consumer)}>
                        <VisibilityIcon />
                      </IconButton>
                      <IconButton color="error" size="small" title="Delete Permanently" onClick={() => onPermanentDelete(consumer)}>
                        <DeleteForeverIcon />
                      </IconButton>
                    </>
                  )}
                </TableCell>
                )}
              </TableRow>
            );
          })}
          {paged.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                No consumers to display.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default AdminConsumerTable;