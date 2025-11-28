import { useState, useEffect, useRef, createContext, useContext } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '../lib/utils'
import { codeToHtml } from 'shiki'

const CodeBlockContext = createContext(null)

export function CodeBlockCopyButton({
  onCopy,
  onError,
  timeout = 2000,
  className,
  ...props
}) {
  const { code } = useContext(CodeBlockContext)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      onCopy?.()
      setTimeout(() => setCopied(false), timeout)
    } catch (error) {
      onError?.(error)
    }
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'p-1.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors',
        className,
      )}
      {...props}
    >
      {copied ? (
        <Check className="w-4 h-4 text-green-500" />
      ) : (
        <Copy className="w-4 h-4" />
      )}
    </button>
  )
}

export default function CodeBlock({
  code,
  language = 'text',
  showLineNumbers = false,
  children,
  className,
  ...props
}) {
  const [highlightedCode, setHighlightedCode] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const codeRef = useRef(null)

  useEffect(() => {
    if (!code) {
      setHighlightedCode('')
      setIsLoading(false)
      return
    }

    let cancelled = false

    const highlight = async () => {
      try {
        const html = await codeToHtml(code, {
          lang: language,
          theme: 'github-dark',
        })
        if (!cancelled) {
          setHighlightedCode(html)
          setIsLoading(false)
        }
      } catch {
        if (!cancelled) {
          setHighlightedCode('')
          setIsLoading(false)
        }
      }
    }

    highlight()

    return () => {
      cancelled = true
    }
  }, [code, language])

  const lines = code?.split('\n') || []

  return (
    <CodeBlockContext.Provider value={{ code }}>
      <div
        className={cn(
          'relative group rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800',
          className,
        )}
        {...props}
      >
        {children && (
          <div className="absolute right-3 top-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
            {children}
          </div>
        )}

        <div className="overflow-hidden">
          {showLineNumbers ? (
            <div className="flex">
              <div className="flex-shrink-0 py-4 pl-4 pr-3 text-right select-none border-r border-zinc-700/50">
                {lines.map((_, idx) => (
                  <div
                    key={idx}
                    className="text-xs font-mono text-zinc-500 leading-relaxed"
                  >
                    {idx + 1}
                  </div>
                ))}
              </div>
              <div className="flex-1 overflow-hidden">
                {isLoading || !highlightedCode ? (
                  <pre className="p-4 text-sm font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
                    <code>{code}</code>
                  </pre>
                ) : (
                  <div
                    ref={codeRef}
                    className="code-block-highlighted p-4"
                    dangerouslySetInnerHTML={{ __html: highlightedCode }}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="overflow-hidden">
              {isLoading || !highlightedCode ? (
                <pre className="p-4 text-sm font-mono text-zinc-300 leading-relaxed whitespace-pre-wrap break-words">
                  <code>{code}</code>
                </pre>
              ) : (
                <div
                  ref={codeRef}
                  className="code-block-highlighted p-4"
                  dangerouslySetInnerHTML={{ __html: highlightedCode }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </CodeBlockContext.Provider>
  )
}
