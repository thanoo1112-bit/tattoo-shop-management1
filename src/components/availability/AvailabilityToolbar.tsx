'use client';

import { useState } from 'react';
import { CreateAvailabilityModal } from './CreateAvailabilityModal';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

interface Artist {
  id: string;
  name: string;
}

interface Props {
  isOwner: boolean;
  artists?: Artist[];
  shopSlug: string;
  selectedArtistId: string;
}

export function AvailabilityToolbar({ isOwner, artists = [], shopSlug, selectedArtistId }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleArtistChange = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id === 'all') {
      params.delete('artist');
    } else {
      params.set('artist', id);
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {isOwner && (
            <select
              value={selectedArtistId}
              onChange={(e) => handleArtistChange(e.target.value)}
              className="bg-[#121212] border border-[#262626] rounded-lg py-2 pl-3 pr-8 text-sm text-[#F5F5F5] focus:outline-none focus:border-[#525252] w-full sm:w-64 appearance-none"
              style={{
                backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23A3A3A3%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 0.7rem top 50%',
                backgroundSize: '0.65rem auto'
              }}
            >
              <option value="all">ช่างทั้งหมด</option>
              {artists.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
        </div>
        
        <button
          onClick={() => setIsModalOpen(true)}
          className="w-full sm:w-auto bg-[#F5F5F5] text-[#0A0A0A] text-sm font-medium px-4 py-2 rounded-lg hover:bg-white transition-colors"
        >
          + เปิดช่วงเวลารับจอง
        </button>
      </div>

      <CreateAvailabilityModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        isOwner={isOwner}
        artists={artists}
        shopSlug={shopSlug}
      />
    </>
  );
}
