'use client'

import { useState } from 'react'
import { Sparkles, Send, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useStarkSdk } from '@/providers/stark-sdk-provider'

type RequestState = 'idle' | 'loading' | 'success' | 'error'

export function UserRequestedMarket() {
  const [prompt, setPrompt] = useState('')
  const [state, setState] = useState<RequestState>('idle')
  const [resultMessage, setResultMessage] = useState('')
  const { wallet } = useStarkSdk()
  const address = wallet?.account?.address

  const handleSubmit = async () => {
    if (!prompt.trim() || state === 'loading') return

    setState('loading')
    setResultMessage('')

    try {
      const res = await fetch('/api/agents/pool-creator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), address }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Request failed')
      }

      const aiResponse = typeof data.result === 'string'
        ? data.result
        : data.result?.output || data.result?.response || 'Market request submitted! The AI agent is processing your request on-chain.'

      setState('success')
      setResultMessage(aiResponse)
      setPrompt('')

      // Reset after 12 seconds (longer since this is now async confirmation)
      setTimeout(() => {
        setState('idle')
        setResultMessage('')
      }, 12000)
    } catch (err: any) {
      setState('error')
      setResultMessage(err?.message || 'Failed to submit request')

      setTimeout(() => {
        setState('idle')
        setResultMessage('')
      }, 5000)
    }
  }

  return (
    <Card className="card-border glass-card relative overflow-hidden group">
      {/* Animated gradient border */}
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-neon-purple via-neon-blue to-neon-purple gradient-shift" />

      {/* Floating orb */}
      <div className="absolute -top-6 -right-6 w-24 h-24 bg-neon-purple/10 rounded-full blur-2xl float opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-foreground">
          <Sparkles className="w-4 h-4 text-neon-purple" />
          Request a Market
          <span className="ml-auto text-[10px] font-normal text-muted-foreground px-2 py-0.5 rounded-full bg-neon-purple/10 border border-neon-purple/20">
            AI-Powered
          </span>
        </CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          Ask the AI to create a betting pool for any matchup
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Input */}
        <div className="relative">
          <input
            id="market-request-input"
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="e.g. Create a pool for Faker vs Showmaker..."
            disabled={state === 'loading'}
            className="w-full px-4 py-3 pr-12 rounded-lg bg-slate-900/80 border border-slate-700/50 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-neon-purple/50 focus:ring-1 focus:ring-neon-purple/20 transition-all duration-200 disabled:opacity-50"
          />
          <button
            id="market-request-submit"
            onClick={handleSubmit}
            disabled={!prompt.trim() || state === 'loading'}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-neon-purple hover:bg-neon-purple/10 disabled:opacity-30 disabled:hover:bg-transparent transition-all duration-200"
          >
            {state === 'loading' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Status feedback */}
        {state === 'loading' && (
          <div className="flex items-center gap-2 text-xs text-neon-blue fade-in-up">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Agent processing your request on Starknet...</span>
          </div>
        )}

        {state === 'success' && (
          <div className="flex items-center gap-2 text-xs text-green-400 fade-in-up">
            <CheckCircle2 className="w-3 h-3" />
            <span>{resultMessage}</span>
          </div>
        )}

        {state === 'error' && (
          <div className="flex items-center gap-2 text-xs text-red-400 fade-in-up">
            <AlertCircle className="w-3 h-3" />
            <span>{resultMessage}</span>
          </div>
        )}

        {/* Example prompts */}
        {state === 'idle' && !resultMessage && (
          <div className="flex flex-wrap gap-1.5">
            {['Faker vs Showmaker', 'Next Pistols duel', 'Top LoL match'].map((example) => (
              <button
                key={example}
                onClick={() => setPrompt(`Create a betting pool for ${example}`)}
                className="text-[10px] px-2 py-1 rounded-full bg-slate-800/50 border border-slate-700/30 text-muted-foreground hover:text-neon-purple hover:border-neon-purple/30 transition-all duration-200"
              >
                {example}
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
