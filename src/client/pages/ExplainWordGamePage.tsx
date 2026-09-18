import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import type { Profile, WordGame, WordGameMode } from '../../shared/contracts'
import { useAuth } from '../auth/AuthContext'
import { useCommunity } from '../community/CommunityContext'
import { AppShell } from '../components/AppShell'
import { AudioPlayer } from '../components/AudioPlayer'
import { RoundsTable } from '../components/RoundsTable'
import { Notice } from '../components/Panel'
import { api, ApiError } from '../lib/api'
import { supabase } from '../lib/supabase'
import { WORD_GAME_MODES, wordGameModeLabel } from '../lib/word-game-mode'

const TOPICS = ['Everyday life', 'Food', 'Travel', 'Nature', 'Work and study', 'Technology']
const LIVE_PREPARATION_MS = 5_000
const LIVE_FINAL_GUESS_MS = 30_000
const RECORDED_GUESS_MS = 90_000
const DEFAULT_EXPLANATION_SECONDS = 60
const EXPLANATION_PRESETS = [60, 120, 180, 240, 300]

export function ExplainWordGamePage() {
  const { partnershipId = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { session } = useAuth()
  const { sessions } = useCommunity()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [game, setGame] = useState<WordGame | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [showEndConfirmation, setShowEndConfirmation] = useState(false)
  const [showFinishedChoice, setShowFinishedChoice] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null)
  const joinedActiveSession = useRef(false)
  const pendingRequestSeen = useRef(false)
  const lastGameSetting = useRef<{ gameId: string; seconds: number } | null>(null)

  const loadGame = useCallback(
    async (quiet = false) => {
      if (!partnershipId) return
      try {
        const response = await api.getWordGame(partnershipId)
        setGame(response.data)
        if (!quiet) setError(null)
      } catch (loadError) {
        if (loadError instanceof ApiError && loadError.code === 'word_game_not_found') {
          setGame(null)
          if (!quiet) setError(null)
        } else if (!quiet) {
          setError(messageFromError(loadError))
        }
      }
    },
    [partnershipId],
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
        setGame(gameResponse?.data ?? null)
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
  }, [partnershipId])

  const sessionGameId = game?.id
  const sessionStatus = game?.status
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
          if (active) setGame(response.data)
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
  }, [partnershipId, sessionGameId, sessionStatus])

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
    if (sessionStatus === 'active' || sessionStatus === 'paused') {
      joinedActiveSession.current = true
    } else if (sessionStatus === 'finished' && joinedActiveSession.current) {
      joinedActiveSession.current = false
      setShowFinishedChoice(true)
    }
  }, [sessionStatus])

  useEffect(() => {
    if (sessionStatus === 'pending') {
      pendingRequestSeen.current = true
    } else if (!game && pendingRequestSeen.current) {
      navigate('/', { replace: true })
    }
  }, [game, navigate, sessionStatus])

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
    setIsBusy(true)
    setError(null)
    try {
      const response = await action()
      setGame(response?.data ?? null)
      return true
    } catch (actionError) {
      setError(messageFromError(actionError))
      return false
    } finally {
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
          <div className="game-title-row">
            <div>
              <h1>Explain the word</h1>
            </div>
          </div>
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
      {showFinishedChoice && game?.status === 'finished' ? (
        <GameFinishedDialog
          game={game}
          onHome={() => navigate('/', { replace: true })}
          onViewResults={() => setShowFinishedChoice(false)}
        />
      ) : null}
    </AppShell>
  )
}

function GameBoard({
  game,
  userId,
  partnershipId,
  isBusy,
  run,
}: {
  game: WordGame
  userId: string
  partnershipId: string
  isBusy: boolean
  run: (action: () => Promise<{ data: WordGame } | void>) => Promise<boolean>
}) {
  const round = game.round
  const openRound = round?.status === 'explaining' || round?.status === 'awaiting_guess'
  const needsGuessReview = round?.status === 'awaiting_guess' && round.guess !== null
  const sessionLocked = game.status !== 'active'

  return (
    <div className="game-board">
      {sessionLocked ? <SessionStatus game={game} userId={userId} /> : null}
      {game.status !== 'finished' ? (
        <div className="game-play-area">
          {!round || !openRound ? (
            game.currentPlayerId === userId ? (
              <NewRoundCard
                disabled={isBusy || sessionLocked}
                onCreate={(topic) => run(() => api.createWordRound(partnershipId, topic))}
              />
            ) : (
              <WaitingCard compact name={game.partner.displayName} title="Next word incoming" />
            )
          ) : needsGuessReview ? (
            <GuessReviewCard
              disabled={isBusy || sessionLocked}
              game={game}
              userId={userId}
              onReview={(approved) =>
                run(() => api.reviewWordGuess(partnershipId, round.id, approved))
              }
            />
          ) : game.mode === 'live_call' ? (
            <LiveCallRound
              key={round.id}
              disabled={isBusy || sessionLocked}
              game={game}
              userId={userId}
              onExpire={() => run(() => api.expireWordRound(partnershipId, round.id))}
              onGuess={(guess) => run(() => api.guessWord(partnershipId, round.id, guess))}
              onSkip={() => run(() => api.skipWordRound(partnershipId, round.id))}
            />
          ) : (
            <RecordedRound
              key={round.id}
              disabled={isBusy || sessionLocked}
              game={game}
              userId={userId}
              onExpire={() => run(() => api.expireWordRound(partnershipId, round.id))}
              onGuess={(guess) => run(() => api.guessWord(partnershipId, round.id, guess))}
              onRecordingStart={() => run(() => api.startWordRecording(partnershipId, round.id))}
              onRecordingStop={() => run(() => api.finishWordRecording(partnershipId, round.id))}
              onSkip={() => run(() => api.skipWordRound(partnershipId, round.id))}
              onSubmit={(audio) =>
                run(() => api.submitWordExplanation(partnershipId, round.id, audio))
              }
            />
          )}
          {round && !openRound ? <RoundOutcome key={round.id} round={round} /> : null}
        </div>
      ) : null}
      {game.status === 'finished' && (game.rounds?.length ?? 0) > 0 ? (
        <section className="rounds-section" aria-labelledby="game-rounds-title">
          <div className="rounds-section-heading">
            <div>
              <h2 id="game-rounds-title">Rounds</h2>
            </div>
            <span>{game.rounds?.length ?? 0}</span>
          </div>
          <RoundsTable
            rounds={game.rounds ?? []}
            partnerId={game.partner.id}
            partnerName={game.partner.displayName}
          />
        </section>
      ) : null}
    </div>
  )
}

