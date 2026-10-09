import axios from 'axios';
import API_BASE_URL from './config';

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

api.interceptors.request.use(config => {
  if (config.url?.includes('/check-auth')) {
    config.params = { ...config.params, _t: Date.now() };
  }
  return config;
});

let isRefreshing = false;
let failedQueue  = [];

const processQueue = (error) => {
  failedQueue.forEach(p => error ? p.reject(error) : p.resolve());
  failedQueue = [];
};

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config;
    const status   = err.response?.status;
    const code     = err.response?.data?.code;

    if (status === 403 && code === 'ACCESS_DISABLED') {
      window.location.href = '/';
      return Promise.reject(err);
    }

    // The server answers 401 with one of these codes when the 15-minute access token is missing,
    // expired or invalid. In every case the right move is one silent refresh attempt using the
    // long-lived refresh cookie. (The refresh call itself is excluded so it can never loop.)
    const REFRESHABLE = ['TOKEN_EXPIRED', 'NO_TOKEN', 'INVALID_TOKEN'];
    const isRefreshCall = original?.url?.endsWith('/api/auth/refresh');
    if (status === 401 && REFRESHABLE.includes(code) && !original._retry && !isRefreshCall) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => api(original)).catch(e => Promise.reject(e));
      }

      original._retry = true;
      isRefreshing    = true;

      try {
        await api.post('/api/auth/refresh');
        processQueue(null);
        return api(original);
      } catch (refreshErr) {
        processQueue(refreshErr);
        window.location.href = '/';
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(err);
  }
);

export default api;
