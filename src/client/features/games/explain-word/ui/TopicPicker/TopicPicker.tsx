import { useState } from 'react'

import { TOPICS } from '@features/games/explain-word/model/game-constants'

export function NewRoundCard({
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
