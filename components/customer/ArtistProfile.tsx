'use client';

import React, { useState, useEffect } from 'react';
import { Artist } from '@/data/mockArtists';
import { useApp } from '@/components/AppContext';
import Link from 'next/link';
import { Calendar, User, Clock, ArrowLeft, ArrowUpRight, Maximize2, AlertCircle } from 'lucide-react';

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
  onSelectEstimate: (artist: Artist) => void;
  onSelectBooking: (artist: Artist) => void;
  onItemSelect?: (item: ArtistArtwork) => void;
}

export default function ArtistProfile({
  artist,
  onBack,
  onSelectEstimate,
  onSelectBooking,
  onItemSelect,
}: ArtistProfileProps) {
  const { supabase } = useApp();
  const [artistPortfolio, setArtistPortfolio] = useState<ArtistArtwork[]>([]);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);

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
    return () => { isMounted = false; };
  }, [supabase, artist.id]);

  return (
    <div className="animate-fadeIn space-y-8 font-prompt">
      {/* Top Back Navigation Bar */}
      <button
        onClick={onBack}
        className="flex items-center space-x-2 text-xs text-studio-secondary hover:text-studio-red transition-colors uppercase tracking-wider font-semibold"
      >
        <ArrowLeft size={16} />
        <span>ย้อนกลับไปรายชื่อช่างสักทั้งหมด</span>
      </button>

      {/* DESKTOP SPLIT CONTAINER: LEFT 32% / RIGHT 68% */}
      <div className="flex flex-col lg:flex-row gap-8 xl:gap-12 items-start">
        {/* ========================================================================= */}
        {/* LEFT: 32% Sticky Artist Profile Card */}
        {/* ========================================================================= */}
        <div className="w-full lg:w-[32%] sticky top-[88px] bg-studio-card border border-studio-border p-6 rounded-[8px] space-y-6 shadow-xl">
          <div className="aspect-[3/4] w-full rounded-[6px] overflow-hidden border border-studio-border bg-studio-main">
            <img
              src={artist.avatar_url || artist.avatar}
              alt={artist.name}
              className="w-full h-full object-cover"
            />
          </div>

          <div>
            <span className="text-[10px] uppercase tracking-widest text-studio-red font-bold">
              {artist.specialties && artist.specialties.length > 0 ? artist.specialties.join(' / ') : artist.specialty}
            </span>
            <h2 className="text-2xl md:text-3xl font-heading font-normal tracking-wide text-studio-primary mt-1">
              {artist.name}
            </h2>
            {artist.nickname && (
              <p className="text-xs text-studio-secondary mt-0.5">ชื่อเล่น: {artist.nickname}</p>
            )}
          </div>

          <p className="text-xs text-studio-secondary leading-relaxed font-light">
            {artist.bio || 'ช่างสักมืออาชีพประจำสตูดิโอ 157 TATTOO'}
          </p>

          <div className="space-y-2 pt-2 border-t border-studio-border text-xs text-studio-secondary">
            <div className="flex items-center space-x-2">
              <Calendar size={15} className="text-studio-red shrink-0" />
              <span>
                วันปฏิบัติงาน: <strong className="text-studio-primary">{artist.working_days ? artist.working_days.join(', ') : (artist.availability ? artist.availability.join(', ') : 'ทุกวัน')}</strong>
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <Clock size={15} className="text-studio-red shrink-0" />
              <span>
                สถานะ: <strong className={
                  (artist.status === 'Available' || artist.status === 'AVAILABLE') ? 'text-green-400' :
                  (artist.status === 'Tattooing' || artist.status === 'TATTOOING') ? 'text-studio-red' : 'text-studio-muted'
                }>{(artist.status === 'Available' || artist.status === 'AVAILABLE') ? 'ว่างรับนัดหมาย' : 'กำลังปฏิบัติงาน'}</strong>
              </span>
            </div>
          </div>

          {/* Action CTA Stack */}
          <div className="space-y-2.5 pt-2">
            <Link
              href={`/booking?artist=${artist.id}`}
              className="w-full min-h-[46px] bg-studio-red text-studio-paper hover:bg-tattoo-red-dark py-3.5 px-4 rounded-[4px] text-xs font-semibold uppercase tracking-wider transition-all border border-studio-red flex items-center justify-center text-center"
            >
              จองคิวกับช่างคนนี้
            </Link>
            <button
              onClick={() => onSelectEstimate(artist)}
              className="w-full min-h-[44px] bg-transparent border border-studio-border hover:bg-studio-main text-studio-primary text-xs uppercase tracking-wider py-2.5 px-4 font-medium transition-all rounded-[4px]"
            >
              ขอประเมินราคางานออกแบบ
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT: 68% Artist Portfolio Masonry Grid */}
        {/* ========================================================================= */}
        <div className="w-full lg:w-[68%] space-y-6">
          <div className="border-b border-studio-border pb-4 flex justify-between items-end">
            <div>
              <span className="text-[10px] uppercase tracking-widest text-studio-secondary font-bold">Artist Gallery</span>
              <h3 className="text-xl md:text-3xl font-heading font-normal tracking-wide text-studio-primary mt-0.5">
                ผลงานสักของ {artist.name}
              </h3>
            </div>
            <span className="text-xs text-studio-secondary">{artistPortfolio.length} ผลงาน</span>
          </div>

          {/* Loading Skeleton */}
          {loadingPortfolio && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-5">
              {[1, 2, 3, 4, 5, 6].map((idx) => (
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

          {/* Error State */}
          {!loadingPortfolio && portfolioError && (
            <div className="bg-studio-card border border-studio-red/40 p-8 rounded-[8px] text-center space-y-2">
              <AlertCircle size={24} className="text-studio-red mx-auto" />
              <p className="text-xs text-studio-secondary">{portfolioError}</p>
            </div>
          )}

          {/* Gallery Grid */}
          {!loadingPortfolio && !portfolioError && artistPortfolio.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-5">
              {artistPortfolio.map((item) => (
                <Link
                  key={item.id}
                  href={`/portfolio?select=${item.id}`}
                  className="bg-studio-card border border-studio-border hover:border-studio-red/60 rounded-[6px] overflow-hidden group cursor-pointer transition-all duration-300 shadow-sm block"
                >
                  <div className="aspect-[4/5] bg-studio-main overflow-hidden relative">
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute top-2.5 left-2.5 bg-studio-sec/90 border border-studio-border text-studio-red text-[9px] font-bold px-2 py-0.5 rounded">
                      {item.style}
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-studio-main/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                      <span className="text-[11px] text-studio-paper font-bold flex items-center gap-1">
                        ดูรายละเอียด <ArrowUpRight size={13} />
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-studio-card space-y-1">
                    <h4 className="text-xs font-heading tracking-wide text-studio-primary truncate">{item.title}</h4>
                    {item.size_label && (
                      <span className="text-[10px] text-studio-muted block truncate">{item.size_label}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!loadingPortfolio && !portfolioError && artistPortfolio.length === 0 && (
            <div className="py-12 px-6 text-center space-y-2 bg-studio-card border border-studio-border rounded-[8px]">
              <p className="text-xs font-semibold text-studio-primary">ช่างคนนี้ยังไม่มีผลงานที่เผยแพร่</p>
              <p className="text-[11px] text-studio-secondary">ผลงานสักคัสตอมใหม่จะถูกเพิ่มในระบบเร็วๆ นี้</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

