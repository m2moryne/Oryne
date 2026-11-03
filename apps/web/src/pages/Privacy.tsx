import { A, Bullets, ProsePage } from '../components/ProsePage'
import { usePageMeta } from '../hooks/usePageMeta'
import { publicPages } from '../lib/seo'
import { EMAIL } from '../lib/social'

export default function Privacy() {
  usePageMeta(publicPages.privacy)
  return (
    <ProsePage
      label="Privacy"
      title="Privacy policy"
      lede="What Oryne collects, why, who else sees it and what you can ask us to do with it. We collect what’s needed to run your wallet and nothing to sell."
      updated="November 3, 2026"
      sections={[
        {
          id: 'collect',
          title: 'What we collect',
          body: (
            <>
              <p>When you use Oryne we store:</p>
              <Bullets
                items={[
                  <>
                    <strong className="font-medium">Account details:</strong> your email address, or your Stellar address
                    if you sign in with Freighter. If you sign in with Google or GitHub, also the name and profile picture
                    they share.
                  </>,
                  <>
                    <strong className="font-medium">Wallet records:</strong> your wallet contract, agents and their limits,
                    payments, approvals, top-ups and withdrawals.
                  </>,
                  <>
                    <strong className="font-medium">Developer settings:</strong> API keys (as hashes), webhook URLs and
                    their delivery history, service listings and teammates you invite.
                  </>,
                  <>
                    <strong className="font-medium">Request logs:</strong> for each API call, the path, the result, how long
                    it took, the browser or client name and which agent or key made it. We keep these for 30 days.
                  </>,
                  <>
                    <strong className="font-medium">Questions to the AI debugger:</strong> what you ask, sent with the
                    details of the failed payment you’re asking about.
                  </>,
                ]}
              />
              <p>
                We use your IP address briefly to limit how many sign-in codes can be requested; we don’t store it with your
                account.
              </p>
            </>
          ),
        },
        {
          id: 'chain',
          title: 'What’s public on Stellar',
          body: (
            <p>
              Your wallet contract, its balance, your agents’ public keys, their limits and every payment are recorded on the
              Stellar network, which anyone can read. That’s how the limits are enforced, and we can’t remove it. Your email
              address and name are never written there.
            </p>
          ),
        },
        {
          id: 'use',
          title: 'How we use it',
          body: (
            <Bullets
              items={[
                'To run your wallet: show your balance and history, prepare changes for you to sign and process payments.',
                'To sign you in and keep your account secure.',
                'To send email you asked for: sign-in codes, team invitations and replies to your messages.',
                'To find and fix problems, and to understand how Oryne is used so we can improve it.',
              ]}
            />
          ),
        },
        {
          id: 'share',
          title: 'Who else sees it',
          body: (
            <>
              <p>We don’t sell your data or use it for advertising. We share it only with the services that run Oryne:</p>
              <Bullets
                items={[
                  <>Render, which hosts our API and database, and Vercel, which hosts this website.</>,
                  <>Resend, which sends our emails.</>,
                  <>Paystack, which processes card top-ups. Your card details go to Paystack, never to us.</>,
                  <>DeepSeek, which answers questions you ask the AI debugger.</>,
                  <>Google or GitHub, if you choose to sign in with them.</>,
                  <>The Stellar network, as described above.</>,
                ]}
              />
              <p>We may also disclose information when the law requires it.</p>
            </>
          ),
        },
        {
          id: 'browser',
          title: 'Cookies and your browser',
          body: (
            <p>
              We don’t use advertising or tracking cookies. The website keeps your sign-in session and preferences, like the
              dashboard theme, in your browser’s local storage. Signing out removes the session.
            </p>
          ),
        },
        {
          id: 'rights',
          title: 'Your choices',
          body: (
            <>
              <p>
                You can ask us for a copy of your data, to correct it, or to delete your account. Write to{' '}
                <A href={`mailto:${EMAIL}`}>{EMAIL}</A> from the email on your account. We’ll delete what we hold, except
                records we must keep by law. Data on the Stellar network can’t be deleted by anyone.
              </p>
              <p>You can withdraw your funds at any time from the dashboard, without asking us.</p>
            </>
          ),
        },
        {
          id: 'changes',
          title: 'Changes',
          body: (
            <p>
              If we change this policy we’ll update the date at the top, and for important changes we’ll tell you by email
              or in the dashboard. Questions: <A href={`mailto:${EMAIL}`}>{EMAIL}</A>.
            </p>
          ),
        },
      ]}
    />
  )
}
