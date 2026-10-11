'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import CustomerHeader from '@/components/customer/CustomerHeader';
import MobileBottomNav from '@/components/customer/MobileBottomNav';
import PortfolioFilter from '@/components/customer/PortfolioFilter';
import EstimateForm from '@/components/estimate/EstimateForm';
import { useApp } from '@/components/AppContext';
import { getThumbnailUrl, handleThumbnailError } from '@/lib/utils/thumbnailHelper';
import Link from 'next/link';
import {
  Sparkles,
  Calendar,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Search,
  SlidersHorizontal,
  User,
  X,
  AlertCircle,
  RefreshCw,
  Image as ImageIcon,
  ZoomIn,
} from 'lucide-react';

export interface PortfolioArtworkData {
  id: string;
  artist_id: string;
  title: string;
  description: string | null;
  style: string;
  size_label: string | null;
  estimated_duration_minutes: number | null;
  image_url: string;
  is_visible: boolean;
  sort_order: number;
  created_at: string;
  artists?: {
    id: string;
    name: string;
    nickname: string | null;
    avatar_url: string | null;
    is_active?: boolean;
    is_visible?: boolean;
  } | null;
}

function formatDurationDisplay(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.round((minutes / 60) * 100) / 100;
  return `${hours} ชม.`;
}

function formatArtistTitle(name?: string | null): string {
  if (!name) return 'ช่างประจำร้าน';
  const trimmed = name.trim();
  if (trimmed.startsWith('ช่าง')) {
    return trimmed;
  }
  return `ช่าง${trimmed}`;
}

