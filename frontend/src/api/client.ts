import axios from 'axios';

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000';

export const WS_BASE_URL =
  (import.meta.env.VITE_WS_BASE_URL as string | undefined) ??
  API_BASE_URL.replace(/^http/, 'ws');

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Surface FastAPI's `detail` field as the Error message so callers see the
// real backend reason (e.g. "Execution not authorized: ...") instead of the
// generic "Request failed with status code 403".
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const detail = error?.response?.data?.detail;
    if (typeof detail === 'string' && detail.length > 0) {
      error.message = detail;
    } else if (Array.isArray(detail) && detail.length > 0) {
      error.message = detail.map((d) => d?.msg ?? String(d)).join('; ');
    }
    console.error('API Error:', error.message);
    return Promise.reject(error);
  }
);