import Image from 'next/image'

export function BrandLogo({ className = "", showText = true }: { className?: string, showText?: boolean }) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <div className="relative w-10 h-10 flex-shrink-0">
        <Image 
          src="/logo.png" 
          alt="157 TATTOO Logo" 
          fill
          className="object-contain"
          priority
        />
      </div>
      {showText && (
        <div className="flex flex-col">
          <span className="text-xl font-bold tracking-widest text-[#F3F3F3] leading-none mb-1">157 TATTOO</span>
          <span className="text-[11px] text-[#9CA3AB] uppercase tracking-widest leading-none">Studio Management</span>
        </div>
      )}
    </div>
  )
}
