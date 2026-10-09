import React, { useState, useEffect } from 'react';
import Fab from '@mui/material/Fab';
import Tooltip from '@mui/material/Tooltip';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';

/**
 * Floating "Back to Top" FAB — appears after scrolling 300px down.
 * Drop this into any page, no props needed.
 */
const ScrollToTop = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <Tooltip title="Back to top" placement="left">
      <Fab
        size="small"
        color="primary"
        aria-label="back to top"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 1200,
          opacity: 0.85,
          '&:hover': { opacity: 1 },
        }}
      >
        <KeyboardArrowUpIcon />
      </Fab>
    </Tooltip>
  );
};

export default ScrollToTop;
