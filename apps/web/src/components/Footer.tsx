import { Mail } from 'lucide-react'
import { Link } from 'react-router-dom'
import { footerGroups, legalLinks } from '../lib/site'
import { EMAIL, socials } from '../lib/social'
import { Icon } from './Icon'
import { Container } from './Section'
import { SocialIcon } from './SocialIcon'
import { Logo } from './Logo'

const linkClasses = 'text-muted transition-colors duration-300 ease-quiet hover:text-charcoal'
const iconClasses = `${linkClasses} -m-2 block p-2`

function FooterLink({ label, to, href }: { label: string; to?: string; href?: string }) {
  return to ? (
    <Link to={to} className={linkClasses}>
      {label}
    </Link>
  ) : (
    <a href={href} className={linkClasses}>
      {label}
    </a>
  )
}

export function Footer() {
  return (
    <footer className="tone-white border-t border-line">
      <Container className="pb-8 pt-12 md:pt-16">
        {/* Brand row: large logo with the tagline beside it */}
        <div className="flex flex-wrap items-center justify-between gap-6">
          <Link to="/" aria-label="Oryne, home" className="block text-charcoal">
            <Logo height="var(--footer-logo-h)" className="[--footer-logo-h:56px] md:[--footer-logo-h:112px]" />
          </Link>
          <p className="max-w-sm text-sm leading-relaxed text-muted md:text-[0.95rem]">
            Wallets for AI agents, with limits enforced on Stellar. Infrastructure for autonomous commerce.
          </p>
        </div>

        <hr className="my-8 border-line md:my-10" />

        <div className="grid gap-y-10 lg:grid-cols-12 lg:gap-x-8">
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4 lg:col-span-9">
            {footerGroups.map((group) => (
              <div key={group.title}>
                <h2 className="text-sm font-semibold">{group.title}</h2>
                <ul className="mt-4 space-y-3 text-sm">
                  {group.links.map((link) => (
                    <li key={link.label}>
                      <FooterLink {...link} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <div className="lg:col-span-3 lg:justify-self-end">
            <h2 className="text-sm font-semibold">Follow</h2>
            <ul className="mt-4 flex items-center gap-5">
              {socials.map((social) => (
                <li key={social.id}>
                  {social.href ? (
                    <a href={social.href} aria-label={social.label} className={iconClasses}>
                      <SocialIcon id={social.id} size={18} />
                    </a>
                  ) : (
                    <Link to={social.soonPath} aria-label={`${social.label} (coming soon)`} className={iconClasses}>
                      <SocialIcon id={social.id} size={18} />
                    </Link>
                  )}
                </li>
              ))}
              <li>
                <a href={`mailto:${EMAIL}`} aria-label={`Email ${EMAIL}`} className={iconClasses}>
                  <Icon icon={Mail} size={20} />
                </a>
              </li>
            </ul>
          </div>
        </div>

        <hr className="mb-6 mt-12 border-line md:mt-16" />

        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 text-sm">
          <p className="text-muted">© {new Date().getFullYear()} Oryne. All rights reserved.</p>
          <ul className="flex flex-wrap gap-x-7 gap-y-2">
            {legalLinks.map((link) => (
              <li key={link.label}>
                <FooterLink {...link} />
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </footer>
  )
}
