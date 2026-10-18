import { Eye } from 'lucide-react'
import { allDevPages } from '../../app/dev/devNav'
import { useEnterPreview } from '../../app/preview'
import { Panel } from '../../app/ui'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'

/**
 * A developer page that's planned but not built for real accounts yet. It says
 * what the page will do and opens the same page in the preview account.
 */
export function UnderDevelopment({ slug }: { slug: string }) {
  const page = allDevPages.find((candidate) => candidate.slug === slug)!
  const enterPreview = useEnterPreview()

  return (
    <div className="space-y-4">
      <h1 className="text-2xl tracking-[-0.02em]">{page.label}</h1>
      <Panel>
        <div className="flex flex-col items-start gap-5 py-6 md:flex-row md:items-center">
          <span className="flex size-12 shrink-0 items-center justify-center border border-taupe/60 text-muted">
            <Icon icon={page.icon} size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="inline-flex items-center gap-2 rounded-full border border-taupe/60 px-2.5 py-0.5 text-xs text-muted">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-burgundy" />
              In development
            </p>
            <p className="mt-3 max-w-xl text-sm leading-relaxed">{page.summary}</p>
            <p className="mt-1 text-sm text-muted">It isn’t live for accounts yet. See how it will work with sample data.</p>
          </div>
          <Button variant="outline" size="sm" leadingIcon={Eye} onClick={() => enterPreview(`/dev/${slug}`)}>
            Preview it
          </Button>
        </div>
      </Panel>
    </div>
  )
}
