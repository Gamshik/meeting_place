import { useEffect, useRef, useState } from 'react'

import { DemoAudioPlayer } from './DemoAudioPlayer'
import { formatDemoClock } from './demo-clock'

type Capture = {
  stop: () => void
  discard: () => void
}

export function DemoRecorder({
  durationSeconds,
  onSend,
}: {
  durationSeconds: number
  onSend: () => void
}) {
  const capture = useRef<Capture | null>(null)
  const request = useRef(0)
  const preview = useRef<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'requesting' | 'recording' | 'finishing' | 'ready'>(
    'idle',
  )
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds)
  const [audio, setAudio] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    function stopWhenHidden() {
      if (document.hidden) capture.current?.stop()
    }

    document.addEventListener('visibilitychange', stopWhenHidden)
    return () => {
      document.removeEventListener('visibilitychange', stopWhenHidden)
      request.current += 1
      capture.current?.discard()
      if (preview.current) URL.revokeObjectURL(preview.current)
    }
  }, [])

  async function start() {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Recording is unavailable here. You can skip to the partner’s turn.')
      return
    }

    if (preview.current) {
      URL.revokeObjectURL(preview.current)
      preview.current = null
      setAudio(null)
    }
    const currentRequest = ++request.current
    setStatus('requesting')
    let stream: MediaStream | undefined

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const tracks = stream.getTracks()
      if (currentRequest !== request.current || document.hidden) {
        tracks.forEach((track) => track.stop())
        if (currentRequest === request.current) setStatus('idle')
        return
      }

      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      const deadline = Date.now() + durationSeconds * 1000

      function release() {
        window.clearTimeout(timer)
        window.clearInterval(countdown)
        tracks.forEach((track) => track.stop())
      }

      function stop() {
        if (recorder.state === 'inactive') return
        setStatus('finishing')
        recorder.stop()
        release()
      }

      function discard() {
        recorder.ondataavailable = null
        recorder.onstop = null
        recorder.onerror = null
        if (recorder.state !== 'inactive') recorder.stop()
        release()
        chunks.length = 0
      }

      const countdown = window.setInterval(() => {
        setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)))
      }, 250)
      const timer = window.setTimeout(stop, durationSeconds * 1000)
      capture.current = { stop, discard }
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data)
      }
      recorder.onstop = () => {
        release()
        capture.current = null
        if (!chunks.length) {
          setError('No audio was recorded. Try again or skip recording.')
          setStatus('idle')
          return
        }
        const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type })
        chunks.length = 0
        const url = URL.createObjectURL(blob)
        preview.current = url
        setAudio(url)
        setStatus('ready')
      }
      recorder.onerror = () => {
        discard()
        capture.current = null
        setError('Recording stopped unexpectedly. Try again or skip recording.')
        setStatus('idle')
      }

      recorder.start()
      setSecondsLeft(durationSeconds)
      setStatus('recording')
    } catch {
      capture.current?.discard()
      capture.current = null
      stream?.getTracks().forEach((track) => track.stop())
      if (currentRequest === request.current) {
        setError('Couldn’t access the microphone. Try again or skip recording.')
        setStatus('idle')
      }
    }
  }

  const isRecording = status === 'recording'
  const busy = status === 'requesting' || status === 'finishing'
  const startLabel = busy
    ? status === 'requesting'
      ? 'Starting recording'
      : 'Preparing recording'
    : audio
      ? 'Record again'
      : 'Start recording'

  return (
    <div
      className={`audio-recorder mic-recorder ${isRecording ? 'is-recording' : ''} ${audio ? 'has-recording' : ''}`}
    >
      <div className="mic-recorder-controls">
        {isRecording ? <MicWave /> : null}
        {isRecording ? (
          <button
            type="button"
            className="mic-control mic-main mic-stop"
            aria-label="Stop recording"
            title="Stop recording"
            onClick={() => capture.current?.stop()}
          >
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <rect className="mic-stop-square" x="7" y="7" width="18" height="18" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className={`mic-control ${audio ? 'mic-again' : 'mic-main'}`}
            disabled={busy}
            aria-label={startLabel}
            aria-describedby="demo-recording-privacy"
            title={startLabel}
            onClick={() => void start()}
          >
            {busy ? (
              <span className="mic-spinner" aria-hidden="true" />
            ) : (
              <svg viewBox="0 0 32 32" aria-hidden="true">
                {audio ? (
                  <path d="M6 12a11 11 0 1 1 0 10M6 5v7h7" />
                ) : (
                  <>
                    <rect x="12" y="3" width="8" height="17" rx="4" />
                    <path d="M7 14v3a9 9 0 0 0 18 0v-3M16 26v4M11 30h10" />
                  </>
                )}
              </svg>
            )}
          </button>
        )}
        {isRecording ? <MicWave /> : null}
        {audio ? (
          <>
            <DemoAudioPlayer
              key={audio}
              className="audio-recorder-preview"
              src={audio}
              label="Your recorded explanation"
            />
            <button
              className="mic-control mic-send"
              type="button"
              aria-label="Send explanation"
              title="Send explanation"
              onClick={onSend}
            >
              <svg viewBox="0 0 32 32" aria-hidden="true">
                <path d="m4 4 25 12L4 28l5-12-5-12ZM9 16h20" />
              </svg>
            </button>
          </>
        ) : null}
      </div>
      {isRecording ? (
        <div className="mic-countdown">
          <span className="sr-only">Recording</span>
          <strong role="timer">
            {formatDemoClock(secondsLeft)} <span className="sr-only">remaining</span>
          </strong>
        </div>
      ) : null}
      <p className="recording-privacy" id="demo-recording-privacy">
        Your recording stays on this device. It is never uploaded or saved and is discarded when you
        send it or leave the turn. The demo partner’s replies are scripted.
      </p>
      <span role="status" className="sr-only">
        {isRecording
          ? 'Recording started'
          : audio
            ? 'Recording ready to review and send'
            : busy
              ? startLabel
              : ''}
      </span>
      {error ? (
        <p role="alert" className="audio-recorder-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function MicWave() {
  return (
    <span className="mic-wave" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}
