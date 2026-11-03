export const EMAIL = 'info@oryne.org'

export type SocialId = 'x' | 'linkedin' | 'github'

/**
 * Oryne's social accounts. While `href` is empty the icon opens the
 * coming-soon page at `soonPath`; set `href` once the account exists.
 */
export const socials: Array<{ id: SocialId; label: string; href: string; soonPath: string }> = [
  { id: 'x', label: 'X', href: 'https://x.com/oryneorg', soonPath: '/x' },
  { id: 'github', label: 'GitHub', href: 'https://github.com/m2moryne/Oryne', soonPath: '/github' },
]
