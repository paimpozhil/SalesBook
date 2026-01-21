import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from '../services/api';

const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      tenant: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: true,

      // Set auth data after login/register
      setAuth: (data) => {
        set({
          user: data.user,
          tenant: data.tenant,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          isAuthenticated: true,
          isLoading: false,
        });
        // Set token in API client
        api.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`;
      },

      // Clear auth data on logout
      clearAuth: () => {
        set({
          user: null,
          tenant: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
          isLoading: false,
        });
        delete api.defaults.headers.common['Authorization'];
      },

      // Login
      login: async (email, password) => {
        const response = await api.post('/auth/login', { email, password });
        get().setAuth(response.data.data);
        return response.data.data;
      },

      // Register
      register: async (data) => {
        const response = await api.post('/auth/register', data);
        get().setAuth(response.data.data);
        return response.data.data;
      },

      // Logout
      logout: async () => {
        try {
          const refreshToken = get().refreshToken;
          if (refreshToken) {
            await api.post('/auth/logout', { refreshToken });
          }
        } catch (error) {
          // Ignore errors during logout
        }
        get().clearAuth();
      },

      // Refresh token
      refreshAccessToken: async () => {
        const refreshToken = get().refreshToken;
        if (!refreshToken) {
          get().clearAuth();
          return null;
        }

        try {
          const response = await api.post('/auth/refresh', { refreshToken });
          const data = response.data.data;
          set({
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
          });
          api.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`;
          return data.accessToken;
        } catch (error) {
          get().clearAuth();
          return null;
        }
      },

      // Initialize auth state (check if token is valid)
      initAuth: async () => {
        const accessToken = get().accessToken;
        if (!accessToken) {
          set({ isLoading: false });
          return;
        }

        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

        try {
          const response = await api.get('/auth/me');
          set({
            user: response.data.data,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          // Try to refresh token
          const newToken = await get().refreshAccessToken();
          if (!newToken) {
            set({ isLoading: false });
          } else {
            // Retry getting user
            try {
              const response = await api.get('/auth/me');
              set({
                user: response.data.data,
                isAuthenticated: true,
                isLoading: false,
              });
            } catch (err) {
              get().clearAuth();
            }
          }
        }
      },

      // Check if user has a specific role
      hasRole: (role) => {
        const user = get().user;
        if (!user) return false;

        const roleHierarchy = {
          SUPER_ADMIN: 4,
          TENANT_ADMIN: 3,
          MANAGER: 2,
          SALES_REP: 1,
        };

        return (roleHierarchy[user.role] || 0) >= (roleHierarchy[role] || 0);
      },

      // Check if user is super admin
      isSuperAdmin: () => get().user?.role === 'SUPER_ADMIN',
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

export default useAuthStore;
