import { useCallback, useEffect, useRef, useState } from 'react'

import { DemoClock } from './DemoClock'
import { DemoGuessCard } from './DemoGuessCard'
import { DemoGuessWaiting } from './DemoGuessWaiting'
import { DemoOutcome, type DemoRoundResult } from './DemoOutcome'
import { DemoRecordedWaiting } from './DemoRecordedWaiting'
import { DemoRecorder } from './DemoRecorder'
import { DemoRoomHeader } from './DemoRoomHeader'
import { DemoTopicPicker } from './DemoTopicPicker'
import words from './words.json'
import './demo-waiting.css'

const clues = import.meta.glob<string>('./clues/*.mp3', {
  eager: true,
  import: 'default',
  query: '?url',
})
const partner = 'Demo partner'
const guessSeconds = 90

type Topic = keyof typeof words
type Round = {
  number: number
  topic: Topic
  entry: (typeof words)[Topic][number]
  duration: number
}
type Turn =
  | { phase: 'topic'; topic?: Topic; result?: DemoRoundResult }
  | { phase: 'explain'; round: Round }
  | { phase: 'sending'; round: Round; guess: string; deadline: number; guessDeadline: number }
  | { phase: 'review-partner'; round: Round; guess: string }
  | { phase: 'review-player'; round: Round; guess: string; deadline: number }
  | { phase: 'preparing'; topic: Topic; result: DemoRoundResult; deadline: number }
  | { phase: 'recording'; round: Round; deadline: number; displayDeadline: number }
  | { phase: 'guess'; round: Round; deadline: number }

function partnerWaitMs() {
  return 5000 + Math.floor(Math.random() * 5001)
}

function normalizeGuess(guess: string) {
  return guess
    .toLowerCase()
    .trim()
    .replace(/^(?:a|an|the)\s+/u, '')
    .replace(/[^a-z]/gu, '')
}

function isCorrectGuess(guess: string, word: string) {
  const normalized = normalizeGuess(guess)
  return normalized === word || (normalized === `${word}s` && !word.endsWith('s'))
}

function roundResult(
  round: Round,
  guess: string,
  outcome: DemoRoundResult['outcome'],
): DemoRoundResult {
  return { number: round.number, word: round.entry.word, guess, outcome }
}