function PortfolioContent() {
  const searchParams = useSearchParams();
  const { supabase } = useApp();

  const [artworks, setArtworks] = useState<PortfolioArtworkData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Controls
  const [filter, setFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'title' | 'artist'>('default');

  // Selected Artwork for 37% Sticky Panel
  const [selectedArtwork, setSelectedArtwork] = useState<PortfolioArtworkData | null>(null);

  // View states for right panel on desktop / page view on mobile
  const [panelView, setPanelView] = useState<'default' | 'estimate'>('default');

  // Mobile detail & Lightbox modal overlay
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);

  // 1. Fetch live portfolio artworks
  const fetchLiveArtworks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from('portfolio_artworks')
        .select(`
          id,
          artist_id,
          title,
          description,
          style,
          size_label,
          estimated_duration_minutes,
          image_url,
          is_visible,
          sort_order,
          created_at,
          artists (
            id,
            name,
            nickname,
            avatar_url,
            is_active,
            is_visible
          )
        `)
        .eq('is_visible', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;

      const loadedList: PortfolioArtworkData[] = (data || [])
        .map((item: any) => ({
          id: item.id,
          artist_id: item.artist_id,
          title: item.title,
          description: item.description || null,
          style: item.style || '',
          size_label: item.size_label || null,
          estimated_duration_minutes: item.estimated_duration_minutes || null,
          image_url: item.image_url,
          is_visible: item.is_visible,
          sort_order: item.sort_order ?? 0,
          created_at: item.created_at,
          artists: Array.isArray(item.artists) ? item.artists[0] : item.artists,
        }))
        .filter((item: PortfolioArtworkData) => {
          if (!item.artist_id || !item.artists) return false;
          if (item.artists.is_active === false || item.artists.is_visible === false) return false;
          return true;
        });

      setArtworks(loadedList);
    } catch (err: any) {
      console.error('[Portfolio] Load error:', err?.message || err);
      setError('ไม่สามารถโหลดผลงานได้ในขณะนี้');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchLiveArtworks();
  }, [fetchLiveArtworks]);

  // 2. URL parameter synchronization
  useEffect(() => {
    if (loading) return;

    const selectId = searchParams.get('select');
    if (selectId) {
      const item = artworks.find((p) => p.id === selectId);
      if (item) {
        setSelectedArtwork(item);
        setPanelView('default');
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
          setShowMobileDetail(true);
        }
      } else {
        setSelectedArtwork(null);
        setShowMobileDetail(false);
      }
    } else if (artworks.length > 0) {
      setSelectedArtwork((prev) => {
        if (prev && artworks.some((p) => p.id === prev.id)) return prev;
        return artworks[0];
      });
    } else {
      setSelectedArtwork(null);
      setShowMobileDetail(false);
    }

    const styleParam = searchParams.get('style') || searchParams.get('filter');
    if (styleParam && styleParam !== 'All') {
      setFilter(styleParam);
    }

    const action = searchParams.get('action');
    if (action === 'estimate') {
      setPanelView('estimate');
    }
  }, [searchParams, artworks, loading]);

  // 3. Client-side filtering & searching
  const filteredArtworks = useMemo(() => {
    let list = artworks;

    // Filter by style
    if (filter !== 'All') {
      list = list.filter((item) => item.style.toLowerCase() === filter.toLowerCase());
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((item) => {
        const titleMatch = item.title?.toLowerCase().includes(q) || false;
        const descMatch = item.description?.toLowerCase().includes(q) || false;
        const styleMatch = item.style?.toLowerCase().includes(q) || false;
        const artistNameMatch = item.artists?.name?.toLowerCase().includes(q) || false;
        const artistNicknameMatch = item.artists?.nickname?.toLowerCase().includes(q) || false;
        return titleMatch || descMatch || styleMatch || artistNameMatch || artistNicknameMatch;
      });
    }

    // Sort
    if (sortBy === 'title') {
      return [...list].sort((a, b) => a.title.localeCompare(b.title, 'th'));
    } else if (sortBy === 'artist') {
      return [...list].sort((a, b) => (a.artists?.name || '').localeCompare(b.artists?.name || '', 'th'));
    }

    return list;
  }, [artworks, filter, searchQuery, sortBy]);

  const dynamicFilters = useMemo(() => {
    const seen = new Set<string>();
    const styles: string[] = [];
    for (const a of artworks) {
      if (!a.style || a.style.trim() === '') continue;
      const key = a.style.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        styles.push(a.style.trim());
      }
    }
    styles.sort((a, b) => a.localeCompare(b, 'th'));
    return ['All', ...styles];
  }, [artworks]);

  const handleItemSelect = (item: PortfolioArtworkData) => {
    setSelectedArtwork(item);
    setPanelView('default');
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setShowLightbox(true);
    }
  };

  return (
    <div className="min-h-screen bg-studio-main pb-28 md:pb-16 text-studio-primary font-prompt">
      <CustomerHeader />

      <main className="max-w-[1560px] mx-auto px-4 sm:px-6 md:px-12 xl:px-16 py-6 md:py-12">
        <div className="flex flex-col lg:flex-row gap-8 xl:gap-12 items-start">
          <div className="w-full lg:w-[63%] space-y-6">
            <div className="border-b border-studio-border pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-2">
              <div>
                <span className="text-[10px] uppercase tracking-widest text-studio-red-bright font-bold">157 TATTOO GALLERY</span>
                <h1 className="text-2xl md:text-3xl font-black tracking-wider text-studio-primary mt-1">
                  ผลงานสัก (PORTFOLIO)
                </h1>
                <p className="text-xs text-studio-secondary mt-1">
                  รวมผลงานสักคัสตอมระดับพรีเมียมจากช่างประจำร้าน 157 TATTOO
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center bg-studio-card/60 p-3 rounded-[6px] border border-studio-border">
              <PortfolioFilter activeFilter={filter} onFilterChange={setFilter} filters={dynamicFilters} />

              <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
                <div className="relative flex-1 sm:w-56">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-studio-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ค้นหาชื่อผลงาน, สไตล์, ช่าง..."
                    className="w-full bg-studio-main border border-studio-border rounded-[4px] pl-9 pr-3 py-1.5 text-xs text-studio-primary placeholder:text-studio-muted focus:outline-none focus:border-studio-red transition-colors"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-studio-muted hover:text-studio-primary"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="relative shrink-0">
                  <select
                    value={sortBy}
                    onChange={(e: any) => setSortBy(e.target.value)}
                    className="bg-studio-main border border-studio-border rounded-[4px] px-3 py-1.5 text-xs text-studio-primary focus:outline-none focus:border-studio-red cursor-pointer"
                  >
                    <option value="default">เรียงลำดับมาตรฐาน</option>
                    <option value="title">เรียงตามชื่อ (A-Z)</option>
                    <option value="artist">เรียงตามชื่อช่าง</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center text-xs text-studio-secondary px-1">
              <span>
                แสดงผลงานทั้งหมด <strong className="text-studio-primary">{filteredArtworks.length}</strong> รายการ
                {filter !== 'All' && <span> • สไตล์: <strong className="text-studio-red-bright">{filter}</strong></span>}
                {searchQuery && <span> • ค้นหา: &quot;<strong className="text-studio-primary">{searchQuery}</strong>&quot;</span>}
              </span>
              {(filter !== 'All' || searchQuery) && (
                <button
                  onClick={() => {
                    setFilter('All');
                    setSearchQuery('');
                  }}
                  className="text-studio-red-bright hover:underline text-[11px]"
                >
                  ล้างตัวกรอง
                </button>
              )}
            </div>

            {loading && (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((idx) => (
                  <div key={idx} className="bg-studio-card border border-studio-border rounded-[6px] overflow-hidden animate-pulse">
                    <div className="aspect-[4/5] bg-studio-sec/60" />
                    <div className="p-3 space-y-2">
                      <div className="h-3 bg-studio-sec/80 rounded w-3/4" />
                      <div className="h-2 bg-studio-sec/50 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loading && error && (
              <div className="bg-studio-card border border-studio-red/40 p-8 rounded-[6px] text-center space-y-3">
                <AlertCircle size={28} className="text-studio-red mx-auto" />
                <h3 className="text-sm font-bold text-studio-primary">{error}</h3>
                <p className="text-xs text-studio-secondary">กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่อีกครั้ง</p>
                <button
                  onClick={fetchLiveArtworks}
                  className="inline-flex items-center gap-1.5 bg-studio-main border border-studio-border hover:border-studio-red text-studio-primary px-4 py-2 rounded text-xs font-semibold"
                >
                  <RefreshCw size={13} />
                  ลองอีกครั้ง
                </button>
              </div>
            )}

            {!loading && !error && filteredArtworks.length === 0 && (
              <div className="bg-studio-card border border-studio-border p-12 rounded-[6px] text-center space-y-3">
                <ImageIcon size={36} className="text-studio-muted mx-auto" />
                <h3 className="text-base font-bold text-studio-primary">ยังไม่มีผลงานใน Portfolio</h3>
                <p className="text-xs text-studio-secondary max-w-md mx-auto">
                  ผลงานสักคัสตอมใหม่จากช่างประจำร้าน 157 TATTOO จะถูกเพิ่มในหน้านี้เร็วๆ นี้
                </p>
                {(filter !== 'All' || searchQuery) && (
                  <button
                    onClick={() => {
                      setFilter('All');
                      setSearchQuery('');
                    }}
                    className="inline-block bg-studio-main border border-studio-border hover:border-studio-red text-studio-primary px-4 py-2 rounded text-xs font-semibold mt-2"
                  >
                    ล้างการค้นหา
                  </button>
                )}
              </div>
            )}

            {!loading && !error && filteredArtworks.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredArtworks.map((item) => {
                  const isSelected = selectedArtwork?.id === item.id;
                  const artistName = item.artists?.name || 'ช่างประจำร้าน';

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleItemSelect(item)}
                      className={`bg-studio-card border rounded-[6px] overflow-hidden group cursor-pointer transition-all duration-300 relative flex flex-col justify-between ${
                        isSelected
                          ? 'border-studio-red ring-1 ring-studio-red shadow-lg shadow-studio-red/10'
                          : 'border-studio-border hover:border-studio-red/60'
                      }`}
                    >
                      {/* Image Area */}
                      <div className="aspect-[4/5] bg-studio-main overflow-hidden relative">
                        <img
                          src={getThumbnailUrl(item.image_url)}
                          onError={(e) => handleThumbnailError(e, item.image_url)}
                          alt={item.title}
                          className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>

                      {/* Info Area Below Image */}
                      <div className="p-3 bg-studio-card flex flex-col justify-between flex-1 min-w-0 space-y-2">
                        <div className="space-y-0.5 min-w-0">
                          <span className="text-[9px] uppercase tracking-wider text-studio-red-bright font-bold block">
                            {item.style}
                          </span>
                          <h4 className="text-xs font-bold text-studio-primary truncate group-hover:text-studio-red-bright transition-colors">
                            {item.title}
                          </h4>
                          <p className="text-[10px] text-studio-secondary truncate">
                            ช่าง: {artistName}
                          </p>
                        </div>

                        {/* Bottom Action Row (CTA Only, Aligned Right) */}
                        <div className="pt-2.5 mt-auto border-t border-studio-border/50 flex items-center justify-end min-w-0">
                          <Link
                            href={`/booking?artist=${item.artist_id}&artwork=${item.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center space-x-1 text-studio-red-bright hover:text-tattoo-red-dark font-semibold transition-all group/btn text-[11px] sm:text-xs"
                          >
                            <span>จองคิวกับช่างคนนี้</span>
                            <ArrowRight size={13} className="transform group-hover/btn:translate-x-0.5 transition-transform" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="hidden lg:block w-full lg:w-[37%] sticky top-24">
            {selectedArtwork ? (
              <div className="bg-studio-card border border-studio-border p-4 rounded-[8px] shadow-xl animate-fadeIn">
                {/* Selected Artwork Image Container (Thumbnail Image, Single Outer Frame) */}
                <div className="w-full h-[520px] max-h-[75vh] flex items-center justify-center relative">
                  <img
                    src={getThumbnailUrl(selectedArtwork.image_url)}
                    onError={(e) => handleThumbnailError(e, selectedArtwork.image_url)}
                    alt={selectedArtwork.title}
                    className="w-full h-full object-contain rounded-[4px] select-none"
                    loading="eager"
                    decoding="async"
                  />
                </div>
              </div>
            ) : (
              <div className="bg-studio-card border border-studio-border p-8 rounded-[8px] text-center text-xs text-studio-muted">
                เลือกผลงานจากรายการเพื่อดูรูปภาพ
              </div>
            )}
          </div>
        </div>
      </main>

      {showMobileDetail && selectedArtwork && (
        <div 
          onClick={() => setShowMobileDetail(false)}
          className="fixed inset-0 z-[70] flex items-end justify-center p-0 bg-studio-main/90 backdrop-blur-md animate-fadeIn font-prompt lg:hidden"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="relative w-full bg-studio-card border-t border-studio-border rounded-t-[16px] overflow-hidden flex flex-col max-h-[88vh] sm:max-h-[90vh] shadow-2xl"
          >
            <button
              onClick={() => setShowMobileDetail(false)}
              className="absolute top-3 right-3 z-20 w-9 h-9 bg-studio-main/80 hover:bg-studio-red text-studio-primary rounded-full flex items-center justify-center transition-colors shadow-lg"
              title="ปิด"
            >
              <X size={16} />
            </button>

            <div className="relative w-full h-[28vh] min-h-[180px] max-h-[260px] bg-studio-main shrink-0 group">
              <img
                src={getThumbnailUrl(selectedArtwork.image_url)}
                onError={(e) => handleThumbnailError(e, selectedArtwork.image_url)}
                alt={selectedArtwork.title}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setShowLightbox(true)}
              />
              <button
                type="button"
                onClick={() => setShowLightbox(true)}
                className="absolute bottom-2.5 right-2.5 bg-studio-main/80 hover:bg-studio-main border border-studio-border/80 text-studio-primary text-[10px] px-2 py-1 rounded flex items-center gap-1 shadow-md backdrop-blur-sm z-10 transition-colors"
              >
                <ZoomIn size={12} />
                <span>ขยายดูรูปจริง</span>
              </button>
            </div>

            <div className="p-5 pb-[max(1.75rem,env(safe-area-inset-bottom,28px))] flex flex-col justify-between overflow-y-auto space-y-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-studio-red-bright bg-studio-sec px-2.5 py-1 border border-studio-border rounded-[4px]">
                  {selectedArtwork.style}
                </span>

                <h2 className="text-xl font-heading font-normal text-studio-primary mt-2 tracking-wide">
                  {selectedArtwork.title}
                </h2>

                <div className="grid grid-cols-2 gap-2 my-4 border-t border-b border-studio-border/60 py-3.5 text-xs">
                  <div className="space-y-0.5 min-w-0">
                    <span className="text-[9px] sm:text-[10px] text-studio-muted flex items-center gap-1 truncate">
                      <User size={12} className="shrink-0" /> <span className="truncate">ช่างสัก</span>
                    </span>
                    <span className="font-semibold text-studio-primary text-xs block truncate">
                      {formatArtistTitle(selectedArtwork.artists?.name)}
                    </span>
                  </div>

                  <div className="space-y-0.5 min-w-0">
                    <span className="text-[9px] sm:text-[10px] text-studio-muted flex items-center gap-1 truncate">
                      <span className="truncate">สไตล์ลายสัก</span>
                    </span>
                    <span className="font-semibold text-studio-primary text-xs block truncate">
                      {selectedArtwork.style}
                    </span>
                  </div>
                </div>

                {selectedArtwork.description &&
                  selectedArtwork.description.trim() !== '' &&
                  selectedArtwork.description.trim() !== 'ว่าง' &&
                  selectedArtwork.description.trim() !== '-' && (
                    <div className="mb-4 space-y-1">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-studio-muted block">
                        รายละเอียดผลงาน
                      </span>
                      <p className="text-xs text-studio-secondary leading-relaxed whitespace-pre-line bg-studio-main/40 p-2.5 rounded border border-studio-border/50">
                        {selectedArtwork.description.trim()}
                      </p>
                    </div>
                )}
              </div>

              <div className="space-y-2 pt-2 border-t border-studio-border/60">
                <Link
                  href={`/booking?artist=${selectedArtwork.artist_id}&artwork=${selectedArtwork.id}`}
                  onClick={() => setShowMobileDetail(false)}
                  className="w-full bg-studio-red hover:bg-[#802222] text-studio-paper py-3 rounded-[4px] text-xs font-bold uppercase tracking-wider flex items-center justify-center space-x-2 transition-all block text-center shadow-md active:scale-[0.99]"
                >
                  <Calendar size={14} />
                  <span>จองคิวกับ{formatArtistTitle(selectedArtwork.artists?.name)}</span>
                </Link>

                {selectedArtwork.artist_id && (
                  <Link
                    href={`/artists?id=${selectedArtwork.artist_id}`}
                    onClick={() => setShowMobileDetail(false)}
                    className="w-full bg-studio-main border border-studio-border hover:border-studio-red text-studio-primary py-2.5 rounded-[4px] text-xs font-medium transition-all block text-center"
                  >
                    ดูประวัติและผลงานทั้งหมดของ{formatArtistTitle(selectedArtwork.artists?.name)} →
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {panelView === 'estimate' && selectedArtwork && (
        <div className="lg:hidden px-4 py-8 border-t border-studio-border mt-8 bg-studio-card animate-fadeIn">
          <button
            onClick={() => setPanelView('default')}
            className="flex items-center space-x-1.5 text-xs text-studio-secondary hover:text-studio-red-bright transition-colors uppercase font-semibold mb-6"
          >
            <ArrowLeft size={14} />
            <span>ย้อนกลับไปดูผลงาน</span>
          </button>

          <EstimateForm
            preselectedArtistId={selectedArtwork.artist_id}
            preselectedArtworkImage={selectedArtwork.image_url}
            preselectedStyle={selectedArtwork.style}
            compact={true}
            onSuccess={() => setPanelView('default')}
          />
        </div>
      )}

      <MobileBottomNav />

      {/* Lightbox Modal for Full Resolution Image */}
      {showLightbox && selectedArtwork && (
        <div
          onClick={() => setShowLightbox(false)}
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out animate-fadeIn font-prompt"
        >
          <div className="relative max-w-4xl max-h-[90vh] text-center" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowLightbox(false)}
              className="absolute -top-10 right-0 text-white hover:text-studio-red-bright text-sm font-bold bg-studio-main/80 border border-studio-border px-3 py-1 rounded"
            >
              ✕ ปิด
            </button>
            <img
              src={selectedArtwork.image_url}
              alt={selectedArtwork.title}
              className="max-w-full max-h-[85vh] object-contain rounded-lg border border-white/20 shadow-2xl mx-auto"
            />
            <p className="text-center text-xs text-studio-secondary mt-2.5">
              {selectedArtwork.title} — รูปภาพความละเอียดสูงต้นฉบับ
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-studio-main flex items-center justify-center font-prompt text-studio-secondary text-xs">กำลังโหลดผลงาน...</div>}>
      <PortfolioContent />
    </React.Suspense>
  );
}
