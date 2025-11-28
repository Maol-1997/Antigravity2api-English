import { useRef, useState, useEffect, useCallback } from 'react'
import { ArrowDown } from 'lucide-react'
import { cn } from '../../lib/utils'

export function Conversation({ children, className, ...props }) {
  return (
    <div className={cn('chat-container', className)} {...props}>
      {children}
    </div>
  )
}

export function ConversationContent({ children, className, onScrollChange, ...props }) {
  const containerRef = useRef(null)
  const endRef = useRef(null)

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
      onScrollChange?.(!isNearBottom)
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [onScrollChange])

  return (
    <div
      ref={containerRef}
      className={cn('chat-conversation', className)}
      {...props}
    >
      <div className="chat-conversation-content max-w-4xl mx-auto w-full">
        {children}
        <div ref={endRef} />
      </div>
    </div>
  )
}

export function ConversationScrollButton({ visible, onClick, className, ...props }) {
  return (
    <button
      className={cn('chat-scroll-button', className)}
      data-visible={visible}
      onClick={onClick}
      {...props}
    >
      <ArrowDown className="w-4 h-4" />
    </button>
  )
}
