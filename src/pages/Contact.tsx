import { Reveal } from '../components/Reveal'
import { Container, Section } from '../components/Section'
import { usePageMeta } from '../hooks/usePageMeta'
import { ContactForm } from '../sections/contact/ContactForm'

export default function Contact() {
  usePageMeta(
    'Contact — Oryne',
    'Oryne is interested in conversations with builders, researchers, companies and people thinking seriously about autonomous systems.',
  )

  return (
    <>
      <section
        aria-labelledby="contact-title"
        className="tone-cream flex min-h-svh flex-col pt-(--nav-h)"
      >
        <Container className="flex flex-1 flex-col justify-center py-20">
          <h1 id="contact-title" className="type-display max-w-[11ch]">
            Let&rsquo;s build what comes next.
          </h1>
          <p className="type-lede mt-10 max-w-lg text-muted md:mt-14">
            We&rsquo;re interested in conversations with builders, researchers, companies and people
            thinking seriously about autonomous systems.
          </p>
        </Container>
      </section>

      <Section id="write" labelledBy="contact-form-title" tone="charcoal">
        <div className="my-auto grid gap-y-12 lg:grid-cols-12 lg:gap-x-8">
          <Reveal className="lg:col-span-5">
            <h2 id="contact-form-title" className="type-statement max-w-[9ch]">
              Write to us.
            </h2>
            <p className="type-lede mt-8 max-w-sm text-muted">
              Tell us who you are and what you are working on. We read everything.
            </p>
          </Reveal>

          <Reveal delay={120} className="lg:col-span-7">
            <div className="tone-cream border border-taupe p-7 sm:p-10 lg:p-14">
              <ContactForm />
            </div>
          </Reveal>
        </div>
      </Section>
    </>
  )
}
