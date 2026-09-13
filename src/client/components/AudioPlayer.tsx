import { useEffect, useRef, useState, type CSSProperties } from 'react'

const PLAYBACK_RATES = [0.75, 1, 1.25]

function formatAudioTime(value: number) {
  if (!Number.isFinite(value)) return '0:00'
  const seconds = Math.max(0, Math.floor(value))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function AudioPlayer({
  src,
  label = 'Voice recording',
  className = '',
}: {
  src: string
  label?: string
  className?: string
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [playbackRate, setPlaybackRate] = useState(1)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    audio.pause()
    audio.load()
    setCurrentTime(0)
    setDuration(0)
    setIsPlaying(false)
  }, [src])

  async function togglePlayback() {
    const audio = audioRef.current
    if (!audio) return

    if (!audio.paused) {
      audio.pause()
      return
    }

    if (audio.ended) audio.currentTime = 0
    try {
      await audio.play()
    } catch {
      setIsPlaying(false)
    }
  }

  function seek(value: number) {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = value
    setCurrentTime(value)
  }

  function updateVolume(value: number) {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = value
    audio.muted = value === 0
    setVolume(value)
    setIsMuted(value === 0)
  }

  function toggleMuted() {
    const audio = audioRef.current
    if (!audio) return
    audio.muted = !audio.muted
    setIsMuted(audio.muted)
  }

  function cyclePlaybackRate() {
    const audio = audioRef.current
    if (!audio) return
    const currentIndex = PLAYBACK_RATES.indexOf(playbackRate)
    const nextRate = PLAYBACK_RATES[(currentIndex + 1) % PLAYBACK_RATES.length]!
    audio.playbackRate = nextRate
    setPlaybackRate(nextRate)
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const audibleVolume = isMuted ? 0 : volume
  const playerStyle = {
    '--audio-progress': `${progress}%`,
    '--audio-volume': `${audibleVolume * 100}%`,
  } as CSSProperties

  return (
    <div
      className={`custom-audio-player ${className}`.trim()}
      role="group"
      aria-label={label}
      style={playerStyle}
    >
      <audio
        ref={audioRef}
        className="custom-audio-source"
        src={src}
        preload="metadata"
        onDurationChange={(event) => {
          const nextDuration = event.currentTarget.duration
          setDuration(Number.isFinite(nextDuration) ? nextDuration : 0)
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      >
        Your browser cannot play this recording.
      </audio>

      <button
        type="button"
        className="custom-audio-play"
        aria-label={isPlaying ? `Pause ${label}` : `Play ${label}`}
        onClick={() => void togglePlayback()}
      >
        <span aria-hidden="true">{isPlaying ? 'Ⅱ' : '▶'}</span>
      </button>

      <div className="custom-audio-timeline">
        <input
          type="range"
          min="0"
          max={duration || 0}
          step="0.05"
          value={Math.min(currentTime, duration || 0)}
          aria-label={`${label} progress`}
          aria-valuetext={`${formatAudioTime(currentTime)} of ${formatAudioTime(duration)}`}
          onChange={(event) => seek(Number(event.currentTarget.value))}
        />
        <div className="custom-audio-time" aria-hidden="true">
          <span>{formatAudioTime(currentTime)}</span>
          <span>{formatAudioTime(duration)}</span>
        </div>
      </div>

      <div className="custom-audio-volume">
        <button
          type="button"
          aria-label={isMuted ? 'Unmute recording' : 'Mute recording'}
          onClick={toggleMuted}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path className="custom-audio-speaker" d="M4 9v6h4l5 4V5L8 9H4Z" />
            {isMuted ? (
              <path d="m17 9 4 4m0-4-4 4" />
            ) : (
              <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" />
            )}
          </svg>
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={audibleVolume}
          aria-label="Recording volume"
          onChange={(event) => updateVolume(Number(event.currentTarget.value))}
        />
      </div>

      <button
        type="button"
        className="custom-audio-speed"
        aria-label={`Playback speed, ${playbackRate} times`}
        onClick={cyclePlaybackRate}
      >
        {playbackRate}×
      </button>
    </div>
  )
}
