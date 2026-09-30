import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { AudioPlayer } from '@shared/ui/AudioPlayer/AudioPlayer'
import {
  convertRecordingToWav,
  preferredMimeType,
} from '@features/games/explain-word/lib/audio-recording'
import { formatCountdown, useServerNow } from '@features/games/explain-word/lib/game-time'

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
  const [isStarting, setIsStarting] = useState(false)
  const [isSending, setIsSending] = useState(false)
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
    if (isStarting || isPreparing || isSending || disabled) return
    setIsStarting(true)
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
      setIsStarting(false)
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
      stream.current?.getTracks().forEach((track) => track.stop())
      if (!recordingBlocked.current) {
        setError('Allow microphone access to record your explanation.')
      }
    } finally {
      setIsStarting(false)
    }
  }

  async function sendRecording() {
    if (!audio || isSending || disabled) return
    setIsSending(true)
    setError(null)
    try {
      await onSubmit(audio)
    } catch {
      setError('Could not send the recording. Try again.')
    } finally {
      setIsSending(false)
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
    <div
      className={`audio-recorder mic-recorder ${isRecording ? 'is-recording' : ''} ${audio ? 'has-recording' : ''}`}
    >
      <div className="mic-recorder-controls">
        {isRecording ? (
          <span className="mic-wave" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        ) : null}
        {!isRecording ? (
          <button
            type="button"
            className={`mic-control ${audio ? 'mic-again' : 'mic-main'}`}
            disabled={disabled || isPreparing || isStarting || isSending}
            aria-label={
              isStarting
                ? 'Starting recording'
                : isPreparing
                  ? 'Preparing recording'
                  : audio
                    ? 'Record again'
                    : 'Start recording'
            }
            title={audio ? 'Record again' : 'Start recording'}
            onClick={() => void startRecording()}
          >
            {isPreparing || isStarting ? (
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
        ) : (
          <button
            type="button"
            className="mic-control mic-main mic-stop"
            aria-label="Stop recording"
            title="Stop recording"
            onClick={stopRecording}
          >
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <rect className="mic-stop-square" x="7" y="7" width="18" height="18" rx="2" />
            </svg>
          </button>
        )}
        {isRecording ? (
          <span className="mic-wave" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        ) : null}
        {audioUrl ? (
          <AudioPlayer
            className="audio-recorder-preview"
            src={audioUrl}
            label="Your recorded explanation"
          />
        ) : null}
        {audio ? (
          <button
            type="button"
            className="mic-control mic-send"
            disabled={disabled || isSending}
            aria-label={isSending ? 'Transcribing' : 'Send explanation'}
            title="Send explanation"
            onClick={() => void sendRecording()}
          >
            {isSending ? (
              <span className="mic-spinner" aria-hidden="true" />
            ) : (
              <svg viewBox="0 0 32 32" aria-hidden="true">
                <path d="m4 4 25 12L4 28l5-12-5-12ZM9 16h20" />
              </svg>
            )}
          </button>
        ) : null}
      </div>
      {isRecording ? (
        <div className="mic-countdown">
          <span className="sr-only">Recording</span>
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
            <span className="sr-only">remaining</span>
          </strong>
        </div>
      ) : null}
      <span role="status" className="sr-only">
        {isSending
          ? 'Sending and transcribing your recording'
          : isStarting
            ? 'Waiting for microphone access'
            : isPreparing
              ? 'Preparing the recording'
              : isRecording
                ? 'Recording started'
                : audio
                  ? 'Recording ready to review and send'
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
