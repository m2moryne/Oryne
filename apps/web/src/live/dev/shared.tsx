import { CopyButton } from '../../app/dev/devUi'

export const REPO = 'https://github.com/m2moryne/Oryne'

/** Developer pages that are built for real accounts. The rest show as in development. */
export const realPages = ['sdks', 'agents', 'merchant', 'contracts', 'debugger', 'logs', 'keys', 'webhooks']

/** A labelled value with a copy button, for IDs people paste into code. */
export function Value({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 border-t border-taupe/40 py-3 first:border-t-0 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="type-label text-muted">{label}</p>
        <p className="mt-1 truncate font-mono text-xs">{value}</p>
      </div>
      <CopyButton value={value} className="text-muted hover:text-charcoal" />
    </div>
  )
}