function GameStartCard({
  blocked,
  disabled,
  onStart,
}: {
  blocked: boolean
  disabled: boolean
  onStart: (mode: WordGameMode, explanationDurationSeconds: number) => Promise<void>
}) {
  const [mode, setMode] = useState<WordGameMode>('live_call')
  const [explanationDurationSeconds, setExplanationDurationSeconds] = useState(
    DEFAULT_EXPLANATION_SECONDS,
  )
  return (
    <section className="game-lobby game-lobby-ready">
      <div className="game-lobby-copy">
        <fieldset className="game-mode-picker" disabled={disabled || blocked}>
          <legend>Mode</legend>
          {WORD_GAME_MODES.map((option) => (
            <label key={option.value} data-cursor={disabled || blocked ? undefined : 'interactive'}>
              <input
                type="radio"
                name="game-mode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
              />
              <span>
                <strong>{option.label}</strong>
              </span>
              <i aria-hidden="true" />
            </label>
          ))}
        </fieldset>
        <DurationPicker
          disabled={disabled || blocked}
          idPrefix="new-game"
          value={explanationDurationSeconds}
          onChange={setExplanationDurationSeconds}
        />
        <div className="game-lobby-actions">
          <button
            type="button"
            className="button button-accent game-lobby-action"
            disabled={disabled || blocked}
            onClick={() => void onStart(mode, explanationDurationSeconds)}
          >
            {disabled ? 'Sending…' : blocked ? 'Finish your current game first' : 'Invite to play'}
          </button>
        </div>
        {blocked ? (
          <p className="game-lobby-blocked" role="status">
            You can have only one active game at a time.
          </p>
        ) : null}
      </div>
    </section>
  )
}

function GameTimeSettings({
  disabled,
  game,
  isCreator,
  onSave,
}: {
  disabled: boolean
  game: WordGame
  isCreator: boolean
  onSave: (seconds: number) => Promise<boolean>
}) {
  const [value, setValue] = useState(game.explanationDurationSeconds)
  const details = useRef<HTMLDetailsElement>(null)
  const summary = useRef<HTMLElement>(null)

  if (!isCreator) {
    return (
      <div
        className="game-time-readout"
        aria-label={`Explanation time: ${formatDuration(game.explanationDurationSeconds)}`}
        title="The game creator controls this setting"
      >
        <RoomControlIcon icon="timer" />
        <strong>{formatDuration(game.explanationDurationSeconds)}</strong>
      </div>
    )
  }

  return (
    <details className="game-time-settings" ref={details}>
      <summary aria-label="Change explanation time" ref={summary}>
        <RoomControlIcon icon="timer" />
        <strong>{formatDuration(game.explanationDurationSeconds)}</strong>
        <i aria-hidden="true">⌄</i>
      </summary>
      <div className="game-time-settings-popover">
        <div className="game-time-settings-heading">
          <strong className="game-time-settings-title">Explanation time</strong>
          <button
            type="button"
            className="game-time-settings-close"
            aria-label="Close explanation time"
            onClick={() => {
              if (details.current) details.current.open = false
              summary.current?.focus()
            }}
          >
            ×
          </button>
        </div>
        <DurationPicker
          compact
          disabled={disabled}
          idPrefix="active-game"
          value={value}
          onChange={setValue}
        />
        {value !== game.explanationDurationSeconds ? (
          <button
            type="button"
            className="button button-primary"
            disabled={disabled}
            onClick={() => void onSave(value)}
          >
            {disabled ? 'Saving…' : 'Save for next round'}
          </button>
        ) : null}
      </div>
    </details>
  )
}

function DurationPicker({
  compact = false,
  disabled,
  idPrefix,
  onChange,
  value,
}: {
  compact?: boolean
  disabled: boolean
  idPrefix: string
  onChange: (value: number) => void
  value: number
}) {
  const inputId = `${idPrefix}-explanation-seconds`
  const [draft, setDraft] = useState(String(value))

  const commitDraft = () => {
    const parsed = Number(draft)
    const next = Number.isFinite(parsed) ? Math.min(300, Math.max(30, Math.round(parsed))) : value
    setDraft(String(next))
    onChange(next)
  }

  return (
    <fieldset className={`duration-picker ${compact ? 'is-compact' : ''}`} disabled={disabled}>
      <legend className={compact ? 'sr-only' : undefined}>Explanation time</legend>
      <div className="duration-presets" aria-label="Explanation time presets">
        {EXPLANATION_PRESETS.map((seconds) => (
          <button
            key={seconds}
            type="button"
            className={value === seconds ? 'is-selected' : ''}
            aria-pressed={value === seconds}
            onClick={() => {
              setDraft(String(seconds))
              onChange(seconds)
            }}
          >
            {seconds / 60} min
          </button>
        ))}
      </div>
      <label className="duration-custom" htmlFor={inputId}>
        <span>Custom</span>
        <span>
          <input
            id={inputId}
            type="number"
            min="30"
            max="300"
            step="1"
            inputMode="numeric"
            value={draft}
            onBlur={commitDraft}
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
          sec
        </span>
      </label>
    </fieldset>
  )
}

function RulesDialog({ onClose }: { onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    closeButton.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="game-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="game-dialog rules-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-rules-title"
        aria-describedby="game-rules-description"
      >
        <div className="game-dialog-heading">
          <h2 id="game-rules-title">How to play</h2>
          <button
            ref={closeButton}
            type="button"
            className="game-dialog-close"
            aria-label="Close rules"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p id="game-rules-description" className="sr-only">
          Choose a topic, explain the word, let your partner guess, review synonyms, then switch
          roles.
        </p>
        <ol className="rules-steps">
          <li>
            <span className="rules-step-number">1</span>
            <span className="rules-step-icon" aria-hidden="true">
              <RulesStepIcon step="topic" />
            </span>
            <strong>Choose a topic</strong>
            <small>Get a word</small>
          </li>
          <li>
            <span className="rules-step-number">2</span>
            <span className="rules-step-icon" aria-hidden="true">
              <RulesStepIcon step="explain" />
            </span>
            <strong>Explain naturally</strong>
            <small>Don’t say it</small>
          </li>
          <li>
            <span className="rules-step-number">3</span>
            <span className="rules-step-icon" aria-hidden="true">
              <RulesStepIcon step="guess" />
            </span>
            <strong>Partner guesses</strong>
            <small>Review synonyms</small>
          </li>
          <li>
            <span className="rules-step-number">4</span>
            <span className="rules-step-icon" aria-hidden="true">
              <RulesStepIcon step="switch" />
            </span>
            <strong>Switch roles</strong>
            <small>Next turn</small>
          </li>
        </ol>
        <div className="rules-modes">
          <div>
            <span aria-hidden="true">↗</span>
            <strong>Live call</strong>
            <small>Talk together</small>
          </div>
          <div>
            <span aria-hidden="true">●</span>
            <strong>Recorded</strong>
            <small>Reply later</small>
          </div>
        </div>
      </section>
    </div>
  )
}

function RulesStepIcon({ step }: { step: 'topic' | 'explain' | 'guess' | 'switch' }) {
  const paths = {
    topic: (
      <>
        <rect x="5" y="5" width="9" height="9" rx="2" />
        <rect x="18" y="5" width="9" height="9" rx="2" />
        <rect x="5" y="18" width="9" height="9" rx="2" />
        <rect x="18" y="18" width="9" height="9" rx="2" />
        <path d="m20.5 22 2 2 3-4" />
      </>
    ),
    explain: (
      <>
        <path d="M5 7h22v15H16l-6 5v-5H5V7Z" />
        <circle cx="10" cy="14.5" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="16" cy="14.5" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="22" cy="14.5" r="1.4" fill="currentColor" stroke="none" />
      </>
    ),
    guess: (
      <>
        <circle cx="10" cy="10" r="5" />
        <path d="M3 27c1-6 3.5-10 7-10s6 4 7 10" />
        <path d="M19 10a5 5 0 1 1 7 4.6c-2 .9-3 2-3 4" />
        <circle cx="23" cy="23" r="1.2" fill="currentColor" stroke="none" />
      </>
    ),
    switch: (
      <>
        <path d="M5 10h19M19 5l5 5-5 5" />
        <path d="M27 22H8M13 17l-5 5 5 5" />
      </>
    ),
  }

  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2">
      {paths[step]}
    </svg>
  )
}

