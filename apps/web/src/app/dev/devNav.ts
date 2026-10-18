import {
  Activity,
  Bot,
  CreditCard,
  FileCode2,
  FlaskConical,
  KeyRound,
  Package,
  Rocket,
  ScrollText,
  Settings,
  Sparkles,
  Store,
  Users,
  Webhook,
  type LucideIcon,
} from 'lucide-react'

/**
 * The developer console's pages, shared by the preview account (/dev, sample
 * data) and real accounts (/app/developers). `slug` is the path under the base.
 */
export type DevPage = { slug: string; label: string; icon: LucideIcon; summary: string }

export const devGroups: Array<{ heading?: string; pages: DevPage[] }> = [
  {
    pages: [{ slug: '', label: 'Overview', icon: Rocket, summary: 'Your setup and the first steps to a paying agent.' }],
  },
  {
    heading: 'Build',
    pages: [
      {
        slug: 'keys',
        label: 'API keys',
        icon: KeyRound,
        summary: 'Secret keys for your servers, with scopes, separate test and live keys, and rotation.',
      },
      {
        slug: 'playground',
        label: 'Playground',
        icon: FlaskConical,
        summary: 'Send API requests and test payments from the browser and see exactly what comes back.',
      },
      {
        slug: 'debugger',
        label: 'AI debugger',
        icon: Sparkles,
        summary: 'Ask about a failed request or a refused payment and get the cause and the fix, read from your logs.',
      },
      {
        slug: 'sdks',
        label: 'SDKs & tools',
        icon: Package,
        summary: 'The agent SDK, the MCP server and the merchant kit.',
      },
    ],
  },
  {
    heading: 'Payments',
    pages: [
      { slug: 'agents', label: 'Agents', icon: Bot, summary: 'Every agent on your wallet, its key and its mandate.' },
      {
        slug: 'merchant',
        label: 'Accept payments',
        icon: Store,
        summary: 'Charge agents for your API per request, settled in USDC on Stellar.',
      },
      {
        slug: 'contracts',
        label: 'Contracts',
        icon: FileCode2,
        summary: 'Your agent-wallet contract on Stellar and the code it runs.',
      },
    ],
  },
  {
    heading: 'Monitor',
    pages: [
      {
        slug: 'logs',
        label: 'Logs',
        icon: ScrollText,
        summary: 'Every API request with its body, response, latency and the key that sent it.',
      },
      {
        slug: 'webhooks',
        label: 'Webhooks',
        icon: Webhook,
        summary: 'Get payment, approval and budget events sent to your server, signed, with retries.',
      },
      {
        slug: 'usage',
        label: 'Usage',
        icon: Activity,
        summary: 'Requests, payment volume and errors over time, by key and by agent.',
      },
    ],
  },
]

/** Reached from the account menu rather than the sidebar. */
export const accountPages: DevPage[] = [
  { slug: 'settings', label: 'Settings', icon: Settings, summary: 'Organization name, API version and security.' },
  { slug: 'team', label: 'Team', icon: Users, summary: 'Invite teammates and choose what each of them can do.' },
  { slug: 'billing', label: 'Billing', icon: CreditCard, summary: 'Your plan, invoices and payment method.' },
]

export const allDevPages = [...devGroups.flatMap((group) => group.pages), ...accountPages]

export const devPath = (base: string, slug: string) => (slug ? `${base}/${slug}` : base)
