import React, { useState } from 'react';
import { TextField, Button, Box, MenuItem, Select, InputLabel, FormControl, IconButton } from '@mui/material';
import ClearIcon from '@mui/icons-material/Clear';

const ConsumerSearchBar = ({ onSearch }) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSearch({ query, filter });
  };

  const handleClear = () => {
    setQuery('');
    onSearch({ query: '', filter });
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', gap: 2, mb: 3 }}>
      <FormControl sx={{ minWidth: 140 }}>
        <InputLabel id="filter-label">Filter</InputLabel>
        <Select
          labelId="filter-label"
          value={filter}
          label="Filter"
          onChange={e => setFilter(e.target.value)}
        >
          <MenuItem value="all">All Fields</MenuItem>
          <MenuItem value="pelcoMeterNumber">PELCO METER #</MenuItem>
          <MenuItem value="accountNumber">ACCOUNT #</MenuItem>
          <MenuItem value="poleNumber">POLE #</MenuItem>
          <MenuItem value="accountName">ACCOUNT NAME</MenuItem>
          <MenuItem value="address">ADDRESS</MenuItem>
        </Select>
      </FormControl>
      <Box sx={{ position: 'relative', width: '100%' }}>
        <TextField
          label="Search"
          variant="outlined"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          fullWidth
          sx={{ backgroundColor: '#fff' }}
        />
        {query && (
          <IconButton
            aria-label="clear search"
            onClick={handleClear}
            sx={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#1976d2',
              zIndex: 2,
            }}
          >
            <ClearIcon />
          </IconButton>
        )}
      </Box>
      <Button type="submit" variant="contained">Search</Button>
    </Box>
  );
};

export default ConsumerSearchBar;
