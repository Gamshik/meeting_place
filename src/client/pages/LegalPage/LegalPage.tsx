import { Link } from 'react-router-dom'
import { OPERATOR_NAME, PRIVACY_CONTACT, PRIVACY_VERSION, TERMS_VERSION } from '@contracts/legal'

export function LegalLinks() {
  return (
    <nav className="legal-links" aria-label="Legal information">
      <Link to="/terms">Terms</Link>
      <Link to="/privacy">Privacy and deletion</Link>
    </nav>
  )
}

export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  const privacy = kind === 'privacy'
  return (
    <main className="legal-page">
      <Link to="/">Back to Meeting Place</Link>
      <article className="legal-card">
        <h1>{privacy ? 'Privacy and your data' : 'Terms of use'}</h1>
        <p>Version {privacy ? PRIVACY_VERSION : TERMS_VERSION}</p>
        <p>
          Meeting Place is operated by {OPERATOR_NAME}, based in Belarus. Contact:{' '}
          <a href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>.
        </p>
        {privacy ? (
          <>
            <h2>What we collect and why</h2>
            <p>
              Google sign-in and Supabase Auth provide your account identity, email, name, and
              profile image. We store your profile, username, time zone, partnerships, game
              activity, transcripts, guesses, and results to provide English practice and your
              history. We also record AI usage and estimated costs to operate the service. Hosting
              and authentication services may process technical information such as IP addresses and
              security logs.
            </p>
            <h2>Your recordings</h2>
            <p>
              Recording starts only when you choose to record. Before you send, the preview stays in
              your browser. When you send an explanation, we store its audio in private Supabase
              Storage and send it through OpenRouter to an AI provider for transcription. Your game
              partner can listen during the supported game flow. Recordings are not public. Do not
              record other people without their permission or include sensitive personal
              information.
            </p>
            <h2>Seven-day audio retention</h2>
            <p>
              Audio recordings expire seven days after their first upload. Automatic deletion runs
              every 15 minutes, so physical removal normally follows within 15 minutes of expiry.
              Failed deletions are retried. Previously issued playback links can remain usable for
              up to five minutes. We also remove abandoned uploads, including recordings whose
              transcription failed.
            </p>
            <p>
              This seven-day rule applies only to audio stored by Meeting Place. Transcripts,
              guesses, game results, profile information, Terms acceptance, and usage records remain
              until deleted through a request or another applicable retention rule. Deleting audio
              does not delete its transcript. Copies already downloaded by another person cannot be
              recalled.
            </p>
            <h2>Service providers and international processing</h2>
            <p>
              We use Google for sign-in, Supabase for authentication, database and storage,
              Cloudflare for hosting, and OpenRouter with its selected AI provider for transcription
              and other game AI features. Data may be processed outside your country, including
              outside Belarus and the European Economic Area. Provider retention and backups follow
              their own agreements and settings; the seven-day app cleanup does not automatically
              erase their copies.
            </p>
            <p>
              <a href="https://supabase.com/privacy">Supabase privacy</a> ·{' '}
              <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare privacy</a> ·{' '}
              <a href="https://openrouter.ai/privacy">OpenRouter privacy</a> ·{' '}
              <a href="https://policies.google.com/privacy">Google privacy</a>
            </p>
            <h2>Access, corrections, and deletion</h2>
            <p>
              You can edit your profile in account settings. For access, corrections, deletion of
              recordings or transcripts, or account deletion, email{' '}
              <a href={`mailto:${PRIVACY_CONTACT}?subject=Meeting%20Place%20privacy%20request`}>
                {PRIVACY_CONTACT}
              </a>{' '}
              from your account email and include your username and what you want removed. Do not
              send your password or identity documents. We may ask for reasonable verification
              before acting. We will explain any records we must retain and respond within the
              applicable legal deadline.
            </p>
            <h2>Adults only and browser storage</h2>
            <p>
              Meeting Place is for people aged 18 or older. The age confirmation is a declaration,
              not identity verification. Contact us if you believe a child has an account. We use
              browser storage for sign-in and application preferences.
            </p>
          </>
        ) : (
          <>
            <h2>Who can use Meeting Place</h2>
            <p>
              You must be at least 18 years old. By accepting these Terms, you confirm that you meet
              this requirement. Keep your account secure and provide accurate profile information.
            </p>
            <h2>Practice respectfully</h2>
            <p>
              Use the service for lawful English practice. Do not harass others, impersonate people,
              submit unlawful content, share other people's private information without permission,
              or bypass security and usage controls. Only upload content you have the right to use.
            </p>
            <h2>Recordings and AI</h2>
            <p>
              Sending an explanation allows us to store and process it to provide the game,
              transcription, and partner playback described in the{' '}
              <Link to="/privacy">Privacy notice</Link>. AI can make mistakes; game transcripts and
              results are not professional advice. Audio expires after seven days; transcripts and
              results have a different lifecycle.
            </p>
            <h2>Availability and account restrictions</h2>
            <p>
              This is an early version of the service. Features may change or be temporarily
              unavailable. We may restrict accounts that misuse the service or do not meet the age
              requirement. Contact us about an account restriction or to request deletion. Nothing
              in these Terms removes rights you have under applicable law.
            </p>
            <h2>Changes and questions</h2>
            <p>
              When we require acceptance of updated Terms, the app will show the new version before
              you continue. Contact <a href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a> with
              questions.
            </p>
          </>
        )}
        <LegalLinks />
      </article>
    </main>
  )
}
