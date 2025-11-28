import { cn } from '../../lib/utils'

export function Loader({ className, ...props }) {
  return (
    <div className={cn('chat-loader', className)} {...props}>
      <div className="chat-loader-dot" />
      <div className="chat-loader-dot" />
      <div className="chat-loader-dot" />
    </div>
  )
}
