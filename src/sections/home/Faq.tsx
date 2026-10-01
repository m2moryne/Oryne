import { Plus } from 'lucide-react'
import { Icon } from '../../components/Icon'
import { Reveal } from '../../components/Reveal'
import { Section } from '../../components/Section'
import { TextLink } from '../../components/TextLink'

const faqs = [
  {
    question: 'What is Oryne?',
    answer:
      'Oryne is building infrastructure for autonomous commerce: the layer that lets software discover services, authorize spending and transact on behalf of the people and organizations it works for.',
  },
  {
    question: 'What does “machines can pay” mean?',
    answer:
      'Software is starting to act, not just advise. To finish a task it often needs to pay for something along the way, such as data, compute or a service. Oryne is working on the infrastructure that lets it do that directly, within limits someone has set.',
  },
  {
    question: 'Who is Oryne for?',
    answer:
      'People building autonomous systems, and the companies whose services those systems will need to reach and pay for.',
  },
  {
    question: 'How does an autonomous system stay under control?',
    answer:
      'Agency only works with limits. Identity, authorization, permissions and accountability are central to what we are building, so that every action traces back to a mandate someone gave.',
  },
  {
    question: 'Can I use Oryne today?',
    answer:
      'Not yet. Oryne is at the beginning and is being introduced gradually. If you want to talk before then, we would like to hear from you.',
  },
  {
    question: 'How do I get involved?',
    answer:
      'Write to us. We are interested in conversations with builders, researchers and companies thinking seriously about autonomous systems.',
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
