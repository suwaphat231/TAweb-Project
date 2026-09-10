import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, type AxiosResponse } from 'axios'
import { api } from './api'
import { queryClient } from './queryClient'
import { useAuthStore } from '../store/authStore'
import type { User } from '../types'

const first: User = { id: 1, username: 'first', full_name: 'First', email: 'first@example.com', role: 'student', is_active: true, created_at: '' }
const second: User = { ...first, id: 2, username: 'second' }
const originalAdapter = api.defaults.adapter

beforeEach(() => {
  useAuthStore.getState().logout()
  queryClient.clear()
  useAuthStore.getState().login('first-token', first)
})
afterEach(() => {
  api.defaults.adapter = originalAdapter
  useAuthStore.getState().logout()
})

describe('account isolation', () => {
  it('clears private cached data on logout', () => {
    queryClient.setQueryData(['student-profile'], first)
    useAuthStore.getState().logout()
    expect(queryClient.getQueryData(['student-profile'])).toBeUndefined()
  })

  it('clears private cached data when switching directly to another account', () => {
    queryClient.setQueryData(['my-applications'], [{ id: 1 }])
    useAuthStore.getState().login('second-token', second)
    expect(queryClient.getQueryData(['my-applications'])).toBeUndefined()
  })

  it('keeps cached data when updating the same account profile', () => {
    queryClient.setQueryData(['my-applications'], [{ id: 1 }])
    useAuthStore.getState().setUser({ ...first, full_name: 'Updated' })
    expect(queryClient.getQueryData(['my-applications'])).toEqual([{ id: 1 }])
  })

  it('discards a response that arrives after the account changes', async () => {
    let finish: (() => void) | undefined
    api.defaults.adapter = (config) => new Promise((resolve) => {
      finish = () => resolve({ data: first, status: 200, statusText: 'OK', headers: {}, config })
    })
    const pending = api.get('/student/profile')
    const assertion = expect(pending).rejects.toMatchObject({ code: 'ERR_CANCELED' })
    await vi.waitFor(() => expect(finish).toBeDefined())
    useAuthStore.getState().login('second-token', second)
    finish!()
    await assertion
    expect(useAuthStore.getState().user?.id).toBe(2)
  })

  it('does not log out a new account when an old request returns 401', async () => {
    let finish: (() => void) | undefined
    api.defaults.adapter = (config) => new Promise((_resolve, reject) => {
      finish = () => reject(new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined,
        { status: 401, data: {}, headers: {}, statusText: 'Unauthorized', config } as AxiosResponse))
    })
    const pending = api.get('/student/profile')
    const assertion = expect(pending).rejects.toMatchObject({ code: 'ERR_CANCELED' })
    await vi.waitFor(() => expect(finish).toBeDefined())
    useAuthStore.getState().login('second-token', second)
    finish!()
    await assertion
    expect(useAuthStore.getState().token).toBe('second-token')
  })

  it('clears the current session on an authenticated 401 even on the login page', async () => {
    api.defaults.adapter = async (config) => {
      throw new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined,
        { status: 401, data: {}, headers: {}, statusText: 'Unauthorized', config } as AxiosResponse)
    }
    await expect(api.get('/auth/me')).rejects.toBeInstanceOf(AxiosError)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})
