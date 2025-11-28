import { useState } from 'react'
import { Bot, User, Copy, Check, RefreshCw } from 'lucide-react'
import { cn } from '../../lib/utils'

export function Message({
  from,
  children,
  className,
  onCopy,
  onRetry,
  isLast,
  ...props
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    onCopy?.()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={cn('chat-message group', className)} data-from={from} {...props}>
      <div className="chat-message-avatar">
        {from === 'user' ? (
          <User className="w-4 h-4" />
        ) : (
          <Bot className="w-4 h-4" />
        )}
      </div>
      <div className="chat-message-content">
        <div className="chat-message-bubble">{children}</div>
        {from === 'assistant' && isLast && (
          <div className="chat-message-actions">
            <button
              onClick={handleCopy}
              className="chat-message-action"
              title="Copy"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
            {onRetry && (
              <button
                onClick={onRetry}
                className="chat-message-action"
                title="Retry"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function MessageContent({ children, className, ...props }) {
  return (
    <div className={cn('chat-message-bubble', className)} {...props}>
      {children}
    </div>
  )
}
