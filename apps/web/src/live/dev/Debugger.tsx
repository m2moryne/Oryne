import { MessageSquare, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { DebugChat, type ChatMessage } from '../../app/dev/DebugChat'
import { Panel } from '../../app/ui'
import { Icon } from '../../components/Icon'
import { cn } from '../../lib/cn'
import { askDebugger, MODE, type DebugTurn } from '../api'
import { useLive } from '../LiveContext'
import { when } from '../shared'

const starters = ['Why was my last payment refused?', 'Which agent is closest to its budget?', 'Is anything stopping my agents from paying?']

/** A saved conversation. Kept in this browser only. */
type Chat = { id: string; title: string; updated: number; messages: ChatMessage[] }

const MAX_CHATS = 30
const storageKey = (walletId: string) => `oryne.debugger.${MODE}.${walletId}`

function loadChats(walletId: string): Chat[] {
  try {
    const raw = localStorage.getItem(storageKey(walletId))
    const chats = raw ? (JSON.parse(raw) as Chat[]) : []
    return Array.isArray(chats) ? chats : []
  } catch {
    return []
  }
}

function saveChats(walletId: string, chats: Chat[]) {
  try {
    localStorage.setItem(storageKey(walletId), JSON.stringify(chats.slice(0, MAX_CHATS)))
  } catch {
    // Storage can be full or blocked; the chat still works, it just isn't remembered.
  }
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)
const titleFor = (question: string) => (question.length > 60 ? `${question.slice(0, 57).trimEnd()}…` : question)

/** The AI debugger for a real account: DeepSeek, grounded in this wallet's own data. */
export default function Debugger() {
  const live = useLive()
  const walletId = live.wallet?.id
  const [chats, setChats] = useState<Chat[]>([])
  const [chatId, setChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const abort = useRef<AbortController | null>(null)
  // Set while a question is in flight, so opening an old chat doesn't count as a change to it.
  const unsaved = useRef(false)

  useEffect(() => () => abort.current?.abort(), [])

  useEffect(() => {
    if (!walletId) return
    setChats(loadChats(walletId))
    setChatId(null)
    setMessages([])
  }, [walletId])

  // Save the open chat whenever an answer has finished.
  useEffect(() => {
    if (!walletId || !chatId || busy || !unsaved.current) return
    unsaved.current = false
    const first = messages.find((message) => message.from === 'you')
    setChats((current) => {
      const existing = current.find((chat) => chat.id === chatId)
      const saved: Chat = {
        id: chatId,
        title: existing?.title ?? titleFor(first?.text ?? 'New chat'),
        updated: Date.now(),
        messages: messages.map(({ from, text, failed }) => ({ from, text, failed })),
      }
      const next = [saved, ...current.filter((chat) => chat.id !== chatId)]
      saveChats(walletId, next)
      return next
    })
  }, [busy, chatId, walletId])

  // The Logs page sends a failed request here with its question ready.
  const location = useLocation()
  const navigate = useNavigate()
  const handedOver = (location.state as { ask?: string } | null)?.ask

  const enabled = live.info?.features?.aiDebugger ?? false

  const open = (chat: Chat | null) => {
    if (busy) return
    setChatId(chat?.id ?? null)
    setMessages(chat?.messages ?? [])
  }

  const remove = (id: string) => {
    if (!walletId || busy) return
    const next = chats.filter((chat) => chat.id !== id)
    setChats(next)
    saveChats(walletId, next)
    if (id === chatId) open(null)
  }

  const ask = async (question: string, fresh = false) => {
    if (!live.session || !live.wallet || busy) return
    const prior = fresh ? [] : messages
    // The conversation so far, as the API wants it: real turns only, no failures.
    const history: DebugTurn[] = prior
      .filter((message) => !message.failed && message.text)
      .map((message) => ({ role: message.from === 'you' ? 'user' : 'assistant', content: message.text }))
    const turns: DebugTurn[] = [...history, { role: 'user', content: question }]

    if (fresh || !chatId) setChatId(newId())
    unsaved.current = true
    setBusy(true)
    setMessages([...prior, { from: 'you', text: question }, { from: 'ai', text: '', pending: true }])
    const update = (patch: Partial<ChatMessage>) =>
      setMessages((current) => [...current.slice(0, -1), { ...current[current.length - 1], ...patch }])

    abort.current = new AbortController()
    let text = ''
    try {
      await askDebugger(
        live.wallet.id,
        live.session.token,
        turns,
        (chunk) => {
          text += chunk
          update({ text })
        },
        abort.current.signal,
      )
      update({ pending: false })
    } catch (error) {
      if (abort.current.signal.aborted) {
        unsaved.current = false
        return
      }
      update({ text: (error as Error).message, pending: false, failed: true })
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!handedOver || !enabled || !live.wallet) return
    navigate(location.pathname, { replace: true, state: null })
    void ask(handedOver, true)
    // Runs once per hand-over; ask() reads current state when it is called.
  }, [handedOver, enabled, live.wallet])

  if (!enabled) {
    return (
      <div>
        <h1 className="sr-only">AI debugger</h1>
        <Panel>
          <p className="text-sm">The AI debugger isn’t switched on for this server yet.</p>
        </Panel>
      </div>
    )
  }

  const empty = (
    <div className="w-full max-w-xl text-center">
      <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-charcoal text-cream">
        <Icon icon={Sparkles} size={18} />
      </span>
      <p className="mt-5 text-lg tracking-[-0.01em]">What’s stopping your agents?</p>
      <p className="mt-2 text-sm text-muted">I read your wallet, your agents’ mandates, recent payments and approvals.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {starters.map((starter) => (
          <button
            key={starter}
            type="button"
            disabled={busy}
            onClick={() => ask(starter, true)}
            className="rounded-full border border-taupe/60 px-4 py-2 text-sm transition-colors hover:border-charcoal disabled:opacity-45"
          >
            {starter}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    // Fills the rest of the screen and runs to its bottom edge, past the shell's padding.
    <div className="relative -mb-3 min-h-[28rem] flex-1 md:-mb-4">
      <h1 className="sr-only">AI debugger</h1>
      <div className="absolute inset-0 flex gap-4">
        <aside className="hidden w-64 shrink-0 flex-col xl:flex">
          <button
            type="button"
            onClick={() => open(null)}
            disabled={busy}
            className="flex items-center gap-2 rounded-full border border-taupe/60 px-4 py-2.5 text-sm transition-colors hover:border-charcoal disabled:opacity-45"
          >
            <Icon icon={Plus} size={15} />
            New chat
          </button>
          <p className="type-label mt-6 px-2 text-muted">Past chats</p>
          <ul className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-4">
            {chats.length === 0 && <li className="px-2 py-2 text-sm text-muted">Your conversations will show up here.</li>}
            {chats.map((chat) => (
              <li key={chat.id} className="group relative">
                <button
                  type="button"
                  onClick={() => open(chat)}
                  disabled={busy}
                  aria-current={chat.id === chatId ? 'true' : undefined}
                  className={cn(
                    'w-full rounded-lg px-3 py-2 pr-9 text-left transition-colors hover:bg-charcoal/[0.05] disabled:opacity-60',
                    chat.id === chatId && 'bg-charcoal/[0.07]',
                  )}
                >
                  <span className="block truncate text-sm">{chat.title}</span>
                  <span className="mt-0.5 block text-xs text-muted">{when(chat.updated / 1000)}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete “${chat.title}”`}
                  onClick={() => remove(chat.id)}
                  disabled={busy}
                  className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted opacity-0 transition-opacity hover:text-charcoal focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Icon icon={Trash2} size={14} />
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {/* Below xl the list doesn't fit beside the chat: a compact picker instead. */}
          <div className="flex items-center gap-2 xl:hidden">
            <button
              type="button"
              onClick={() => open(null)}
              disabled={busy}
              className="flex shrink-0 items-center gap-2 rounded-full border border-taupe/60 px-4 py-2 text-sm disabled:opacity-45"
            >
              <Icon icon={Plus} size={15} />
              New chat
            </button>
            {chats.length > 0 && (
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Past chats</span>
                <Icon icon={MessageSquare} size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                <select
                  value={chatId ?? ''}
                  disabled={busy}
                  onChange={(event) => open(chats.find((chat) => chat.id === event.target.value) ?? null)}
                  className="w-full truncate rounded-full border border-taupe/60 bg-transparent py-2 pl-9 pr-4 text-sm"
                >
                  <option value="">Past chats</option>
                  {chats.map((chat) => (
                    <option key={chat.id} value={chat.id}>
                      {chat.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="min-h-0 flex-1">
            <DebugChat messages={messages} onSend={(question) => ask(question)} busy={busy} placeholder="Why can’t my agent pay?" empty={empty} />
          </div>
        </div>
      </div>
    </div>
  )
}
