import Link from 'next/link';
import Image from 'next/image';

interface SelectedArtistSummaryProps {
  artist: {
    artist_id: string;
    display_name: string;
    avatar_url: string | null;
  };
  shopSlug: string;
}

export default function SelectedArtistSummary({ artist, shopSlug }: SelectedArtistSummaryProps) {
  return (
    <div className="flex flex-row items-center justify-between gap-2 sm:gap-4 mb-6 md:mb-8 border-b border-[#262626] pb-6">
      <div className="flex items-center min-w-0">
        <div className="w-[72px] h-[72px] rounded-[12px] overflow-hidden bg-[#121212] border border-[#262626] flex-shrink-0 relative">
          {artist.avatar_url ? (
            <Image 
              src={artist.avatar_url} 
              alt={artist.display_name} 
              fill
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#A3A3A3] font-medium text-base sm:text-lg">
              {artist.display_name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="ml-3 sm:ml-4 min-w-0 truncate pr-2">
          <p className="text-[11px] sm:text-xs text-[#737373] mb-0.5">ช่างสักที่เลือก</p>
          <h3 className="text-sm sm:text-base font-semibold text-[#F5F5F5] truncate">{artist.display_name}</h3>
        </div>
      </div>
      
      <Link 
        href={`/book/${shopSlug}`}
        className="inline-flex flex-shrink-0 items-center justify-center text-[13px] sm:text-sm text-[#A3A3A3] hover:text-[#F5F5F5] transition-colors min-h-[44px] px-2 active:scale-95"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5">
          <path d="M8 3 4 7l4 4"/>
          <path d="M4 7h16"/>
          <path d="m16 21 4-4-4-4"/>
          <path d="M20 17H4"/>
        </svg>
        <span className="hidden min-[360px]:inline">เปลี่ยนช่าง</span>
        <span className="min-[360px]:hidden">เปลี่ยน</span>
      </Link>
    </div>
  );
}
