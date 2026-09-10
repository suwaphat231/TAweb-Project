import { vi } from 'vitest'

const values = new Map<string, string>()
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
}
vi.stubGlobal('localStorage', storage)
vi.stubGlobal('window', { localStorage: storage, location: { pathname: '/login', href: '/login' } })
