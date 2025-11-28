import { cn } from '../../lib/utils'

export function Shimmer({ children, duration = 1.5, className }) {
  return (
    <span
      className={cn('shimmer-text', className)}
      style={{ '--shimmer-duration': `${duration}s` }}
    >
      {children}
    </span>
  )
}
