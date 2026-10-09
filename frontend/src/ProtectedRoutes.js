import { useEffect, useState, useRef } from 'react';
import api from './api';

let authCache = null;
const AUTH_CACHE_TTL = 60_000;

function isCacheFresh() {
  return authCache && Date.now() - authCache.timestamp < AUTH_CACHE_TTL;
}

function invalidateCache() {
  authCache = null;
}

export async function logout() {
  try {
    await api.post('/api/auth/logout');
  } catch {
    // ignore
  } finally {
    invalidateCache();
    window.location.href = '/';
  }
}

export function useAuthCheck() {
  const [state, setState] = useState({ loading: true, authenticated: false, role: null });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    async function checkAuth() {
      if (isCacheFresh()) {
        if (mounted.current) setState({ loading: false, authenticated: authCache.authenticated, role: authCache.role });
        return;
      }

      try {
        const res = await api.get('/api/auth/check-auth', { timeout: 10_000 });
        const { authenticated, role } = res.data;

        if (authenticated) {
          authCache = { authenticated, role: role ?? null, timestamp: Date.now() };
        } else {
          invalidateCache();
        }

        if (mounted.current) setState({ loading: false, authenticated, role: role ?? null });
      } catch {
        if (mounted.current) setState({ loading: false, authenticated: false, role: null });
      }
    }

    checkAuth();
    return () => { mounted.current = false; };
  }, []);

  return state;
}
