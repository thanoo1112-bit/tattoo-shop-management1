'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Artist } from '@/data/mockArtists';
import { formatTattooSize } from '@/lib/utils/formatters';
import { useApp } from '@/components/AppContext';
import { FlashDesignData } from '@/components/flash/FlashReservationModal';
import Link from 'next/link';
import { Calendar, Clock, ArrowLeft, AlertCircle } from 'lucide-react';
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
  if (!name) return 'ช่างประจำร้าน';
  const trimmed = name.trim();
  if (trimmed.startsWith('ช่าง')) {
    return trimmed;
  }
  return `ช่าง${trimmed}`;
}

export default function ArtistProfile({
  artist,
  onBack,
}: ArtistProfileProps) {
  const { supabase } = useApp();
  const [artistPortfolio, setArtistPortfolio] = useState<ArtistArtwork[]>([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string>('ALL');

  // Flash Designs State
  const [artistFlashDesigns, setArtistFlashDesigns] = useState<FlashDesignData[]>([]);
  const [loadingFlash, setLoadingFlash] = useState(true);
  const [flashError, setFlashError] = useState<string | null>(null);
  const [selectedFlashStyle, setSelectedFlashStyle] = useState<string>('ALL');

  // Tab State
  const [activeTab, setActiveTab] = useState<'portfolio' | 'flash'>('portfolio');

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

  const getFlashStatusBadge = (status: FlashDesignData['status']) => {
    switch (status) {
      case 'AVAILABLE':
        return (
          <span className="text-[10px] bg-emerald-950/70 border border-emerald-600/50 text-emerald-400 px-2 py-0.5 rounded font-bold">
            ● พร้อมจอง
          </span>
        );
      case 'HELD':
        return (
          <span className="text-[10px] bg-amber-950/70 border border-amber-600/50 text-amber-300 px-2 py-0.5 rounded font-bold">
            ● กำลังรอยืนยัน
          </span>
        );
      case 'RESERVED':
      case 'SOLD':
        return (
          <span className="text-[10px] bg-indigo-950/70 border border-indigo-600/50 text-indigo-300 px-2 py-0.5 rounded font-bold">
            ● จองแล้ว
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
        <p className="text-xs text-studio-secondary leading-relaxed">
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
    <div className="animate-fadeIn space-y-6 font-prompt">
      {/* Top Back Navigation Bar */}
      <button
        onClick={onBack}
        className="flex items-center space-x-2 text-xs text-studio-secondary hover:text-studio-red transition-colors uppercase tracking-wider font-semibold"
      >
        <ArrowLeft size={16} />
        <span>ย้อนกลับไปรายชื่อช่างสักทั้งหมด</span>
      </button>

      {/* ========================================================================= */}
      {/* 1. COMPACT HORIZONTAL ARTIST PROFILE HEADER CARD */}
      {/* ========================================================================= */}
      <div className="w-full bg-studio-card border border-studio-border p-5 md:p-6 rounded-[8px] shadow-xl">
        <div className="flex flex-col lg:flex-row items-center gap-5 lg:gap-6">
          
          {/* 1. LEFT PHOTO (~25% Desktop, Horizontal Aspect 4/3) */}
          <div className="w-full lg:w-[25%] shrink-0">
            <div className="aspect-[4/3] w-full max-h-[200px] lg:max-h-[220px] rounded-[6px] overflow-hidden border border-studio-border bg-studio-main">
              <img
                src={artist.avatar_url || artist.avatar}
                alt={artist.name}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* 2. MIDDLE INFO (~50% Desktop, Natural Top-to-Bottom Flow) */}
          <div className="w-full lg:w-[50%] flex-1 space-y-2.5">
            {/* Row 1: Style Tags + Status */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-studio-red bg-studio-sec px-2.5 py-1 border border-studio-border rounded-[4px] font-bold">
                {artist.specialties && artist.specialties.length > 0 ? artist.specialties.join(' / ') : (artist.specialty || 'CUSTOM TATTOO')}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded border font-semibold ${
                (artist.status === 'Available' || artist.status === 'AVAILABLE')
                  ? 'bg-green-950/40 border-green-800/60 text-green-400'
                  : 'bg-studio-sec border-studio-border text-studio-muted'
              }`}>
                {(artist.status === 'Available' || artist.status === 'AVAILABLE') ? '● พร้อมรับนัดหมาย' : '● กำลังปฏิบัติงาน'}
              </span>
            </div>

            {/* Row 2: Name */}
            <div>
              <h1 className="text-xl md:text-2xl lg:text-3xl font-heading font-normal tracking-wide text-studio-primary">
                {artist.name}
              </h1>
              {artist.nickname && (
                <p className="text-xs text-studio-secondary mt-0.5">ชื่อเล่น: <span className="text-studio-primary font-medium">{artist.nickname}</span></p>
              )}
            </div>

            {/* Row 3: Bio */}
            <p className="text-xs text-studio-secondary leading-relaxed font-light line-clamp-3">
              {artist.bio || 'ช่างสักมืออาชีพประจำสตูดิโอ 157 TATTOO พร้อมออกแบบและรังสรรค์ผลงานสักตรงตามโจทย์เฉพาะบุคคล'}
            </p>

            {/* Row 4: Working Days & Hours (Directly below Bio) */}
            <div className="flex flex-wrap items-center gap-y-1 gap-x-4 border-t border-studio-border/50 pt-2 text-xs text-studio-secondary">
              <div className="flex items-center space-x-1.5">
                <Calendar size={14} className="text-studio-red shrink-0" />
                <span>
                  วันปฏิบัติงาน: <strong className="text-studio-primary">{artist.working_days ? artist.working_days.join(', ') : (artist.availability ? artist.availability.join(', ') : 'ทุกวัน')}</strong>
                </span>
              </div>
              <div className="flex items-center space-x-1.5">
                <Clock size={14} className="text-studio-red shrink-0" />
                <span>
                  เวลา: <strong className="text-studio-primary">11:00 - 20:00 น.</strong>
                </span>
              </div>
            </div>
          </div>

          {/* 3. RIGHT ACTION PANEL (~25% Desktop, Vertically Centered) */}
          <div className="w-full lg:w-[25%] shrink-0 flex flex-col justify-center items-center text-center space-y-2.5 pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-studio-border lg:pl-6 my-auto">
            <div className="space-y-0.5">
              <h3 className="text-xs md:text-sm font-bold text-studio-primary tracking-wide">
                พร้อมจองคิวหรือยัง?
              </h3>
              <p className="text-[11px] text-studio-secondary leading-tight">
                เลือกวันและเวลาที่สะดวกเพื่อเริ่มจองคิว
              </p>
            </div>

            <Link
              href={`/booking?artist=${artist.id}`}
              className="w-full min-h-[44px] bg-studio-red text-studio-paper hover:bg-[#802222] py-3 px-4 rounded-[4px] text-xs font-bold uppercase tracking-wider transition-all border border-studio-red flex items-center justify-center text-center shadow-md active:scale-[0.99]"
            >
              จองคิวกับ{artistTitleName}
            </Link>

            {(artistPortfolio.length > 0 || artistFlashDesigns.length > 0) && (
              <div className="flex items-center justify-center gap-2 pt-0.5 text-[10px] text-studio-muted">
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
          </div>

        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. FULL-WIDTH ARTIST GALLERY SECTION WITH 2 TABS */}
      {/* ========================================================================= */}
      <div className="space-y-4 pt-2">
        {/* Gallery Header & Tabs */}
        <div className="border-b border-studio-border pb-3 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2">
            <span className="text-[10px] uppercase tracking-widest text-studio-red font-bold">ARTIST GALLERY</span>
            {/* 2 TABS */}
            <div className="flex items-center gap-6">
              <button
                onClick={() => setActiveTab('portfolio')}
                className={`text-lg md:text-xl font-heading tracking-wide transition-all pb-1 border-b-2 ${
                  activeTab === 'portfolio'
                    ? 'text-studio-primary border-studio-red font-bold'
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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4 lg:gap-5">
                {[1, 2, 3, 4, 5].map((idx) => (
                  <div key={idx} className="aspect-square bg-studio-card border border-studio-border rounded-[6px] overflow-hidden animate-pulse">
                    <div className="w-full h-full bg-studio-sec/60" />
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

            {/* 5-Column Grid on Desktop matching /portfolio card style */}
            {!loadingPortfolio && !portfolioError && filteredPortfolio.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4 lg:gap-5 justify-start">
                {filteredPortfolio.map((item) => (
                  <Link
                    key={item.id}
                    href={`/portfolio?select=${item.id}`}
                    className="aspect-square bg-studio-main border border-studio-border hover:border-studio-red/60 hover:shadow-lg rounded-[6px] overflow-hidden group cursor-pointer transition-all duration-200 relative block"
                  >
                    <img
                      src={getThumbnailUrl(item.image_url)}
                      onError={(e) => handleThumbnailError(e, item.image_url)}
                      alt={item.title}
                      className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                      decoding="async"
                    />

                    {/* Permanent Dark Gradient Overlay on Image Bottom */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end p-3 sm:p-4 space-y-0.5 pointer-events-none">
                      {/* Style name in Red */}
                      <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-studio-red truncate">
                        {item.style}
                      </span>

                      {/* Artwork Title in White */}
                      <h3 className="text-xs sm:text-sm font-heading font-bold tracking-wide text-studio-primary truncate">
                        {item.title}
                      </h3>

                      {item.size_label && (
                        <span className="text-[10px] sm:text-xs text-studio-secondary truncate">
                          ขนาด: {formatTattooSize(null, null, item.size_label) !== 'ไม่ระบุ' ? formatTattooSize(null, null, item.size_label) : item.size_label}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Empty State */}
            {!loadingPortfolio && !portfolioError && filteredPortfolio.length === 0 && (
              <div className="py-12 px-6 text-center space-y-2 bg-studio-card border border-studio-border rounded-[8px]">
                <p className="text-xs font-semibold text-studio-primary">
                  {selectedStyle !== 'ALL' ? `ไม่พบผลงานสไตล์ "${selectedStyle}" ของช่างคนนี้` : 'ช่างคนนี้ยังไม่มีผลงานที่เผยแพร่'}
                </p>
                <p className="text-[11px] text-studio-secondary">ผลงานสักคัสตอมใหม่จะถูกเพิ่มในระบบเร็วๆ นี้</p>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4 lg:gap-5">
                {[1, 2, 3, 4, 5].map((idx) => (
                  <div key={idx} className="aspect-[4/5] bg-studio-card border border-studio-border rounded-[6px] overflow-hidden animate-pulse">
                    <div className="w-full h-full bg-studio-sec/60" />
                  </div>
                ))}
              </div>
            )}

            {/* Error State */}
            {!loadingFlash && flashError && (
              <div className="bg-studio-card border border-studio-red/40 p-8 rounded-[8px] text-center space-y-2">
                <AlertCircle size={24} className="text-studio-red mx-auto" />
                <p className="text-xs text-studio-secondary">{flashError}</p>
              </div>
            )}

            {/* Grid View for Flash Designs */}
            {!loadingFlash && !flashError && filteredFlashDesigns.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5 sm:gap-4 lg:gap-5 justify-start">
                {filteredFlashDesigns.map((item) => (
                  <div
                    key={item.id}
                    className="bg-studio-card border border-studio-border hover:border-studio-red/60 hover:shadow-lg rounded-[6px] overflow-hidden group transition-all duration-200 flex flex-col justify-between"
                  >
                    <Link
                      href={`/flash?select=${item.id}`}
                      className="block aspect-[4/5] bg-studio-main overflow-hidden relative"
                    >
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
                      <div className="absolute top-2.5 right-2.5">
                        {getFlashStatusBadge(item.status)}
                      </div>
                    </Link>

                    <div className="p-3 bg-studio-card flex-1 flex flex-col justify-between space-y-2">
                      <div>
                        <span className="text-[9px] uppercase tracking-wider text-studio-red font-bold block mb-0.5">
                          {item.style}
                        </span>
                        <h4 className="text-xs font-bold text-studio-primary truncate group-hover:text-studio-red transition-colors">
                          <Link href={`/flash?select=${item.id}`}>
                            {item.title}
                          </Link>
                        </h4>
                      </div>

                      <div className="pt-2 border-t border-studio-border/50 flex justify-between items-center">
                        {item.status === 'AVAILABLE' ? (
                          <Link
                            href={`/booking?flash=${item.id}`}
                            className="bg-studio-red text-studio-paper hover:bg-tattoo-red-dark px-2.5 py-1 rounded text-[10px] font-semibold tracking-wider uppercase transition-colors"
                          >
                            จองลายนี้
                          </Link>
                        ) : (
                          <span className="text-[10px] text-studio-muted font-medium">
                            {item.status === 'HELD' ? 'กำลังรอยืนยัน' : 'จองแล้ว'}
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
                <p className="text-[11px] text-studio-secondary">
                  ติดตามลายสักพร้อมจองใหม่ๆ ได้เร็วๆ นี้
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

