import { PREVIEW_ON } from './flags'
import { EMAIL, socials } from './social'

type FooterLink = { label: string; to?: string; href?: string }

/**
 * Top navigation. Product is left out for now; its page still exists and is
 * linked from the footer.
 */
export const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/docs', label: 'Docs' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/app/developers', label: 'Developers' },
  { to: '/contact', label: 'Contact' },
]

/** Footer link columns. `to` is an internal route, `href` an external link. */
export const footerGroups: Array<{ title: string; links: FooterLink[] }> = [
  {
    title: 'Product',
    links: [
      { label: 'Overview', to: '/product' },
      { label: 'How it works', to: '/how-it-works' },
      { label: 'Dashboard', to: '/app' },
      ...(PREVIEW_ON ? [{ label: 'Preview', to: '/demo' }] : []),
      { label: 'Developers', to: '/app/developers' },
      { label: 'Documentation', to: '/docs' },
      { label: 'Pricing', to: '/pricing' },
      { label: 'Status', to: '/status' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', to: '/about' },
      { label: 'Vision', to: '/vision' },
      { label: 'Security', to: '/security' },
    ],
  },
  {
    title: 'Open source',
    links: [
      { label: 'GitHub', href: 'https://github.com/m2moryne/Oryne' },
      { label: 'npm packages', href: 'https://www.npmjs.com/org/oryne' },
    ],
  },
  {
    title: 'Connect',
    links: [
      { label: 'Contact', to: '/contact' },
      { label: EMAIL, href: `mailto:${EMAIL}` },
    ],
  },
]

export const legalLinks: FooterLink[] = [
  { label: 'Privacy Policy', to: '/privacy' },
  { label: 'Terms', to: '/terms' },
]

/**
 * Pages that are linked but not built yet. Each one renders the coming-soon
 * page. To launch one, remove it here and add a real <Route> in App.tsx.
 */
export const soonPages: Array<{ path: string; name: string }> = [
  ...socials
    .filter((social) => !social.href)
    .map((social) => ({ path: social.soonPath, name: `Oryne on ${social.label}` })),
]
