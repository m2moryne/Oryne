import { Link } from 'react-router-dom'
import { A, Bullets, ProsePage } from '../components/ProsePage'
import { usePageMeta } from '../hooks/usePageMeta'
import { publicPages } from '../lib/seo'
import { EMAIL } from '../lib/social'

export default function Terms() {
  usePageMeta(publicPages.terms)
  return (
    <ProsePage
      label="Terms"
      title="Terms of use"
      lede="The agreement between you and Oryne when you use the website, the dashboard, the API and our packages. Please read it; it’s short."
      updated="November 3, 2026"
      sections={[
        {
          id: 'agree',
          title: 'Using Oryne',
          body: (
            <p>
              By creating an account or using Oryne you agree to these terms and to our{' '}
              <Link to="/privacy" className="underline underline-offset-4">
                privacy policy
              </Link>
              . If you use Oryne for a company, you confirm you may agree on its behalf. You must be old enough to enter a
              contract where you live.
            </p>
          ),
        },
        {
          id: 'testnet',
          title: 'Testnet',
          body: (
            <>
              <p>
                Oryne currently runs on Stellar testnet. Test USDC has no value and can’t be exchanged for money. The test
                network can be reset by Stellar, which erases wallets and balances on it.
              </p>
              <p>
                Card top-ups buy test USDC for trying Oryne. They don’t create a balance you can withdraw as money.
              </p>
            </>
          ),
        },
        {
          id: 'wallet',
          title: 'Your wallet and keys',
          body: (
            <Bullets
              items={[
                'Your wallet is a contract on Stellar owned by your passkey or Freighter account. You are responsible for keeping them safe. We can’t recover a wallet if you lose the key that owns it.',
                'You choose the agents you trust and their limits. Payments your agents make within those limits are yours.',
                'Keep agent keys and API keys secret. If one leaks, remove the agent or revoke the key in the dashboard.',
                'Payments on Stellar are final. We can’t reverse them.',
              ]}
            />
          ),
        },
        {
          id: 'acceptable',
          title: 'What you may not do',
          body: (
            <Bullets
              items={[
                'Break the law, or use Oryne to pay for or sell anything illegal.',
                'Try to access accounts or data that aren’t yours, or disrupt the service.',
                'Abuse the faucet, sign-in, email or AI debugger, for example with automated bulk requests.',
                'List a service in the directory that you don’t run or that misleads agents about what they pay for.',
              ]}
            />
          ),
        },
        {
          id: 'code',
          title: 'Open-source code',
          body: (
            <p>
              Oryne’s code and npm packages are released under the MIT licence, which governs your use of the code itself.
              These terms cover the service we run.
            </p>
          ),
        },
        {
          id: 'warranty',
          title: 'No warranty',
          body: (
            <>
              <p>
                Oryne is in development and provided as it is. We work to keep it running and correct, but we don’t promise
                it will be uninterrupted or free of errors. The wallet contract hasn’t been independently audited yet.
              </p>
              <p>
                To the extent the law allows, we aren’t liable for indirect or consequential losses, or for losses caused by
                agents acting within limits you set, by lost keys, or by the Stellar network.
              </p>
            </>
          ),
        },
        {
          id: 'ending',
          title: 'Ending',
          body: (
            <p>
              You can stop using Oryne at any time and withdraw your funds. We may suspend accounts that break these terms.
              Because the wallet is yours on Stellar, you keep control of it even if your Oryne account is closed.
            </p>
          ),
        },
        {
          id: 'changes',
          title: 'Changes',
          body: (
            <p>
              We’ll update these terms before mainnet and paid plans launch. When we change them we update the date at the
              top and tell you about important changes. Questions: <A href={`mailto:${EMAIL}`}>{EMAIL}</A>.
            </p>
          ),
        },
      ]}
    />
  )
}
