import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import type { Profile, WordGame, WordGameMode } from '../../../shared/contracts'
import { AppShell } from '../../widgets/AppShell/AppShell'
import { useAuth } from '../../features/auth/model/AuthContext'
import { useCommunity } from '../../features/community/model/CommunityContext'
import { EndGameDialog } from '../../features/games/explain-word/ui/EndGameDialog/EndGameDialog'
import { GameBoard } from '../../features/games/explain-word/ui/GameBoard/GameBoard'
import { GameFinishedDialog } from '../../features/games/explain-word/ui/GameFinishedDialog/GameFinishedDialog'
import { GameInvitation } from '../../features/games/explain-word/ui/GameInvitation/GameInvitation'
import { GameStartCard } from '../../features/games/explain-word/ui/GameStartCard/GameStartCard'
import { GameTimeSettings } from '../../features/games/explain-word/ui/GameTimeSettings/GameTimeSettings'
import { RoomControlIcon } from '../../features/games/explain-word/ui/RoomControlIcon/RoomControlIcon'
import { RulesDialog } from '../../features/games/explain-word/ui/RulesDialog/RulesDialog'
import { Scoreboard } from '../../features/games/explain-word/ui/Scoreboard/Scoreboard'
import { formatDuration } from '../../features/games/explain-word/lib/game-time'
import { api, ApiError } from '../../shared/api/api'
import { supabase } from '../../shared/api/supabase'
import { messageFromError } from '../../shared/lib/errors'
import { Notice } from '../../shared/ui/Panel/Panel'

