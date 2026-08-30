import Link from 'next/link';
import Image from 'next/image';

export default function PublicBookingHeader({
  shopSlug,
  hideTrackButton = false,
}: {
  shopSlug?: string;
  hideTrackButton?: boolean;
}) {
  const homeHref = shopSlug ? `/shop/${shopSlug}` : '/shop/157-tattoo';
  return (
    <header className="h-[64px] md:h-[72px] flex items-center border-b border-[#262626] bg-[#0A0A0A] px-4 sm:px-5 md:px-8 lg:px-10 sticky top-0 z-50">
      <div className="max-w-[1280px] mx-auto w-full flex items-center justify-between">
        
        {/* LEFT: BRAND */}
        <Link href={homeHref} className="flex items-center gap-2 md:gap-2.5 group">
          <div className="relative w-6 h-6 md:w-7 md:h-7">
            <Image 
              src="/logo.png" 
              alt="157 TATTOO Logo" 
              fill
              className="object-contain grayscale"
            />
          </div>
          <span className="text-sm font-bold tracking-[0.2em] text-[#F5F5F5] group-hover:text-white transition-colors">
            157 TATTOO
          </span>
        </Link>
        
        {/* RIGHT: TRACK STATUS — hidden on pages that are already part of the tracking flow */}
        {!hideTrackButton && (
          <button 
            className="px-4 py-2 bg-[#171717] border border-[#404040] text-[#F5F5F5] hover:bg-[#262626] transition-colors rounded-md text-xs font-semibold cursor-not-allowed"
            title="ติดตามสถานะ"
          >
            ติดตามสถานะ
          </button>
        )}

      </div>
    </header>
  );
}
