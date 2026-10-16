'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Artist } from '@/data/mockArtists';
import { useApp } from '@/components/AppContext';
import { FlashDesignData } from '@/components/flash/FlashReservationModal';
import Link from 'next/link';
import { ArrowLeft, AlertCircle, ArrowRight, X } from 'lucide-react';
import { getThumbnailUrl, handleThumbnailError } from '@/lib/utils/thumbnailHelper';

export interface ArtistArtwork {
  id: string;
  title: string;
  style: string;
  image_url: string;
  size_label: string | null;
  estimated_duration_minutes: number | null;
}

interface ArtistProfileProps {
  artist: Artist;
  onBack: () => void;
  onSelectEstimate?: (artist: Artist) => void;
  onSelectBooking?: (artist: Artist) => void;
  onItemSelect?: (item: ArtistArtwork) => void;
}

function formatArtistTitle(name?: string | null): string {
  const trimmed = name ? name.trim() : '';
  if (!trimmed) return 'ช่างประจำร้าน';
  if (trimmed.startsWith('ช่าง')) {
    return trimmed;
  }
  return `ช่าง${trimmed}`;
}

export default function ArtistProfile({
  artist,
  onBack,
  onItemSelect,
}: ArtistProfileProps) {
  const { supabase } = useApp();
  const [artistPortfolio, setArtistPortfolio] = useState<ArtistArtwork[]>([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string>('ALL');
  const [previewArtwork, setPreviewArtwork] = useState<ArtistArtwork | FlashDesignData | null>(null);

  // Flash Designs State
  const [artistFlashDesigns, setArtistFlashDesigns] = useState<FlashDesignData[]>([]);
  const [loadingFlash, setLoadingFlash] = useState(true);
  const [flashError, setFlashError] = useState<string | null>(null);
  const [selectedFlashStyle, setSelectedFlashStyle] = useState<string>('ALL');

  // Tab State
  const [activeTab, setActiveTab] = useState<'portfolio' | 'flash'>('portfolio');

  // Lock body scroll and listen for Escape key when previewArtwork is active
  useEffect(() => {
    if (!previewArtwork) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewArtwork(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [previewArtwork]);

  useEffect(() => {
    let isMounted = true;
    async function loadArtistData() {
      setLoadingPortfolio(true);
      setLoadingFlash(true);
      setPortfolioError(null);
      setFlashError(null);

      // 1. Fetch Portfolio Artworks
      try {
        const { data: portfolioData, error: portfolioErr } = await supabase
          .from('portfolio_artworks')
          .select('id, title, style, image_url, size_label, estimated_duration_minutes')
          .eq('artist_id', artist.id)
          .eq('is_visible', true)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false });

        if (portfolioErr) throw portfolioErr;
        if (isMounted) {
          setArtistPortfolio(portfolioData || []);
        }
      } catch (err: any) {
        if (isMounted) setPortfolioError('ไม่สามารถโหลดผลงานได้');
      } finally {
        if (isMounted) setLoadingPortfolio(false);
      }

      // 2. Fetch Flash Designs
      try {
        const { data: flashData, error: flashErr } = await supabase
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
            is_repeatable,
            is_visible,
            sort_order,
            created_at
          `)
          .eq('artist_id', artist.id)
          .eq('is_visible', true)
          .in('status', ['AVAILABLE', 'HELD', 'RESERVED', 'SOLD'])
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false });

        if (flashErr) throw flashErr;

        if (isMounted) {
          const formatted: FlashDesignData[] = (flashData || []).map((d: any) => ({
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
            is_repeatable: Boolean(d.is_repeatable),
            is_visible: d.is_visible,
            artist: {
              id: artist.id,
              name: artist.name,
              nickname: artist.nickname,
              is_active: artist.is_active,
              is_visible: artist.is_visible,
            },
          }));
          setArtistFlashDesigns(formatted);
        }
      } catch (err: any) {
        if (isMounted) setFlashError('ไม่สามารถโหลดลายออกแบบ Flash ได้');
      } finally {
        if (isMounted) setLoadingFlash(false);
      }
    }

    loadArtistData();
    return () => {
      isMounted = false;
    };
  }, [supabase, artist.id, artist.name, artist.nickname, artist.is_active, artist.is_visible]);

  // Available unique styles for Portfolio filter
  const availableStyles = useMemo(() => {
    const stylesSet = new Set<string>();
    artistPortfolio.forEach((item) => {
      if (item.style) stylesSet.add(item.style);
    });
    return Array.from(stylesSet);
  }, [artistPortfolio]);

  const filteredPortfolio = useMemo(() => {
    if (selectedStyle === 'ALL') return artistPortfolio;
    return artistPortfolio.filter((item) => item.style === selectedStyle);
  }, [artistPortfolio, selectedStyle]);

  // Available unique styles for Flash filter
  const availableFlashStyles = useMemo(() => {
    const stylesSet = new Set<string>();
    artistFlashDesigns.forEach((item) => {
      if (item.style) stylesSet.add(item.style);
    });
    return Array.from(stylesSet);
  }, [artistFlashDesigns]);

  const filteredFlashDesigns = useMemo(() => {
    if (selectedFlashStyle === 'ALL') return artistFlashDesigns;
    return artistFlashDesigns.filter((item) => item.style === selectedFlashStyle);
  }, [artistFlashDesigns, selectedFlashStyle]);

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

  const artistTitleName = formatArtistTitle(artist.name);

  if (artist.is_active === false || artist.is_visible === false) {
    return (
      <div className="py-16 px-6 text-center space-y-4 bg-studio-card border border-studio-border rounded-[8px] max-w-lg mx-auto shadow-lg font-prompt my-8">
        <AlertCircle size={32} className="text-amber-400 mx-auto" />
        <h3 className="text-lg font-heading text-studio-primary">
          ช่างคนนี้ถูกปิดใช้งาน
        </h3>
        <p className="text-xs text-[#E2DDD4] leading-relaxed">
          ช่างสักที่คุณกำลังค้นหาไม่เปิดให้จองคิวในขณะนี้ คุณสามารถเลือกชมทีมช่างสักท่านอื่นของสตูดิโอ 157 TATTOO ได้
        </p>
        <button
          onClick={onBack}
          className="inline-block bg-studio-red hover:bg-tattoo-red-dark text-studio-paper px-4 py-2 rounded text-xs font-semibold uppercase tracking-wider transition-colors"
        >
          ย้อนกลับไปรายชื่อช่างสักทั้งหมด
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fadeIn space-y-5 font-prompt">
      {/* Top Back Navigation Bar */}
      <button
        onClick={onBack}
        className="flex items-center space-x-2 text-xs text-[#E2DDD4] hover:text-studio-red-bright transition-colors uppercase tracking-wider font-semibold"
      >
        <ArrowLeft size={16} />
        <span>ย้อนกลับไปรายชื่อช่างสักทั้งหมด</span>
      </button>

      {/* ========================================================================= */}
      {/* 1. CINEMATIC HERO ARTIST PROFILE HEADER */}
      {/* ========================================================================= */}
      <div className="w-full bg-studio-card border border-studio-border rounded-[8px] overflow-hidden shadow-xl relative">
        <div className="flex flex-col lg:flex-row min-h-[290px] lg:h-[300px]">
          
          {/* 1. LEFT / CENTER HERO IMAGE (~50% Desktop) */}
          <div className="relative w-full lg:w-[50%] h-[240px] sm:h-[270px] lg:h-full shrink-0 overflow-hidden bg-studio-main">
            <img
              src={artist.avatar_url || artist.avatar}
              alt={artist.name}
              className="w-full h-full object-cover object-[center_20%]"
            />
            {/* Desktop Gradient Overlay: Softer gradient fade from transparent to dark studio-card */}
            <div className="hidden lg:block absolute inset-0 bg-gradient-to-r from-transparent via-studio-card/40 via-60% to-studio-card" />
            {/* Mobile/Tablet Gradient Overlay: Top transparent -> Bottom dark studio-card */}
            <div className="lg:hidden absolute inset-0 bg-gradient-to-t from-studio-card via-studio-card/40 to-transparent" />
          </div>

          {/* 2. CENTER INFO (~30% Desktop, Expanded presence) */}
          <div className="w-full lg:w-[30%] shrink-0 flex flex-col justify-center p-5 lg:py-5 lg:px-4 space-y-2.5 z-10 -mt-10 sm:-mt-12 lg:mt-0 lg:-ml-10">
            {/* Style Tag */}
            <div>
              <span className="text-[10px] uppercase tracking-widest text-studio-red-bright bg-studio-sec px-2.5 py-1 border border-studio-border rounded-[4px] font-bold inline-block shadow-sm">
                {artist.specialties && artist.specialties.length > 0 ? artist.specialties.join(' / ') : (artist.specialty || 'CUSTOM TATTOO')}
              </span>
            </div>

            {/* Name */}
            <div>
              <h1 className="text-xl md:text-2xl lg:text-3xl font-heading font-normal tracking-wide text-studio-primary">
                {artist.name}
              </h1>
              {artist.nickname && (
                <p className="text-xs text-[#E2DDD4] mt-0.5">
                  ชื่อเล่น: <span className="text-studio-primary font-medium">{artist.nickname}</span>
                </p>
              )}
            </div>

            {/* Bio */}
            <p className="text-xs text-[#E2DDD4] leading-relaxed font-light line-clamp-3">
              {artist.bio || 'ช่างสักมืออาชีพประจำสตูดิโอ 157 TATTOO พร้อมออกแบบและรังสรรค์ผลงานสักตรงตามโจทย์เฉพาะบุคคล'}
            </p>

            {/* Portfolio / Flash Count */}
            {(artistPortfolio.length > 0 || artistFlashDesigns.length > 0) && (
              <div className="flex items-center gap-2 text-[11px] text-[#F2EEE8] font-medium pt-0.5">
                {artistPortfolio.length > 0 && (
                  <span>ผลงาน {artistPortfolio.length} ชิ้น</span>
                )}
                {artistPortfolio.length > 0 && artistFlashDesigns.length > 0 && (
                  <span>•</span>
                )}
                {artistFlashDesigns.length > 0 && (
                  <span>Flash {artistFlashDesigns.length} ลาย</span>
                )}
              </div>
            )}

            {/* Mobile Booking Button (directly following counts with mt-4) */}
            <div className="lg:hidden mt-4">
              <Link
                href={`/booking?artist=${artist.id}`}
                className="w-full min-h-[52px] bg-studio-red text-studio-paper hover:bg-[#802222] py-3.5 px-4 rounded-[4px] text-xs font-bold uppercase tracking-wider transition-all border border-studio-red flex items-center justify-center text-center shadow-md active:scale-[0.99]"
              >
                จองคิวกับ{artistTitleName}
              </Link>
            </div>
          </div>

          {/* 3. RIGHT BOOKING CTA (Desktop Only, ~20% Desktop) */}
          <div className="hidden lg:flex w-[20%] shrink-0 flex-col justify-center items-center text-center p-4 sm:p-5 space-y-2.5 z-10 border-l border-studio-border bg-transparent ml-auto">
            <div className="space-y-1">
              <h3 className="text-xs md:text-sm font-bold text-studio-primary tracking-wide">
                สนใจจองคิวกับช่างคนนี้?
              </h3>
              <p className="text-[11px] text-[#E2DDD4] leading-tight max-w-[170px] mx-auto">
                ส่งรายละเอียดงานและเลือกวันที่ต้องการ
              </p>
            </div>

            <Link
              href={`/booking?artist=${artist.id}`}
              className="w-full min-h-[44px] bg-studio-red text-studio-paper hover:bg-[#802222] py-3 px-4 rounded-[4px] text-xs font-bold uppercase tracking-wider transition-all border border-studio-red flex items-center justify-center text-center shadow-md active:scale-[0.99]"
            >
              จองคิวกับ{artistTitleName}
            </Link>
          </div>

        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. FULL-WIDTH ARTIST GALLERY SECTION WITH 2 TABS */}
      {/* ========================================================================= */}
      <div className="space-y-4 pt-1">
        {/* Gallery Header & Tabs */}
        <div className="border-b border-studio-border pb-3 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2">
            <span className="text-[10px] uppercase tracking-widest text-studio-red-bright font-bold">ARTIST GALLERY</span>
            {/* 2 TABS */}
            <div className="flex items-center gap-6">
              <button
                onClick={() => setActiveTab('portfolio')}
                className={`text-lg md:text-xl font-heading tracking-wide transition-all pb-1 border-b-2 ${
                  activeTab === 'portfolio'
                    ? 'text-studio-primary border-studio-red-base font-bold'
                    : 'text-studio-muted border-transparent hover:text-studio-secondary'
                }`}
              >
                ผลงานสัก ({artistPortfolio.length})
              </button>
              <button
                onClick={() => setActiveTab('flash')}
                className={`text-lg md:text-xl font-heading tracking-wide transition-all pb-1 border-b-2 ${
                  activeTab === 'flash'
                    ? 'text-studio-primary border-studio-red font-bold'
                    : 'text-studio-muted border-transparent hover:text-studio-secondary'
                }`}
              >
                ลายออกแบบ ({artistFlashDesigns.length})
              </button>
            </div>
          </div>

          {/* Style Filter per Active Tab */}
          {activeTab === 'portfolio' ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-studio-muted">
                {filteredPortfolio.length} จาก {artistPortfolio.length} ผลงาน
              </span>

              {availableStyles.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  <button
                    onClick={() => setSelectedStyle('ALL')}
                    className={`text-[11px] px-3 py-1 rounded-[4px] transition-all font-medium whitespace-nowrap ${
                      selectedStyle === 'ALL'
                        ? 'bg-studio-red text-studio-paper font-bold'
                        : 'bg-studio-card border border-studio-border text-studio-secondary hover:text-studio-primary'
                    }`}
                  >
                    ทั้งหมด
                  </button>
                  {availableStyles.map((style) => (
                    <button
                      key={style}
                      onClick={() => setSelectedStyle(style)}
                      className={`text-[11px] px-3 py-1 rounded-[4px] transition-all font-medium whitespace-nowrap ${
                        selectedStyle === style
                          ? 'bg-studio-red text-studio-paper font-bold'
                          : 'bg-studio-card border border-studio-border text-studio-secondary hover:text-studio-primary'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-xs text-studio-muted">
                {filteredFlashDesigns.length} จาก {artistFlashDesigns.length} ลาย
              </span>

              {availableFlashStyles.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  <button
                    onClick={() => setSelectedFlashStyle('ALL')}
                    className={`text-[11px] px-3 py-1 rounded-[4px] transition-all font-medium whitespace-nowrap ${
                      selectedFlashStyle === 'ALL'
                        ? 'bg-studio-red text-studio-paper font-bold'
                        : 'bg-studio-card border border-studio-border text-studio-secondary hover:text-studio-primary'
                    }`}
                  >
                    ทั้งหมด
                  </button>
                  {availableFlashStyles.map((style) => (
                    <button
                      key={style}
                      onClick={() => setSelectedFlashStyle(style)}
                      className={`text-[11px] px-3 py-1 rounded-[4px] transition-all font-medium whitespace-nowrap ${
                        selectedFlashStyle === style
                          ? 'bg-studio-red text-studio-paper font-bold'
                          : 'bg-studio-card border border-studio-border text-studio-secondary hover:text-studio-primary'
                      }`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: PORTFOLIO ARTWORKS */}
        {/* ========================================================================= */}
        {activeTab === 'portfolio' && (
          <>
            {/* Loading State */}
            {loadingPortfolio && (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-5">
                {[1, 2, 3, 4, 5, 6].map((idx) => (
                  <div key={idx} className="bg-studio-card border border-studio-border rounded-[6px] overflow-hidden animate-pulse">
                    <div className="aspect-[4/5] bg-studio-sec/60" />
                    <div className="p-2.5 sm:p-3 space-y-2">
                      <div className="h-3 bg-studio-sec/80 rounded w-3/4" />
                      <div className="h-2 bg-studio-sec/50 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Error State */}
            {!loadingPortfolio && portfolioError && (
              <div className="bg-studio-card border border-studio-red/40 p-8 rounded-[8px] text-center space-y-2">
                <AlertCircle size={24} className="text-studio-red mx-auto" />
                <p className="text-xs text-studio-secondary">{portfolioError}</p>
              </div>
            )}

            {/* 2-Column Grid on Mobile, 5-Column Grid on Desktop matching /portfolio card style */}
            {!loadingPortfolio && !portfolioError && filteredPortfolio.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-5 justify-start">
                {filteredPortfolio.map((item) => (
                  <div
                    key={item.id}
                    className="bg-studio-card border border-studio-border hover:border-studio-red/60 rounded-[6px] overflow-hidden group transition-all duration-300 relative flex flex-col justify-between"
                  >
                    <div
                      onClick={() => setPreviewArtwork(item)}
                      className="cursor-pointer flex-1 min-w-0"
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
                      <div className="p-2.5 sm:p-3 bg-studio-card space-y-0.5 min-w-0">
                        <span className="text-[9px] uppercase tracking-wider text-studio-red-bright font-bold block truncate">
                          {item.style}
                        </span>
                        <h4 className="text-xs font-bold text-studio-primary truncate group-hover:text-studio-red-bright transition-colors">
                          {item.title}
                        </h4>
                        <p className="text-[10px] text-[#E2DDD4] truncate">
                          ช่าง: {artist.name}
                        </p>
                      </div>
                    </div>

                    {/* Bottom Action Row (CTA Only, Aligned Right) */}
                    <div className="p-2.5 pt-0 sm:p-3 sm:pt-0 bg-studio-card">
                      <div className="pt-2 sm:pt-2.5 border-t border-studio-border/50 flex items-center justify-end min-w-0">
                        <Link
                          href={`/booking?artist=${artist.id}&artwork=${item.id}`}
                          className="inline-flex items-center space-x-1 text-studio-red-bright hover:text-tattoo-red-dark font-semibold transition-all group/btn text-[10px] sm:text-xs"
                        >
                          <span className="truncate">จองคิวกับช่างคนนี้</span>
                          <ArrowRight size={12} className="transform group-hover/btn:translate-x-0.5 transition-transform shrink-0" />
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty State */}
            {!loadingPortfolio && !portfolioError && filteredPortfolio.length === 0 && (
              <div className="py-12 px-6 text-center space-y-2 bg-studio-card border border-studio-border rounded-[8px]">
                <p className="text-xs font-semibold text-studio-primary">
                  {selectedStyle !== 'ALL' ? `ไม่พบผลงานสไตล์ "${selectedStyle}" ของช่างคนนี้` : 'ช่างคนนี้ยังไม่มีผลงานที่เผยแพร่'}
                </p>
                <p className="text-[11px] text-[#E2DDD4]">ผลงานสักคัสตอมใหม่จะถูกเพิ่มในระบบเร็วๆ นี้</p>
              </div>
            )}
          </>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: FLASH DESIGNS */}
        {/* ========================================================================= */}
        {activeTab === 'flash' && (
          <>
            {/* Loading State */}
            {loadingFlash && (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-5">
                {[1, 2, 3, 4, 5, 6].map((idx) => (
                  <div key={idx} className="bg-studio-card border border-studio-border rounded-[6px] overflow-hidden animate-pulse">
                    <div className="aspect-[4/5] bg-studio-sec/60" />
                    <div className="p-2.5 sm:p-3 space-y-2">
                      <div className="h-3 bg-studio-sec/80 rounded w-3/4" />
                      <div className="h-2 bg-studio-sec/50 rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Error State */}
            {!loadingFlash && flashError && (
              <div className="bg-studio-card border border-studio-red/40 p-8 rounded-[8px] text-center space-y-2">
                <AlertCircle size={24} className="text-studio-red mx-auto" />
                <p className="text-xs text-[#E2DDD4]">{flashError}</p>
              </div>
            )}

            {/* Grid View for Flash Designs */}
            {!loadingFlash && !flashError && filteredFlashDesigns.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-5 justify-start">
                {filteredFlashDesigns.map((item) => (
                  <div
                    key={item.id}
                    className="bg-studio-card border border-studio-border hover:border-studio-red/60 rounded-[6px] overflow-hidden group transition-all duration-300 relative flex flex-col justify-between"
                  >
                    <div
                      onClick={() => setPreviewArtwork(item)}
                      className="cursor-pointer flex-1 min-w-0"
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
                        <div className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 flex flex-col items-end gap-1.5 pointer-events-none">
                          {getStatusBadge(item.status)}
                        </div>
                      </div>

                      {/* Info & Bottom Action Row */}
                      <div className="p-2.5 sm:p-3 bg-studio-card flex flex-col justify-between flex-1 min-w-0 space-y-2">
                        <div className="space-y-0.5 min-w-0">
                          <span className="text-[9px] uppercase tracking-wider text-studio-red-bright font-bold block truncate">
                            {item.style || 'FLASH'}
                          </span>
                          <h4 className="text-xs font-bold text-studio-primary truncate group-hover:text-studio-red-bright transition-colors">
                            {item.title}
                          </h4>
                          <p className="text-[10px] text-[#E2DDD4] truncate">
                            ช่าง: {artist.name || item.artist?.name || 'ช่างประจำร้าน'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Row (CTA Only, Aligned Right) */}
                    <div className="p-2.5 pt-0 sm:p-3 sm:pt-0 bg-studio-card">
                      <div className="pt-2 sm:pt-2.5 mt-auto border-t border-studio-border/50 flex items-center justify-end min-w-0">
                        {item.status === 'AVAILABLE' ? (
                          <Link
                            href={`/booking?flash=${item.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center space-x-1 text-studio-red-bright hover:text-tattoo-red-dark font-semibold transition-all group/btn text-[10px] sm:text-xs"
                          >
                            <span className="truncate">จองลายนี้</span>
                            <ArrowRight size={12} className="transform group-hover/btn:translate-x-0.5 transition-transform shrink-0" />
                          </Link>
                        ) : (
                          <span className="text-[10px] text-[#F2EEE8] font-medium">
                            {item.status === 'HELD' ? 'รอการยืนยัน' : item.status === 'RESERVED' ? 'จองแล้ว' : 'ปิดจอง'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty State */}
            {!loadingFlash && !flashError && filteredFlashDesigns.length === 0 && (
              <div className="py-12 px-6 text-center space-y-2 bg-studio-card border border-studio-border rounded-[8px]">
                <p className="text-xs font-semibold text-studio-primary">
                  {selectedFlashStyle !== 'ALL'
                    ? `ไม่พบลายออกแบบ Flash สไตล์ "${selectedFlashStyle}" ของช่างคนนี้`
                    : 'ช่างคนนี้ยังไม่มีลายออกแบบ Flash ที่เผยแพร่'}
                </p>
                <p className="text-[11px] text-[#E2DDD4]">
                  ติดตามลายสักพร้อมจองใหม่ๆ ได้เร็วๆ นี้
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Lightbox / Fullscreen Image Preview Modal (Clean Image Only via React Portal) */}
      {previewArtwork &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fadeIn"
            onClick={() => setPreviewArtwork(null)}
          >
            {/* Close Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPreviewArtwork(null);
              }}
              className="fixed top-4 right-4 z-[100000] w-11 h-11 flex items-center justify-center text-white bg-black/70 hover:bg-black/95 rounded-full transition-all border border-white/30 shadow-2xl active:scale-95 cursor-pointer"
              aria-label="Close Preview"
            >
              <X size={24} />
            </button>

            {/* Centered Image (Only Image, No Metadata/Caption) */}
            <img
              src={previewArtwork.image_url}
              alt={previewArtwork.title}
              onClick={(e) => e.stopPropagation()}
              className="max-w-[92vw] max-h-[82vh] lg:max-w-[72vw] lg:max-h-[72vh] w-auto h-auto object-contain rounded-[4px] shadow-2xl select-none"
            />
          </div>,
          document.body
        )}
    </div>
  );
}

