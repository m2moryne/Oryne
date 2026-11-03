import { A, Bullets, ProsePage } from '../components/ProsePage'
import { usePageMeta } from '../hooks/usePageMeta'
import { publicPages } from '../lib/seo'
import { EMAIL } from '../lib/social'

const REPO = 'https://github.com/m2moryne/Oryne'

export default function Security() {
  usePageMeta(publicPages.security)
  return (
    <ProsePage
      label="Security"
      title="Limits that hold even if we don’t."
      lede="Oryne is built so that the things that matter most, who owns the money and what agents may spend, don’t depend on trusting our servers."
      sections={[
        {
          id: 'model',
          title: 'Who can move money',
          body: (
            <>
              <p>
                Each account has its own wallet contract on Stellar. It holds the USDC and is owned by your passkey or
                your Freighter account. Only that owner can add or remove agents, change their limits, approve a payment
                beyond a mandate or withdraw.
              </p>
              <p>
                Oryne prepares those changes, but they only take effect once your passkey or Freighter signs them. We
                never hold the owner key, so we can’t sign for you.
              </p>
            </>
          ),
        },
        {
          id: 'mandates',
          title: 'How limits are enforced',
          body: (
            <>
              <p>
                Each agent has its own key and a mandate stored in the contract: a cap per payment, a budget per period
                and, if you choose, a list of payees. Whenever an agent pays, the Stellar network runs the contract’s
                authorization check against that mandate. A payment that breaks a rule fails on the network, and no money
                moves.
              </p>
              <p>
                Because the check runs on Stellar, it holds even if the Oryne API is down, misconfigured or compromised.
              </p>
            </>
          ),
        },
        {
          id: 'keys',
          title: 'Keys and secrets',
          body: (
            <Bullets
              items={[
                <>Agent keys are created in your browser. Oryne stores only the public key; the secret goes to your agent.</>,
                <>Passkeys stay on your device. We keep their public key so the contract can verify your signature.</>,
                <>API keys are read-only and stored as hashes; the full key is shown once, when you create it.</>,
                <>Sign-in codes are stored as hashes, expire after 10 minutes and are rate-limited.</>,
                <>Webhooks are signed with HMAC-SHA256 in the <code>oryne-signature</code> header, so you can check they came from us.</>,
                <>Sign-in sessions last 7 days, and you can sign out of every device from Settings.</>,
              ]}
            />
          ),
        },
        {
          id: 'teams',
          title: 'Teams',
          body: (
            <p>
              Teammates sign in as themselves and get a role: viewer, developer or admin. Roles are checked by the API on
              every request. No role can change the wallet; that stays with the owner’s signature.
            </p>
          ),
        },
        {
          id: 'status',
          title: 'Where we are today',
          body: (
            <>
              <p>
                Oryne runs on Stellar testnet with test USDC. The wallet contract hasn’t been independently audited yet. An
                audit is a condition for launching on mainnet with real money.
              </p>
              <p>
                All the code, including the contract, is open source on <A href={REPO}>GitHub</A> for anyone to review.
              </p>
            </>
          ),
        },
        {
          id: 'report',
          title: 'Reporting a vulnerability',
          body: (
            <>
              <p>
                If you find a security issue, please email <A href={`mailto:${EMAIL}?subject=Security%20report`}>{EMAIL}</A>{' '}
                with “Security report” in the subject. Include what you found, how to reproduce it and what it affects.
              </p>
              <Bullets
                items={[
                  'We’ll confirm we received it and keep you updated while we fix it.',
                  'Please give us reasonable time to fix it before you share it publicly.',
                  'Test only against your own accounts and testnet funds. Don’t access other people’s data or disrupt the service.',
                  'We won’t take action against good-faith research that follows these rules.',
                ]}
              />
            </>
          ),
        },
      ]}
    />
  )
}
