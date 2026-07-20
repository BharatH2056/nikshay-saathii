import { create } from 'zustand';
import { apiClient } from '../api/client';

interface User {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  region: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  setRole: (role: 'hw' | 'admin') => Promise<void>;
}

const DEFAULT_USERS = {
  hw: {
    id: '11111111-1111-1111-1111-111111111111',
    fullName: 'Anjali CHW',
    email: 'anjali@asha.in',
    phone: '+919876543210',
    role: 'hw',
    region: 'Rural Karnataka (Zone A)'
  },
  admin: {
    id: '22222222-2222-2222-2222-222222222222',
    fullName: 'Dr. Mehta DTO',
    email: 'mehta@dots.in',
    phone: '+919876543211',
    role: 'admin',
    region: 'Karnataka District Office'
  }
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: DEFAULT_USERS.hw,
  token: localStorage.getItem('token') || 'hw-token',
  loading: false,
  error: null,

  login: async () => {
    return true;
  },

  logout: () => {
    localStorage.setItem('token', 'hw-token');
    set({ user: DEFAULT_USERS.hw, token: 'hw-token', error: null });
  },

  setRole: async (role: 'hw' | 'admin') => {
    set({ loading: true });
    const token = role === 'admin' ? 'admin-token' : 'hw-token';
    localStorage.setItem('token', token);
    set({ token });
    await get().checkAuth();
  },

  checkAuth: async () => {
    const token = localStorage.getItem('token') || 'hw-token';
    localStorage.setItem('token', token);

    try {
      const response = await apiClient.get('/auth/me');
      set({ user: response.data.user, token, loading: false });
    } catch (err) {
      const fallbackUser = token === 'admin-token' ? DEFAULT_USERS.admin : DEFAULT_USERS.hw;
      set({ user: fallbackUser, token, loading: false });
    }
  }
}));
