'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import CustomerHeader from '@/components/customer/CustomerHeader';
import MobileBottomNav from '@/components/customer/MobileBottomNav';
import PortfolioFilter from '@/components/customer/PortfolioFilter';
import FlashReservationModal, { FlashDesignData } from '@/components/flash/FlashReservationModal';
import { fetchLiveFlashDesigns as fetchSharedFlashDesigns } from '@/lib/flash/fetchLiveFlashDesigns';
import { useApp } from '@/components/AppContext';
import { getThumbnailUrl, handleThumbnailError } from '@/lib/utils/thumbnailHelper';
import Link from 'next/link';
import {
  Sparkles,
  Calendar,
  FileText,
  ArrowLeft,
  ArrowRight,
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

interface FlashDesignWithMeta extends FlashDesignData {
  created_at?: string;
}

function FlashContent() {
  const searchParams = useSearchParams();
  const { user } = useApp();

  const [flashDesigns, setFlashDesigns] = useState<FlashDesignWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Controls
  const [filter, setFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'newest' | 'oldest'>('default');

  // Selected Artwork for 37% Sticky Panel
  const [selectedArtwork, setSelectedArtwork] = useState<FlashDesignWithMeta | null>(null);
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
      const formatted: FlashDesignWithMeta[] = await fetchSharedFlashDesigns();
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

    if (sortBy === 'newest') {
      return [...list].sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeB - timeA;
      });
    } else if (sortBy === 'oldest') {
      return [...list].sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeA - timeB;
      });
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

  const handleItemSelect = (item: FlashDesignWithMeta) => {
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
            ✕ ปิดจอง
          </span>
        );
    }
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
      <CustomerHeader showLogo />

      <main className="max-w-[1560px] mx-auto px-4 sm:px-6 md:px-12 xl:px-16 py-6 md:py-12">
        {/* DESKTOP SPLIT CONTAINER: LEFT 63% / RIGHT 37% */}
        <div className="flex flex-col lg:flex-row gap-8 xl:gap-12 items-start">
          {/* ========================================================================= */}
          {/* LEFT SIDE: 63% Flash Gallery */}
          {/* ========================================================================= */}
          <div className="w-full lg:w-[63%] space-y-6">
            <div className="border-b border-studio-border pb-4">
              <span className="text-[10px] uppercase tracking-widest text-studio-red-bright font-bold">
                157 TATTOO LIVE FLASH
              </span>
              <h1 className="text-2xl md:text-3xl font-black tracking-wider text-studio-primary mt-1">
                แบบลายสักพร้อมจอง (FLASH DESIGNS)
              </h1>
              <p className="text-xs text-[#E2DDD4] mt-1 font-light">
                รวมแบบลายสักว่างพร้อมสักจากช่างประจำร้าน 157 TATTOO เลือกลายที่ชอบและส่งคำขอจองคิวได้ทันที
              </p>
            </div>

            {/* Filter Bar + Search & Sort Controls */}
            <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center bg-studio-card/60 p-3 rounded-[6px] border border-studio-border">
              <PortfolioFilter activeFilter={filter} onFilterChange={setFilter} filters={dynamicFilters} />

              <div className="flex items-center gap-3 w-full xl:w-auto shrink-0">
                <div className="relative flex-1 xl:w-48">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B8B0A3]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ค้นหาลาย / ช่าง..."
                    className="w-full bg-studio-main border border-studio-border text-xs text-studio-primary pl-8 pr-3 py-1.5 rounded-[4px] outline-none focus:border-studio-red placeholder:text-[#B8B0A3]"
                  />
                </div>

                <div className="flex items-center space-x-1.5 bg-studio-main border border-studio-border px-2.5 py-1.5 rounded-[4px] shrink-0" title="เรียงตาม">
                  <SlidersHorizontal size={13} className="text-[#B8B0A3]" />
                  <span className="text-[11px] text-[#F2EEE8] shrink-0">เรียงตาม</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    aria-label="เรียงตาม"
                    className="bg-transparent text-[11px] text-[#E2DDD4] outline-none cursor-pointer"
                  >
                    <option value="default" className="bg-[#171512] text-studio-primary">ค่าเริ่มต้น</option>
                    <option value="newest" className="bg-[#171512] text-studio-primary">ล่าสุด</option>
                    <option value="oldest" className="bg-[#171512] text-studio-primary">เก่าสุด</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Gallery Results Count */}
            <div className="flex justify-between items-center text-xs text-[#E2DDD4] px-1">
              <span>
                แสดงลายสักพร้อมจอง: <strong className="text-studio-primary">{filteredItems.length}</strong> รายการ
              </span>
              {filter !== 'All' && (
                <button onClick={() => setFilter('All')} className="text-studio-red-bright hover:underline text-[11px]">
                  ล้างตัวกรองทั้งหมด
                </button>
              )}
            </div>

            {loading && (
              <div className="py-16 text-center text-xs text-[#E2DDD4] animate-pulse">
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
                        <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5">
                          {getStatusBadge(item.status)}
                        </div>
                      </div>

                      {/* Info & Bottom Action Row */}
                      <div className="p-3 bg-studio-card flex flex-col justify-between flex-1 min-w-0 space-y-2">
                        <div className="space-y-0.5 min-w-0">
                          <span className="text-[9px] uppercase tracking-wider text-studio-red-bright font-bold block">
                            {item.style || 'FLASH'}
                          </span>
                          <h4 className="text-xs font-bold text-studio-primary truncate group-hover:text-studio-red-bright transition-colors">
                            {item.title}
                          </h4>
                          <p className="text-[10px] text-[#E2DDD4] truncate">
                            ช่าง: {item.artist?.name || 'ช่างประจำร้าน'}
                          </p>
                        </div>

                        {/* Bottom Action Row (CTA Only, Aligned Right) */}
                        <div className="pt-2.5 mt-auto border-t border-studio-border/50 flex items-center justify-end min-w-0">
                          {item.status === 'AVAILABLE' ? (
                            <Link
                              href={`/booking?flash=${item.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center space-x-1 text-studio-red-bright hover:text-tattoo-red-dark font-semibold transition-all group/btn text-[11px] sm:text-xs"
                            >
                              <span>จองลายนี้</span>
                              <ArrowRight size={13} className="transform group-hover/btn:translate-x-0.5 transition-transform" />
                            </Link>
                          ) : (
                            <span className="text-[10px] text-[#F2EEE8] font-medium">
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
                <Search size={32} className="text-[#B8B0A3] mx-auto" />
                <h3 className="text-sm font-bold text-studio-primary">ไม่พบลายสัก Flash ที่ตรงกับการค้นหา</h3>
                <p className="text-xs text-[#E2DDD4]">ลองเปลี่ยนคำค้นหาหรือเลือกสไตล์งานอื่น</p>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* RIGHT SIDE: 37% Sticky Image Panel (Image Only) */}
          {/* ========================================================================= */}
          <div className="hidden lg:block w-full lg:w-[37%] sticky top-[88px] bg-studio-card border border-studio-border p-5 rounded-[8px] shadow-xl">
            {selectedArtwork ? (
              <div className="animate-fadeIn">
                <div className="relative aspect-[4/5] w-full rounded-[6px] border border-studio-border overflow-hidden bg-studio-main flex items-center justify-center group">
                  <img
                    src={getThumbnailUrl(activeImage)}
                    onError={(e) => handleThumbnailError(e, activeImage)}
                    alt={selectedArtwork.title}
                    className="w-full h-full object-contain select-none"
                  />

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
              </div>
            ) : selectError ? (
              <div className="py-12 px-4 text-center space-y-3">
                <AlertCircle size={32} className="text-amber-400 mx-auto" />
                <h3 className="text-sm font-bold text-studio-primary">ลายสักไม่เปิดให้จอง</h3>
                <p className="text-xs text-[#E2DDD4]">{selectError}</p>
              </div>
            ) : (
              <div className="py-20 text-center text-xs text-[#F2EEE8]">
                เลือกลายสักเพื่อดูรูปภาพ
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Mobile Image-Only Preview Overlay */}
      {showMobileDetail && selectedArtwork && (
        <div
          onClick={() => setShowMobileDetail(false)}
          className="fixed inset-0 z-[100] lg:hidden bg-[#0E0D0C]/95 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn"
        >
          {/* Close Button X */}
          <button
            type="button"
            onClick={() => setShowMobileDetail(false)}
            className="fixed top-4 right-4 z-[110] w-10 h-10 rounded-full bg-black/60 border border-white/20 text-white flex items-center justify-center text-lg font-bold shadow-lg active:scale-95 transition-transform"
            aria-label="Close preview"
          >
            ✕
          </button>

          {/* Image Container */}
          <div
            className="relative w-full max-w-lg max-h-[90vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={getThumbnailUrl(activeImage)}
              onError={(e) => handleThumbnailError(e, activeImage)}
              alt={selectedArtwork.title}
              className="max-w-full max-h-[85vh] w-auto h-auto object-contain rounded-lg select-none shadow-2xl"
            />

            {hasMultipleImages && (
              <>
                <div className="absolute top-2 right-2 bg-black/80 border border-white/20 text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded shadow z-10">
                  {activeImageIndex + 1} / {selectedImages.length}
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveImageIndex((prev) => (prev === 0 ? selectedImages.length - 1 : prev - 1));
                  }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 border border-white/20 text-white flex items-center justify-center shadow-md active:scale-95 z-10"
                  aria-label="Previous image"
                >
                  <ChevronLeft size={18} />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveImageIndex((prev) => (prev + 1) % selectedImages.length);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 border border-white/20 text-white flex items-center justify-center shadow-md active:scale-95 z-10"
                  aria-label="Next image"
                >
                  <ChevronRight size={18} />
                </button>
              </>
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
              className="absolute -top-10 right-0 text-white hover:text-studio-red-bright text-sm font-bold bg-studio-main/80 border border-studio-border px-3 py-1 rounded"
            >
              ✕ ปิด
            </button>
            <img
              src={activeImage}
              alt={selectedArtwork?.title || ''}
              className="max-w-full max-h-[85vh] object-contain rounded-lg border border-white/20 shadow-2xl mx-auto"
            />
            <p className="text-center text-xs text-[#E2DDD4] mt-2.5">
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