function EndGameDialog({
  isBusy,
  onCancel,
  onConfirm,
}: {
  isBusy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const cancelButton = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    cancelButton.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isBusy, onCancel])

  return (
    <div
      className="game-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy) onCancel()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-game-title"
        className="game-dialog end-game-dialog"
      >
        <div className="end-game-heading">
          <EndGameArtwork />
          <h2 id="end-game-title">End game?</h2>
        </div>
        <div className="game-dialog-actions">
          <button
            ref={cancelButton}
            type="button"
            className="button button-secondary"
            disabled={isBusy}
            onClick={onCancel}
          >
            Keep playing
          </button>
          <button
            type="button"
            className="button button-danger"
            disabled={isBusy}
            onClick={onConfirm}
          >
            {isBusy ? 'Ending…' : 'End game'}
          </button>
        </div>
      </section>
    </div>
  )
}

function EndGameArtwork() {
  return (
    <div className="end-game-artwork" aria-hidden="true">
      <span className="end-game-player is-left">
        <i />
      </span>
      <span className="end-game-link">
        <i />
        <i />
        <i />
      </span>
      <span className="end-game-break">×</span>
      <span className="end-game-player is-right">
        <i />
      </span>
    </div>
  )
}

function GameFinishedDialog({
  game,
  onHome,
  onViewResults,
}: {
  game: WordGame
  onHome: () => void
  onViewResults: () => void
}) {
  const resultsButton = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    resultsButton.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onViewResults()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onViewResults])

  return (
    <div className="game-dialog-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="finished-game-title"
        aria-describedby="finished-game-description"
        className="game-dialog finished-game-dialog"
      >
        <span className="finished-game-symbol" aria-hidden="true">
          ✓
        </span>
        <h2 id="finished-game-title">The game has finished</h2>
        <p id="finished-game-description">
          Your final score is saved. You can review every round now or return home.
        </p>
        <div className="finished-game-score" aria-label="Final score">
          <div>
            <span>You</span>
            <strong>{game.scores.you}</strong>
          </div>
          <span aria-hidden="true">:</span>
          <div>
            <span>{game.partner.displayName}</span>
            <strong>{game.scores.partner}</strong>
          </div>
        </div>
        <div className="game-dialog-actions">
          <button type="button" className="button button-secondary" onClick={onHome}>
            Go home
          </button>
          <button
            ref={resultsButton}
            type="button"
            className="button button-primary"
            onClick={onViewResults}
          >
            View results
          </button>
        </div>
      </section>
    </div>
  )
}

function SessionStatus({ game, userId }: { game: WordGame; userId: string }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (game.status !== 'paused') return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [game.status])

  if (game.status === 'finished') {
    const expiredWhilePaused = Boolean(game.reconnectDeadline)
    return (
      <section className="session-finished-card" role="status">
        <span className="session-finished-icon" aria-hidden="true">
          ✓
        </span>
        <div>
          <h2>{expiredWhilePaused ? 'Reconnect window ended' : 'Game finished'}</h2>
          <p>
            {expiredWhilePaused
              ? `${game.partner.displayName} did not return. Your result is saved below.`
              : 'Your result is saved. Review the rounds below or start a new game.'}
          </p>
        </div>
      </section>
    )
  }

  const seconds = game.reconnectDeadline
    ? Math.min(
        300,
        Math.max(0, Math.ceil((new Date(game.reconnectDeadline).getTime() - now) / 1000)),
      )
    : 300
  const partnerLeft = game.disconnectedPlayerId === game.partner.id
  const reconnectingSelf = game.disconnectedPlayerId === userId
  return (
    <section className="session-pause-card" role="status">
      <div className="session-pause-signal" aria-hidden="true">
        <span>{partnerLeft ? game.partner.displayName.trim().charAt(0).toUpperCase() : '↻'}</span>
        <i />
      </div>
      <div className="session-pause-copy">
        <span className="session-pause-status">Game paused</span>
        <h2>
          {reconnectingSelf
            ? 'Reconnecting you'
            : partnerLeft
              ? `Waiting for ${game.partner.displayName}`
              : 'Reconnecting the game'}
        </h2>
      </div>
      <div
        className="session-pause-timer"
        aria-label={`${formatCountdown(seconds)} remaining to reconnect`}
      >
        <span>Time left</span>
        <strong>{formatCountdown(seconds)}</strong>
      </div>
    </section>
  )
}

