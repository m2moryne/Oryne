import { Eye } from 'lucide-react'
import { allDevPages } from '../../app/dev/devNav'
import { PREVIEW_ON, useEnterPreview } from '../../app/preview'
import { EmptyState, Panel } from '../../app/ui'
import { Button } from '../../components/Button'

/**
 * A developer page that isn't built for real accounts yet: its title and an
 * empty page. In builds with the preview on, it opens the same page there.
 */
export function UnderDevelopment({ slug }: { slug: string }) {
  const page = allDevPages.find((candidate) => candidate.slug === slug)!
  const enterPreview = useEnterPreview()

  return (
    <div className="space-y-4">
      <h1 className="text-2xl tracking-[-0.02em]">{page.label}</h1>
      <Panel flush>
        <EmptyState
          icon={page.icon}
          title="Nothing here yet"
          action={
            PREVIEW_ON && (
              <Button variant="outline" size="sm" leadingIcon={Eye} onClick={() => enterPreview(`/dev/${slug}`)}>
                Preview it
              </Button>
            )
          }
        />
      </Panel>
    </div>
  )
}