export function ExplainWordGamePage() {
  const { partnershipId = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { session } = useAuth()
  const { sessions } = useCommunity()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [game, setGame] = useState<WordGame | null>(null)
  const [finishedGame, setFinishedGame] = useState<WordGame | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [showEndConfirmation, setShowEndConfirmation] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null)
  const pendingGame = useRef<{ partnershipId: string; id: string } | null>(null)
  const lastGameSetting = useRef<{ gameId: string; seconds: number } | null>(null)
  const gameLoadVersion = useRef(0)
  const gameMutationInFlight = useRef(false)

  const receiveGame = useCallback(
    (nextGame: WordGame | null) => {
      const pendingId =
        pendingGame.current?.partnershipId === partnershipId ? pendingGame.current.id : null

      if (pendingId && (!nextGame || nextGame.id !== pendingId)) {
        pendingGame.current = null
        setFinishedGame(null)
        setGame(null)
        navigate('/', { replace: true })
        return
      }

      if (nextGame?.status === 'pending') {
        pendingGame.current = { partnershipId, id: nextGame.id }
      } else if (pendingId && nextGame?.id === pendingId) {
        pendingGame.current = null
      }

      if (nextGame?.status === 'finished') {
        setFinishedGame(nextGame)
        setGame((current) =>
          current?.id === nextGame.id && current.status !== 'finished' ? current : nextGame,
        )
        return
      }
      setFinishedGame(null)
      setGame(nextGame)
    },
    [navigate, partnershipId],
  )

  const loadGame = useCallback(
    async (quiet = false) => {
      if (!partnershipId || gameMutationInFlight.current) return
      const loadVersion = ++gameLoadVersion.current
      try {
        const response = await api.getWordGame(partnershipId)
        if (loadVersion !== gameLoadVersion.current) return
        receiveGame(response.data)
        if (!quiet) setError(null)
      } catch (loadError) {
        if (loadVersion !== gameLoadVersion.current) return
        if (loadError instanceof ApiError && loadError.code === 'word_game_not_found') {
          receiveGame(null)
          if (!quiet) setError(null)
        } else if (!quiet) {
          setError(messageFromError(loadError))
        }
      }
    },
    [partnershipId, receiveGame],
  )

  useEffect(() => {
    let active = true
    const initialGame = api.getWordGame(partnershipId).catch((loadError: unknown) => {
      if (loadError instanceof ApiError && loadError.code === 'word_game_not_found') return null
      throw loadError
    })
    void Promise.all([api.getProfile(), initialGame])
      .then(([profileResponse, gameResponse]) => {
        if (!active) return
        setProfile(profileResponse.data)
        receiveGame(gameResponse?.data ?? null)
        setError(null)
      })
      .catch((loadError) => {
        if (active) setError(messageFromError(loadError))
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [partnershipId, receiveGame])

  const completedGame =
    finishedGame?.id === game?.id ? finishedGame : game?.status === 'finished' ? game : null
  const sessionGameId = completedGame?.id ?? game?.id
  const sessionStatus = completedGame?.status ?? game?.status
  const hasOtherOngoingGame = sessions.some(
    (item) =>
      (item.status === 'active' || item.status === 'paused') &&
      (item.gameId !== 'explain-word' || item.partnershipId !== partnershipId),
  )
  const wantsNewGame = searchParams.get('new') === '1'
  const showModeSelection = !game || (wantsNewGame && game.status === 'finished')
  const isRoom = Boolean(game && !showModeSelection)

  useEffect(() => {
    if (wantsNewGame && game && game.status !== 'finished') {
      setSearchParams({}, { replace: true })
    }
  }, [game, setSearchParams, wantsNewGame])

  useEffect(() => {
    if (sessionStatus === 'active' || sessionStatus === 'paused' || sessionStatus === 'finished') {
      return
    }
    const timer = setInterval(() => void loadGame(true), 3000)
    return () => clearInterval(timer)
  }, [loadGame, sessionStatus])

  useEffect(() => {
    if (!sessionGameId || (sessionStatus !== 'active' && sessionStatus !== 'paused')) return
    let active = true
    const heartbeat = () => {
      void api
        .heartbeatWordGame(partnershipId)
        .then((response) => {
          if (active) receiveGame(response.data)
        })
        .catch(() => undefined)
    }
    const leave = () => {
      void api.leaveWordGame(partnershipId).catch(() => undefined)
    }
    heartbeat()
    const timer = setInterval(heartbeat, 4000)
    window.addEventListener('pagehide', leave)
    return () => {
      active = false
      clearInterval(timer)
      window.removeEventListener('pagehide', leave)
    }
  }, [partnershipId, receiveGame, sessionGameId, sessionStatus])

  useEffect(() => {
    if (!sessionGameId || (sessionStatus !== 'active' && sessionStatus !== 'paused')) return
    let active = true
    const channel = supabase
      .channel(`word-game:${sessionGameId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'word_games',
          filter: `id=eq.${sessionGameId}`,
        },
        () => {
          if (active) void loadGame(true)
        },
      )
      .subscribe()

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [loadGame, sessionGameId, sessionStatus])

  useEffect(() => {
    if (!game) {
      lastGameSetting.current = null
      return
    }
    const previous = lastGameSetting.current
    if (previous?.gameId === game.id && previous.seconds !== game.explanationDurationSeconds) {
      setSettingsNotice(
        `Explanation time changed to ${formatDuration(game.explanationDurationSeconds)}. It will apply from the next round.`,
      )
    }
    lastGameSetting.current = { gameId: game.id, seconds: game.explanationDurationSeconds }
  }, [game])

  async function run(action: () => Promise<{ data: WordGame } | void>) {
    if (isBusy) return false
    gameMutationInFlight.current = true
    gameLoadVersion.current += 1
    setIsBusy(true)
    setError(null)
    try {
      const response = await action()
      receiveGame(response?.data ?? null)
      return true
    } catch (actionError) {
      setError(messageFromError(actionError))
      return false
    } finally {
      gameMutationInFlight.current = false
      setIsBusy(false)
    }
  }

  async function startGame(mode: WordGameMode, explanationDurationSeconds: number) {
    if (await run(() => api.startWordGame(partnershipId, mode, explanationDurationSeconds))) {
      setSearchParams({}, { replace: true })
    }
  }

  async function endGame() {
    if (isBusy) return
    setIsBusy(true)
    setError(null)
    try {
      await api.endWordGame(partnershipId)
      navigate('/', { replace: true })
    } catch (actionError) {
      setError(messageFromError(actionError))
      setShowEndConfirmation(false)
      setIsBusy(false)
    }
  }

  async function closeGameInvitation(action: () => Promise<void>) {
    if (isBusy) return
    setIsBusy(true)
    setError(null)
    try {
      await action()
      navigate('/', { replace: true })
    } catch (actionError) {
      setError(messageFromError(actionError))
      setIsBusy(false)
    }
  }

  if (isLoading || !session) {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-100">
        <p className="text-stone-600">Opening the game…</p>
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-100 px-5">
        <div className="max-w-md rounded-3xl border border-stone-200 bg-white p-7 text-center shadow-sm">
          <h1 className="font-serif text-2xl font-semibold">We could not open this game</h1>
          <p className="mt-3 text-stone-600">{error ?? 'Please try again in a moment.'}</p>
          <Link className="button button-primary mt-6" to="/">
            Return to games
          </Link>
        </div>
      </main>
    )
  }

  return (
    <AppShell
      profile={profile}
      variant={isRoom ? 'room' : 'default'}
      onNavigate={() => {
        if (game?.status === 'active' || game?.status === 'paused') {
          void api.leaveWordGame(partnershipId).catch(() => undefined)
        }
      }}
    >
      <header
        className={`game-page-header ${game && game.status !== 'pending' ? 'is-active' : ''} ${isRoom ? 'is-room' : ''}`}
      >
        <div className="game-page-heading">
          <Link
            className="game-back-link"
            to="/"
            aria-label="Lobby"
            title="Return to lobby"
            onClick={() => {
              if (game?.status === 'active' || game?.status === 'paused') {
                void api.leaveWordGame(partnershipId).catch(() => undefined)
              }
            }}
          >
            <RoomControlIcon icon="leave" />
          </Link>
          {isRoom ? (
            <h1 className="sr-only">Explain the word</h1>
          ) : (
            <div className="game-title-row">
              <div>
                <h1>Explain the word</h1>
              </div>
            </div>
          )}
        </div>
        <div className="game-header-tools">
          {game && game.status !== 'pending' && !showModeSelection ? (
            <Scoreboard game={game} />
          ) : null}
          {game && !showModeSelection && game.status !== 'finished' ? (
            <GameTimeSettings
              key={`${game.id}:${game.explanationDurationSeconds}`}
              disabled={isBusy}
              game={game}
              isCreator={game.requestedById === session.user.id}
              onSave={(seconds) => run(() => api.updateWordGameSettings(partnershipId, seconds))}
            />
          ) : null}
          <button
            type="button"
            className="game-icon-button"
            aria-label="How to play"
            title="How to play"
            onClick={() => setShowRules(true)}
          >
            i
          </button>
          {game && !showModeSelection && game.status !== 'pending' && game.status !== 'finished' ? (
            <button
              type="button"
              className="game-end-control"
              aria-label={isBusy ? 'Ending game' : 'End game'}
              title="End game"
              disabled={isBusy}
              onClick={() => setShowEndConfirmation(true)}
            >
              <RoomControlIcon icon="finish" />
            </button>
          ) : game?.status === 'finished' && !showModeSelection ? (
            <button
              type="button"
              className="button button-primary"
              disabled={isBusy}
              onClick={() => setSearchParams({ new: '1' })}
            >
              New game
            </button>
          ) : null}
        </div>
      </header>

      {error ? <Notice error message={error} onClose={() => setError(null)} /> : null}
      {settingsNotice ? (
        <Notice message={settingsNotice} onClose={() => setSettingsNotice(null)} />
      ) : null}

      {showModeSelection ? (
        <GameStartCard disabled={isBusy} blocked={hasOtherOngoingGame} onStart={startGame} />
      ) : game.status === 'pending' ? (
        <GameInvitation
          game={game}
          userId={session.user.id}
          disabled={isBusy}
          acceptBlocked={hasOtherOngoingGame}
          onAccept={() => run(() => api.acceptWordGame(partnershipId))}
          onCancel={() => closeGameInvitation(() => api.cancelWordGame(partnershipId))}
          onDecline={() => closeGameInvitation(() => api.declineWordGame(partnershipId))}
        />
      ) : (
        <GameBoard
          game={game}
          userId={session.user.id}
          partnershipId={partnershipId}
          isBusy={isBusy}
          completionPending={Boolean(completedGame)}
          run={run}
        />
      )}
      {showRules ? <RulesDialog onClose={() => setShowRules(false)} /> : null}
      {showEndConfirmation ? (
        <EndGameDialog
          isBusy={isBusy}
          onCancel={() => setShowEndConfirmation(false)}
          onConfirm={() => void endGame()}
        />
      ) : null}
      {completedGame && !showModeSelection ? (
        <GameFinishedDialog
          game={completedGame}
          onHome={() => navigate('/', { replace: true })}
          onViewResults={() =>
            navigate(`/?view=history&highlight=${encodeURIComponent(completedGame.id)}`, {
              replace: true,
            })
          }
        />
      ) : null}
    </AppShell>
  )
}
