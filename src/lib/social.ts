export const EMAIL = 'hello@oryne.org'

export type SocialId = 'x' | 'linkedin' | 'github'

/**
 * Oryne's social accounts. While `href` is empty the icon opens the
 * coming-soon page at `soonPath`; set `href` once the account exists.
 */
export const socials: Array<{ id: SocialId; label: string; href: string; soonPath: string }> = [
  { id: 'x', label: 'X', href: '', soonPath: '/x' },
  { id: 'linkedin', label: 'LinkedIn', href: '', soonPath: '/linkedin' },
  { id: 'github', label: 'GitHub', href: '', soonPath: '/github' },
]
