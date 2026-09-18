'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Artist } from '@/data/mockArtists';
import { useApp } from '@/components/AppContext';
import Link from 'next/link';
import { Calendar, Clock, ArrowLeft, ArrowUpRight, AlertCircle } from 'lucide-react';

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

  useEffect(() => {
    let isMounted = true;
    async function loadArtistPortfolio() {
      setLoadingPortfolio(true);
      setPortfolioError(null);
      try {
        const { data, error } = await supabase
          .from('portfolio_artworks')
          .select('id, title, style, image_url, size_label, estimated_duration_minutes')
          .eq('artist_id', artist.id)
          .eq('is_visible', true)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (isMounted) {
          setArtistPortfolio(data || []);
        }
      } catch (err: any) {
        if (isMounted) setPortfolioError('ไม่สามารถโหลดผลงานได้');
      } finally {
        if (isMounted) setLoadingPortfolio(false);
      }
    }
    loadArtistPortfolio();
    return () => {
      isMounted = false;
    };
  }, [supabase, artist.id]);

  // Available unique styles for filter
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

  const artistTitleName = formatArtistTitle(artist.name);

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

            {(artistPortfolio.length > 0 || (artist.specialties && artist.specialties.length > 0)) && (
              <div className="flex items-center justify-center gap-2 pt-0.5 text-[10px] text-studio-muted">
                {artistPortfolio.length > 0 && (
                  <span>ผลงาน {artistPortfolio.length} ชิ้น</span>
                )}
                {artistPortfolio.length > 0 && artist.specialties && artist.specialties.length > 0 && (
                  <span>•</span>
                )}
                {artist.specialties && artist.specialties.length > 0 && (
                  <span>{artist.specialties.length} สไตล์</span>
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. FULL-WIDTH ARTIST GALLERY SECTION */}
      {/* ========================================================================= */}
      <div className="space-y-4 pt-2">
        {/* Gallery Header & Style Filter */}
        <div className="border-b border-studio-border pb-3 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-studio-red font-bold">ARTIST GALLERY</span>
            <h2 className="text-lg md:text-2xl font-heading font-normal tracking-wide text-studio-primary mt-0.5">
              ผลงานสักของ {artist.name}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-studio-muted">
              {filteredPortfolio.length} จาก {artistPortfolio.length} ผลงาน
            </span>

            {/* Filter Buttons */}
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
        </div>

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
                  src={item.image_url}
                  alt={item.title}
                  className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
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

                  {/* Size Label */}
                  {item.size_label && (
                    <span className="text-[10px] sm:text-xs text-studio-secondary truncate">
                      ขนาด: {item.size_label}
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
      </div>
    </div>
  );
}
