'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import CustomerHeader from '@/components/customer/CustomerHeader';
import MobileBottomNav from '@/components/customer/MobileBottomNav';
import PortfolioFilter from '@/components/customer/PortfolioFilter';
import FlashReservationModal, { FlashDesignData } from '@/components/flash/FlashReservationModal';
import { createClient } from '@/lib/supabase/client';
import { useApp } from '@/components/AppContext';
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

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showMobileDetail, setShowMobileDetail] = useState(false);

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
          sort_order,
          created_at,
          artists (
            id,
            name,
            nickname
          )
        `)
        .eq('is_visible', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (fetchErr) throw fetchErr;

      const formatted: FlashDesignData[] = (designs || []).map((d: any) => ({
        id: d.id,
        artist_id: d.artist_id,
        title: d.title,
        description: d.description,
        style: d.style || 'Fine Line',
        size_label: d.size_label,
        price: Number(d.price) || 0,
        deposit_amount: Number(d.deposit_amount) || 0,
        estimated_duration_minutes: d.estimated_duration_minutes ? Number(d.estimated_duration_minutes) : null,
        image_url: d.image_url,
        image_url_2: d.image_url_2 || null,
        status: d.status,
        is_visible: d.is_visible,
        artist: d.artists ? {
          id: d.artists.id,
          name: d.artists.name,
          nickname: d.artists.nickname,
        } : null,
      }));

      setFlashDesigns(formatted);
      if (formatted.length > 0 && !selectedArtwork) {
        setSelectedArtwork(formatted[0]);
        setActiveImageIndex(0);
      }
    } catch (err: any) {
      console.error('Error fetching live flash designs:', err);
      setError('ไม่สามารถโหลดข้อมูลแบบลายสัก Flash ได้ในขณะนี้');
    } finally {
      setLoading(false);
    }
  }, [selectedArtwork]);

  useEffect(() => {
    fetchLiveFlashDesigns();
  }, [fetchLiveFlashDesigns]);

  // Sync URL query params (e.g. ?select=uuid)
  useEffect(() => {
    const selectId = searchParams.get('select');
    if (selectId && flashDesigns.length > 0) {
      const found = flashDesigns.find((f) => f.id === selectId);
      if (found) {
        setSelectedArtwork(found);
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
          setShowMobileDetail(true);
        }
      }
    }

    const styleParam = searchParams.get('style') || searchParams.get('filter');
    if (styleParam && styleParam !== 'All') {
      setFilter(styleParam);
    }
  }, [searchParams, flashDesigns]);

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
              <PortfolioFilter activeFilter={filter} onFilterChange={setFilter} />

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
                          src={item.image_url}
                          alt={item.title}
                          className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                          loading="lazy"
                        />
                        <div className="absolute top-2.5 left-2.5 bg-studio-main/90 backdrop-blur-sm border border-studio-border/60 text-studio-red text-[9px] font-bold px-2 py-0.5 rounded">
                          Flash
                        </div>
                        <div className="absolute top-2.5 right-2.5">
                          {getStatusBadge(item.status)}
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
                          <span className="text-studio-red font-semibold shrink-0">
                            ฿{item.price.toLocaleString()}
                          </span>
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
                  <div className="flex items-center gap-2">
                    {getStatusBadge(selectedArtwork.status)}
                    <span className="text-[10px] bg-studio-red/10 border border-studio-red/30 text-studio-red px-2 py-0.5 rounded font-bold">
                      {selectedArtwork.style}
                    </span>
                  </div>
                </div>

                <div className="relative aspect-[4/3] rounded-[6px] border border-studio-border overflow-hidden bg-studio-main group">
                  <img
                    src={activeImage}
                    alt={selectedArtwork.title}
                    className={`w-full h-full object-cover select-none transition-opacity duration-200 ${hasMultipleImages ? 'cursor-pointer' : ''}`}
                    onClick={() => {
                      if (hasMultipleImages) {
                        setActiveImageIndex((prev) => (prev + 1) % selectedImages.length);
                      }
                    }}
                  />

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
                <div className="grid grid-cols-2 gap-3 border-t border-b border-studio-border/60 py-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-[10px] text-studio-muted flex items-center gap-1">
                      <User size={12} /> ช่างสักเจ้าของลาย
                    </span>
                    <span className="font-semibold text-studio-primary block">
                      {selectedArtwork.artist?.name || 'ช่างประจำร้าน'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-studio-muted flex items-center gap-1">
                      <Clock size={12} /> เวลาสักโดยประมาณ
                    </span>
                    <span className="font-semibold text-studio-primary block">
                      {selectedArtwork.estimated_duration_minutes
                        ? `${selectedArtwork.estimated_duration_minutes} นาที`
                        : 'ไม่ระบุ'}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-studio-muted flex items-center gap-1">
                      <DollarSign size={12} /> ราคาค่าบริการ (Fixed)
                    </span>
                    <span className="font-bold text-studio-red block">
                      ฿{selectedArtwork.price.toLocaleString()}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-studio-muted">เงินมัดจำสำหรับจอง</span>
                    <span className="font-semibold text-studio-primary block">
                      ฿{selectedArtwork.deposit_amount.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Size Label */}
                {selectedArtwork.size_label && (
                  <div className="text-xs text-studio-secondary flex items-center justify-between px-1 bg-studio-main/50 p-2.5 rounded-[4px] border border-studio-border/40">
                    <span className="text-studio-muted">ขนาดแนะนำสำหรับลายนี้:</span>
                    <span className="font-semibold text-studio-primary">{selectedArtwork.size_label}</span>
                  </div>
                )}

                {/* Progressive Action CTAs */}
                <div className="space-y-3 pt-2">
                  {selectedArtwork.status === 'AVAILABLE' ? (
                    <button
                      onClick={() => setIsModalOpen(true)}
                      className="w-full bg-studio-red text-studio-primary hover:bg-studio-red/80 py-3.5 px-4 rounded-[4px] text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-studio-red/10"
                    >
                      ส่งคำขอจองลายนี้ (มัดจำ ฿{selectedArtwork.deposit_amount.toLocaleString()})
                    </button>
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
                src={activeImage}
                alt={selectedArtwork.title}
                className={`w-full h-full object-cover select-none ${hasMultipleImages ? 'cursor-pointer' : ''}`}
                onClick={() => {
                  if (hasMultipleImages) {
                    setActiveImageIndex((prev) => (prev + 1) % selectedImages.length);
                  }
                }}
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
            <div>
              <div className="flex justify-between items-center">
                <h3 className="text-base font-bold text-studio-primary">{selectedArtwork.title}</h3>
                {getStatusBadge(selectedArtwork.status)}
              </div>
              <p className="text-xs text-studio-secondary mt-0.5">ช่าง: {selectedArtwork.artist?.name || 'ช่างประจำร้าน'}</p>
            </div>
            <div className="flex justify-between items-center text-xs bg-studio-main p-2.5 rounded border border-studio-border/50">
              <span className="text-studio-muted">ราคาค่าสัก: <strong className="text-studio-red">฿{selectedArtwork.price.toLocaleString()}</strong></span>
              <span className="text-studio-muted">มัดจำ: <strong className="text-studio-primary">฿{selectedArtwork.deposit_amount.toLocaleString()}</strong></span>
            </div>
            {selectedArtwork.status === 'AVAILABLE' ? (
              <button
                onClick={() => {
                  setShowMobileDetail(false);
                  setIsModalOpen(true);
                }}
                className="w-full bg-studio-red text-studio-primary py-3 rounded text-xs font-bold uppercase tracking-wider"
              >
                ส่งคำขอจองลายนี้
              </button>
            ) : (
              <button disabled className="w-full bg-studio-main border border-studio-border text-studio-muted py-3 rounded text-xs font-bold cursor-not-allowed">
                ไม่สามารถจองได้ในขณะนี้
              </button>
            )}
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
