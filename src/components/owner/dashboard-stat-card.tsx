type StatCardProps = {
  title: string
  value: string | number
  subtitle: string
  icon?: React.ReactNode
  type?: 'appointments' | 'requests' | 'artists' | 'revenue' | 'default'
}

export function DashboardStatCard({ title, value, subtitle, icon, type = 'default' }: StatCardProps) {
  const colorMap = {
    appointments: { text: 'text-[#FFFFFF]', bg: 'bg-[#FFFFFF]/10', border: 'border-t-[#FFFFFF]' },
    requests: { text: 'text-[#A3A3A3]', bg: 'bg-[#A3A3A3]/10', border: 'border-t-[#A3A3A3]' },
    artists: { text: 'text-[#8A8A8A]', bg: 'bg-[#8A8A8A]/10', border: 'border-t-[#8A8A8A]' },
    revenue: { text: 'text-[#FFFFFF]', bg: 'bg-[#FFFFFF]/10', border: 'border-t-[#FFFFFF]' },
    default: { text: 'text-[#A3A3A3]', bg: 'bg-[#262626]', border: 'border-t-[#262626]' }
  }
  
  const colors = colorMap[type]

  return (
    <div className={`bg-[#171717] border-t-2 border-t-[#8A8A8A] rounded-xl p-4 sm:p-6 transition-all hover:bg-[#262626] relative overflow-hidden group shadow-[0_4px_20px_-4px_rgba(0,0,0,0.5)] h-full flex flex-col`}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent pointer-events-none" />
      <div className="flex items-start sm:items-center justify-between mb-3 sm:mb-5 gap-2">
        <h3 className="text-[10px] sm:text-xs font-medium text-[#9CA3AB] tracking-wider sm:tracking-widest uppercase leading-tight line-clamp-2 sm:line-clamp-1 mt-1 sm:mt-0">{title}</h3>
        {icon && (
          <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-white/[0.06] border border-white/[0.04] flex items-center justify-center shadow-inner">
            <div className="scale-[0.95] sm:scale-100 flex items-center justify-center text-[#F5F5F5] transition-all duration-300 [filter:drop-shadow(0_0_4px_rgba(255,255,255,0.22))_drop-shadow(0_0_7px_rgba(255,255,255,0.1))] group-hover:[filter:drop-shadow(0_0_5px_rgba(255,255,255,0.3))_drop-shadow(0_0_9px_rgba(255,255,255,0.12))]">
              {icon}
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 sm:gap-1.5 relative z-10 mt-auto">
        <span className={`text-2xl sm:text-4xl font-light ${colors.text} tracking-tight truncate`}>{value}</span>
        <span className="text-[10px] sm:text-xs text-[#747C85] leading-snug line-clamp-2">{subtitle}</span>
      </div>
    </div>
  )
}
