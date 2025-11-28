import { createContext, useContext, useState, useEffect } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Shimmer } from './Shimmer'

const ReasoningContext = createContext(null)

const useReasoning = () => {
  const context = useContext(ReasoningContext)
  if (!context) {
    throw new Error('Reasoning components must be used within Reasoning')
  }
  return context
}

const AUTO_CLOSE_DELAY = 1000

export function Reasoning({
  className,
  isStreaming = false,
  defaultOpen = true,
  duration: durationProp,
  children,
  ...props
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [duration, setDuration] = useState(durationProp)
  const [hasAutoClosed, setHasAutoClosed] = useState(false)
  const [startTime, setStartTime] = useState(null)

  // Track duration when streaming starts and ends
  useEffect(() => {
    if (isStreaming) {
      if (startTime === null) {
        setStartTime(Date.now())
      }
    } else if (startTime !== null) {
      setDuration(Math.ceil((Date.now() - startTime) / 1000))
      setStartTime(null)
    }
  }, [isStreaming, startTime])

  // Auto-close when streaming ends (once only)
  useEffect(() => {
    if (defaultOpen && !isStreaming && isOpen && !hasAutoClosed && startTime === null) {
      const timer = setTimeout(() => {
        setIsOpen(false)
        setHasAutoClosed(true)
      }, AUTO_CLOSE_DELAY)

      return () => clearTimeout(timer)
    }
  }, [isStreaming, isOpen, defaultOpen, hasAutoClosed, startTime])

  // Update duration from prop
  useEffect(() => {
    if (durationProp !== undefined) {
      setDuration(durationProp)
    }
  }, [durationProp])

  return (
    <ReasoningContext.Provider value={{ isStreaming, isOpen, setIsOpen, duration }}>
      <div
        className={cn('chat-reasoning', className)}
        data-state={isOpen ? 'open' : 'closed'}
        {...props}
      >
        {children}
      </div>
    </ReasoningContext.Provider>
  )
}

export function ReasoningTrigger({ className, children, ...props }) {
  const { isStreaming, isOpen, setIsOpen, duration } = useReasoning()

  const getThinkingMessage = () => {
    if (isStreaming || duration === undefined || duration === 0) {
      return <Shimmer duration={1.5}>Thinking...</Shimmer>
    }
    if (duration < 60) {
      return `Thought for ${duration} second${duration !== 1 ? 's' : ''}`
    }
    const mins = Math.floor(duration / 60)
    const secs = duration % 60
    if (secs === 0) return `Thought for ${mins} minute${mins !== 1 ? 's' : ''}`
    return `Thought for ${mins}m ${secs}s`
  }

  return (
    <button
      className={cn('chat-reasoning-trigger', className)}
      data-state={isOpen ? 'open' : 'closed'}
      onClick={() => setIsOpen(!isOpen)}
      {...props}
    >
      {children ?? (
        <>
          <Sparkles className="w-4 h-4" />
          <span className="flex-1">{getThinkingMessage()}</span>
          <ChevronDown
            className={cn(
              'w-4 h-4 transition-transform duration-200',
              isOpen && 'rotate-180'
            )}
          />
        </>
      )}
    </button>
  )
}

export function ReasoningContent({ className, children, ...props }) {
  const { isOpen, isStreaming } = useReasoning()

  if (!isOpen) return null

  return (
    <div className={cn('chat-reasoning-content', className)} {...props}>
      {children}
      {isStreaming && (
        <span className="inline-block w-0.5 h-4 ml-0.5 bg-zinc-400 animate-pulse" />
      )}
    </div>
  )
}
