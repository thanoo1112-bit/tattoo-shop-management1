'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import CustomerHeader from '@/components/customer/CustomerHeader';
import MobileBottomNav from '@/components/customer/MobileBottomNav';
import PortfolioFilter from '@/components/customer/PortfolioFilter';
import FlashReservationModal, { FlashDesignData } from '@/components/flash/FlashReservationModal';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/components/AppContext';
import { getThumbnailUrl, handleThumbnailError } from '@/lib/utils/thumbnailHelper';
import Link from 'next/link';
import {
  Sparkles,
  Calendar,
  FileText,
  ArrowLeft,
  ArrowUpRight,
  Search,
  SlidersHorizontal,
  User,
  Clock,
  DollarSign,
  Tag,
  CheckCircle2,
  AlertCircle,
  Clock3,
  Ban,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
} from 'lucide-react';

function FlashContent() {
  const searchParams = useSearchParams();
  const { user } = useApp();

  const [flashDesigns, setFlashDesigns] = useState<FlashDesignData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Controls
  const [filter, setFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'price-asc' | 'price-desc'>('default');

  // Selected Artwork for 37% Sticky Panel
  const [selectedArtwork, setSelectedArtwork] = useState<FlashDesignData | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // Modal & Lightbox State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);

  const [selectError, setSelectError] = useState<string | null>(null);

  // Fetch Live Flash Designs from Supabase
  const fetchLiveFlashDesigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: designs, error: fetchErr } = await supabase
        .from('flash_designs')
        .select(`
          id,
          artist_id,
          title,
          description,
          style,
          size_label,
          price,
          deposit_amount,
          estimated_duration_minutes,
          image_url,
          image_url_2,
          status,
          is_visible,
          is_repeatable,
          sort_order,
          created_at,
          artists (
            id,
            name,
            nickname,
            is_active,
            is_visible
          )
        `)
        .eq('is_visible', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;

      const formatted: FlashDesignData[] = (designs || [])
        .map((d: any) => ({
          id: d.id,
          artist_id: d.artist_id,
          title: d.title,
          description: d.description,
          style: d.style || '',
          size_label: d.size_label,
          price: Number(d.price) || 0,
          deposit_amount: Number(d.deposit_amount) || 0,
          estimated_duration_minutes: d.estimated_duration_minutes ? Number(d.estimated_duration_minutes) : null,
          image_url: d.image_url,
          image_url_2: d.image_url_2 || null,
          status: d.status,
          is_visible: d.is_visible,
          is_repeatable: Boolean(d.is_repeatable),
          artist: d.artists ? {
            id: d.artists.id,
            name: d.artists.name,
            nickname: d.artists.nickname,
            is_active: d.artists.is_active,
            is_visible: d.artists.is_visible,
          } : null,
        }))
        .filter((d: FlashDesignData) => {
          if (!d.artist_id || !d.artist) return false;
          if (d.artist.is_active === false || d.artist.is_visible === false) return false;
          return true;
        });

      setFlashDesigns(formatted);
    } catch (err: any) {
      console.error('Error fetching live flash designs:', err);
      setError('ไม่สามารถโหลดข้อมูลแบบลายสัก Flash ได้ในขณะนี้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveFlashDesigns();
  }, [fetchLiveFlashDesigns]);

  // Sync URL query params (e.g. ?select=uuid)
  useEffect(() => {
    if (loading) return;

    const selectId = searchParams.get('select');
    if (selectId) {
      const found = flashDesigns.find((f) => f.id === selectId);
      if (found) {
        setSelectedArtwork(found);
        setSelectError(null);
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
          setShowMobileDetail(true);
        }
      } else {
        setSelectedArtwork(null);
        setSelectError('ลายนี้ไม่เปิดให้จองในขณะนี้ หรือช่างสักถูกปิดใช้งาน');
      }
    } else if (flashDesigns.length > 0) {
      setSelectedArtwork((prev) => {
        if (prev && flashDesigns.some((f) => f.id === prev.id)) return prev;
        return flashDesigns[0];
      });
      setSelectError(null);
    } else {
      setSelectedArtwork(null);
      setSelectError(null);
    }

    const styleParam = searchParams.get('style') || searchParams.get('filter');
    if (styleParam && styleParam !== 'All') {
      setFilter(styleParam);
    }
  }, [searchParams, flashDesigns, loading]);

  // Filter & Search & Sort
  const filteredItems = useMemo(() => {
    let list = flashDesigns;

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

    if (sortBy === 'price-asc') {
      return [...list].sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-desc') {
      return [...list].sort((a, b) => b.price - a.price);
    }

    return list;
  }, [flashDesigns, filter, searchQuery, sortBy]);

  const dynamicFilters = useMemo(() => {
    const seen = new Set<string>();
    const styles: string[] = [];
    for (const d of flashDesigns) {
      if (!d.style || d.style.trim() === '') continue;
      const key = d.style.trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        styles.push(d.style.trim());
      }
    }
    styles.sort((a, b) => a.localeCompare(b, 'th'));
    return ['All', ...styles];
  }, [flashDesigns]);

  const handleItemSelect = (item: FlashDesignData) => {
    setSelectedArtwork(item);
    setActiveImageIndex(0);
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setShowMobileDetail(true);
    }
  };

  const getStatusBadge = (status: FlashDesignData['status']) => {
    switch (status) {
      case 'AVAILABLE':
        return (
          <span className="text-[10px] bg-emerald-950/60 border border-emerald-600/40 text-emerald-400 px-2 py-0.5 rounded font-bold">
            ● ว่าง พร้อมจอง
          </span>
        );
      case 'HELD':
        return (
          <span className="text-[10px] bg-amber-950/60 border border-amber-600/40 text-amber-300 px-2 py-0.5 rounded font-bold">
            ● กำลังรอการยืนยัน
          </span>
        );
      case 'RESERVED':
        return (
          <span className="text-[10px] bg-indigo-950/60 border border-indigo-600/40 text-indigo-300 px-2 py-0.5 rounded font-bold">
            ● จองแล้ว
          </span>
        );
      case 'SOLD':
        return (
          <span className="text-[10px] bg-[#171512] border border-[#4A443A] text-[#7A7265] px-2 py-0.5 rounded font-bold">
            ✕ สักแล้ว / ปิดจอง
          </span>
        );
    }
  };

  const getTypeBadge = (isRepeatable?: boolean) => {
    if (isRepeatable) {
      return (
        <span className="text-[10px] bg-cyan-950/80 border border-cyan-600/40 text-cyan-300 px-2 py-0.5 rounded font-bold">
          สักซ้ำได้
        </span>
      );
    }
    return (
      <span className="text-[10px] bg-amber-950/80 border border-amber-600/40 text-amber-300 px-2 py-0.5 rounded font-bold">
        ลายเดียว
      </span>
    );
  };

  // Helper to extract available images array for selectedArtwork
  const selectedImages = useMemo(() => {
    if (!selectedArtwork) return [];
    return [selectedArtwork.image_url, selectedArtwork.image_url_2].filter(Boolean) as string[];
  }, [selectedArtwork]);

  const activeImage = selectedImages[activeImageIndex] || selectedArtwork?.image_url || '';
  const hasMultipleImages = selectedImages.length > 1;

  return (
    <div className="min-h-screen bg-studio-main pb-28 md:pb-16 text-studio-primary font-prompt">
      <CustomerHeader />

      <main className="max-w-[1560px] mx-auto px-4 sm:px-6 md:px-12 xl:px-16 py-6 md:py-12">
        {/* DESKTOP SPLIT CONTAINER: LEFT 63% / RIGHT 37% */}
        <div className="flex flex-col lg:flex-row gap-8 xl:gap-12 items-start">
          {/* ========================================================================= */}
          {/* LEFT SIDE: 63% Flash Gallery */}
          {/* ========================================================================= */}
          <div className="w-full lg:w-[63%] space-y-6">
            <div className="border-b border-studio-border pb-4">
              <span className="text-[10px] uppercase tracking-widest text-studio-red font-bold">
                157 TATTOO LIVE FLASH
              </span>
              <h1 className="text-2xl md:text-3xl font-black tracking-wider text-studio-primary mt-1">
                แบบลายสักพร้อมจอง (FLASH DESIGNS)
              </h1>
              <p className="text-xs text-studio-secondary mt-1 font-light">
                รวมแบบลายสักว่างพร้อมสักลิขสิทธิ์เฉพาะของช่างประจำร้าน 157 TATTOO ราคาคงที่ชัดเจน (Fixed Price) ส่งคำขอจองคิวได้ทันที
              </p>
            </div>

            {/* Filter Bar + Search & Sort Controls */}
            <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center bg-studio-card/60 p-3 rounded-[6px] border border-studio-border">
              <PortfolioFilter activeFilter={filter} onFilterChange={setFilter} filters={dynamicFilters} />

              <div className="flex items-center gap-3 w-full xl:w-auto shrink-0">
                <div className="relative flex-1 xl:w-48">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-studio-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ค้นหาลาย / ช่าง..."
                    className="w-full bg-studio-main border border-studio-border text-xs text-studio-primary pl-8 pr-3 py-1.5 rounded-[4px] outline-none focus:border-studio-red"
                  />
                </div>

                <div className="flex items-center space-x-1.5 bg-studio-main border border-studio-border px-2.5 py-1.5 rounded-[4px] shrink-0">
                  <SlidersHorizontal size={13} className="text-studio-muted" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-transparent text-[11px] text-studio-secondary outline-none cursor-pointer"
                  >
                    <option value="default">เรียงตามเริ่มต้น</option>
                    <option value="price-asc">ราคา: ต่ำ ➔ สูง</option>
                    <option value="price-desc">ราคา: สูง ➔ ต่ำ</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Gallery Results Count */}
            <div className="flex justify-between items-center text-xs text-studio-secondary px-1">
              <span>
                แสดงลายสักพร้อมจอง: <strong className="text-studio-primary">{filteredItems.length}</strong> รายการ
              </span>
              {filter !== 'All' && (
                <button onClick={() => setFilter('All')} className="text-studio-red hover:underline text-[11px]">
                  ล้างตัวกรองทั้งหมด
                </button>
              )}
            </div>

            {loading && (
              <div className="py-16 text-center text-xs text-studio-secondary animate-pulse">
                กำลังโหลดแบบลายสัก Flash...
              </div>
            )}

            {error && (
              <div className="bg-red-950/40 border border-red-900/60 p-4 rounded-[6px] text-xs text-red-400 flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            {/* Desktop Masonry Grid: 3 Columns on 1440px / 4 Columns on 1920px */}
            {!loading && !error && (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredItems.map((item) => {
                  const isSelected = selectedArtwork?.id === item.id;

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleItemSelect(item)}
                      className={`bg-studio-card border rounded-[6px] overflow-hidden group cursor-pointer transition-all duration-300 relative ${
                        isSelected
                          ? 'border-studio-red ring-1 ring-studio-red shadow-lg shadow-studio-red/10'
                          : 'border-studio-border hover:border-studio-red/60'
                      }`}
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
                        <div className="absolute top-2.5 left-2.5 bg-studio-main/90 backdrop-blur-sm border border-studio-border/60 text-studio-red text-[9px] font-bold px-2 py-0.5 rounded">
                          Flash
                        </div>
                        <div className="absolute top-2.5 right-2.5 flex flex-col items-end gap-1">
                          {getStatusBadge(item.status)}
                          {getTypeBadge(item.is_repeatable)}
                        </div>
                      </div>

                      <div className="p-3 bg-studio-card">
                        <span className="text-[9px] uppercase tracking-wider text-studio-red font-bold block mb-0.5">
                          {item.style}
                        </span>
                        <h4 className="text-xs font-bold text-studio-primary truncate group-hover:text-studio-red transition-colors">
                          {item.title}
                        </h4>
                        <div className="flex justify-between items-center text-[10px] text-studio-secondary mt-1">
                          <span className="truncate pr-2">
                            ช่าง: {item.artist?.name || 'ช่างประจำร้าน'}
                          </span>
                        </div>
                        <div className="pt-2 mt-2 border-t border-studio-border/50 flex justify-between items-center">
                          {item.status === 'AVAILABLE' ? (
                            <Link
                              href={`/booking?flash=${item.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="bg-studio-red text-studio-paper hover:bg-tattoo-red-dark px-2.5 py-1 rounded text-[10px] font-semibold tracking-wider uppercase transition-colors"
                            >
                              จองลายนี้
                            </Link>
                          ) : (
                            <span className="text-[10px] text-studio-muted">
                              {item.status === 'HELD' ? 'รอการยืนยัน' : item.status === 'RESERVED' ? 'จองแล้ว' : 'ปิดจอง'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!loading && !error && filteredItems.length === 0 && (
              <div className="bg-studio-card border border-studio-border p-12 rounded-[8px] text-center space-y-2">
                <Search size={32} className="text-studio-muted mx-auto" />
                <h3 className="text-sm font-bold text-studio-primary">ไม่พบลายสัก Flash ที่ตรงกับการค้นหา</h3>
                <p className="text-xs text-studio-secondary">ลองเปลี่ยนคำค้นหาหรือเลือกสไตล์งานอื่น</p>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* RIGHT SIDE: 37% Sticky Action Panel */}
          {/* ========================================================================= */}
          <div className="hidden lg:block w-full lg:w-[37%] sticky top-[88px] bg-studio-card border border-studio-border p-6 rounded-[8px] shadow-xl">
            {selectedArtwork ? (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex justify-between items-center border-b border-studio-border pb-3">
                  <span className="text-[10px] uppercase tracking-widest text-studio-red font-bold">
                    ลายพร้อมสัก (Flash Design)
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {getStatusBadge(selectedArtwork.status)}
                    {getTypeBadge(selectedArtwork.is_repeatable)}
                    <span className="text-[10px] bg-studio-red/10 border border-studio-red/30 text-studio-red px-2 py-0.5 rounded font-bold">
                      {selectedArtwork.style}
                    </span>
                  </div>
                </div>

                <div className="relative aspect-[4/3] rounded-[6px] border border-studio-border overflow-hidden bg-studio-main group">
                  <img
                    src={getThumbnailUrl(activeImage)}
                    onError={(e) => handleThumbnailError(e, activeImage)}
                    alt={selectedArtwork.title}
                    className="w-full h-full object-cover select-none transition-opacity duration-200 cursor-pointer"
                    onClick={() => setShowLightbox(true)}
                  />

                  {/* Zoom indicator button */}
                  <button
                    type="button"
                    onClick={() => setShowLightbox(true)}
                    className="absolute bottom-2.5 right-2.5 bg-studio-main/80 hover:bg-studio-main border border-studio-border/80 text-studio-primary text-[10px] px-2 py-1 rounded flex items-center gap-1 shadow-md backdrop-blur-sm z-10 transition-colors"
                  >
                    <ZoomIn size={12} />
                    <span>ขยายดูรูปจริง</span>
                  </button>

                  {hasMultipleImages && (
                    <>
                      {/* Indicator 1/2 */}
                      <div className="absolute top-2.5 right-2.5 bg-studio-main/90 backdrop-blur-sm border border-studio-border text-studio-primary text-[10px] font-mono font-bold px-2 py-0.5 rounded shadow z-10">
                        {activeImageIndex + 1} / {selectedImages.length}
                      </div>

                      {/* Navigation Controls */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveImageIndex((prev) => (prev === 0 ? selectedImages.length - 1 : prev - 1));
                        }}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-studio-main/80 hover:bg-studio-main border border-studio-border text-studio-primary flex items-center justify-center transition-all shadow-md active:scale-95 z-10"
                        aria-label="Previous image"
                      >
                        <ChevronLeft size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveImageIndex((prev) => (prev + 1) % selectedImages.length);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-studio-main/80 hover:bg-studio-main border border-studio-border text-studio-primary flex items-center justify-center transition-all shadow-md active:scale-95 z-10"
                        aria-label="Next image"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </>
                  )}
                </div>

                <div>
                  <h3 className="text-xl font-bold text-studio-primary tracking-wide">{selectedArtwork.title}</h3>
                  <p className="text-xs text-studio-secondary mt-1">
                    ช่างสักผู้รับผิดชอบ: <strong className="text-studio-primary">{selectedArtwork.artist?.name || 'ช่างประจำร้าน'}</strong>
                  </p>
                  {selectedArtwork.description && (
                    <p className="text-xs text-studio-muted mt-2 font-light leading-relaxed bg-studio-main/50 p-2.5 rounded border border-studio-border/30">
                      {selectedArtwork.description}
                    </p>
                  )}
                </div>

                {/* Specs Grid */}
                <div className="grid grid-cols-1 gap-3 border-t border-b border-studio-border/60 py-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-[10px] text-studio-muted flex items-center gap-1">
                      <User size={12} /> ช่างสักเจ้าของลาย
                    </span>
                    <span className="font-semibold text-studio-primary block">
                      {selectedArtwork.artist?.name || 'ช่างประจำร้าน'}
                    </span>
                  </div>
                </div>

                {/* Progressive Action CTAs */}
                <div className="space-y-3 pt-2">
                  {selectedArtwork.status === 'AVAILABLE' ? (
                    <Link
                      href={`/booking?flash=${selectedArtwork.id}`}
                      className="w-full bg-studio-red text-studio-primary hover:bg-tattoo-red-dark active:scale-[0.99] py-3.5 px-4 rounded-[4px] text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-studio-red/10 flex items-center justify-center text-center"
                    >
                      จองลายนี้
                    </Link>
                  ) : (
                    <button
                      disabled
                      className="w-full bg-studio-main/60 border border-studio-border/60 text-studio-muted py-3.5 px-4 rounded-[4px] text-xs font-bold uppercase tracking-widest cursor-not-allowed"
                    >
                      {selectedArtwork.status === 'HELD'
                        ? 'กำลังรอการยืนยัน (ไม่สามารถจองซ้ำได้)'
                        : selectedArtwork.status === 'RESERVED'
                        ? 'มีผู้จองแล้ว'
                        : 'ขายแล้ว / ปิดการจอง'}
                    </button>
                  )}
                  <div className="text-[10px] text-studio-muted text-center">
                    * การส่งคำขอยังไม่ใช่นัดหมายที่ยืนยัน ร้านจะติดต่อยืนยันรอบนัดหมายและการชำระเงินมัดจำอีกครั้ง
                  </div>
                </div>
              </div>
            ) : selectError ? (
              <div className="py-12 px-4 text-center space-y-3">
                <AlertCircle size={32} className="text-amber-400 mx-auto" />
                <h3 className="text-sm font-bold text-studio-primary">ลายสักไม่เปิดให้จอง</h3>
                <p className="text-xs text-studio-secondary">{selectError}</p>
              </div>
            ) : (
              <div className="py-20 text-center text-xs text-studio-muted">
                เลือกลายสักเพื่อดูรายละเอียดและส่งคำขอจอง
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Mobile Detail Modal Overlay */}
      {showMobileDetail && selectedArtwork && (
        <div className="fixed inset-0 z-40 lg:hidden flex items-end sm:items-center justify-center p-0 sm:p-4 bg-studio-main/90 backdrop-blur-sm">
          <div className="w-full sm:max-w-md bg-studio-card border border-studio-border rounded-t-[12px] sm:rounded-[8px] p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-2 border-b border-studio-border">
              <span className="text-[10px] uppercase font-bold text-studio-red tracking-wider">FLASH DETAIL</span>
              <button onClick={() => setShowMobileDetail(false)} className="text-xs text-studio-muted p-1">
                ✕ ปิด
              </button>
            </div>
            <div className="relative aspect-[4/3] rounded overflow-hidden bg-studio-main border border-studio-border group">
              <img
                src={getThumbnailUrl(activeImage)}
                onError={(e) => handleThumbnailError(e, activeImage)}
                alt={selectedArtwork.title}
                className="w-full h-full object-cover select-none cursor-pointer"
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

              {hasMultipleImages && (
                <>
                  <div className="absolute top-2.5 right-2.5 bg-studio-main/90 backdrop-blur-sm border border-studio-border text-studio-primary text-[10px] font-mono font-bold px-2 py-0.5 rounded shadow z-10">
                    {activeImageIndex + 1} / {selectedImages.length}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveImageIndex((prev) => (prev === 0 ? selectedImages.length - 1 : prev - 1));
                    }}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-studio-main/80 hover:bg-studio-main border border-studio-border text-studio-primary flex items-center justify-center transition-all shadow-md active:scale-95 z-10"
                    aria-label="Previous image"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveImageIndex((prev) => (prev + 1) % selectedImages.length);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-studio-main/80 hover:bg-studio-main border border-studio-border text-studio-primary flex items-center justify-center transition-all shadow-md active:scale-95 z-10"
                    aria-label="Next image"
                  >
                    <ChevronRight size={16} />
                  </button>
                </>
              )}
            </div>
            <div>
              <div className="flex justify-between items-start gap-2">
                <h3 className="text-base font-bold text-studio-primary flex-1">{selectedArtwork.title}</h3>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {getStatusBadge(selectedArtwork.status)}
                  {getTypeBadge(selectedArtwork.is_repeatable)}
                </div>
              </div>
              <p className="text-xs text-studio-secondary mt-0.5">ช่าง: {selectedArtwork.artist?.name || 'ช่างประจำร้าน'}</p>
            </div>
            {selectedArtwork.status === 'AVAILABLE' ? (
              <Link
                href={`/booking?flash=${selectedArtwork.id}`}
                className="w-full bg-studio-red text-studio-primary py-3 rounded text-xs font-bold uppercase tracking-wider block text-center"
              >
                จองลายนี้
              </Link>
            ) : (
              <button disabled className="w-full bg-studio-main border border-studio-border text-studio-muted py-3 rounded text-xs font-bold cursor-not-allowed">
                ไม่สามารถจองได้ในขณะนี้
              </button>
            )}
          </div>
        </div>
      )}

      {/* Lightbox Modal for Full Resolution Image */}
      {showLightbox && activeImage && (
        <div
          onClick={() => setShowLightbox(false)}
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out animate-fadeIn font-prompt"
        >
          <div className="relative max-w-4xl max-h-[90vh] text-center" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowLightbox(false)}
              className="absolute -top-10 right-0 text-white hover:text-studio-red text-sm font-bold bg-studio-main/80 border border-studio-border px-3 py-1 rounded"
            >
              ✕ ปิด
            </button>
            <img
              src={activeImage}
              alt={selectedArtwork?.title || ''}
              className="max-w-full max-h-[85vh] object-contain rounded-lg border border-white/20 shadow-2xl mx-auto"
            />
            <p className="text-center text-xs text-studio-secondary mt-2.5">
              {selectedArtwork?.title} — รูปภาพความละเอียดสูงต้นฉบับ
            </p>
          </div>
        </div>
      )}

      {/* Dedicated Flash Reservation Modal */}
      {selectedArtwork && isModalOpen && (
        <FlashReservationModal
          flash={selectedArtwork}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={() => {
            fetchLiveFlashDesigns();
            if (typeof window !== 'undefined') {
              window.location.href = '/portal?tab=flash';
            }
          }}
        />
      )}

      <MobileBottomNav />
    </div>
  );
}

export default function FlashPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-studio-main flex items-center justify-center font-prompt text-xs text-studio-secondary">
          กำลังโหลดแบบลายสัก Flash...
        </div>
      }
    >
      <FlashContent />
    </React.Suspense>
  );
}
