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
              history. We also record provider-reported AI usage and costs, where available, to
              operate the service. Hosting and authentication services may process technical
              information such as IP addresses and security logs.
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
            <h2>What other users can see</h2>
            <p>
              Your friends can see your display name, username, profile image, and practice activity
              summaries. Game participants can see their shared transcripts, guesses, and results
              through the game and history screens. Audio playback is available to the game partner
              during the supported game flow. These features do not provide a public directory of
              users or public access to game history.
            </p>
            <p>
              Playback uses temporary links valid for up to five minutes. Anyone who obtains one of
              these links can play or download that recording until the link expires, even without
              signing in. Do not share playback links. Expiration does not erase downloaded copies.
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
              This seven-day rule applies only to audio stored by Meeting Place. Deleting audio does
              not delete its transcript. Copies already downloaded by another person cannot be
              recalled.
            </p>
            <h2>Other records and account deletion</h2>
            <p>
              Profiles, age declarations and Terms acceptance records, practice activity, and AI
              usage records are kept while your account exists. Transcripts, guesses, and results
              are kept with the shared game history. These records have no automatic age-based
              deletion schedule. You can request earlier deletion using the contact below.
            </p>
            <p>
              Deleting your account removes its profile, acceptance records, activity and usage
              records, partnerships, and associated shared games. Your partners also lose that
              shared game history, including transcripts and results; their accounts are not
              deleted. Deletion of either participant's account can therefore remove shared history.
              Related recordings are queued for cleanup, normally within 15 minutes, with failed
              deletions retried. Existing playback links may work briefly as described above.
            </p>
            <p>
              We retain identifiers of deleted games to find and remove related recordings,
              including delayed uploads. These cleanup records contain game identifiers and deletion
              times, not audio or transcripts, and currently have no automatic deletion schedule.
              Provider backups and technical logs have separate retention rules.
            </p>
            <h2>Service providers and international processing</h2>
            <p>
              We use Google for sign-in, Supabase for authentication, database and storage,
              Cloudflare for hosting, and OpenRouter for transcription and word-card generation. Our
              current models are Microsoft MAI-Transcribe 2 and OpenAI GPT-4o-mini, served through
              Microsoft Azure in our verified configuration. The model developer and the provider
              serving a request can be different organizations. Data may be processed outside your
              country, including outside Belarus and the European Economic Area. Provider retention
              and backups follow their own agreements and settings; the seven-day app cleanup does
              not automatically erase their copies.
            </p>
            <p>
              We configure OpenRouter to require zero-data-retention endpoints for the model groups
              used by these features, and OpenRouter input/output logging is disabled. These routing
              restrictions use OpenRouter's endpoint-specific policies; zero data retention does not
              mean no temporary processing in memory. OpenRouter's definition permits certain
              in-memory prompt caching. Request metadata, such as model, timing, and cost, is
              separate from audio, prompts, and response content and may be retained.
            </p>
            <p>
              These AI settings do not change Meeting Place's own storage and deletion periods.
              Provider information and this notice will be reviewed when our models, routing, or
              privacy settings change.
            </p>
            <p>
              <a href="https://supabase.com/privacy">Supabase privacy</a> ·{' '}
              <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare privacy</a> ·{' '}
              <a href="https://openrouter.ai/privacy">OpenRouter privacy</a> ·{' '}
              <a href="https://policies.google.com/privacy">Google privacy</a> ·{' '}
              <a href="https://www.microsoft.com/en-us/privacy/privacystatement">
                Microsoft privacy
              </a>{' '}
              ·{' '}
              <a href="https://openrouter.ai/docs/guides/features/zdr">
                OpenRouter zero data retention
              </a>
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
