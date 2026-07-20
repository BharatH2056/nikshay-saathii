import axios from 'axios';

const API_BASE_URL = '/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to inject JWT token into header
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token') || 'hw-token';
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});
