'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageCircle, Send, Loader2, BrainCircuit, ChevronDown, ChevronUp, X } from 'lucide-react'

interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  text: string
  timestamp: Date
}

interface TrollboxProps {
  poolId: number
}

export function Trollbox({ poolId }: TrollboxProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'ai',
      text: "Hey! I'm the Shōbu Analyst AI. Ask me anything about this pool — odds, betting strategy, or who's looking strong. 🎯",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: input.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/agents/analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolId, message: userMsg.text }),
      })

      const data = await res.json()

      const aiText = typeof data.result === 'string'
        ? data.result
        : data.result?.output || data.result?.response || JSON.stringify(data.result) || 'Hmm, I couldn\'t process that. Try again?'

      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'ai',
        text: aiText,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, aiMsg])
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `err-${Date.now()}`,
        role: 'ai',
        text: 'Connection issue — the analyst agent might be restarting. Try again in a moment.',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }

  // Collapsed state — just a floating button
  if (!isOpen) {
    return (
      <button
        id="trollbox-toggle"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full bg-neon-purple text-slate-dark font-semibold shadow-lg shadow-neon-purple/30 hover:shadow-neon-purple/50 hover:scale-105 active:scale-95 transition-all duration-300"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="text-sm">Trollbox</span>
        {messages.length > 1 && (
          <span className="w-5 h-5 rounded-full bg-white/20 text-[10px] font-bold flex items-center justify-center">
            {messages.length - 1}
          </span>
        )}
      </button>
    )
  }

  // Open state — full chat panel
  return (
    <div className="fixed bottom-6 right-6 z-50 w-[360px] max-h-[500px] flex flex-col rounded-xl overflow-hidden card-border glass-card shadow-2xl shadow-neon-purple/10 fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-slate-900/80">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-neon-purple" />
          <span className="text-sm font-semibold text-foreground">Trollbox</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-neon-purple/10 text-neon-purple border border-neon-purple/20">
            Pool #{poolId}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-slate-800/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px] max-h-[320px]"
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-neon-purple/20 text-foreground border border-neon-purple/20 rounded-br-sm'
                  : 'bg-slate-800/60 text-gray-300 border border-slate-700/30 rounded-bl-sm'
              }`}
            >
              {msg.role === 'ai' && (
                <div className="flex items-center gap-1 mb-1 text-[10px] text-neon-purple font-medium">
                  <BrainCircuit className="w-3 h-3" />
                  Shōbu AI
                </div>
              )}
              {msg.text}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-xl bg-slate-800/60 border border-slate-700/30 rounded-bl-sm">
              <div className="flex items-center gap-2 text-[10px] text-neon-purple">
                <Loader2 className="w-3 h-3 animate-spin" />
                Analyzing...
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-slate-700/50 p-2 bg-slate-900/60">
        <div className="flex items-center gap-2">
          <input
            id="trollbox-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Ask about odds, strategy..."
            disabled={loading}
            className="flex-1 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/30 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-neon-purple/40 transition-colors disabled:opacity-50"
          />
          <button
            id="trollbox-send"
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="p-2 rounded-lg text-neon-purple hover:bg-neon-purple/10 disabled:opacity-30 transition-all duration-200"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
