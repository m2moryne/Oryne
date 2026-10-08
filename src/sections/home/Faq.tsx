import { Plus } from 'lucide-react'
import { Icon } from '../../components/Icon'
import { Reveal } from '../../components/Reveal'
import { Section } from '../../components/Section'
import { TextLink } from '../../components/TextLink'

const faqs = [
  {
    question: 'What is Oryne?',
    answer:
      'Oryne is the mandate layer for agent payments on Stellar. It gives an AI agent a wallet it can spend from, and enforces the limits you set (budget, per-payment cap, allowed services, expiry) in a smart contract, so they hold even if the agent or its key is compromised.',
  },
  {
    question: 'Does Oryne hold my money?',
    answer:
      'No. Funds sit in an agent-wallet contract that you own, unlocked by your passkey. Oryne never has custody and cannot move your funds; neither can an agent, beyond its mandate.',
  },
  {
    question: 'Why Stellar?',
    answer:
      'Agent payments are tiny and constant. Stellar settles in about five seconds for a fraction of a cent, has USDC natively, and already runs the open agent-payment protocols x402 and MPP. Its anchor network also lets people fund wallets and cash out in local currency.',
  },
  {
    question: 'What happens when an agent wants to spend more than its limit?',
    answer:
      'The contract refuses the payment and the agent asks you instead. You approve it once with your passkey, which signs a one-time allowance on-chain, or you decline. Nothing moves until you decide.',
  },
  {
    question: 'Which agents work with Oryne?',
    answer:
      'Any agent that can call a tool. The Oryne MCP server plugs into Claude, Cursor and other MCP clients, and the TypeScript and Python SDKs cover everything else.',
  },
  {
    question: 'I run an API. How do I get paid by agents?',
    answer:
      'Add the Oryne middleware to the routes you want to charge for and set a price. Agents get a 402 Payment Required, pay in USDC, and you are paid within seconds. You are listed in the directory automatically.',
  },
  {
    question: 'Can I use Oryne today?',
    answer:
      'The dashboard and developer console on this site are a working preview on simulated data. The agent-wallet contract is open source and runs on Stellar testnet. Write to us to join the pilot.',
  },
]

export function Faq() {
  return (
    <Section id="faq" labelledBy="faq-title" tone="white">
      <div className="my-auto grid gap-y-12 lg:grid-cols-12 lg:gap-x-8">
        <Reveal className="lg:col-span-5">
          <h2 id="faq-title" className="type-statement max-w-[10ch]">
            Questions, answered.
          </h2>
          <p className="type-lede mt-8 text-muted">
            Something else on your mind?{' '}
            <TextLink to="/contact" className="text-charcoal">
              Start a conversation
            </TextLink>
          </p>
        </Reveal>

        <Reveal delay={120} className="border-t border-line lg:col-span-7">
          {faqs.map((faq) => (
            <details key={faq.question} name="faq" className="group border-b border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-lg md:text-xl [&::-webkit-details-marker]:hidden">
                {faq.question}
                <Icon
                  icon={Plus}
                  size={20}
                  className="shrink-0 text-muted transition-transform duration-300 ease-quiet group-open:rotate-45"
                />
              </summary>
              <p className="max-w-xl pb-8 leading-relaxed text-muted">{faq.answer}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </Section>
  )
}
