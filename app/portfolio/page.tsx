'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import CustomerHeader from '@/components/customer/CustomerHeader';
import MobileBottomNav from '@/components/customer/MobileBottomNav';
import PortfolioFilter from '@/components/customer/PortfolioFilter';
import EstimateForm from '@/components/estimate/EstimateForm';
import { useApp } from '@/components/AppContext';
import Link from 'next/link';
import {
  Sparkles,
  Calendar,
  ArrowLeft,
  ArrowUpRight,
  Search,
  SlidersHorizontal,
  User,
  Clock,
  Maximize2,
  X,
  AlertCircle,
  RefreshCw,
  Image as ImageIcon,
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
  } | null;
}

function formatDurationDisplay(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} นาที`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (remainingMins === 0) {
    return `${hours} ชม. (${minutes} นาที)`;
  }
  return `${hours} ชม. ${remainingMins} นาที`;
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

  // Mobile detail modal overlay
  const [showMobileDetail, setShowMobileDetail] = useState(false);

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
            avatar_url
          )
        `)
        .eq('is_visible', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;

      const loadedList: PortfolioArtworkData[] = (data || []).map((item: any) => ({
        id: item.id,
        artist_id: item.artist_id,
        title: item.title,
        description: item.description || null,
        style: item.style || 'Fine Line',
        size_label: item.size_label || null,
        estimated_duration_minutes: item.estimated_duration_minutes || null,
        image_url: item.image_url,
        is_visible: item.is_visible,
        sort_order: item.sort_order ?? 0,
        created_at: item.created_at,
        artists: Array.isArray(item.artists) ? item.artists[0] : item.artists,
      }));

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
    const styleParam = searchParams.get('style') || searchParams.get('filter');
    if (styleParam && styleParam !== 'All') {
      setFilter(styleParam);
    }

    const selectId = searchParams.get('select');
    if (selectId && artworks.length > 0) {
      const item = artworks.find((p) => p.id === selectId);
      if (item) {
        setSelectedArtwork(item);
        setPanelView('default');
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
          setShowMobileDetail(true);
        }
      }
    } else if (!selectedArtwork && artworks.length > 0) {
      setSelectedArtwork(artworks[0]);
    }

    const action = searchParams.get('action');
    if (action === 'estimate') {
      setPanelView('estimate');
    }
  }, [searchParams, artworks, selectedArtwork]);

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

  const handleItemSelect = (item: PortfolioArtworkData) => {
    setSelectedArtwork(item);
    setPanelView('default');
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setShowMobileDetail(true);
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
                <span className="text-[10px] uppercase tracking-widest text-studio-red font-bold">157 TATTOO GALLERY</span>
                <h1 className="text-2xl md:text-3xl font-black tracking-wider text-studio-primary mt-1">
                  ผลงานสัก (PORTFOLIO)
                </h1>
                <p className="text-xs text-studio-secondary mt-1">
                  รวมผลงานสักคัสตอมระดับพรีเมียมจากช่างประจำร้าน 157 TATTOO
                </p>
              </div>
            </div>

            <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center bg-studio-card/60 p-3 rounded-[6px] border border-studio-border">
              <PortfolioFilter activeFilter={filter} onFilterChange={setFilter} />

              <div className="flex items-center gap-3 w-full xl:w-auto shrink-0">
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
                {filter !== 'All' && <span> • สไตล์: <strong className="text-studio-red">{filter}</strong></span>}
                {searchQuery && <span> • ค้นหา: &quot;<strong className="text-studio-primary">{searchQuery}</strong>&quot;</span>}
              </span>
              {(filter !== 'All' || searchQuery) && (
                <button
                  onClick={() => {
                    setFilter('All');
                    setSearchQuery('');
                  }}
                  className="text-studio-red hover:underline text-[11px]"
                >
                  ล้างตัวกรอง
                </button>
              )}
            </div>

            {loading && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((idx) => (
                  <div key={idx} className="bg-studio-card border border-studio-border rounded-[6px] overflow-hidden animate-pulse">
                    <div className="aspect-square bg-studio-sec/60" />
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
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                {filteredArtworks.map((item) => {
                  const isSelected = selectedArtwork?.id === item.id;
                  const artistName = item.artists?.name || 'ช่างประจำร้าน';
                  const durationText = formatDurationDisplay(item.estimated_duration_minutes);

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleItemSelect(item)}
                      className={`bg-studio-card border rounded-[6px] overflow-hidden group cursor-pointer transition-all duration-200 flex flex-col justify-between ${
                        isSelected
                          ? 'border-studio-red ring-1 ring-studio-red shadow-lg shadow-studio-red/10'
                          : 'border-studio-border hover:border-studio-red/60 hover:shadow-md'
                      }`}
                    >
                      <div className="aspect-square bg-studio-main overflow-hidden relative">
                        <img
                          src={item.image_url}
                          alt={item.title}
                          className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute top-2 left-2 bg-studio-sec/90 backdrop-blur-sm border border-studio-border text-studio-red text-[9px] font-bold px-2 py-0.5 rounded">
                          {item.style}
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-studio-main/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                          <span className="text-[11px] text-studio-paper font-bold flex items-center gap-1">
                            ดูรายละเอียด <ArrowUpRight size={13} />
                          </span>
                        </div>
                      </div>

                      <div className="p-3 space-y-1">
                        <h3 className="text-xs sm:text-sm font-heading tracking-wide text-studio-primary truncate">
                          {item.title}
                        </h3>
                        <div className="flex justify-between items-center text-[10px] text-studio-secondary">
                          <span className="truncate">ช่าง: {artistName}</span>
                          {durationText && <span className="shrink-0 text-studio-muted">{item.size_label || durationText}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="hidden lg:block w-full lg:w-[37%] sticky top-24 space-y-4">
            {selectedArtwork ? (
              <div className="bg-studio-card border border-studio-border p-5 rounded-[8px] space-y-5 shadow-xl">
                {panelView === 'default' ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-studio-border pb-3">
                      <span className="text-[10px] uppercase tracking-widest text-studio-red font-bold">
                        งานออกแบบเฉพาะบุคคล (Custom Artwork)
                      </span>
                      <span className="text-[10px] bg-studio-red/10 border border-studio-red/30 text-studio-red px-2 py-0.5 rounded font-bold">
                        {selectedArtwork.style}
                      </span>
                    </div>

                    <div className="aspect-[4/3] rounded-[6px] border border-studio-border overflow-hidden bg-studio-main">
                      <img
                        src={selectedArtwork.image_url}
                        alt={selectedArtwork.title}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div>
                      <h3 className="text-xl font-bold text-studio-primary tracking-wide">{selectedArtwork.title}</h3>
                      <p className="text-xs text-studio-secondary mt-1">
                        ช่างสักประจำผลงาน:{' '}
                        <strong className="text-studio-primary">{selectedArtwork.artists?.name || 'ช่างประจำร้าน'}</strong>
                        {selectedArtwork.artists?.nickname && ` (${selectedArtwork.artists.nickname})`}
                      </p>
                      {selectedArtwork.description && (
                        <p className="text-xs text-studio-secondary/90 mt-2 leading-relaxed bg-studio-main/50 p-2.5 rounded border border-studio-border/50">
                          {selectedArtwork.description}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 border-t border-b border-studio-border/60 py-4 text-xs">
                      <div className="space-y-1">
                        <span className="text-[10px] text-studio-muted flex items-center gap-1">
                          <User size={12} /> ช่างสัก
                        </span>
                        <span className="font-semibold text-studio-primary block truncate">
                          {selectedArtwork.artists?.name || 'ช่างประจำร้าน'}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] text-studio-muted flex items-center gap-1">
                          <Clock size={12} /> เวลาสักโดยประมาณ
                        </span>
                        <span className="font-semibold text-studio-primary block">
                          {formatDurationDisplay(selectedArtwork.estimated_duration_minutes) || 'ตามขนาดงานจริง'}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] text-studio-muted">สไตล์ลายสัก</span>
                        <span className="font-semibold text-studio-primary block">{selectedArtwork.style}</span>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] text-studio-muted">ขนาดผลงานจริง</span>
                        <span className="font-semibold text-studio-primary block">
                          {selectedArtwork.size_label || 'กำหนดตามสรีระลูกค้า'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3 pt-2">
                      <Link
                        href={`/booking?artist=${selectedArtwork.artist_id}&artwork=${selectedArtwork.id}`}
                        className="min-h-[46px] w-full bg-studio-red hover:bg-[#802222] text-studio-paper py-3 px-4 rounded-[4px] text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-studio-red/10 flex items-center justify-center space-x-2 border border-studio-red active:scale-[0.99] text-center block"
                      >
                        <Calendar size={14} />
                        <span>จองคิวกับช่าง {selectedArtwork.artists?.name || ''}</span>
                      </Link>

                      <Link
                        href={`/artists?id=${selectedArtwork.artist_id}`}
                        className="w-full bg-transparent border border-studio-border text-studio-secondary hover:text-studio-primary hover:border-studio-red/50 py-2.5 px-4 rounded-[4px] text-xs font-medium transition-all block text-center"
                      >
                        ดูประวัติและผลงานของช่าง {selectedArtwork.artists?.name || ''}
                      </Link>

                      <button
                        onClick={() => setPanelView('estimate')}
                        className="w-full text-center text-xs text-studio-muted hover:text-studio-red pt-1 block transition-colors"
                      >
                        สนใจงานแนวนี้? ส่งรูปขอประเมินราคางานออกแบบใหม่ →
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 animate-fadeIn">
                    <button
                      onClick={() => setPanelView('default')}
                      className="flex items-center space-x-1.5 text-xs text-studio-secondary hover:text-studio-red transition-colors uppercase font-semibold pb-2 border-b border-studio-border w-full"
                    >
                      <ArrowLeft size={14} />
                      <span>ย้อนกลับไปดูรายละเอียดผลงาน</span>
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
              </div>
            ) : (
              <div className="bg-studio-card border border-studio-border p-8 rounded-[8px] text-center text-xs text-studio-muted">
                เลือกผลงานจากรายการเพื่อดูรายละเอียด
              </div>
            )}
          </div>
        </div>
      </main>

      {showMobileDetail && selectedArtwork && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 bg-studio-main/90 backdrop-blur-md animate-fadeIn font-prompt lg:hidden">
          <div className="relative w-full bg-studio-card border-t border-studio-border rounded-t-[16px] overflow-hidden flex flex-col max-h-[90vh] shadow-2xl">
            <button
              onClick={() => setShowMobileDetail(false)}
              className="absolute top-3 right-3 z-20 w-9 h-9 bg-studio-main/80 hover:bg-studio-red text-studio-primary rounded-full flex items-center justify-center transition-colors shadow-lg"
              title="ปิด"
            >
              <X size={16} />
            </button>

            <div className="relative w-full h-[32vh] min-h-[200px] bg-studio-main shrink-0">
              <img
                src={selectedArtwork.image_url}
                alt={selectedArtwork.title}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="p-5 flex flex-col justify-between overflow-y-auto space-y-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-studio-red bg-studio-sec px-2.5 py-1 border border-studio-border rounded-[4px]">
                  {selectedArtwork.style}
                </span>

                <h2 className="text-xl font-heading font-normal text-studio-primary mt-2 tracking-wide">
                  {selectedArtwork.title}
                </h2>

                <p className="text-xs text-studio-secondary mt-1">
                  ประเภทงาน: <span className="text-studio-primary font-medium">งานออกแบบเฉพาะบุคคล (Custom Artwork)</span>
                </p>

                <div className="grid grid-cols-2 gap-3 my-4 border-t border-b border-studio-border/60 py-3.5 text-xs">
                  <div className="space-y-0.5">
                    <span className="text-[10px] text-studio-muted flex items-center gap-1">
                      <User size={12} /> ช่างสัก
                    </span>
                    <span className="font-semibold text-studio-primary block truncate">
                      {selectedArtwork.artists?.name || 'ช่างประจำร้าน'}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-[10px] text-studio-muted flex items-center gap-1">
                      <Clock size={12} /> เวลาสักโดยประมาณ
                    </span>
                    <span className="font-semibold text-studio-primary block">
                      {formatDurationDisplay(selectedArtwork.estimated_duration_minutes) || 'ตามขนาดงานจริง'}
                    </span>
                  </div>

                  {selectedArtwork.size_label && (
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-studio-muted flex items-center gap-1">
                        <Maximize2 size={12} /> ขนาด
                      </span>
                      <span className="font-semibold text-studio-primary block">{selectedArtwork.size_label}</span>
                    </div>
                  )}
                </div>

                <Link
                  href={`/artists?id=${selectedArtwork.artist_id}`}
                  onClick={() => setShowMobileDetail(false)}
                  className="text-xs text-studio-primary hover:text-studio-red hover:underline text-left block py-1 font-medium"
                >
                  ดูประวัติและผลงานทั้งหมดของช่าง {selectedArtwork.artists?.name || ''} →
                </Link>
              </div>

              <div className="space-y-2 pt-2 border-t border-studio-border/60">
                <Link
                  href={`/booking?artist=${selectedArtwork.artist_id}&artwork=${selectedArtwork.id}`}
                  onClick={() => setShowMobileDetail(false)}
                  className="w-full bg-studio-red hover:bg-[#802222] text-studio-paper py-3 rounded-[4px] text-xs font-bold uppercase tracking-wider flex items-center justify-center space-x-2 transition-all block text-center"
                >
                  <Calendar size={14} />
                  <span>จองคิวกับช่าง {selectedArtwork.artists?.name || ''}</span>
                </Link>

                <button
                  onClick={() => {
                    setShowMobileDetail(false);
                    setPanelView('estimate');
                  }}
                  className="w-full bg-studio-main border border-studio-border hover:border-studio-red text-studio-primary py-2.5 rounded-[4px] text-xs font-medium transition-all"
                >
                  ส่งรูปขอประเมินราคางานแนวนี้
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {panelView === 'estimate' && selectedArtwork && (
        <div className="lg:hidden px-4 py-8 border-t border-studio-border mt-8 bg-studio-card animate-fadeIn">
          <button
            onClick={() => setPanelView('default')}
            className="flex items-center space-x-1.5 text-xs text-studio-secondary hover:text-studio-red transition-colors uppercase font-semibold mb-6"
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
