import { EMAIL, socials } from './social'

type FooterLink = { label: string; to?: string; href?: string }

/** Top navigation. Pages that are not built yet open the coming-soon page. */
export const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/product', label: 'Product' },
  { to: '/dev', label: 'Developers' },
  { to: '/vision', label: 'Vision' },
  { to: '/journal', label: 'Journal' },
  { to: '/contact', label: 'Contact' },
]

/** Footer link columns. `to` is an internal route, `href` an external link. */
export const footerGroups: Array<{ title: string; links: FooterLink[] }> = [
  {
    title: 'Product',
    links: [
      { label: 'Overview', to: '/product' },
      { label: 'Dashboard', to: '/app' },
      { label: 'Developers', to: '/dev' },
      { label: 'Documentation', to: '/docs' },
      { label: 'Status', to: '/status' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Vision', to: '/vision' },
      { label: 'About', to: '/about' },
      { label: 'Careers', to: '/careers' },
      { label: 'Press', to: '/press' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Journal', to: '/journal' },
      { label: 'Research', to: '/research' },
      { label: 'Security', to: '/security' },
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
  { path: '/product', name: 'The product overview' },
  { path: '/docs', name: 'The documentation' },
  { path: '/status', name: 'The status page' },
  { path: '/about', name: 'The about page' },
  { path: '/careers', name: 'The careers page' },
  { path: '/press', name: 'The press room' },
  { path: '/journal', name: 'The journal' },
  { path: '/research', name: 'The research library' },
  { path: '/security', name: 'The security page' },
  { path: '/privacy', name: 'The privacy policy' },
  { path: '/terms', name: 'The terms page' },
  ...socials
    .filter((social) => !social.href)
    .map((social) => ({ path: social.soonPath, name: `Oryne on ${social.label}` })),
]