function GameInvitation({
  acceptBlocked,
  disabled,
  game,
  onAccept,
  onCancel,
  onDecline,
  userId,
}: {
  acceptBlocked: boolean
  disabled: boolean
  game: WordGame
  onAccept: () => Promise<unknown>
  onCancel: () => Promise<void>
  onDecline: () => Promise<void>
  userId: string
}) {
  const isRequester = game.requestedById === userId
  const partnerInitial = game.partner.displayName.trim().charAt(0).toUpperCase() || '?'
  return (
    <section
      className={`game-invitation-card ${isRequester ? 'is-sent' : 'is-received'}`}
      role={isRequester ? 'status' : undefined}
    >
      <div className="game-invitation-avatar" aria-hidden="true">
        <span>{partnerInitial}</span>
        <i>{isRequester ? '…' : '!'}</i>
      </div>
      <div className="game-invitation-copy">
        {isRequester ? (
          <span className="game-invitation-status">Invitation sent</span>
        ) : (
          <GameModeBadge mode={game.mode} />
        )}
        <h2>
          {isRequester
            ? `Waiting for ${game.partner.displayName}`
            : `${game.partner.displayName} invited you`}
        </h2>
        {isRequester ? (
          <span className="game-invitation-waiting-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        ) : null}
        {!isRequester ? (
          <p>Join the shared game now. The player who sent the invitation will explain first.</p>
        ) : null}
        {!isRequester && acceptBlocked ? (
          <p className="game-lobby-blocked" role="status">
            Finish your current game before accepting this invitation.
          </p>
        ) : null}
      </div>
      <div className="game-invitation-actions">
        {isRequester ? (
          <button
            type="button"
            className="game-cancel-invitation"
            disabled={disabled}
            onClick={() => void onCancel()}
          >
            Cancel
          </button>
        ) : (
          <>
            <button
              type="button"
              className="button button-primary"
              disabled={disabled || acceptBlocked}
              onClick={() => void onAccept()}
            >
              {disabled
                ? 'Starting…'
                : acceptBlocked
                  ? 'Finish your current game first'
                  : 'Accept and play'}
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={disabled}
              onClick={() => void onDecline()}
            >
              Decline
            </button>
          </>
        )}
      </div>
    </section>
  )
}

function NewRoundCard({
  disabled,
  onCreate,
}: {
  disabled: boolean
  onCreate: (topic: string) => Promise<unknown>
}) {
  const [topic, setTopic] = useState(TOPICS[0]!)
  return (
    <section className="game-stage new-round-card">
      <h2>Choose a topic</h2>
      <fieldset className="topic-picker" disabled={disabled}>
        <legend className="sr-only">Topic</legend>
        {TOPICS.map((option) => (
          <label key={option} data-cursor={disabled ? undefined : 'interactive'}>
            <input
              type="radio"
              name="word-topic"
              value={option}
              checked={topic === option}
              onChange={(event) => setTopic(event.target.value)}
            />
            <span>
              <TopicIcon topic={option} />
              <strong>{option}</strong>
            </span>
          </label>
        ))}
      </fieldset>
      <button
        className="button button-accent new-round-action"
        type="button"
        disabled={disabled}
        aria-label={disabled ? 'Creating a word' : 'Give me a word'}
        title={disabled ? 'Creating a word…' : 'Give me a word'}
        data-busy={disabled ? 'true' : undefined}
        onClick={() => void onCreate(topic)}
      >
        <svg className="word-deal-icon" viewBox="0 0 108 66" aria-hidden="true">
          <g className="word-deal-card word-deal-card-back">
            <rect x="18" y="15" width="52" height="38" rx="7" />
          </g>
          <g className="word-deal-card word-deal-card-middle">
            <rect x="29" y="11" width="52" height="38" rx="7" />
            <path d="M42 23h25M42 30h16" />
          </g>
          <g className="word-deal-card word-deal-card-front">
            <rect x="40" y="7" width="52" height="38" rx="7" />
            <path className="word-deal-question" d="M62 19c1-5 11-5 11 1 0 5-6 4-6 9M67 35h.01" />
          </g>
          <path className="word-deal-arrow" d="M20 58c21 7 56 4 73-8m0 0-2 8m2-8-8-2" />
          <path className="word-deal-spark word-deal-spark-one" d="M99 7v9M95 11.5h8" />
          <path className="word-deal-spark word-deal-spark-two" d="M8 27v7M4.5 30.5h7" />
        </svg>
        <span className="sr-only">{disabled ? 'Creating a word' : 'Give me a word'}</span>
      </button>
    </section>
  )
}

function TopicIcon({ topic }: { topic: string }) {
  const paths = (() => {
    switch (topic) {
      case 'Everyday life':
        return (
          <g className="topic-icon-art topic-home-art">
            <path d="M5 14.5 16 5l11 9.5" />
            <path d="M8 13v13h16V13" />
            <path className="topic-home-door" d="M13 26v-8h6v8" />
          </g>
        )
      case 'Food':
        return (
          <>
            <path d="M5 25h22M8 22h16" />
            <g className="topic-food-cover">
              <path d="M10 22a6 6 0 0 1 12 0M16 13v3" />
              <circle cx="16" cy="10" r="2" />
            </g>
          </>
        )
      case 'Travel':
        return (
          <g className="topic-icon-art topic-travel-case">
            <rect x="7" y="10" width="18" height="15" rx="2" />
            <path className="topic-travel-handle" d="M12 10V7h8v3" />
            <path d="M7 17h18M11 15v4M21 15v4" />
          </g>
        )
      case 'Nature':
        return (
          <g className="topic-icon-art topic-nature-leaf">
            <path d="M26 6C15 6 7 11 7 19c0 4 3 7 7 7 8 0 12-8 12-20Z" />
            <path d="M6 27c4-7 9-11 16-15M13 20h6M12 21v-6" />
          </g>
        )
      case 'Work and study':
        return (
          <>
            <g className="topic-book-page topic-book-page-left">
              <path d="M5 8.5c4-1 7 0 11 2.5v16c-4-2.5-7-3.5-11-2.5v-16Z" />
              <path d="M9 14h3M9 18h3" />
            </g>
            <g className="topic-book-page topic-book-page-right">
              <path d="M27 8.5c-4-1-7 0-11 2.5v16c4-2.5 7-3.5 11-2.5v-16Z" />
              <path d="M20 14h3M20 18h3" />
            </g>
          </>
        )
      case 'Technology':
        return (
          <>
            <rect x="6" y="7" width="20" height="15" rx="2" />
            <path d="M3.5 26h25M12 26l1-4h6l1 4" />
            <path className="topic-code-left" d="m13 12-3 2.5 3 2.5" />
            <path className="topic-code-right" d="m19 12 3 2.5-3 2.5" />
            <path className="topic-code-cursor" d="M16 12v5" />
          </>
        )
      default:
        return <circle cx="16" cy="16" r="10" />
    }
  })()

  return (
    <svg
      className={`topic-icon topic-icon--${topic.toLowerCase().replaceAll(' ', '-')}`}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  )
}

function ExplainCard({
  disabled,
  game,
  onRecordingStart,
  onRecordingStop,
  onSkip,
  onSubmit,
}: {
  disabled: boolean
  game: WordGame
  onRecordingStart: () => Promise<boolean>
  onRecordingStop: () => Promise<boolean>
  onSkip: () => Promise<unknown>
  onSubmit: (audio: Blob) => Promise<unknown>
}) {
  const round = game.round!
  return (
    <section className="game-surface secret-surface explain-card">
      <div className="explain-card-topbar">
        <p>{round.topic}</p>
        <button
          type="button"
          className="explain-skip-control"
          disabled={disabled}
          onClick={() => void onSkip()}
        >
          Skip word
        </button>
      </div>
      <SecretWordBrief round={round} />
      <AudioRecorder
        disabled={disabled}
        durationSeconds={round.explanationDurationSeconds}
        recordingStartedAt={round.recordingStartedAt}
        serverTime={game.serverTime}
        onStart={onRecordingStart}
        onStop={onRecordingStop}
        onSubmit={onSubmit}
      />
    </section>
  )
}

function RecordedRound({
  disabled,
  game,
  onExpire,
  onGuess,
  onRecordingStart,
  onRecordingStop,
  onSkip,
  onSubmit,
  userId,
}: {
  disabled: boolean
  game: WordGame
  onExpire: () => Promise<boolean>
  onGuess: (guess: string) => Promise<boolean>
  onRecordingStart: () => Promise<boolean>
  onRecordingStop: () => Promise<boolean>
  onSkip: () => Promise<boolean>
  onSubmit: (audio: Blob) => Promise<boolean>
  userId: string
}) {
  const round = game.round!
  const now = useServerNow(game.serverTime)
  const expirationAttempted = useRef(false)
  const isExplainer = round.explainerId === userId
  const recordingStartedAt = parseTimestamp(round.recordingStartedAt)
  const recordingFinishedAt = parseTimestamp(round.recordingFinishedAt)
  const explainedAt = parseTimestamp(round.explainedAt)
  const recordingEndsAt = recordingStartedAt + round.explanationDurationSeconds * 1000
  const guessEndsAt = explainedAt + RECORDED_GUESS_MS
  const isGuessing = round.status === 'awaiting_guess'
  const isExpired = isGuessing && explainedAt > 0 && now >= guessEndsAt

  useEffect(() => {
    if (disabled || !isExpired || expirationAttempted.current) return
    expirationAttempted.current = true
    void onExpire().then((succeeded) => {
      if (!succeeded) expirationAttempted.current = false
    })
  }, [disabled, isExpired, onExpire])

  if (round.status === 'explaining') {
    return (
      <div className="recorded-round">
        {!isExplainer && recordingStartedAt > 0 && recordingFinishedAt === 0 ? (
          <RoundClock
            description={
              now < recordingEndsAt
                ? 'Your partner is recording the clue now.'
                : 'The recording is being prepared and sent.'
            }
            remainingMs={recordingEndsAt - now}
            title={now < recordingEndsAt ? 'Recording in progress' : 'Preparing the recording'}
          />
        ) : null}
        {!isExplainer && recordingFinishedAt > 0 ? (
          <PhaseNotice
            description="The clue is being converted, transcribed, and sent to you."
            title="Preparing the recording"
          />
        ) : null}
        {isExplainer ? (
          <ExplainCard
            disabled={disabled}
            game={game}
            onRecordingStart={onRecordingStart}
            onRecordingStop={onRecordingStop}
            onSkip={onSkip}
            onSubmit={onSubmit}
          />
        ) : (
          <WaitingCard
            name={game.partner.displayName}
            message={
              recordingFinishedAt > 0
                ? 'They finished speaking. Their recording is being prepared.'
                : recordingStartedAt > 0
                  ? 'They are recording an explanation.'
                  : 'They are getting ready to record an explanation.'
            }
          />
        )}
      </div>
    )
  }

  const remainingMs = explainedAt > 0 ? guessEndsAt - now : RECORDED_GUESS_MS
  return (
    <div className="recorded-round">
      <RoundClock
        compact
        description={
          isExpired
            ? 'No answer was submitted before the listening window ended.'
            : isExplainer
              ? 'Your partner can replay the clue and submit one answer.'
              : 'Replay the recording as needed, then submit your answer.'
        }
        expired={isExpired}
        remainingMs={remainingMs}
        title={isExpired ? 'Time’s up' : 'Listen and guess'}
      />
      {isExplainer || isExpired ? (
        <WaitingCard
          name={isExpired ? 'the next round' : game.partner.displayName}
          message={
            isExpired
              ? 'No guess was submitted before time ran out.'
              : 'Your explanation is ready. They have up to 90 seconds to answer.'
          }
        />
      ) : (
        <GuessCard
          disabled={disabled}
          audioAvailable={round.audioAvailable}
          liveCall={false}
          visualMode="listening"
          partnershipId={game.partnershipId}
          roundId={round.id}
          transcript={round.transcript ?? ''}
          onGuess={onGuess}
        />
      )}
    </div>
  )
}

function LiveCallRound({
  disabled,
  game,
  onExpire,
  onGuess,
  onSkip,
  userId,
}: {
  disabled: boolean
  game: WordGame
  onExpire: () => Promise<boolean>
  onGuess: (guess: string) => Promise<boolean>
  onSkip: () => Promise<boolean>
  userId: string
}) {
  const round = game.round!
  const preparationEndsAt = Date.parse(round.createdAt) + LIVE_PREPARATION_MS
  const explanationEndsAt = preparationEndsAt + round.explanationDurationSeconds * 1000
  const roundEndsAt = explanationEndsAt + LIVE_FINAL_GUESS_MS
  const now = useServerNow(game.serverTime)
  const expirationAttempted = useRef(false)
  const isPreparing = now < preparationEndsAt
  const isExplaining = !isPreparing && now < explanationEndsAt
  const isExpired = now >= roundEndsAt
  const targetTime = isPreparing
    ? preparationEndsAt
    : isExplaining
      ? explanationEndsAt
      : roundEndsAt
  const isExplainer = round.explainerId === userId

  useEffect(() => {
    if (disabled || !isExpired || expirationAttempted.current) return
    expirationAttempted.current = true
    void onExpire().then((succeeded) => {
      if (!succeeded) expirationAttempted.current = false
    })
  }, [disabled, isExpired, onExpire])

  return (
    <div className="live-round">
      <RoundClock
        description={
          isPreparing
            ? 'Both players get five seconds to get ready.'
            : isExplaining
              ? 'Speak in your call while your partner can type the answer.'
              : isExpired
                ? 'Ending this round…'
                : 'The clue is over. The guesser gets 30 seconds to think.'
        }
        expired={isExpired}
        finalGuess={!isPreparing && !isExplaining && !isExpired}
        preparing={isPreparing}
        remainingMs={targetTime - now}
        title={
          isPreparing
            ? 'Get ready'
            : isExplaining
              ? isExplainer
                ? 'Explain now'
                : 'Guess now'
              : isExpired
                ? 'Time’s up'
                : 'Final guess'
        }
      />

      {isExplainer ? (
        <section className="game-surface secret-surface explain-card live-explain-card">
          <div className="explain-card-topbar">
            <p>{round.topic}</p>
            <button
              type="button"
              className="explain-skip-control"
              disabled={disabled || isExpired}
              onClick={() => void onSkip()}
            >
              Skip word
            </button>
          </div>
          <SecretWordBrief round={round} />
        </section>
      ) : isPreparing ? (
        <section
          className="live-ready-cue"
          role="status"
          aria-label={`Get ready to listen to ${game.partner.displayName}’s clue`}
        >
          <div className="live-ready-person is-partner" aria-hidden="true">
            <span>{game.partner.displayName.trim().charAt(0).toLocaleUpperCase()}</span>
            <strong>{game.partner.displayName}</strong>
          </div>
          <div className="live-ready-wave" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="live-ready-person is-you" aria-hidden="true">
            <span>You</span>
            <strong>Listen</strong>
          </div>
        </section>
      ) : isExpired ? (
        <WaitingCard name="the next round" message="No guess was submitted before time ran out." />
      ) : (
        <GuessCard
          disabled={disabled}
          audioAvailable={false}
          liveCall
          visualMode={isExplaining ? 'listening' : 'recall'}
          partnershipId={game.partnershipId}
          roundId={round.id}
          transcript=""
          onGuess={onGuess}
        />
      )}
    </div>
  )
}

function RoundClock({
  compact = false,
  description,
  expired = false,
  finalGuess = false,
  preparing = false,
  remainingMs,
  title,
}: {
  compact?: boolean
  description: string
  expired?: boolean
  finalGuess?: boolean
  preparing?: boolean
  remainingMs: number
  title: string
}) {
  const secondsRemaining = Math.max(0, Math.ceil(remainingMs / 1000))
  return (
    <section
      className={`live-round-clock ${compact ? 'is-compact' : ''} ${preparing ? 'is-preparing' : ''} ${finalGuess ? 'is-final-guess' : ''} ${expired ? 'is-expired' : ''}`}
      aria-label={`${title}: ${secondsRemaining} seconds remaining`}
    >
      <div>
        <p>{title}</p>
        <span className="sr-only">{description}</span>
      </div>
      <strong role="timer">{formatCountdown(secondsRemaining)}</strong>
    </section>
  )
}

function PhaseNotice({ description, title }: { description: string; title: string }) {
  return (
    <section className="live-round-clock phase-notice" role="status">
      <div>
        <p>{title}</p>
        <span>{description}</span>
      </div>
      <strong aria-hidden="true">•••</strong>
    </section>
  )
}

function SecretWordBrief({ round }: { round: NonNullable<WordGame['round']> }) {
  const secretWord = round.secretWord?.trim().toLocaleLowerCase()
  const visibleForbiddenWords = round.forbiddenWords?.filter(
    (word) => word.trim().toLocaleLowerCase() !== secretWord,
  )

  return (
    <div className="explain-brief">
      <div className="secret-word-block">
        <span>Your secret word</span>
        <h2>{round.secretWord}</h2>
      </div>
      {visibleForbiddenWords?.length ? (
        <div className="forbidden-words-block">
          <p>Don’t say</p>
          <div>
            {visibleForbiddenWords.map((word) => (
              <span key={word}>{word}</span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AudioRecorder({
  disabled,
  durationSeconds,
  onStart,
  onStop,
  onSubmit,
  recordingStartedAt,
  serverTime,
}: {
  disabled: boolean
  durationSeconds: number
  onStart: () => Promise<boolean>
  onStop: () => Promise<boolean>
  onSubmit: (audio: Blob) => Promise<unknown>
  recordingStartedAt?: string | null
  serverTime?: string
}) {
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const discardOnStop = useRef(false)
  const recordingBlocked = useRef(false)
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [secondsRemaining, setSecondsRemaining] = useState(durationSeconds)
  const [isPreparing, setIsPreparing] = useState(false)
  const [audio, setAudio] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const now = useServerNow(serverTime)

  useLayoutEffect(
    () => () => {
      recordingBlocked.current = true
      discardOnStop.current = true
      if (stopTimer.current) clearTimeout(stopTimer.current)
      if (countdownTimer.current) clearInterval(countdownTimer.current)
      if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
      stream.current?.getTracks().forEach((track) => track.stop())
    },
    [],
  )

  useEffect(() => () => (audioUrl ? URL.revokeObjectURL(audioUrl) : undefined), [audioUrl])

  async function startRecording() {
    recordingBlocked.current = false
    discardOnStop.current = false
    setError(null)
    setAudio(null)
    setAudioUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Audio recording is not supported in this browser.')
      return
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (recordingBlocked.current) {
        mediaStream.getTracks().forEach((track) => track.stop())
        return
      }
      const mimeType = preferredMimeType()
      const mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined)
      stream.current = mediaStream
      recorder.current = mediaRecorder
      chunks.current = []
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data)
      }
      mediaRecorder.onstop = async () => {
        mediaStream.getTracks().forEach((track) => track.stop())
        if (discardOnStop.current) {
          chunks.current = []
          return
        }
        setIsRecording(false)
        setIsPreparing(true)
        try {
          const stopped = await onStop()
          if (!stopped || recordingBlocked.current) {
            if (!recordingBlocked.current) {
              setError('The recording status could not be updated. Try recording again.')
            }
            return
          }
          const recording = new Blob(chunks.current, {
            type: mediaRecorder.mimeType || 'audio/webm',
          })
          const wav = await convertRecordingToWav(recording)
          if (recordingBlocked.current) return
          setAudio(wav)
          setAudioUrl(URL.createObjectURL(wav))
        } catch {
          if (!recordingBlocked.current) {
            setError('This browser could not prepare the recording. Try Chrome, Edge, or Safari.')
          }
        } finally {
          setIsPreparing(false)
        }
      }
      const started = await onStart()
      if (!started || recordingBlocked.current) {
        mediaStream.getTracks().forEach((track) => track.stop())
        if (!recordingBlocked.current) setError('The recording could not be started. Try again.')
        return
      }
      mediaRecorder.start()
      setSecondsRemaining(durationSeconds)
      setIsRecording(true)
      stopTimer.current = setTimeout(stopRecording, durationSeconds * 1000)
      countdownTimer.current = setInterval(() => {
        setSecondsRemaining((current) => Math.max(0, current - 1))
      }, 1_000)
    } catch {
      if (!recordingBlocked.current) {
        setError('Allow microphone access to record your explanation.')
      }
    }
  }

  function stopRecording() {
    if (stopTimer.current) clearTimeout(stopTimer.current)
    if (countdownTimer.current) clearInterval(countdownTimer.current)
    stopTimer.current = null
    countdownTimer.current = null
    if (recorder.current?.state === 'recording') recorder.current.stop()
  }

  return (
    <div className="audio-recorder">
      <div className="audio-recorder-heading">
        <span aria-hidden="true">
          <i />
        </span>
        <div>
          <p>Record your explanation</p>
          <small>Up to {formatDuration(durationSeconds)} · Speak clearly and naturally</small>
        </div>
      </div>
      <div className="audio-recorder-actions">
        {!isRecording ? (
          <button
            type="button"
            className="button button-primary"
            disabled={disabled || isPreparing}
            onClick={() => void startRecording()}
          >
            {isPreparing ? 'Preparing…' : audio ? 'Record again' : 'Start recording'}
          </button>
        ) : (
          <button type="button" className="button button-danger" onClick={stopRecording}>
            Stop recording
          </button>
        )}
        {audio ? (
          <button
            type="button"
            className="button button-accent"
            disabled={disabled}
            onClick={() => void onSubmit(audio)}
          >
            {disabled ? 'Transcribing…' : 'Send explanation'}
          </button>
        ) : null}
      </div>
      {isRecording ? (
        <div role="status" aria-live="polite" className="audio-recorder-status">
          <span>● Recording</span>
          <strong>
            {formatCountdown(
              recordingStartedAt
                ? Math.max(
                    0,
                    Math.ceil(
                      (Date.parse(recordingStartedAt) + durationSeconds * 1000 - now) / 1000,
                    ),
                  )
                : secondsRemaining,
            )}{' '}
            remaining
          </strong>
        </div>
      ) : null}
      {isPreparing ? (
        <p role="status" className="audio-recorder-message">
          Preparing the recording…
        </p>
      ) : null}
      {audioUrl ? (
        <AudioPlayer
          className="audio-recorder-preview"
          src={audioUrl}
          label="Your recorded explanation"
        />
      ) : null}
      {error ? (
        <p role="alert" className="audio-recorder-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function GuessCard({
  audioAvailable,
  disabled,
  liveCall,
  partnershipId,
  roundId,
  transcript,
  visualMode,
  onGuess,
}: {
  audioAvailable: boolean
  disabled: boolean
  liveCall: boolean
  partnershipId: string
  roundId: string
  transcript: string
  visualMode: 'listening' | 'recall'
  onGuess: (guess: string) => Promise<unknown>
}) {
  const [guess, setGuess] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioError, setAudioError] = useState<string | null>(null)

  useEffect(() => {
    if (!audioAvailable) return
    let active = true
    void api
      .getWordRoundAudio(partnershipId, roundId)
      .then((response) => {
        if (active) setAudioUrl(response.data.url)
      })
      .catch((loadError) => {
        if (active) setAudioError(messageFromError(loadError))
      })
    return () => {
      active = false
    }
  }, [audioAvailable, partnershipId, roundId])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (guess.trim()) void onGuess(guess)
  }
  const guessInputId = `word-guess-${roundId}`

  return (
    <section
      className={`game-surface guess-card ${liveCall ? 'is-live' : 'is-recorded'}`}
      aria-label="Submit your guess"
    >
      <div className={`guess-flow-art is-${visualMode}`} aria-hidden="true">
        {visualMode === 'recall' ? (
          <svg viewBox="0 0 900 270" preserveAspectRatio="xMidYMid meet">
            <path className="guess-flow-loop guess-flow-loop-top" d="M145 72C284 7 619 5 754 72" />
            <path className="guess-flow-moving-arrow is-top is-first" d="m-10-6 10 6-10 6">
              <animateMotion
                begin="0s"
                dur="8s"
                path="M145 72C284 7 619 5 754 72"
                repeatCount="indefinite"
                rotate="auto"
              />
            </path>
            <path className="guess-flow-moving-arrow is-top is-second" d="m-10-6 10 6-10 6">
              <animateMotion
                begin="-4s"
                dur="8s"
                path="M145 72C284 7 619 5 754 72"
                repeatCount="indefinite"
                rotate="auto"
              />
            </path>
            <path
              className="guess-flow-loop guess-flow-loop-bottom"
              d="M755 206c-151 63-466 62-610 0"
            />
            <path className="guess-flow-moving-arrow is-bottom is-first" d="m-10-6 10 6-10 6">
              <animateMotion
                begin="0s"
                dur="8s"
                path="M755 206c-151 63-466 62-610 0"
                repeatCount="indefinite"
                rotate="auto"
              />
            </path>
            <path className="guess-flow-moving-arrow is-bottom is-second" d="m-10-6 10 6-10 6">
              <animateMotion
                begin="-4s"
                dur="8s"
                path="M755 206c-151 63-466 62-610 0"
                repeatCount="indefinite"
                rotate="auto"
              />
            </path>
            <g className="guess-flow-person guess-recall-person">
              <rect x="42" y="91" width="88" height="88" rx="20" />
              <circle cx="82" cy="120" r="14" />
              <path d="M58 163c3-18 14-27 24-27 11 0 22 9 25 27" />
              <path className="guess-recall-hand" d="m100 139 10-7" />
            </g>
            <g className="guess-recall-thoughts">
              <circle cx="139" cy="105" r="5" />
              <circle cx="155" cy="88" r="8" />
              <path d="M170 69c0-13 12-23 28-23 7-9 27-9 34 2 17-3 31 7 31 20 0 14-13 24-30 23h-34c-17 1-29-8-29-22Z" />
              <circle cx="196" cy="68" r="3" />
              <circle cx="216" cy="68" r="3" />
              <circle cx="236" cy="68" r="3" />
            </g>
            <g className="guess-recall-clues">
              <rect x="312" y="42" width="20" height="12" rx="4" />
              <rect x="355" y="29" width="28" height="12" rx="4" />
              <rect x="408" y="23" width="17" height="12" rx="4" />
            </g>
            <g className="guess-flow-card guess-flow-card-back">
              <rect x="770" y="96" width="87" height="96" rx="18" />
            </g>
            <g className="guess-flow-card guess-flow-card-front">
              <rect x="755" y="81" width="87" height="96" rx="18" />
              <path d="M784 111c2-16 29-16 29 2 0 13-16 11-16 24M797 153h.01" />
            </g>
            <path className="guess-flow-spark guess-flow-spark-one" d="M850 58v18M841 67h18" />
            <path className="guess-flow-spark guess-flow-spark-two" d="M33 190v14M26 197h14" />
          </svg>
        ) : (
          <svg viewBox="0 0 900 270" preserveAspectRatio="xMidYMid meet">
            <path className="guess-flow-loop guess-flow-loop-top" d="M145 72C284 7 619 5 754 72" />
            <path className="guess-flow-moving-arrow is-top is-first" d="m-10-6 10 6-10 6">
              <animateMotion
                begin="0s"
                dur="8s"
                path="M145 72C284 7 619 5 754 72"
                repeatCount="indefinite"
                rotate="auto"
              />
            </path>
            <path className="guess-flow-moving-arrow is-top is-second" d="m-10-6 10 6-10 6">
              <animateMotion
                begin="-4s"
                dur="8s"
                path="M145 72C284 7 619 5 754 72"
                repeatCount="indefinite"
                rotate="auto"
              />
            </path>
            <path
              className="guess-flow-loop guess-flow-loop-bottom"
              d="M755 206c-151 63-466 62-610 0"
            />
            <path className="guess-flow-moving-arrow is-bottom is-first" d="m-10-6 10 6-10 6">
              <animateMotion
                begin="0s"
                dur="8s"
                path="M755 206c-151 63-466 62-610 0"
                repeatCount="indefinite"
                rotate="auto"
              />
            </path>
            <path className="guess-flow-moving-arrow is-bottom is-second" d="m-10-6 10 6-10 6">
              <animateMotion
                begin="-4s"
                dur="8s"
                path="M755 206c-151 63-466 62-610 0"
                repeatCount="indefinite"
                rotate="auto"
              />
            </path>
            <g className="guess-flow-person">
              <rect x="42" y="91" width="88" height="88" rx="20" />
              <circle cx="86" cy="122" r="14" />
              <path d="M61 163c3-18 14-27 25-27s22 9 25 27" />
            </g>
            <g className="guess-flow-waves">
              <path d="M145 117c10 8 10 26 0 34" />
              <path d="M160 107c17 13 17 41 0 54" />
              <path d="M177 97c24 20 24 57 0 76" />
            </g>
            <g className="guess-flow-card guess-flow-card-back">
              <rect x="770" y="96" width="87" height="96" rx="18" />
            </g>
            <g className="guess-flow-card guess-flow-card-front">
              <rect x="755" y="81" width="87" height="96" rx="18" />
              <path d="M784 111c2-16 29-16 29 2 0 13-16 11-16 24M797 153h.01" />
            </g>
            <path className="guess-flow-spark guess-flow-spark-one" d="M850 58v18M841 67h18" />
            <path className="guess-flow-spark guess-flow-spark-two" d="M33 190v14M26 197h14" />
          </svg>
        )}
      </div>
      <div className="guess-card-content">
        {!liveCall && audioUrl ? (
          <div className="mt-6 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
            <p className="mb-2 text-sm font-medium text-stone-700">Listen to their explanation</p>
            <AudioPlayer src={audioUrl} label="Partner’s recorded explanation" />
          </div>
        ) : !liveCall && audioAvailable && !audioError ? (
          <p role="status" className="mt-5 text-sm text-stone-500">
            Loading the recording…
          </p>
        ) : null}
        {audioError ? (
          <p role="alert" className="mt-5 text-sm text-red-700">
            {audioError}
          </p>
        ) : null}
        {!liveCall ? (
          <blockquote className="mt-6 rounded-2xl bg-stone-100 p-5 leading-7 text-stone-700">
            “{transcript}”
          </blockquote>
        ) : null}
        <form className="guess-card-form" autoComplete="off" onSubmit={submit}>
          <label className="sr-only" htmlFor={guessInputId}>
            Your answer
          </label>
          <div className="guess-card-controls">
            <input
              id={guessInputId}
              name={guessInputId}
              type="text"
              className="input guess-card-input"
              autoComplete="off"
              placeholder="Type your answer"
              value={guess}
              maxLength={80}
              required
              disabled={disabled}
              onChange={(event) => setGuess(event.target.value)}
            />
            <button
              className="button button-primary guess-card-submit"
              disabled={disabled}
              type="submit"
              aria-label={disabled ? 'Checking answer' : 'Submit guess'}
              title={disabled ? 'Checking answer…' : 'Submit guess'}
              data-busy={disabled ? 'true' : undefined}
            >
              <svg viewBox="0 0 32 32" aria-hidden="true">
                <path className="guess-submit-arrow" d="M5 16h20m-7-7 7 7-7 7" />
                <path className="guess-submit-spark" d="M8 5v5M5.5 7.5h5" />
              </svg>
              <span className="sr-only">{disabled ? 'Checking answer' : 'Submit guess'}</span>
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}

function RoundOutcome({ round }: { round: NonNullable<WordGame['round']> }) {
  const outcome = round.status === 'skipped' ? 'skipped' : round.isCorrect ? 'success' : 'missed'
  const answer = round.status === 'skipped' ? 'Skipped' : round.guess || 'No answer'
  const label =
    outcome === 'success' ? 'Correct!' : outcome === 'skipped' ? 'Word skipped' : 'Not quite'

  return (
    <section
      className={`round-outcome round-outcome-${outcome}`}
      aria-label={`Round ${round.turnNumber}: ${label}`}
      aria-live="polite"
      role="status"
    >
      <div className="round-outcome-verdict">
        <span className="round-outcome-mark" aria-hidden="true">
          {outcome === 'success' ? '✓' : outcome === 'skipped' ? '↷' : '×'}
        </span>
        <div>
          <small>Round {round.turnNumber}</small>
          <strong>{label}</strong>
        </div>
      </div>
      <div className="round-outcome-words">
        <div>
          <small>Word</small>
          <strong>{round.secretWord}</strong>
        </div>
        <span className="round-outcome-arrow" aria-hidden="true">
          →
        </span>
        <div>
          <small>Answer</small>
          <strong>{answer}</strong>
        </div>
      </div>
      <div className="round-outcome-sparks" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
    </section>
  )
}

function GuessReviewCard({
  disabled,
  game,
  onReview,
  userId,
}: {
  disabled: boolean
  game: WordGame
  onReview: (approved: boolean) => Promise<boolean>
  userId: string
}) {
  const round = game.round!
  const isExplainer = round.explainerId === userId

  return (
    <section
      className={`game-surface guess-review-card ${isExplainer ? 'is-explainer' : 'is-guesser'}`}
      aria-live="polite"
    >
      <div className="guess-review-heading">
        <h2>{isExplainer ? 'Does this answer count?' : 'Waiting for answer review'}</h2>
      </div>
      <div className="guess-review-comparison">
        {isExplainer ? (
          <div>
            <span>Secret word</span>
            <strong>{round.secretWord}</strong>
          </div>
        ) : null}
        <div>
          <span>{isExplainer ? `${game.partner.displayName} guessed` : 'Your guess'}</span>
          <strong>{round.guess}</strong>
        </div>
      </div>
      {isExplainer ? (
        <div className="guess-review-actions">
          <button
            className="button button-primary"
            disabled={disabled}
            type="button"
            onClick={() => void onReview(true)}
          >
            {disabled ? 'Saving…' : 'Approve answer'}
          </button>
          <button
            className="button button-secondary"
            disabled={disabled}
            type="button"
            onClick={() => void onReview(false)}
          >
            Keep as incorrect
          </button>
        </div>
      ) : null}
    </section>
  )
}

function WaitingCard({
  compact = false,
  name,
  message,
  title,
}: {
  compact?: boolean
  name: string
  message?: string
  title?: ReactNode
}) {
  if (compact) {
    return (
      <section className="game-surface game-waiting is-compact" aria-live="polite">
        <div className="waiting-compact-copy">
          <span className="waiting-turn-label">{name} is choosing</span>
          <h2>{title ?? `Waiting for ${name}`}</h2>
          {message ? <p>{message}</p> : null}
          <span className="waiting-compact-progress" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
        <span className="waiting-word-deck" aria-hidden="true">
          <i>?</i>
          <i>?</i>
          <i>?</i>
        </span>
      </section>
    )
  }

  return (
    <section className="game-surface game-waiting" aria-live="polite">
      <div className="waiting-presence" aria-hidden="true">
        <span className="waiting-avatar">{name.trim().charAt(0).toUpperCase()}</span>
        <span className="waiting-dots">
          <i />
          <i />
          <i />
        </span>
      </div>
      <h2>{title ?? `Waiting for ${name}`}</h2>
      {message ? <p>{message}</p> : null}
    </section>
  )
}

function GameModeBadge({ mode }: { mode: WordGameMode }) {
  return (
    <span className={`game-mode-badge game-mode-${mode}`}>
      <span aria-hidden="true">{mode === 'live_call' ? '↗' : '●'}</span>
      {wordGameModeLabel(mode)}
    </span>
  )
}

function Scoreboard({ game }: { game: WordGame }) {
  return (
    <div className="game-scoreboard" aria-label="Score" aria-live="polite">
      <div className="is-you">
        <p>You</p>
        <strong key={`you-${game.scores.you}`}>{game.scores.you}</strong>
      </div>
      <span aria-hidden="true">:</span>
      <div className="is-partner">
        <p>{game.partner.displayName}</p>
        <strong key={`partner-${game.scores.partner}`}>{game.scores.partner}</strong>
      </div>
    </div>
  )
}

function RoomControlIcon({ icon }: { icon: 'finish' | 'leave' | 'timer' }) {
  if (icon === 'leave') {
    return (
      <svg className="room-control-icon" viewBox="0 0 28 28" aria-hidden="true">
        <path className="room-lobby-home" d="M4 13 14 4l10 9v11H4Z" />
        <path className="room-lobby-door" d="M11 24v-7h6v7" />
      </svg>
    )
  }
  if (icon === 'timer') {
    return (
      <svg className="room-control-icon" viewBox="0 0 28 28" aria-hidden="true">
        <path d="M10 3h8M14 3v3M21.5 7.5l2 2" />
        <circle cx="14" cy="16" r="9" />
        <path className="room-timer-hand" d="M14 16V10m0 6 4 2" />
      </svg>
    )
  }
  return (
    <svg className="room-control-icon" viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="10" />
      <rect className="room-end-stop" x="10" y="10" width="8" height="8" rx="1" />
    </svg>
  )
}

function preferredMimeType() {
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) =>
    MediaRecorder.isTypeSupported(type),
  )
}

function formatCountdown(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} sec`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder === 0 ? `${minutes} min` : `${minutes}:${String(remainder).padStart(2, '0')}`
}

function parseTimestamp(value?: string | null) {
  if (!value) return 0
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function useServerNow(serverTime?: string) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const observedAt = Date.now()
    const parsedServerTime = serverTime ? Date.parse(serverTime) : Number.NaN
    const serverOffset = Number.isFinite(parsedServerTime) ? parsedServerTime - observedAt : 0
    const timer = setInterval(() => setNow(Date.now() + serverOffset), 250)
    return () => clearInterval(timer)
  }, [serverTime])

  return now
}

async function convertRecordingToWav(recording: Blob) {
  const decodingContext = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await decodingContext.decodeAudioData(await recording.arrayBuffer())
  } finally {
    await decodingContext.close()
  }

  const sampleRate = 16_000
  const frameCount = Math.max(1, Math.ceil(decoded.duration * sampleRate))
  const renderingContext = new OfflineAudioContext(1, frameCount, sampleRate)
  const source = renderingContext.createBufferSource()
  source.buffer = decoded
  source.connect(renderingContext.destination)
  source.start()
  const rendered = await renderingContext.startRendering()
  return encodePcmWav(rendered.getChannelData(0), sampleRate)
}

function encodePcmWav(samples: Float32Array, sampleRate: number) {
  const bytesPerSample = 2
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample)
  const view = new DataView(buffer)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + samples.length * bytesPerSample, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * bytesPerSample, true)
  view.setUint16(32, bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, samples.length * bytesPerSample, true)
  samples.forEach((sample, index) => {
    const clipped = Math.max(-1, Math.min(1, sample))
    view.setInt16(
      44 + index * bytesPerSample,
      clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff,
      true,
    )
  })
  return new Blob([buffer], { type: 'audio/wav' })
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

function messageFromError(error: unknown) {
  if (error instanceof ApiError || error instanceof Error) return error.message
  return 'Something went wrong.'
}
