import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import type { Profile, WordGame } from '../../shared/contracts'
import { useAuth } from '../auth/AuthContext'
import { AppShell } from '../components/AppShell'
import { api, ApiError } from '../lib/api'

const TOPICS = ['Everyday life', 'Food', 'Travel', 'Nature', 'Work and study', 'Technology']

export function ExplainWordGamePage() {
  const { partnershipId = '' } = useParams()
  const navigate = useNavigate()
  const { session, signOut } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [game, setGame] = useState<WordGame | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
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
            Return to your partners
          </Link>
        </div>
      </main>
    )
  }

  return (
    <AppShell
      profile={profile}
      isBusy={isBusy}
      onSignOut={() => {
        if (game?.status === 'active' || game?.status === 'paused') {
          void api.leaveWordGame(partnershipId).catch(() => undefined)
        }
        void signOut()
      }}
    >
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            className="text-sm font-semibold text-emerald-800 hover:text-emerald-950"
            to="/"
            onClick={() => {
              if (game?.status === 'active' || game?.status === 'paused') {
                void api.leaveWordGame(partnershipId).catch(() => undefined)
              }
            }}
          >
            ← Your partners
          </Link>
          <h1 className="mt-3 font-serif text-4xl font-semibold">Explain the word</h1>
          <p className="mt-2 text-stone-600">
            Describe it without saying it. Your friend gets the next turn.
          </p>
        </div>
        {game && game.status !== 'pending' ? <Scoreboard game={game} /> : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}

      {!game ? (
        <section className="rounded-3xl bg-emerald-950 p-7 text-white shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-300">
            New game
          </p>
          <h2 className="mt-3 font-serif text-3xl font-semibold">Invite your partner to play</h2>
          <p className="mt-3 max-w-2xl leading-7 text-emerald-100">
            The game begins after your partner accepts. Then you will take the first turn and your
            partner will receive your recording and transcript before guessing.
          </p>
          <button
            type="button"
            className="button button-accent mt-6"
            disabled={isBusy}
            onClick={() => void run(() => api.startWordGame(partnershipId))}
          >
            {isBusy ? 'Sending…' : 'Send game request'}
          </button>
        </section>
      ) : game.status === 'pending' ? (
        <GameInvitation
          game={game}
          userId={session.user.id}
          disabled={isBusy}
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
          onEnd={() => setShowEndConfirmation(true)}
          onRestart={() => run(() => api.startWordGame(partnershipId))}
        />
      )}
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
  onEnd,
  onRestart,
}: {
  game: WordGame
  userId: string
  partnershipId: string
  isBusy: boolean
  run: (action: () => Promise<{ data: WordGame } | void>) => Promise<void>
  onEnd: () => void
  onRestart: () => Promise<void>
}) {
  const round = game.round
  const openRound = round?.status === 'explaining' || round?.status === 'awaiting_guess'
  const sessionLocked = game.status !== 'active'

  return (
    <div>
      {sessionLocked ? <SessionStatus game={game} userId={userId} /> : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_0.42fr]">
        <div>
          {!round || !openRound ? (
            game.currentPlayerId === userId ? (
              <NewRoundCard
                disabled={isBusy || sessionLocked}
                onCreate={(topic) => run(() => api.createWordRound(partnershipId, topic))}
              />
            ) : (
              <WaitingCard
                name={game.partner.displayName}
                message="It is their turn to choose a word."
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
                message="They are recording an explanation. This page refreshes automatically."
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
        </div>

        <aside className="space-y-4">
          {round ? <RoundSummary game={game} userId={userId} /> : null}
          <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">How it works</h2>
            <ol className="mt-3 space-y-2 text-sm leading-6 text-stone-600">
              <li>1. Choose a topic and get a private word.</li>
              <li>2. Record up to one minute without saying the word.</li>
              <li>3. Your partner reads the transcript and guesses.</li>
              <li>4. A correct guess earns the explainer one point.</li>
            </ol>
          </section>
          {game.status === 'finished' ? (
            <button
              type="button"
              className="button button-accent w-full"
              disabled={isBusy}
              onClick={() => void onRestart()}
            >
              {isBusy ? 'Starting…' : 'Start a new game'}
            </button>
          ) : (
            <button
              type="button"
              className="button button-danger w-full"
              disabled={isBusy}
              onClick={onEnd}
            >
              {isBusy ? 'Ending…' : 'End game'}
            </button>
          )}
        </aside>
      </div>
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
      className="fixed inset-0 z-50 grid place-items-center bg-emerald-950/60 p-5 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy) onCancel()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-game-title"
        aria-describedby="end-game-description"
        className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl"
      >
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-red-700">End game</p>
        <h2 id="end-game-title" className="mt-2 font-serif text-3xl font-semibold">
          Finish for both players?
        </h2>
        <p id="end-game-description" className="mt-3 leading-7 text-stone-600">
          Both players will leave the game immediately. The final score will remain available to
          review, but the game cannot be resumed.
        </p>
        <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
    ? Math.max(0, Math.ceil((new Date(game.reconnectDeadline).getTime() - now) / 1000))
    : 300
  const partnerLeft = game.disconnectedPlayerId === game.partner.id
  return (
    <section className="mb-6 rounded-3xl border border-amber-300 bg-amber-50 p-6" role="status">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-800">
        Game paused
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-stone-900">
            {partnerLeft ? `Waiting for ${game.partner.displayName}` : 'Reconnecting players…'}
          </h2>
          <p className="mt-1 text-stone-600">
            {game.disconnectedPlayerId === userId
              ? 'You are reconnecting. The game resumes when both players are online.'
              : 'Game actions are locked until both players are online.'}
          </p>
        </div>
        <p className="font-mono text-3xl font-semibold tabular-nums text-amber-900">
          {formatCountdown(seconds)}
        </p>
      </div>
    </section>
  )
}

function GameInvitation({
  disabled,
  game,
  onAccept,
  onCancel,
  onDecline,
  userId,
}: {
  disabled: boolean
  game: WordGame
  onAccept: () => Promise<void>
  onCancel: () => Promise<void>
  onDecline: () => Promise<void>
  userId: string
}) {
  const isRequester = game.requestedById === userId
  return (
    <section className="rounded-3xl border border-amber-200 bg-amber-50 p-7 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-800">
        Game request
      </p>
      <h2 className="mt-3 font-serif text-3xl font-semibold">
        {isRequester
          ? `Waiting for ${game.partner.displayName}`
          : `${game.partner.displayName} wants to play`}
      </h2>
      <p className="mt-3 max-w-2xl leading-7 text-stone-600">
        {isRequester
          ? 'The game will appear for both of you as soon as your partner accepts.'
          : 'Accept to start the shared game. The player who invited you will explain first.'}
      </p>
      <div className="mt-6 flex flex-wrap gap-2">
        {isRequester ? (
          <button
            type="button"
            className="button button-danger"
            disabled={disabled}
            onClick={() => void onCancel()}
          >
            Cancel request
          </button>
        ) : (
          <>
            <button
              type="button"
              className="button button-primary"
              disabled={disabled}
              onClick={() => void onAccept()}
            >
              {disabled ? 'Starting…' : 'Accept and play'}
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
      <p role="status" className="mt-5 text-sm text-stone-500">
        This page checks for updates automatically.
      </p>
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
    <section className="rounded-3xl bg-emerald-950 p-7 text-white shadow-lg">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-300">Your turn</p>
      <h2 className="mt-3 font-serif text-3xl font-semibold">Choose a topic</h2>
      <label className="mt-6 block text-sm text-emerald-100" htmlFor="word-topic">
        Topic
      </label>
      <select
        id="word-topic"
        className="mt-2 w-full rounded-xl bg-white px-3 py-3 text-stone-900"
        value={topic}
        disabled={disabled}
        onChange={(event) => setTopic(event.target.value)}
      >
        {TOPICS.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
      <button
        className="button button-accent mt-5"
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
    <section className="rounded-3xl border border-amber-200 bg-amber-50 p-7 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-800">
        {round.topic}
      </p>
      <h2 className="mt-4 text-sm font-medium text-stone-600">Your secret word</h2>
      <p className="mt-1 font-serif text-5xl font-semibold text-emerald-950">{round.secretWord}</p>
      <p className="mt-4 text-sm leading-6 text-stone-600">
        Do not say the word or any direct form shown below. Your recording is shared privately with
        your partner together with the transcript.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {round.forbiddenWords?.map((word) => (
          <span
            key={word}
            className="rounded-full bg-white px-3 py-1 text-sm text-stone-600 ring-1 ring-amber-200"
          >
            {word}
          </span>
        ))}
      </div>
      <AudioRecorder disabled={disabled} onSubmit={onSubmit} />
      <button
        type="button"
        className="button button-secondary mt-4"
        disabled={disabled}
        onClick={() => void onSkip()}
      >
        Skip this word
      </button>
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
    <div className="mt-7 rounded-2xl bg-white p-5 ring-1 ring-amber-200">
      <p className="font-medium">Record your explanation</p>
      <p className="mt-1 text-sm text-stone-500">
        Maximum one minute. Speak clearly and naturally.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
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
        <div
          role="status"
          aria-live="polite"
          className="mt-4 flex items-center justify-between rounded-xl bg-red-50 px-4 py-3 text-red-800 ring-1 ring-red-200"
        >
          <span className="text-sm font-medium">● Recording</span>
          <span className="font-mono text-xl font-semibold tabular-nums">
            {formatCountdown(secondsRemaining)} remaining
          </span>
        </div>
      ) : null}
      {isPreparing ? (
        <p role="status" className="mt-3 text-sm font-medium text-stone-600">
          Preparing the recording…
        </p>
      ) : null}
      {audioUrl ? (
        <audio className="mt-4 w-full" controls src={audioUrl}>
          Your browser cannot play this recording.
        </audio>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
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
    <section className="rounded-3xl border border-stone-200 bg-white p-7 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-800">
        Your guess
      </p>
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
  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
        Round {round.turnNumber}
      </p>
      <p className="mt-2 font-semibold">
        {round.explainerId === userId ? 'You explain' : `${game.partner.displayName} explains`}
      </p>
      {isFinished ? (
        <div className="mt-4 space-y-2 text-sm">
          <p>
            <span className="text-stone-500">Word:</span> <strong>{round.secretWord}</strong>
          </p>
          {round.status === 'skipped' ? (
            <p className="text-stone-600">This word was skipped.</p>
          ) : (
            <>
              <p>
                <span className="text-stone-500">Guess:</span> {round.guess}
              </p>
              <p
                className={
                  round.isCorrect ? 'font-semibold text-emerald-800' : 'font-semibold text-red-700'
                }
              >
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
        <p className="mt-3 text-sm leading-6 text-stone-600">{round.transcript}</p>
      ) : null}
      {round.explainerId === userId && round.coachScore !== null ? (
        <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950">
          <p className="font-semibold">AI coaching · {round.coachScore}/100</p>
          <p className="mt-1 leading-6">{round.coachFeedback}</p>
        </div>
      ) : null}
    </section>
  )
}

function WaitingCard({ name, message }: { name: string; message: string }) {
  return (
    <section className="rounded-3xl border border-dashed border-stone-300 bg-white px-7 py-14 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-amber-100 text-2xl">
        ⏳
      </div>
      <h2 className="mt-5 font-serif text-3xl font-semibold">Waiting for {name}</h2>
      <p className="mx-auto mt-3 max-w-lg text-stone-600">{message}</p>
    </section>
  )
}

function Scoreboard({ game }: { game: WordGame }) {
  return (
    <div
      className="flex rounded-2xl border border-stone-200 bg-white p-1 shadow-sm"
      aria-label="Score"
    >
      <div className="min-w-24 rounded-xl bg-emerald-950 px-4 py-2 text-center text-white">
        <p className="text-xs text-emerald-200">You</p>
        <p className="text-xl font-semibold">{game.scores.you}</p>
      </div>
      <div className="min-w-24 px-4 py-2 text-center">
        <p className="truncate text-xs text-stone-500">{game.partner.displayName}</p>
        <p className="text-xl font-semibold">{game.scores.partner}</p>
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
