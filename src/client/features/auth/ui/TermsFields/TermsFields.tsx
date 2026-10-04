import { Link } from 'react-router-dom'
import { TERMS_VERSION } from '@contracts/legal'
export function TermsFields({
  adult,
  terms,
  onAdult,
  onTerms,
}: {
  adult: boolean
  terms: boolean
  onAdult: (value: boolean) => void
  onTerms: (value: boolean) => void
}) {
  return (
    <>
      <p>Meeting Place is for adults aged 18 and older. Please confirm before continuing.</p>
      <label className="legal-check">
        <input
          type="checkbox"
          checked={adult}
          onChange={(event) => onAdult(event.target.checked)}
        />
        I am 18 years old or older.
      </label>
      <label className="legal-check">
        <input
          type="checkbox"
          checked={terms}
          onChange={(event) => onTerms(event.target.checked)}
        />
        <span>
          I accept the{' '}
          <Link className="legal-text-link" to="/terms" target="_blank" rel="noopener">
            Terms of use
          </Link>{' '}
          (version {TERMS_VERSION}).
        </span>
      </label>
      <p>
        Read our{' '}
        <Link className="legal-text-link" to="/privacy" target="_blank" rel="noopener">
          Privacy notice
        </Link>{' '}
        to understand recordings, AI processing, and deletion. This confirmation records your age
        declaration and Terms acceptance.
      </p>
    </>
  )
}
