/**
 * Titles and descriptions for every page, in one place. The pages read them at
 * runtime (usePageMeta), and scripts/seo.ts reads them at build time to write
 * sitemap.xml, robots.txt and a pre-filled HTML file per public page, so search
 * engines and link previews see the right title without running JavaScript.
 *
 * No imports here: the build script loads this file directly with Node.
 */

export const SITE_URL = 'https://oryne.org'

export type PageMeta = {
  title: string
  description: string
  /** Canonical path. Pages with a dynamic path leave it out and use the current one. */
  path?: string
  /** Keep out of search results: signed-in areas, placeholders. */
  noindex?: boolean
}

/** Public pages, in the order the sitemap lists them. */
export const publicPages = {
  home: {
    path: '/',
    title: 'Oryne — AI agent wallets with limits they can’t break',
    description:
      'Give your AI agent a wallet it can spend from, with a budget, a cap per payment and approved services enforced by a smart contract on Stellar. Not a promise: code.',
  },
  howItWorks: {
    path: '/how-it-works',
    title: 'How Oryne works — Give your AI agent a wallet with limits | Oryne',
    description:
      'In plain words: how you connect an AI agent to your Oryne wallet, what happens when it pays, and how people use it with Claude, their own agents, apps and paid services.',
  },
  product: {
    path: '/product',
    title: 'Product — Agent wallets, on-chain mandates and approvals | Oryne',
    description:
      'Everything an AI agent needs to pay safely: a wallet you own, spending mandates enforced on Stellar, ask-first approvals, live receipts, an MCP server, agent SDK and merchant kit.',
  },
  docs: {
    path: '/docs',
    title: 'Documentation — Agent SDK, MCP server and merchant kit | Oryne',
    description:
      'Developer docs for Oryne: give an AI agent a wallet with @oryne/agent or @oryne/mcp, charge agents with @oryne/merchant. Quickstart, API reference, refusal reasons and the x402 payment protocol on Stellar.',
  },
  vision: {
    path: '/vision',
    title: 'Vision — An economy where software can pay | Oryne',
    description:
      'AI agents are starting to act, not just advise. Oryne on autonomous systems, the payment infrastructure they need, and why the limits must live on-chain.',
  },
  contact: {
    path: '/contact',
    title: 'Contact Oryne — Agent payments, partnerships and research',
    description:
      'Talk to Oryne about agent wallets, accepting payments from AI agents, partnerships or research. Builders, researchers and companies welcome.',
  },
  pricing: {
    path: '/pricing',
    title: 'Pricing — No subscription, pay when your agents do | Oryne',
    description:
      'Free for your agents’ first $100 of payments each month, then 0.5% per payment capped at $2. No monthly fee, every feature included, receiving payments always free.',
  },
  about: {
    path: '/about',
    title: 'About Oryne — Wallets for software that pays',
    description:
      'Why Oryne gives AI agents wallets with limits enforced by a smart contract on Stellar, how we work, and where the project is today.',
  },
  status: {
    path: '/status',
    title: 'Status — Is Oryne working? | Oryne',
    description: 'Live checks of the Oryne API, x402 facilitator, Stellar network, sign-in, faucet and card top-ups.',
  },
  security: {
    path: '/security',
    title: 'Security — How Oryne keeps agent wallets safe | Oryne',
    description:
      'Who can move money, how agent limits are enforced on Stellar, how keys and secrets are handled, and how to report a vulnerability.',
  },
  privacy: {
    path: '/privacy',
    title: 'Privacy policy | Oryne',
    description: 'What Oryne collects, why, who else sees it, what is public on Stellar and the choices you have.',
  },
  terms: {
    path: '/terms',
    title: 'Terms of use | Oryne',
    description: 'The terms for using the Oryne website, dashboard, API and packages while Oryne runs on Stellar testnet.',
  },
} satisfies Record<string, PageMeta & { path: string }>

/** Pages that exist but should not be indexed. */
export const privatePages = {
  dashboard: {
    title: 'Dashboard — Oryne',
    description: 'Your agents, their mandates, approvals and every payment they make.',
    noindex: true,
  },
} satisfies Record<string, PageMeta>

/** Areas robots.txt asks crawlers to skip. */
export const disallowedPaths = ['/app', '/demo', '/dev']

/** Placeholder pages (lib/site.ts soonPages) render this. */
export const comingSoonMeta = (name: string): PageMeta => ({
  title: 'Coming soon — Oryne',
  description: `${name} is under construction. More to come from Oryne.`,
  noindex: true,
})