export function DemoGame({
  duration,
  onDurationChange,
}: {
  duration: number
  onDurationChange: (seconds: number) => void
}) {
  const [turn, setTurn] = useState<Turn>({ phase: 'topic' })
  const [score, setScore] = useState({ you: 0, partner: 0 })
  const nextWord = useRef<Partial<Record<Topic, number>>>({})
  const roundNumber = useRef(0)
  const partnerGuesses = useRef(0)

  const makeRound = useCallback(
    (topic: Topic): Round => {
      const index = nextWord.current[topic] ?? 0
      const deck = words[topic]
      nextWord.current[topic] = (index + 1) % deck.length
      return { number: ++roundNumber.current, topic, entry: deck[index]!, duration }
    },
    [duration],
  )

  const finish = useCallback(
    (
      round: Round,
      guess: string,
      outcome: DemoRoundResult['outcome'],
      guesser: 'you' | 'partner',
    ) => {
      if (outcome === 'success') {
        setScore((previous) => ({ ...previous, [guesser]: previous[guesser] + 1 }))
      }
      const result = roundResult(round, guess, outcome)
      setTurn(
        guesser === 'partner'
          ? {
              phase: 'preparing',
              topic: round.topic,
              result,
              deadline: Date.now() + partnerWaitMs(),
            }
          : { phase: 'topic', topic: round.topic, result },
      )
    },
    [],
  )

  useEffect(() => {
    if (!('deadline' in turn)) return
    const delay = Math.max(0, turn.deadline - Date.now())
    const timer = window.setTimeout(() => {
      switch (turn.phase) {
        case 'sending':
          if (isCorrectGuess(turn.guess, turn.round.entry.word)) {
            finish(turn.round, turn.guess, 'success', 'partner')
          } else {
            setTurn({ phase: 'review-partner', round: turn.round, guess: turn.guess })
          }
          break
        case 'preparing': {
          const round = makeRound(turn.topic)
          const startedAt = Date.now()
          setTurn({
            phase: 'recording',
            round,
            deadline: startedAt + round.entry.clueDurationMs,
            displayDeadline: startedAt + round.duration * 1000,
          })
          break
        }
        case 'recording':
          setTurn({ phase: 'guess', round: turn.round, deadline: Date.now() + guessSeconds * 1000 })
          break
        case 'guess':
          finish(turn.round, '', 'missed', 'you')
          break
        case 'review-player':
          finish(turn.round, turn.guess, 'missed', 'you')
          break
      }
    }, delay)
    return () => window.clearTimeout(timer)
  }, [finish, makeRound, turn])

  function send(round: Round) {
    const guess = partnerGuesses.current++ % 2 === 0 ? round.entry.word : round.entry.miss
    const now = Date.now()
    setTurn({
      phase: 'sending',
      round,
      guess,
      deadline: now + partnerWaitMs(),
      guessDeadline: now + guessSeconds * 1000,
    })
  }

  function submitGuess(round: Round, guess: string) {
    if (isCorrectGuess(guess, round.entry.word)) {
      finish(round, guess, 'success', 'you')
    } else {
      setTurn({ phase: 'review-player', round, guess, deadline: Date.now() + partnerWaitMs() })
    }
  }

  return (
    <>
      <DemoRoomHeader score={score} duration={duration} onDurationChange={onDurationChange} />
      <div className={`game-board${turn.phase === 'preparing' ? ' demo-waiting-for-partner' : ''}`}>
        <div className="game-play-area">
          {turn.phase === 'topic' ? (
            <DemoTopicPicker
              initialTopic={turn.topic}
              onCreate={(topic) => setTurn({ phase: 'explain', round: makeRound(topic) })}
            />
          ) : null}
          {turn.phase === 'explain' ? (
            <div className="recorded-round recorded-clue-stage">
              <section className="game-surface secret-surface explain-card live-explain-card">
                <div className="explain-brief">
                  <div className="secret-word-block">
                    <div className="secret-word-heading">
                      <span>Your secret word</span>
                      <button
                        type="button"
                        className="explain-skip-control"
                        aria-label="Skip word"
                        onClick={() => finish(turn.round, '', 'skipped', 'partner')}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="m5 5 10 7-10 7ZM19 5v14" />
                        </svg>
                        Skip
                      </button>
                    </div>
                    <h2>{turn.round.entry.word}</h2>
                  </div>
                  <div className="forbidden-words-block">
                    <p>Don’t say</p>
                    <div>
                      {turn.round.entry.avoid.map((word) => (
                        <span key={word}>{word}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
              <DemoRecorder durationSeconds={turn.round.duration} onSend={() => send(turn.round)} />
            </div>
          ) : null}
          {turn.phase === 'sending' ? (
            <div className="recorded-round">
              <DemoClock
                compact
                deadline={turn.guessDeadline}
                duration={guessSeconds}
                title="Listen and guess"
                description="The scripted partner will guess shortly."
              />
              <DemoGuessWaiting name={partner} />
            </div>
          ) : null}
          {turn.phase === 'preparing' || turn.phase === 'recording' ? (
            <div className="recorded-round recorded-clue-stage">
              {turn.phase === 'recording' ? (
                <DemoClock
                  deadline={turn.displayDeadline}
                  duration={turn.round.duration}
                  title="Recording in progress"
                  description="Your partner is recording the clue now."
                />
              ) : null}
              <DemoRecordedWaiting name={partner} state={turn.phase} />
            </div>
          ) : null}
          {turn.phase === 'guess' ? (
            <div className="recorded-round">
              <DemoClock
                compact
                deadline={turn.deadline}
                duration={guessSeconds}
                title="Listen and guess"
                description="Replay the recording as needed, then submit your answer."
              />
              <DemoGuessCard
                src={clues[`./clues/${turn.round.entry.word}.mp3`]!}
                transcript={turn.round.entry.clue}
                onGuess={(guess) => submitGuess(turn.round, guess)}
              />
            </div>
          ) : null}
          {turn.phase === 'review-partner' || turn.phase === 'review-player' ? (
            <DemoReview
              guess={turn.guess}
              word={turn.round.entry.word}
              onReview={
                turn.phase === 'review-partner'
                  ? (approved) =>
                      finish(turn.round, turn.guess, approved ? 'success' : 'missed', 'partner')
                  : undefined
              }
            />
          ) : null}
          {'result' in turn && turn.result ? <DemoOutcome result={turn.result} /> : null}
        </div>
      </div>
    </>
  )
}

function DemoReview({
  guess,
  word,
  onReview,
}: {
  guess: string
  word: string
  onReview?: (approved: boolean) => void
}) {
  return (
    <section
      className={`game-surface guess-review-card ${onReview ? 'is-explainer' : 'is-guesser'}`}
      aria-live="polite"
    >
      <div className="guess-review-heading">
        <h2>{onReview ? 'Does this answer count?' : 'Waiting for answer review'}</h2>
      </div>
      <div className="guess-review-comparison">
        {onReview ? (
          <div className="is-secret-word">
            <span>Secret word</span>
            <strong>{word}</strong>
          </div>
        ) : null}
        <div className="is-submitted-guess">
          <span>{onReview ? `${partner} guessed` : 'Your guess'}</span>
          <strong>{guess}</strong>
        </div>
      </div>
      {onReview ? (
        <div className="guess-review-actions">
          <button className="button button-primary" type="button" onClick={() => onReview(true)}>
            Approve answer
          </button>
          <button className="button button-secondary" type="button" onClick={() => onReview(false)}>
            Keep as incorrect
          </button>
        </div>
      ) : null}
    </section>
  )
}
