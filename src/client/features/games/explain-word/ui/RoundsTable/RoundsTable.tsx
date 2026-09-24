import type { WordGameRoundSummary } from '../../../../../../shared/contracts'

export function RoundsTable({
  rounds,
  partnerId,
  partnerName,
}: {
  rounds: WordGameRoundSummary[]
  partnerId: string
  partnerName: string
}) {
  if (!rounds.length) {
    return <p className="rounds-empty">No rounds were played.</p>
  }

  return (
    <div className="rounds-table-wrap">
      <table className="rounds-table">
        <thead>
          <tr>
            <th scope="col">Round</th>
            <th scope="col">Explainer</th>
            <th scope="col">Topic</th>
            <th scope="col">Word</th>
            <th scope="col">Guess</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((round) => (
            <tr key={round.id}>
              <td>{round.turnNumber}</td>
              <td>{round.explainerId === partnerId ? partnerName : 'You'}</td>
              <td>{round.topic}</td>
              <td>{round.word ?? 'Hidden'}</td>
              <td>{round.guess ?? '—'}</td>
              <td>
                <RoundResult round={round} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RoundResult({ round }: { round: WordGameRoundSummary }) {
  if (round.status === 'skipped') return <span className="round-result is-skipped">Skipped</span>
  if (round.status === 'explaining' || round.status === 'awaiting_guess') {
    return <span className="round-result is-live">In progress</span>
  }
  if (round.isCorrect) return <span className="round-result is-correct">+1 correct</span>
  return <span className="round-result is-missed">No point</span>
}
