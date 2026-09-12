import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { api } from '../lib/api'
import { games } from '../lib/games'
import { supabase } from '../lib/supabase'
import {
  CommunityContext,
  type CommunityData,
  type GameHistoryItem,
  type GameSession,
} from './CommunityContext'
import type { Partnership, PartnershipCursor } from '../../shared/contracts'

export function CommunityProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [data, setData] = useState<Omit<CommunityData, 'refresh'>>({
    partnerships: [],
    sessions: [],
    history: [],
    isLoading: true,
    error: null,
  })
  const generation = useRef(0)
  const refresh = useCallback(async () => {
    const request = ++generation.current
    try {
      const [partnerships, sessions, history] = await Promise.all([
        (async () => {
          const items: Partnership[] = []
          let cursor: PartnershipCursor | undefined
          do {
            const response = await api.getPartnerships(cursor)
            items.push(...response.data)
            cursor = response.nextCursor ?? undefined
          } while (cursor)
          return [...new Map(items.map((item) => [item.id, item])).values()]
        })(),
        Promise.all(
          games.map(async (game) =>
            (await game.loadSessions()).map((item) => ({ ...item, gameId: game.id })),
          ),
        ).then((items) => items.flat() as GameSession[]),
        Promise.all(
          games.map(async (game) =>
            (await game.loadHistory()).map((item) => ({ ...item, gameId: game.id })),
          ),
        ).then((items) =>
          (items.flat() as GameHistoryItem[]).sort(
            (left, right) => Date.parse(right.finishedAt) - Date.parse(left.finishedAt),
          ),
        ),
      ])
      if (request !== generation.current) return false
      setData({ partnerships, sessions, history, isLoading: false, error: null })
      return true
    } catch (error) {
      if (request === generation.current)
        setData((current) => ({
          ...current,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Could not refresh your activity.',
        }))
      return false
    }
  }, [])
  const invalidate = useCallback(() => {
    generation.current += 1
  }, [])
  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (active) void refresh()
    })
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        if (active) void refresh()
      }, 150)
    }
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') schedule()
    }, 3000)
    const channel = supabase
      .channel(`community:${session?.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partnerships' }, schedule)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') schedule()
      })
    window.addEventListener('focus', schedule)
    return () => {
      active = false
      invalidate()
      clearInterval(interval)
      clearTimeout(timer)
      window.removeEventListener('focus', schedule)
      void supabase.removeChannel(channel)
    }
  }, [invalidate, refresh, session?.user.id])
  return (
    <CommunityContext.Provider value={{ ...data, refresh }}>{children}</CommunityContext.Provider>
  )
}
