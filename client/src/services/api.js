import axios from 'axios';
import toast from 'react-hot-toast';

// Create axios instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 errors (unauthorized)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Try to refresh token
      const authStore = (await import('../store/authStore')).default;
      const refreshToken = authStore.getState().refreshToken;

      if (refreshToken) {
        try {
          const response = await axios.post('/api/v1/auth/refresh', {
            refreshToken,
          });

          const { accessToken, refreshToken: newRefreshToken } = response.data.data;

          authStore.getState().setAuth({
            ...authStore.getState(),
            accessToken,
            refreshToken: newRefreshToken,
          });

          originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          authStore.getState().clearAuth();
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      } else {
        authStore.getState().clearAuth();
        window.location.href = '/login';
      }
    }

    // Handle other errors
    const message = error.response?.data?.error?.message || error.message || 'An error occurred';

    // Don't show toast for 401 (handled above) or canceled requests
    if (error.response?.status !== 401 && !axios.isCancel(error)) {
      toast.error(message);
    }

    return Promise.reject(error);
  }
);

export default api;
