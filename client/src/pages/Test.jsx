import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Send,
  Trash2,
  RefreshCw,
  Key,
  Eye,
  EyeOff,
  Sparkles,
  ChevronDown,
  Bot,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { cn } from '../lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import CodeBlock, { CodeBlockCopyButton } from '../components/CodeBlock'
import {
  Loader,
  Message,
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from '../components/chat'

// Image component for base64 images
function ChatImage({ src, alt }) {
  return (
    <img
      src={src}
      alt={alt || 'Generated image'}
      className="max-w-full h-auto rounded-lg border border-zinc-200 my-2"
    />
  )
}

// Parse content and extract images (both markdown and raw base64)
function parseContentWithImages(content) {
  if (!content) return []

  const parts = []
  let remaining = content

  // Pattern for markdown images: ![alt](data:image/...)
  const markdownImageRegex = /!\[([^\]]*)\]\((data:image\/[^)]+)\)/g

  // Pattern for raw base64 data URLs
  const rawBase64Regex =
    /(data:image\/(?:jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+)/g

  // First, handle markdown images
  let lastIndex = 0
  let match

  while ((match = markdownImageRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index)
      if (textBefore.trim()) {
        parts.push({ type: 'text', content: textBefore })
      }
    }
    parts.push({ type: 'image', alt: match[1], src: match[2] })
    lastIndex = match.index + match[0].length
  }

  // If we found markdown images, add remaining text
  if (parts.length > 0) {
    if (lastIndex < content.length) {
      const remainingText = content.slice(lastIndex)
      if (remainingText.trim()) {
        parts.push({ type: 'text', content: remainingText })
      }
    }
    return parts
  }

  // If no markdown images, check for raw base64 URLs
  lastIndex = 0
  while ((match = rawBase64Regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = content.slice(lastIndex, match.index)
      if (textBefore.trim()) {
        parts.push({ type: 'text', content: textBefore })
      }
    }
    parts.push({ type: 'image', alt: 'Generated image', src: match[1] })
    lastIndex = match.index + match[0].length
  }

  if (parts.length > 0) {
    if (lastIndex < content.length) {
      const remainingText = content.slice(lastIndex)
      if (remainingText.trim()) {
        parts.push({ type: 'text', content: remainingText })
      }
    }
    return parts
  }

  // No images found, return as single text part
  return [{ type: 'text', content }]
}

// Message Response with Markdown and Image support
function MessageResponse({ children }) {
  const parts = parseContentWithImages(children)

  return (
    <div className="chat-message-response">
      {parts.map((part, idx) => {
        if (part.type === 'image') {
          return <ChatImage key={idx} src={part.src} alt={part.alt} />
        }

        return (
          <ReactMarkdown
            key={idx}
            remarkPlugins={[remarkGfm]}
            components={{
              pre({ children }) {
                return <>{children}</>
              },
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '')
                const codeString = String(children).replace(/\n$/, '')
                const isMultiLine = codeString.includes('\n') || match

                if (isMultiLine) {
                  return (
                    <CodeBlock
                      code={codeString}
                      language={match?.[1] || 'text'}
                    >
                      <CodeBlockCopyButton />
                    </CodeBlock>
                  )
                }

                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                )
              },
              img({ src, alt }) {
                return <ChatImage src={src} alt={alt} />
              },
            }}
          >
            {part.content}
          </ReactMarkdown>
        )
      })}
    </div>
  )
}


// Suggestions
function Suggestions({ suggestions, onSelect }) {
  if (!suggestions?.length) return null

  return (
    <div className="chat-suggestions">
      {suggestions.map((suggestion, idx) => (
        <button
          key={idx}
          className="chat-suggestion"
          onClick={() => onSelect(suggestion)}
        >
          {suggestion}
        </button>
      ))}
    </div>
  )
}

