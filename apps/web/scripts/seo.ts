/**
 * Runs after `vite build`. From the pages in src/lib/seo.ts it writes:
 *   - dist/<page>/index.html: the app's index.html with that page's title,
 *     description, canonical URL and social tags, so crawlers and link previews
 *     that don't run JavaScript still see the right page
 *   - dist/sitemap.xml and dist/robots.txt
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { disallowedPaths, publicPages, SITE_URL, type PageMeta } from '../src/lib/seo.ts'

const dist = fileURLToPath(new URL('../dist/', import.meta.url))
const template = readFileSync(`${dist}index.html`, 'utf8')

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** How often each page changes and how it ranks against the others, for the sitemap. */
const sitemapHints: Record<keyof typeof publicPages, { changefreq: string; priority: string }> = {
  home: { changefreq: 'weekly', priority: '1.0' },
  product: { changefreq: 'weekly', priority: '0.9' },
  vision: { changefreq: 'monthly', priority: '0.7' },
  contact: { changefreq: 'yearly', priority: '0.5' },
}

function pageHtml({ title, description, path }: PageMeta & { path: string }) {
  const url = escape(SITE_URL + path)
  const [t, d] = [escape(title), escape(description)]
  const replacements: Array<[RegExp, string]> = [
    [/<title>[^<]*<\/title>/, `<title>${t}</title>`],
    [/(<meta\s+name="description"\s+content=")[^"]*"/, `$1${d}"`],
    [/(<link rel="canonical" href=")[^"]*"/, `$1${url}"`],
    [/(<meta property="og:title" content=")[^"]*"/, `$1${t}"`],
    [/(<meta\s+property="og:description"\s+content=")[^"]*"/, `$1${d}"`],
    [/(<meta property="og:url" content=")[^"]*"/, `$1${url}"`],
    [/(<meta name="twitter:title" content=")[^"]*"/, `$1${t}"`],
    [/(<meta\s+name="twitter:description"\s+content=")[^"]*"/, `$1${d}"`],
  ]
  return replacements.reduce((html, [pattern, value]) => {
    if (!pattern.test(html)) throw new Error(`index.html has no tag matching ${pattern}`)
    return html.replace(pattern, value)
  }, template)
}

const pages = Object.entries(publicPages) as Array<[keyof typeof publicPages, (typeof publicPages)[keyof typeof publicPages]]>

for (const [, page] of pages) {
  const dir = page.path === '/' ? dist : `${dist}${page.path.slice(1)}/`
  mkdirSync(dir, { recursive: true })
  writeFileSync(`${dir}index.html`, pageHtml(page))
}

const today = new Date().toISOString().slice(0, 10)
writeFileSync(
  `${dist}sitemap.xml`,
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    ([key, page]) => `  <url>
    <loc>${SITE_URL}${page.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${sitemapHints[key].changefreq}</changefreq>
    <priority>${sitemapHints[key].priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`,
)

writeFileSync(
  `${dist}robots.txt`,
  `User-agent: *
Allow: /
${disallowedPaths.map((path) => `Disallow: ${path}`).join('\n')}

Sitemap: ${SITE_URL}/sitemap.xml
`,
)

console.log(`SEO: ${pages.length} pages, sitemap.xml and robots.txt written to dist/`)
