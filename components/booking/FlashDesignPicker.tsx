'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, Search } from 'lucide-react';
import PortfolioFilter from '@/components/customer/PortfolioFilter';
import { fetchLiveFlashDesigns, FlashDesignWithMeta } from '@/lib/flash/fetchLiveFlashDesigns';
import { getThumbnailUrl, handleThumbnailError } from '@/lib/utils/thumbnailHelper';

interface FlashDesignPickerProps {
  /** Called with the chosen flash design id. The parent applies the same flow as /booking?flash=<id>. */
  onSelect: (flashId: string) => void;
}

/**
 * Embedded gallery of AVAILABLE flash designs for /booking.
 * Data comes from the same shared source as /flash (lib/flash/fetchLiveFlashDesigns).
 * It does NOT create any booking itself; selection hands off to the existing flash booking flow.
 */
export default function FlashDesignPicker({ onSelect }: FlashDesignPickerProps) {
  const [designs, setDesigns] = useState<FlashDesignWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const list = await fetchLiveFlashDesigns();
        if (isMounted) setDesigns(list.filter((d) => d.status === 'AVAILABLE'));
      } catch (err) {
        console.error('Error fetching live flash designs:', err);
        if (isMounted) setError('ไม่สามารถโหลดข้อมูลแบบลายสัก Flash ได้ในขณะนี้');
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const dynamicFilters = useMemo(() => {
    const seen = new Set<string>();
    const styles: string[] = [];
    for (const d of designs) {
      if (!d.style || d.style.trim() === '') continue;
      const key = d.style.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        styles.push(d.style.trim());
      }
    }
    styles.sort((a, b) => a.localeCompare(b, 'th'));
    return ['All', ...styles];
  }, [designs]);

  const filteredItems = useMemo(() => {
    let list = designs;
    if (filter !== 'All') {
      list = list.filter((item) => item.style.toLowerCase() === filter.toLowerCase());
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          (item.artist?.name && item.artist.name.toLowerCase().includes(q)) ||
          item.style.toLowerCase().includes(q)
      );
    }
    return list;
  }, [designs, filter, searchQuery]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3 justify-between items-start md:items-center bg-studio-card/60 p-3 rounded-[6px] border border-studio-border">
        <PortfolioFilter activeFilter={filter} onFilterChange={setFilter} filters={dynamicFilters} />
        <div className="relative w-full md:w-48 shrink-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B8B0A3]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาลาย / ช่าง..."
            className="w-full bg-studio-main border border-studio-border text-xs text-studio-primary pl-8 pr-3 py-1.5 rounded-[4px] outline-none focus:border-studio-red placeholder:text-[#B8B0A3]"
          />
        </div>
      </div>

      <div className="text-xs text-[#E2DDD4] px-1">
        แสดงลายสักพร้อมจอง: <strong className="text-studio-primary">{filteredItems.length}</strong> รายการ
      </div>

      {loading && (
        <div className="py-16 text-center text-xs text-[#E2DDD4] animate-pulse">กำลังโหลดแบบลายสัก Flash...</div>
      )}

      {error && (
        <div className="bg-red-950/40 border border-red-900/60 p-4 rounded-[6px] text-xs text-red-400 flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelect(item.id)}
              className="bg-studio-card border border-studio-border hover:border-studio-red/60 rounded-[6px] overflow-hidden group cursor-pointer transition-all duration-300 flex flex-col justify-between"
            >
              <div className="aspect-[4/5] bg-studio-main overflow-hidden relative">
                <img
                  src={getThumbnailUrl(item.image_url)}
                  onError={(e) => handleThumbnailError(e, item.image_url)}
                  alt={item.title}
                  className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                  decoding="async"
                />
                <span className="absolute top-3 right-3 text-[10px] bg-emerald-950/60 border border-emerald-600/40 text-emerald-400 px-2 py-0.5 rounded font-bold">
                  ● ว่าง พร้อมจอง
                </span>
              </div>
              <div className="p-3 bg-studio-card flex flex-col flex-1 min-w-0 space-y-2">
                <div className="space-y-0.5 min-w-0">
                  <span className="text-[9px] uppercase tracking-wider text-studio-red-bright font-bold block">
                    {item.style || 'FLASH'}
                  </span>
                  <h4 className="text-xs font-bold text-studio-primary truncate group-hover:text-studio-red-bright transition-colors">
                    {item.title}
                  </h4>
                  <p className="text-[10px] text-[#E2DDD4] truncate">ช่าง: {item.artist?.name || 'ช่างประจำร้าน'}</p>
                </div>
                <div className="pt-2.5 mt-auto border-t border-studio-border/50 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(item.id);
                    }}
                    className="inline-flex items-center space-x-1 text-studio-red-bright hover:text-tattoo-red-dark font-semibold transition-all text-[11px] sm:text-xs"
                  >
                    <span>จองลายนี้</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && filteredItems.length === 0 && (
        <div className="bg-studio-card border border-studio-border p-12 rounded-[8px] text-center space-y-2">
          <Search size={32} className="text-[#B8B0A3] mx-auto" />
          <h3 className="text-sm font-bold text-studio-primary">ไม่พบลายสัก Flash ที่เปิดให้จอง</h3>
          <p className="text-xs text-[#E2DDD4]">ลองเปลี่ยนคำค้นหาหรือเลือกสไตล์งานอื่น</p>
        </div>
      )}
    </div>
  );
}
