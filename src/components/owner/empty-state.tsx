import Link from 'next/link'
import { LucideIcon } from 'lucide-react'

type EmptyStateProps = {
  icon?: LucideIcon
  title: string
  description: string
  actionLabel?: string
  actionHref?: string
  actionDisabled?: boolean
}

export function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  actionLabel, 
  actionHref,
  actionDisabled
}: EmptyStateProps) {
  return (
    <div className="relative flex flex-col items-center justify-center p-10 text-center bg-[#262626] border border-[#262626] border-dashed rounded-xl h-full min-h-[240px] overflow-hidden group">
      
      {Icon && (
        <div className="relative inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#171717] border border-[#FFFFFF]/20 mb-5 shadow-inner">
          <div className="absolute inset-0 rounded-full border border-[#FFFFFF]/10 scale-125 transition-transform duration-500 group-hover:scale-110" />
          <Icon className="h-6 w-6 text-[#9CA3AB] group-hover:text-[#C8CDD3] transition-colors relative z-10" />
        </div>
      )}
      <h3 className="text-base font-medium text-[#F3F3F3] mb-2">{title}</h3>
      <p className="text-sm text-[#747C85] max-w-xs mb-8">{description}</p>
      
      {actionLabel && (
        actionDisabled ? (
          <button 
            disabled 
            className="relative z-10 inline-flex items-center px-5 py-2.5 text-xs font-medium text-[#747C85] bg-[#262626] rounded-md cursor-not-allowed border border-[#262626]"
          >
            {actionLabel}
          </button>
        ) : actionHref ? (
          <Link 
            href={actionHref}
            className="relative z-10 inline-flex items-center px-5 py-2.5 text-xs font-medium text-black bg-[#FFFFFF] hover:bg-[#E5E5E5] border border-[#E5E5E5] rounded-md transition-all shadow-[0_4px_15px_rgba(255,255,255,0.15)] hover:shadow-[0_6px_20px_rgba(255,255,255,0.25)] focus:ring-2 focus:ring-[#FFFFFF]/50 focus:outline-none"
          >
            {actionLabel}
          </Link>
        ) : null
      )}
    </div>
  )
}
