import { ArrowRight } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { EMAIL } from '../../lib/social'

const fieldClasses =
  'mt-2 block w-full border-b border-line bg-transparent py-3 text-lg outline-none transition-[border-color,box-shadow] duration-300 ease-quiet hover:border-charcoal/60 focus:border-burgundy focus:shadow-[0_1px_0_0_var(--color-burgundy)]'

type FieldProps = {
  label: string
  name: string
  type?: string
  autoComplete?: string
  optional?: boolean
}

function Field({ label, name, type = 'text', autoComplete, optional }: FieldProps) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="type-label flex justify-between text-muted">
        <span>{label}</span>
        {optional && <span>Optional</span>}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required={!optional}
        className={fieldClasses}
      />
    </div>
  )
}

/**
 * The site has no backend. Submitting drafts the message in the visitor's own
 * email client, addressed to Oryne.
 */
export function ContactForm() {
  const messageId = useId()
  const [drafted, setDrafted] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const value = (key: string) => String(data.get(key) ?? '').trim()

    const subject = `A conversation with Oryne: ${value('name')}`
    const signature = [value('name'), value('company'), value('email')].filter(Boolean).join('\n')
    const body = `${value('message')}\n\n${signature}`

    window.location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    setDrafted(true)
  }

  return (
    <form onSubmit={handleSubmit} aria-labelledby="contact-form-title" className="space-y-8">
      <Field label="Name" name="name" autoComplete="name" />
      <Field label="Email" name="email" type="email" autoComplete="email" />
      <Field label="Company" name="company" autoComplete="organization" optional />

      <div>
        <label htmlFor={messageId} className="type-label block text-muted">
          Message
        </label>
        <textarea id={messageId} name="message" rows={4} required className={`${fieldClasses} resize-y`} />
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 pt-2">
        <Button type="submit" variant="accent" icon={ArrowRight}>
          Send message
        </Button>
        <p role="status" className="max-w-xs text-sm leading-relaxed text-muted">
          {drafted
            ? `Your message has been drafted in your email client. If nothing opened, write to ${EMAIL}.`
            : 'Opens a draft in your email client.'}
        </p>
      </div>
    </form>
  )
}
