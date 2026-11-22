import { useState } from 'react'
import { Link, Navigate, Route, Routes, useMatch, useNavigate } from 'react-router-dom'

import { DemoGame } from './DemoGame'
import { demoHomeState } from './demo-navigation'
import { DemoDurationPicker, DemoRoomHeader } from './DemoRoomHeader'
import { DemoSettingInfo } from './DemoSettingInfo'
import './demo-play.css'

export default function DemoPage() {
  const room = useMatch('/demo/play')
  const [duration, setDuration] = useState(60)
  const [selected, setSelected] = useState(false)
  const home = <DemoHome selected={selected} onSelect={setSelected} />

  return (
    <div className={`app-shell${room ? ' app-shell-room' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {!room ? (
        <header className="site-header">
          <Link
            className="wordmark"
            to="/"
            state={demoHomeState}
            aria-label="Meeting Place demo home"
          >
            <span className="brand-mark" aria-hidden="true">
              mp
            </span>
            <span>
              meeting
              <span className="brand-dot" aria-hidden="true" />
              <br />
              place
            </span>
          </Link>
          <div className="header-actions">
            <Link className="button button-secondary" to="/login">
              Sign in
            </Link>
          </div>
        </header>
      ) : null}
      <main id="main" className="main-content">
        <Routes>
          <Route path="/" element={home} />
          <Route path="/demo" element={home} />
          <Route
            path="/demo/settings"
            element={<DemoSettings duration={duration} onChange={setDuration} />}
          />
          <Route
            path="/demo/play"
            element={<DemoGame duration={duration} onDurationChange={setDuration} />}
          />
          <Route path="*" element={<Navigate to="/" state={demoHomeState} replace />} />
        </Routes>
      </main>
    </div>
  )
}

function DemoHome({
  selected,
  onSelect,
}: {
  selected: boolean
  onSelect: (selected: boolean) => void
}) {
  const navigate = useNavigate()

  return (
    <section className="quick-start-shell" id="practice-games">
      <div className="practice-step-heading">
        <h1>Choose a game</h1>
      </div>
      <div className="game-catalog">
        <div className="game-options" aria-label="Choose a game">
          <button
            type="button"
            className="game-choice"
            aria-label="Explain the word"
            aria-pressed={selected}
            onClick={() => onSelect(!selected)}
          >
            <span className="game-choice-art" aria-hidden="true">
              <svg viewBox="0 0 190 140">
                <path className="game-choice-ray" d="M40 28 24 10m49 12V4m27 31 17-17" />
                <path
                  className="game-choice-bubble game-choice-bubble-back"
                  d="M75 60h69a18 18 0 0 1 18 18v28a18 18 0 0 1-18 18h-13l-1 15-23-15H75a18 18 0 0 1-18-18V78a18 18 0 0 1 18-18Z"
                />
                <path
                  className="game-choice-bubble"
                  d="M22 42h86a19 19 0 0 1 19 19v31a19 19 0 0 1-19 19H67l-28 20 2-20H22A19 19 0 0 1 3 92V61a19 19 0 0 1 19-19Z"
                />
              </svg>
            </span>
            <span className="game-choice-copy">
              <strong>Explain the word</strong>
              <span>Describe it. Guess it.</span>
            </span>
            <span className="game-choice-state" aria-hidden="true">
              {selected ? '✓' : ''}
            </span>
          </button>
          <div className="future-game" aria-label="More games coming soon">
            <svg viewBox="0 0 96 76" aria-hidden="true">
              <path d="M35 17 29 6m19 8V2m13 15 6-11" />
              <path d="M26 26h44c9 0 16 7 16 16v14c0 9-7 16-16 16H26c-9 0-16-7-16-16V42c0-9 7-16 16-16Z" />
              <path d="M29 42v15m-8-7h16m27-4h.1m10 9h.1m-10 9h.1m-10-9h.1" />
            </svg>
            <strong>More games soon</strong>
          </div>
        </div>
      </div>
      <div className="quick-start-footer demo-play-footer">
        <div className="demo-play-action" data-ready={selected}>
          <span className="demo-play-paddle" aria-hidden="true" />
          <span className="demo-play-court" aria-hidden="true" />
          <span className="demo-play-ball" aria-hidden="true" />
          <button
            type="button"
            className="button button-primary"
            disabled={!selected}
            onClick={() => navigate('/demo/settings')}
          >
            Play
          </button>
          <span className="demo-play-paddle" aria-hidden="true" />
        </div>
      </div>
    </section>
  )
}

function DemoSettings({
  duration,
  onChange,
}: {
  duration: number
  onChange: (seconds: number) => void
}) {
  return (
    <>
      <DemoRoomHeader />
      <section className="game-lobby game-lobby-ready">
        <div className="game-lobby-copy">
          <fieldset className="game-mode-picker">
            <legend>
              <span className="setting-legend-content">
                <span>Mode</span>
                <DemoSettingInfo
                  label="About game modes"
                  text="Recorded: record a voice clue here for the scripted demo partner to answer. Live call is available when you play with a friend."
                />
              </span>
            </legend>
            <label data-cursor="interactive">
              <input type="radio" name="game-mode" value="recorded" defaultChecked />
              <span>
                <strong>Recorded</strong>
              </span>
              <i aria-hidden="true" />
            </label>
          </fieldset>
          <DemoDurationPicker value={duration} onChange={onChange} />
          <div className="game-lobby-actions">
            <Link className="button button-accent game-lobby-action" to="/demo/play">
              Start game
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
