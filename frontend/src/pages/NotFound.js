import React from 'react';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';

const NotFound = () => (
  <Container>
    <Typography variant="h4" color="error" gutterBottom>
      404 - Page Not Found
    </Typography>
    <Typography>
      The page you are looking for does not exist.
    </Typography>
  </Container>
);

export default NotFound;
