import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import type { Profile, WordGame } from '../../shared/contracts'
import { useAuth } from '../auth/AuthContext'
import { useCommunity } from '../community/CommunityContext'
import { AppShell } from '../components/AppShell'
import { RoundsTable } from '../components/RoundsTable'
import { Notice } from '../components/Panel'
import { api, ApiError } from '../lib/api'

const TOPICS = ['Everyday life', 'Food', 'Travel', 'Nature', 'Work and study', 'Technology']

export function ExplainWordGamePage() {
  const { partnershipId = '' } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { partnerships, sessions } = useCommunity()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [game, setGame] = useState<WordGame | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [showEndConfirmation, setShowEndConfirmation] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const joinedActiveSession = useRef(false)

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
  const partner = partnerships.find((item) => item.id === partnershipId)?.partner
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
    if (sessionStatus === 'active' || sessionStatus === 'paused') {
      joinedActiveSession.current = true
    } else if (sessionStatus === 'finished' && joinedActiveSession.current) {
      navigate('/', { replace: true })
    }
  }, [navigate, sessionStatus])

  async function run(action: () => Promise<{ data: WordGame } | void>) {
    if (isBusy) return
    setIsBusy(true)
    setError(null)
    try {
      const response = await action()
      setGame(response?.data ?? null)
    } catch (actionError) {
      setError(messageFromError(actionError))
    } finally {
      setIsBusy(false)
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
      onNavigate={() => {
        if (game?.status === 'active' || game?.status === 'paused') {
          void api.leaveWordGame(partnershipId).catch(() => undefined)
        }
      }}
    >
      <header
        className={`game-page-header ${game && game.status !== 'pending' ? 'is-active' : ''}`}
      >
        <div className="game-page-heading">
          <Link
            className="game-back-link"
            to="/"
            onClick={() => {
              if (game?.status === 'active' || game?.status === 'paused') {
                void api.leaveWordGame(partnershipId).catch(() => undefined)
              }
            }}
          >
            ← Games
          </Link>
          <div className="game-title-row">
            <div>
              <h1>Explain the word</h1>
              <p>Describe it without saying it. Then switch roles.</p>
            </div>
          </div>
        </div>
        <div className="game-header-tools">
          {game && game.status !== 'pending' ? <Scoreboard game={game} /> : null}
          <button
            type="button"
            className="game-icon-button"
            aria-label="How to play"
            title="How to play"
            onClick={() => setShowRules(true)}
          >
            i
          </button>
          {game && game.status !== 'pending' && game.status !== 'finished' ? (
            <button
              type="button"
              className="game-end-control"
              disabled={isBusy}
              onClick={() => setShowEndConfirmation(true)}
            >
              <span aria-hidden="true" />
              {isBusy ? 'Ending…' : 'End game'}
            </button>
          ) : game?.status === 'finished' ? (
            <button
              type="button"
              className="button button-primary"
              disabled={isBusy}
              onClick={() => void run(() => api.startWordGame(partnershipId))}
            >
              {isBusy ? 'Starting…' : 'New game'}
            </button>
          ) : null}
        </div>
      </header>

      {error ? <Notice error message={error} onClose={() => setError(null)} /> : null}

      {!game ? (
        <GameStartCard
          currentPlayerName={profile.displayName}
          partnerName={partner?.displayName}
          disabled={isBusy}
          blocked={hasOtherOngoingGame}
          onStart={() => run(() => api.startWordGame(partnershipId))}
        />
      ) : game.status === 'pending' ? (
        <GameInvitation
          game={game}
          userId={session.user.id}
          disabled={isBusy}
          acceptBlocked={hasOtherOngoingGame}
          onAccept={() => run(() => api.acceptWordGame(partnershipId))}
          onCancel={() => run(() => api.cancelWordGame(partnershipId))}
          onDecline={() => run(() => api.declineWordGame(partnershipId))}
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
  run: (action: () => Promise<{ data: WordGame } | void>) => Promise<void>
}) {
  const round = game.round
  const openRound = round?.status === 'explaining' || round?.status === 'awaiting_guess'
  const sessionLocked = game.status !== 'active'

  return (
    <div className="game-board">
      {sessionLocked ? <SessionStatus game={game} userId={userId} /> : null}
      <div className="game-play-area">
        {!round || !openRound ? (
          game.currentPlayerId === userId ? (
            <NewRoundCard
              disabled={isBusy || sessionLocked}
              onCreate={(topic) => run(() => api.createWordRound(partnershipId, topic))}
            />
          ) : (
            <WaitingCard
              name={game.partner.displayName}
              message="It is their turn to choose the next word."
            />
          )
        ) : round.status === 'explaining' ? (
          round.explainerId === userId ? (
            <ExplainCard
              disabled={isBusy || sessionLocked}
              game={game}
              onSkip={() => run(() => api.skipWordRound(partnershipId, round.id))}
              onSubmit={(audio) =>
                run(() => api.submitWordExplanation(partnershipId, round.id, audio))
              }
            />
          ) : (
            <WaitingCard
              name={game.partner.displayName}
              message="They are recording an explanation."
            />
          )
        ) : round.explainerId === userId ? (
          <WaitingCard
            name={game.partner.displayName}
            message="Your explanation is ready. They can now submit their guess."
          />
        ) : (
          <GuessCard
            disabled={isBusy || sessionLocked}
            audioAvailable={round.audioAvailable}
            partnershipId={partnershipId}
            roundId={round.id}
            transcript={round.transcript ?? ''}
            onGuess={(guess) => run(() => api.guessWord(partnershipId, round.id, guess))}
          />
        )}
        {round ? <RoundSummary game={game} userId={userId} /> : null}
      </div>
      <section className="rounds-section" aria-labelledby="game-rounds-title">
        <div className="rounds-section-heading">
          <div>
            <p className="eyebrow">Game record</p>
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
    </div>
  )
}

function GameStartCard({
  blocked,
  currentPlayerName,
  disabled,
  onStart,
  partnerName,
}: {
  blocked: boolean
  currentPlayerName: string
  disabled: boolean
  onStart: () => Promise<void>
  partnerName?: string
}) {
  const partnerLabel = partnerName ?? 'your partner'
  const currentInitial = currentPlayerName.trim().charAt(0).toUpperCase() || 'Y'
  const partnerInitial = partnerName?.trim().charAt(0).toUpperCase() || '?'

  return (
    <section className="game-lobby game-lobby-ready">
      <div className="game-lobby-copy">
        <p className="game-lobby-eyebrow">
          <span aria-hidden="true" /> Two-player game
        </p>
        <h2>Ready to play with {partnerLabel}?</h2>
        <p>Send one invitation. The game opens automatically for both of you when they accept.</p>
        <button
          type="button"
          className="button button-accent game-lobby-action"
          disabled={disabled || blocked}
          onClick={() => void onStart()}
        >
          {disabled ? 'Sending…' : blocked ? 'Finish your current game first' : 'Invite to play'}
        </button>
        {blocked ? (
          <p className="game-lobby-blocked" role="status">
            You can have only one active game at a time.
          </p>
        ) : null}
      </div>
      <div className="game-lobby-preview" aria-hidden="true">
        <div className="game-lobby-players">
          <span>{currentInitial}</span>
          <i>
            <b />
            <b />
            <b />
          </i>
          <span>{partnerInitial}</span>
        </div>
        <strong>You explain first</strong>
        <p>Then switch roles after every word.</p>
      </div>
    </section>
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
        <p id="game-rules-description" className="rules-intro">
          Take turns explaining and guessing. One clear clue can be enough.
        </p>
        <ol className="rules-steps">
          <li>
            <span>1</span>
            <div>
              <strong>Choose a topic</strong>
              <p>You receive a private word that your partner cannot see.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Explain naturally</strong>
              <p>Record up to one minute without saying the secret word or its forms.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Your partner guesses</strong>
              <p>They can listen to the recording and read the transcript.</p>
            </div>
          </li>
          <li>
            <span>4</span>
            <div>
              <strong>Switch roles</strong>
              <p>A correct guess earns the explainer one point, then the turn changes.</p>
            </div>
          </li>
        </ol>
        <div className="rules-tip">
          <span aria-hidden="true">!</span>
          <p>
            Using the secret word means no point for that round. AI feedback is private to the
            explainer and never changes the score.
          </p>
        </div>
      </section>
    </div>
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
        aria-describedby="end-game-description"
        className="game-dialog end-game-dialog"
      >
        <span className="end-game-symbol" aria-hidden="true">
          ■
        </span>
        <p className="end-game-label">End game</p>
        <h2 id="end-game-title">Finish for both players?</h2>
        <p id="end-game-description">
          Both players will leave the game immediately. The final score will remain available to
          review, but the game cannot be resumed.
        </p>
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
            {isBusy ? 'Ending…' : 'End game for everyone'}
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
      <section className="mb-6 rounded-3xl border border-stone-300 bg-stone-100 p-6" role="status">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-600">
          Game finished
        </p>
        <h2 className="mt-2 font-serif text-2xl font-semibold text-stone-900">
          {expiredWhilePaused ? 'Your partner did not reconnect in time' : 'This game was ended'}
        </h2>
        <p className="mt-2 text-stone-600">The final score is saved. Game actions are disabled.</p>
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
        <p className="session-pause-eyebrow">
          <span aria-hidden="true" /> Game paused
        </p>
        <h2>
          {partnerLeft
            ? `Waiting for ${game.partner.displayName}`
            : reconnectingSelf
              ? 'Reconnecting you…'
              : 'Reconnecting players…'}
        </h2>
        <p>
          {reconnectingSelf
            ? 'Trying to bring you back. Your round and recording are safe.'
            : 'Your round is safe. Play resumes when both players are back online.'}
        </p>
      </div>
      <div
        className="session-pause-timer"
        aria-label={`${formatCountdown(seconds)} remaining to reconnect`}
      >
        <span>Reconnect window</span>
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
  onAccept: () => Promise<void>
  onCancel: () => Promise<void>
  onDecline: () => Promise<void>
  userId: string
}) {
  const isRequester = game.requestedById === userId
  const partnerInitial = game.partner.displayName.trim().charAt(0).toUpperCase() || '?'
  return (
    <section className={`game-invitation-card ${isRequester ? 'is-sent' : 'is-received'}`}>
      <div className="game-invitation-avatar" aria-hidden="true">
        <span>{partnerInitial}</span>
        <i>{isRequester ? '…' : '!'}</i>
      </div>
      <div className="game-invitation-copy">
        <p className="game-lobby-eyebrow">
          <span aria-hidden="true" /> {isRequester ? 'Invitation sent' : 'Game invitation'}
        </p>
        <h2>
          {isRequester
            ? `Waiting for ${game.partner.displayName}`
            : `${game.partner.displayName} invited you`}
        </h2>
        <p>
          {isRequester
            ? 'You are all set. The game will open automatically as soon as they accept.'
            : 'Join the shared game now. The player who sent the invitation will explain first.'}
        </p>
        {isRequester ? (
          <p className="game-invitation-live" role="status">
            <span aria-hidden="true" /> Waiting for a response
          </p>
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
            Cancel invitation
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
  onCreate: (topic: string) => Promise<void>
}) {
  const [topic, setTopic] = useState(TOPICS[0]!)
  return (
    <section className="game-stage new-round-card">
      <p className="game-card-eyebrow">Your turn</p>
      <h2>Choose a topic</h2>
      <p className="new-round-intro">Pick a direction and we’ll find a fresh word for you.</p>
      <fieldset className="topic-picker" disabled={disabled}>
        <legend>Topic</legend>
        {TOPICS.map((option) => (
          <label key={option}>
            <input
              type="radio"
              name="word-topic"
              value={option}
              checked={topic === option}
              onChange={(event) => setTopic(event.target.value)}
            />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
      <button
        className="button button-accent new-round-action"
        type="button"
        disabled={disabled}
        onClick={() => void onCreate(topic)}
      >
        {disabled ? 'Creating…' : 'Give me a word'}
      </button>
    </section>
  )
}

function ExplainCard({
  disabled,
  game,
  onSkip,
  onSubmit,
}: {
  disabled: boolean
  game: WordGame
  onSkip: () => Promise<void>
  onSubmit: (audio: Blob) => Promise<void>
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
      <div className="explain-brief">
        <div className="secret-word-block">
          <span>Your secret word</span>
          <h2>{round.secretWord}</h2>
        </div>
        <div className="forbidden-words-block">
          <p>Don’t say</p>
          <div>
            {round.forbiddenWords?.map((word) => (
              <span key={word}>{word}</span>
            ))}
          </div>
        </div>
      </div>
      <AudioRecorder disabled={disabled} onSubmit={onSubmit} />
    </section>
  )
}

function AudioRecorder({
  disabled,
  onSubmit,
}: {
  disabled: boolean
  onSubmit: (audio: Blob) => Promise<void>
}) {
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [secondsRemaining, setSecondsRemaining] = useState(60)
  const [isPreparing, setIsPreparing] = useState(false)
  const [audio, setAudio] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(
    () => () => {
      if (stopTimer.current) clearTimeout(stopTimer.current)
      if (countdownTimer.current) clearInterval(countdownTimer.current)
      stream.current?.getTracks().forEach((track) => track.stop())
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    },
    [audioUrl],
  )

  async function startRecording() {
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
      const mimeType = preferredMimeType()
      const mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined)
      stream.current = mediaStream
      recorder.current = mediaRecorder
      chunks.current = []
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data)
      }
      mediaRecorder.onstop = async () => {
        const recording = new Blob(chunks.current, { type: mediaRecorder.mimeType || 'audio/webm' })
        mediaStream.getTracks().forEach((track) => track.stop())
        setIsRecording(false)
        setIsPreparing(true)
        try {
          const wav = await convertRecordingToWav(recording)
          setAudio(wav)
          setAudioUrl(URL.createObjectURL(wav))
        } catch {
          setError('This browser could not prepare the recording. Try Chrome, Edge, or Safari.')
        } finally {
          setIsPreparing(false)
        }
      }
      mediaRecorder.start()
      setSecondsRemaining(60)
      setIsRecording(true)
      stopTimer.current = setTimeout(stopRecording, 60_000)
      countdownTimer.current = setInterval(() => {
        setSecondsRemaining((current) => Math.max(0, current - 1))
      }, 1_000)
    } catch {
      setError('Allow microphone access to record your explanation.')
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
          <small>Up to one minute · Speak clearly and naturally</small>
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
          <strong>{formatCountdown(secondsRemaining)} remaining</strong>
        </div>
      ) : null}
      {isPreparing ? (
        <p role="status" className="audio-recorder-message">
          Preparing the recording…
        </p>
      ) : null}
      {audioUrl ? (
        <audio className="audio-recorder-preview" controls src={audioUrl}>
          Your browser cannot play this recording.
        </audio>
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
  partnershipId,
  roundId,
  transcript,
  onGuess,
}: {
  audioAvailable: boolean
  disabled: boolean
  partnershipId: string
  roundId: string
  transcript: string
  onGuess: (guess: string) => Promise<void>
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
  return (
    <section className="game-surface">
      <h2 className="mt-3 font-serif text-3xl font-semibold">What word did they describe?</h2>
      {audioUrl ? (
        <div className="mt-6 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="mb-2 text-sm font-medium text-stone-700">Listen to their explanation</p>
          <audio className="w-full" controls src={audioUrl}>
            Your browser cannot play this recording.
          </audio>
        </div>
      ) : audioAvailable && !audioError ? (
        <p role="status" className="mt-5 text-sm text-stone-500">
          Loading the recording…
        </p>
      ) : null}
      {audioError ? (
        <p role="alert" className="mt-5 text-sm text-red-700">
          {audioError}
        </p>
      ) : null}
      <blockquote className="mt-6 rounded-2xl bg-stone-100 p-5 leading-7 text-stone-700">
        “{transcript}”
      </blockquote>
      <form className="mt-6" onSubmit={submit}>
        <label className="text-sm font-medium" htmlFor="word-guess">
          Your answer
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="word-guess"
            className="input"
            value={guess}
            maxLength={80}
            required
            disabled={disabled}
            onChange={(event) => setGuess(event.target.value)}
          />
          <button className="button button-primary shrink-0" disabled={disabled} type="submit">
            {disabled ? 'Checking…' : 'Submit guess'}
          </button>
        </div>
      </form>
    </section>
  )
}

function RoundSummary({ game, userId }: { game: WordGame; userId: string }) {
  const round = game.round!
  const isFinished = round.status === 'completed' || round.status === 'skipped'
  const isMyTurn = round.explainerId === userId
  return (
    <section className="round-recap" aria-label={`Round ${round.turnNumber} summary`}>
      <div className="round-recap-heading">
        <div>
          <p>Round {round.turnNumber}</p>
          <h2>{isMyTurn ? 'You explain' : `${game.partner.displayName} explains`}</h2>
        </div>
        <span className={`round-status round-status-${round.status}`}>
          {round.status === 'completed'
            ? 'Complete'
            : round.status === 'skipped'
              ? 'Skipped'
              : round.status === 'awaiting_guess'
                ? 'Guessing'
                : 'Explaining'}
        </span>
      </div>
      {isFinished ? (
        <div className="round-recap-result">
          <div>
            <span>Word</span>
            <strong>{round.secretWord}</strong>
          </div>
          {round.status === 'skipped' ? (
            <p className="round-recap-message">This word was skipped.</p>
          ) : (
            <>
              <div>
                <span>Guess</span>
                <strong>{round.guess}</strong>
              </div>
              <p className={`round-recap-message ${round.isCorrect ? 'is-correct' : 'is-missed'}`}>
                {round.isCorrect
                  ? 'Correct — one point!'
                  : round.usedForbiddenWord
                    ? 'No point — the secret word was used.'
                    : 'Not quite this time.'}
              </p>
            </>
          )}
        </div>
      ) : round.transcript ? (
        <p className="round-transcript">{round.transcript}</p>
      ) : null}
      {isMyTurn && round.coachScore !== null ? (
        <details className="coaching-disclosure">
          <summary>
            <span>AI coaching · {round.coachScore}/100</span>
            <span aria-hidden="true">+</span>
          </summary>
          <p>{round.coachFeedback}</p>
        </details>
      ) : null}
    </section>
  )
}

function WaitingCard({ name, message }: { name: string; message: string }) {
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
      <p className="waiting-label">Partner's turn</p>
      <h2>Waiting for {name}</h2>
      <p>{message}</p>
    </section>
  )
}

function Scoreboard({ game }: { game: WordGame }) {
  return (
    <div className="game-scoreboard" aria-label="Score">
      <div className="is-you">
        <p>You</p>
        <strong>{game.scores.you}</strong>
      </div>
      <span aria-hidden="true">:</span>
      <div>
        <p>{game.partner.displayName}</p>
        <strong>{game.scores.partner}</strong>
      </div>
    </div>
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
