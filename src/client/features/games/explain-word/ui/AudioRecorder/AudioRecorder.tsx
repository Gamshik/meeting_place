import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { AudioPlayer } from '@shared/ui/AudioPlayer/AudioPlayer'
import {
  convertRecordingToWav,
  preferredMimeType,
} from '@features/games/explain-word/lib/audio-recording'
import {
  formatCountdown,
  formatDuration,
  useServerNow,
} from '@features/games/explain-word/lib/game-time'

export function AudioRecorder({
  disabled,
  forceStop,
  durationSeconds,
  onStart,
  onStop,
  onSubmit,
  recordingStartedAt,
  serverTime,
}: {
  disabled: boolean
  forceStop: boolean
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

  useEffect(() => {
    if (!forceStop) return
    recordingBlocked.current = true
    discardOnStop.current = true
    if (stopTimer.current) clearTimeout(stopTimer.current)
    if (countdownTimer.current) clearInterval(countdownTimer.current)
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
    stream.current?.getTracks().forEach((track) => track.stop())
    const timer = window.setTimeout(() => {
      setIsRecording(false)
      setIsPreparing(false)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [forceStop])

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
