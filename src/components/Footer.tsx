import { Mail } from 'lucide-react'
import { Link } from 'react-router-dom'
import { footerGroups, legalLinks } from '../lib/site'
import { EMAIL, socials } from '../lib/social'
import { Icon } from './Icon'
import { Container } from './Section'
import { SocialIcon } from './SocialIcon'
import { Wordmark } from './Wordmark'

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
    <footer className="tone-cream border-t border-line">
      <Container className="pb-8 pt-16 md:pt-24">
        <div>
          <div className="grid gap-y-12 lg:grid-cols-12 lg:gap-x-8">
            <div className="lg:col-span-4">
              <Link to="/" aria-label="Oryne, home" className="text-lg">
                <Wordmark />
              </Link>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
                Infrastructure for autonomous commerce and machine-to-machine payments.
              </p>

              <ul className="mt-6 flex items-center gap-5">
                {socials.map((social) => (
                  <li key={social.id}>
                    {social.href ? (
                      <a href={social.href} aria-label={social.label} className={iconClasses}>
                        <SocialIcon id={social.id} size={18} />
                      </a>
                    ) : (
                      <Link
                        to={social.soonPath}
                        aria-label={`${social.label} (coming soon)`}
                        className={iconClasses}
                      >
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

              <p className="mt-8 inline-flex items-center gap-2.5 rounded-lg border border-taupe/50 px-3.5 py-2 text-sm">
                <span aria-hidden="true" className="size-2 rounded-full bg-burgundy" />
                More to come
              </p>
            </div>

            <nav
              aria-label="Footer"
              className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4 lg:col-span-8"
            >
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
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 mt-16 border-t border-line pt-6 text-sm md:mt-24">
            <p className="text-muted">© {new Date().getFullYear()} Oryne</p>
            <ul className="flex gap-7">
              {legalLinks.map((link) => (
                <li key={link.label}>
                  <FooterLink {...link} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </footer>
  )
}
