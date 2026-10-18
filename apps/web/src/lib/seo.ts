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
  product: {
    path: '/product',
    title: 'Product — Agent wallets, on-chain mandates and approvals | Oryne',
    description:
      'Everything an AI agent needs to pay safely: a wallet you own, spending mandates enforced on Stellar, ask-first approvals, live receipts, an MCP server, agent SDK and merchant kit.',
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
} satisfies Record<string, PageMeta & { path: string }>

/** Pages that exist but should not be indexed. */
export const privatePages = {
  dashboard: {
    title: 'Dashboard — Oryne',
    description: 'Your agents, their mandates, approvals and every payment they make.',
    noindex: true,
  },
  demo: {
    title: 'Demo dashboard — Oryne',
    description: 'A clickable tour of the Oryne dashboard on sample data.',
    noindex: true,
  },
  developers: {
    title: 'Developer console — Oryne',
    description: 'A preview of the Oryne developer console on sample data.',
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
