import Link from 'next/link';
import Image from 'next/image';

interface Artist {
  artist_id: string;
  display_name: string;
  avatar_url: string | null;
}

export default function ArtistCard({ artist, shopSlug }: { artist: Artist, shopSlug: string }) {
  // Using query params to navigate to Step 2
  const href = `/book/${shopSlug}?step=2&artist=${artist.artist_id}`;

  return (
    <Link 
      href={href}
      className="group flex items-center p-4 md:p-5 h-[100px] md:h-[120px] rounded-2xl border border-[#262626] bg-[#121212] hover:bg-[#1a1a1a] transition-all duration-200 active:scale-[0.98]"
    >
      <div className="w-[72px] h-[72px] rounded-[12px] overflow-hidden bg-[#121212] flex-shrink-0 border border-[#262626] relative">
        {artist.avatar_url ? (
          <Image 
            src={artist.avatar_url} 
            alt={artist.display_name} 
            fill
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#A3A3A3] font-medium text-lg md:text-xl">
            {artist.display_name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      
      <div className="ml-4 md:ml-5 flex-1 overflow-hidden">
        <h3 className="text-[16px] md:text-[18px] font-semibold text-[#F5F5F5] group-hover:text-white transition-colors truncate">
          {artist.display_name}
        </h3>
        <p className="text-[13px] md:text-[14px] text-[#737373] mt-0.5">Tattoo Artist</p>
      </div>
      
      <div className="ml-4 flex items-center text-[#A3A3A3] group-hover:text-white transition-colors">
        <span className="hidden md:inline-block mr-2 text-sm font-medium">เลือกช่าง</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
      </div>
    </Link>
  );
}