// Model Select Button
function ModelSelectButton({ models, selected, onChange, onRefresh }) {
  const [open, setOpen] = useState(false)
  const selectedModel = models.find((m) => m.id === selected)

  return (
    <div className="relative">
      <button
        className="chat-prompt-input-button"
        onClick={() => setOpen(!open)}
      >
        <Sparkles className="w-4 h-4" />
        <span className="max-w-[100px] truncate">
          {selectedModel?.id?.split('/').pop() || 'Select model'}
        </span>
        <ChevronDown
          className={cn(
            'w-3.5 h-3.5 transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full left-0 mb-2 w-64 max-h-60 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg z-20">
            <div className="p-2 border-b border-zinc-200 flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-500">Models</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onRefresh()
                }}
                className="p-1 hover:bg-zinc-100 rounded"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
            <div className="p-1">
              {models.map((model) => (
                <button
                  key={model.id}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm rounded-lg transition-colors',
                    selected === model.id
                      ? 'bg-zinc-900 text-white'
                      : 'hover:bg-zinc-100',
                  )}
                  onClick={() => {
                    onChange(model.id)
                    setOpen(false)
                  }}
                >
                  {model.id}
                </button>
              ))}
              {models.length === 0 && (
                <div className="px-3 py-2 text-sm text-zinc-500">
                  No models available
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Main Test Component
export default function Test() {
  const { token: adminToken } = useAuth()
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem('test_messages')
    return saved ? JSON.parse(saved) : []
  })
  const [input, setInput] = useState('')
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState(
    () => localStorage.getItem('test_selected_model') || '',
  )
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem('test_api_key') || '',
  )
  const [status, setStatus] = useState('ready') // ready, submitted, streaming
  const [showApiKey, setShowApiKey] = useState(false)

  const messagesEndRef = useRef(null)
  const conversationRef = useRef(null)
  const textareaRef = useRef(null)

  // Persist state to localStorage
  useEffect(() => {
    localStorage.setItem('test_api_key', apiKey)
  }, [apiKey])

  useEffect(() => {
    localStorage.setItem('test_messages', JSON.stringify(messages))
  }, [messages])

  useEffect(() => {
    if (selectedModel) {
      localStorage.setItem('test_selected_model', selectedModel)
    }
  }, [selectedModel])

  // Fetch models
  const fetchModels = async () => {
    try {
      const res = await fetch('/v1/models', {
        headers: {
          Authorization: `Bearer ${apiKey || 'sk-test'}`,
        },
      })

      if (res.ok) {
        const data = await res.json()
        setModels(data.data || [])
        if (data.data?.length > 0 && !selectedModel) {
          setSelectedModel(data.data[0].id)
        }
      }
    } catch (error) {
      console.error('Failed to fetch models', error)
    }
  }

  useEffect(() => {
    fetchModels()
  }, [])

  // Auto-scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    if (status === 'streaming' || status === 'submitted') {
      scrollToBottom()
    }
  }, [messages, status, scrollToBottom])


  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    }
  }, [input])

  // Send message
  const handleSend = async () => {
    if (!input.trim() || !selectedModel || status !== 'ready') return

    const userMsg = { role: 'user', content: input }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setStatus('submitted')

    const assistantMsgId = Date.now()
    const reasoningStartTime = Date.now()
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        content: '',
        reasoning: '',
        reasoningDuration: null,
        id: assistantMsgId,
      },
    ])

    try {
      const response = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey || 'sk-test'}`,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [...messages, userMsg].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stream: true,
        }),
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      setStatus('streaming')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let assistantContent = ''
      let reasoningContent = ''
      let buffer = ''
      let reasoningEnded = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6))
              const delta = data.choices[0]?.delta

              // Handle reasoning content (DeepSeek R1 format)
              const reasoning = delta?.reasoning_content || ''
              if (reasoning) {
                reasoningContent += reasoning
              }

              // Handle regular content
              const content = delta?.content || ''
              if (content) {
                // If we get content after reasoning, reasoning is done
                if (reasoningContent && !reasoningEnded) {
                  reasoningEnded = true
                }
                assistantContent += content
              }

              // Calculate reasoning duration
              const reasoningDuration =
                reasoningEnded || assistantContent
                  ? Math.round((Date.now() - reasoningStartTime) / 1000)
                  : null

              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? {
                        ...msg,
                        content: assistantContent,
                        reasoning: reasoningContent,
                        reasoningDuration: reasoningDuration,
                      }
                    : msg,
                ),
              )
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? { ...msg, content: `Error: ${error.message}` }
            : msg,
        ),
      )
    } finally {
      setStatus('ready')
    }
  }

  // Handle retry
  const handleRetry = async () => {
    if (messages.length < 2) return

    // Remove last assistant message and resend
    const newMessages = messages.slice(0, -1)
    setMessages(newMessages)

    const lastUserMsg = newMessages[newMessages.length - 1]
    if (lastUserMsg?.role === 'user') {
      setInput(lastUserMsg.content)
      setMessages(newMessages.slice(0, -1))
    }
  }

  // Copy message content
  const handleCopyMessage = (content) => {
    navigator.clipboard.writeText(content)
  }

  // Suggestions
  const suggestions =
    messages.length === 0
      ? [
          'What are you capable of?',
          'Help me write some code',
          'Explain a concept',
          'Creative writing task',
        ]
      : []

  return (
    <div className="h-[calc(100vh-1rem)] flex flex-col">
      {/* Chat Area - Full Screen */}
      <div className="flex-1 flex flex-col bg-white overflow-hidden">
        {/* Conversation */}
        <div ref={conversationRef} className="chat-conversation relative">
          <div className="chat-conversation-content max-w-4xl mx-auto w-full">
            {messages.length === 0 && (
              <div className="chat-empty-state justify-self-center">
                <Bot className="chat-empty-state-icon" />
                <h3 className="chat-empty-state-title">Start a conversation</h3>
                <p className="chat-empty-state-description">
                  Select a model and type a message to begin
                </p>
              </div>
            )}

            {messages.map((msg, idx) => {
              const isLastAssistant =
                idx === messages.length - 1 && msg.role === 'assistant'
              const isStreaming = status === 'streaming' && isLastAssistant
              const isLoading = status === 'submitted' && isLastAssistant
              const hasReasoning = msg.role === 'assistant' && msg.reasoning
              const isReasoningOnly = hasReasoning && !msg.content
              const isEmpty = !msg.content && !msg.reasoning

              return (
                <Message
                  key={idx}
                  from={msg.role}
                  isLast={isLastAssistant}
                  onCopy={() => handleCopyMessage(msg.content)}
                  onRetry={isLastAssistant ? handleRetry : undefined}
                >
                  {msg.role === 'assistant' ? (
                    <>
                      {isLoading && isEmpty && <Loader />}
                      {hasReasoning && (
                        <Reasoning
                          isStreaming={isStreaming && isReasoningOnly}
                          duration={msg.reasoningDuration}
                        >
                          <ReasoningTrigger />
                          <ReasoningContent>{msg.reasoning}</ReasoningContent>
                        </Reasoning>
                      )}
                      {msg.content && (
                        <MessageResponse>{msg.content}</MessageResponse>
                      )}
                    </>
                  ) : (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  )}
                </Message>
              )
            })}
            <div ref={messagesEndRef} />
          </div>

        </div>

        {/* Input Area */}
        <div className="shrink-0 p-4 border-t border-zinc-200">
          <div className="max-w-4xl mx-auto w-full">
            <Suggestions
              suggestions={suggestions}
              onSelect={(s) => setInput(s)}
            />

            <div className="chat-prompt-input">
              <div className="chat-prompt-input-body">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend()
                    }
                  }}
                  placeholder="Type a message..."
                  className="chat-prompt-input-textarea"
                  rows={1}
                />
              </div>
              <div className="chat-prompt-input-footer">
                <div className="chat-prompt-input-tools">
                  {/* Model Selector */}
                  <ModelSelectButton
                    models={models}
                    selected={selectedModel}
                    onChange={setSelectedModel}
                    onRefresh={fetchModels}
                  />

                  {/* API Key Input */}
                  <div className="relative hidden sm:flex items-center">
                    <Key className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 z-10" />
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="API Key"
                      className="w-48 pl-8 pr-8 py-1.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-300 outline-none transition-all placeholder:text-zinc-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 transition-colors"
                    >
                      {showApiKey ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {/* Clear Chat Button */}
                  {messages.length > 0 && (
                    <button
                      onClick={() => setMessages([])}
                      className="p-2 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Clear chat"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}

                  {/* Send Button */}
                  <button
                    onClick={handleSend}
                    disabled={status !== 'ready' || !input.trim()}
                    className="chat-prompt-input-submit"
                  >
                    {status !== 'ready' ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
