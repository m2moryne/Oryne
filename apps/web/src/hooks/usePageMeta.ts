import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { SITE_URL, type PageMeta } from '../lib/seo'

/** Finds the head tag matching `selector`, creating it from `create` when missing. */
function headTag<T extends Element>(selector: string, create: () => T) {
  let tag = document.head.querySelector<T>(selector)
  if (!tag) {
    tag = create()
    document.head.append(tag)
  }
  return tag
}

const meta = (attribute: 'name' | 'property', key: string, content: string) =>
  headTag(`meta[${attribute}="${key}"]`, () => {
    const tag = document.createElement('meta')
    tag.setAttribute(attribute, key)
    return tag
  }).setAttribute('content', content)

/** Sets the title, description, canonical URL, social previews and robots rule for a page. */
export function usePageMeta({ title, description, path, noindex }: PageMeta) {
  const { pathname } = useLocation()
  const url = SITE_URL + (path ?? pathname)

  useEffect(() => {
    document.title = title
    meta('name', 'description', description)
    meta('property', 'og:title', title)
    meta('property', 'og:description', description)
    meta('property', 'og:url', url)
    meta('name', 'twitter:title', title)
    meta('name', 'twitter:description', description)
    meta('name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow')
    headTag('link[rel="canonical"]', () => {
      const tag = document.createElement('link')
      tag.rel = 'canonical'
      return tag
    }).href = url
  }, [title, description, url, noindex])
}
