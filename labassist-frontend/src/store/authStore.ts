import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types'
import { authApi } from '../services/api'

interface AuthStore {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (token: string, user: User) => void
  loginWithCredentials: (username: string, password: string) => Promise<void>
  loginWithGoogle: (credential: string) => Promise<{ isNewUser: boolean }>
  logout: () => void
  setUser: (user: User) => void
  hydrateFromStorage: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: (token, user) => set({ token, user, isAuthenticated: true }),

      loginWithCredentials: async (username, password) => {
        const { token, user } = await authApi.login({ username, password })
        set({ token, user, isAuthenticated: true })
      },

      loginWithGoogle: async (credential) => {
        const res = await authApi.google({ credential })
        set({ token: res.token, user: res.user, isAuthenticated: true })
        return { isNewUser: res.is_new_user ?? false }
      },

      logout: () => set({ token: null, user: null, isAuthenticated: false }),

      setUser: (user) => set({ user }),

      hydrateFromStorage: () => {
        const { token, user } = get()
        if (token && user) set({ isAuthenticated: true })
      },
    }),
    {
      name: 'labassist_auth',
      partialize: (state) => ({ token: state.token, user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
)
