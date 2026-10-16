'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import CustomerHeader from '@/components/customer/CustomerHeader';
import MobileBottomNav from '@/components/customer/MobileBottomNav';
import HeroSection from '@/components/customer/HeroSection';
import StudioAtmosphereSection from '@/components/customer/StudioAtmosphereSection';
import { Artist } from '@/data/mockArtists';
import { useApp } from '@/components/AppContext';
import { getThumbnailUrl, handleThumbnailError } from '@/lib/utils/thumbnailHelper';
import Link from 'next/link';
import { Sparkles, Compass, Award, MapPin, Clock, Phone, ShieldCheck, ArrowRight, ArrowUpRight, Users, UserRound, Droplet, Skull, Eye, X } from 'lucide-react';

const TattooMachineIcon = ({ size = 18, className = '' }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M8 3h8a2 2 0 0 1 2 2v3H6V5a2 2 0 0 1 2-2z" />
    <circle cx="9.5" cy="6" r="0.75" fill="currentColor" />
    <circle cx="14.5" cy="6" r="0.75" fill="currentColor" />
    <path d="M7 8v4a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8" />
    <rect x="10" y="13" width="4" height="5" rx="1" />
    <line x1="12" y1="18" x2="12" y2="22" />
  </svg>
);

export default function HomePage() {
  const router = useRouter();
  const { supabase, user, profile, authLoading } = useApp();
  const [featuredArtists, setFeaturedArtists] = useState<Artist[]>([]);
  const [artistsLoading, setArtistsLoading] = useState(true);
  const [liveFlash, setLiveFlash] = useState<any[]>([]);
  const [livePortfolio, setLivePortfolio] = useState<any[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);
  const [selectedWorksTab, setSelectedWorksTab] = useState<'flash' | 'portfolio'>('portfolio');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    if (previewImage) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setPreviewImage(null);
        }
      };
      window.addEventListener('keydown', handleKeyDown);

      return () => {
        document.body.style.overflow = originalOverflow;
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [previewImage]);

  useEffect(() => {
    if (!authLoading && user && profile) {
      if (profile.role === 'admin') {
        router.replace('/admin/dashboard');
        return;
      } else if (profile.role === 'artist') {
        router.replace('/artist/dashboard');
        return;
      }
    }
  }, [user, profile, authLoading, router]);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        // 1. Featured Artists
        const { data, error } = await supabase
          .from('artists')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true })
          .limit(2);

        if (!error && data && isMounted) {
          setFeaturedArtists(data.map((item: any) => ({
            id: item.id,
            name: item.name,
            nickname: item.nickname || undefined,
            slug: item.slug || undefined,
            specialty: (item.specialties && item.specialties.length > 0) ? item.specialties.join(' / ') : '',
            specialties: item.specialties || [],
            bio: item.bio || '',
            avatar: item.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500',
            avatar_url: item.avatar_url || undefined,
            portfolio: [],
            availability: item.working_days || [],
            working_days: item.working_days || [],
            status: item.status || 'AVAILABLE',
            is_active: item.is_active,
            is_visible: item.is_visible,
            sort_order: item.sort_order,
            created_at: item.created_at,
            updated_at: item.updated_at,
          })));
        }

        // 2. Live Flash Designs
        const { data: flashData } = await supabase
          .from('flash_designs')
          .select(`
            id,
            title,
            style,
            size_label,
            price,
            deposit_amount,
            image_url,
            status,
            is_repeatable,
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
          .limit(10);

        if (flashData && isMounted) {
          const activeFlash = flashData
            .filter((f: any) => f.artists && f.artists.is_active !== false && f.artists.is_visible !== false)
            .slice(0, 4);

          setLiveFlash(activeFlash.map((f: any) => ({
            id: f.id,
            title: f.title,
            artistName: f.artists?.name || 'ช่างประจำร้าน',
            style: f.style || 'Fine Line',
            size: f.size_label || '8x8 cm',
            price: Number(f.price) || 0,
            deposit: Number(f.deposit_amount) || 0,
            image: f.image_url,
            status: f.status,
            is_repeatable: Boolean(f.is_repeatable),
          })));
        }

        // 3. Live Portfolio Artworks
        const { data: portfolioData, error: portErr } = await supabase
          .from('portfolio_artworks')
          .select(`
            id,
            artist_id,
            title,
            style,
            image_url,
            size_label,
            estimated_duration_minutes,
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

        if (!portErr && portfolioData && isMounted) {
          setLivePortfolio(portfolioData.map((p: any) => ({
            id: p.id,
            title: p.title,
            style: p.style || 'Fine Line',
            image: getThumbnailUrl(p.image_url),
            originalImage: p.image_url,
            artistName: p.artists?.name || 'ช่างประจำร้าน',
            artistId: p.artist_id,
            size: p.size_label,
          })));
        } else if (portErr && isMounted) {
          setPortfolioError('ไม่สามารถโหลดผลงานได้');
        }
      } catch (_) {}
      finally {
        if (isMounted) {
          setArtistsLoading(false);
          setPortfolioLoading(false);
        }
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [supabase]);

  const styleCards = [
    { title: 'CHICANO', styleQuery: 'Chicano', desc: 'ลายเส้นเข้ม รายละเอียดสูง โทนขาวดำ และองค์ประกอบแบบ Chicano', icon: TattooMachineIcon },
    { title: 'PORTRAIT', styleQuery: 'Portrait', desc: 'งานภาพบุคคล เน้นสัดส่วน แสงเงา และรายละเอียดใบหน้า', icon: UserRound },
    { title: 'BLACKWORK', styleQuery: 'Blackwork', desc: 'งานสีดำเข้ม เส้นคม น้ำหนักชัด และองค์ประกอบทรงพลัง', icon: Droplet },
    { title: 'DARKWORK', styleQuery: 'Darkwork', desc: 'งานโทนมืด บรรยากาศหนัก ดุดัน และรายละเอียดเชิงแฟนตาซี/สยอง', icon: Skull },
  ];

  return (
    <div className="min-h-screen bg-studio-main pb-28 md:pb-16 text-studio-primary font-prompt">
      {/* Top Header Navigation */}
      <CustomerHeader showLogo />

      {/* Hero Section */}
      <HeroSection />

      {/* Main Content Area */}
      <main className="max-w-[1560px] mx-auto px-4 sm:px-6 md:px-12 xl:px-16 py-10 md:py-20 space-y-16 sm:space-y-24 md:space-y-28">
        
        {/* Section: Tattoo Styles (Craftsmanship) */}
        <section className="space-y-4 sm:space-y-6">
          <div className="border-b border-studio-border pb-3 sm:pb-5">
            <span className="text-[10px] uppercase tracking-widest text-studio-secondary font-bold">Craftsmanship</span>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-heading font-normal tracking-[0.04em] text-studio-primary mt-0.5">
              สไตล์งานสักยอดนิยม (TATTOO STYLES)
            </h2>
          </div>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
            {styleCards.map((style, idx) => {
              const Icon = style.icon;
              return (
                <Link
                  key={idx}
                  href={`/portfolio?style=${style.styleQuery}`}
                  className="bg-studio-card border border-studio-border p-4 sm:p-6 lg:p-8 rounded-[8px] hover:border-studio-red/60 hover:shadow-lg transition-all group flex flex-col justify-between cursor-pointer"
                  title={`ดูผลงานสไตล์ ${style.styleQuery}`}
                >
                  <div>
                    <div className="w-9 h-9 sm:w-11 sm:h-11 bg-studio-main border border-studio-border text-studio-red group-hover:border-studio-red/50 rounded-[4px] flex items-center justify-center mb-3 sm:mb-5 transition-colors">
                      <Icon size={18} className="sm:w-5 sm:h-5 group-hover:scale-110 transition-transform" />
                    </div>
                    <h3 className="text-base sm:text-lg lg:text-xl font-heading tracking-wide text-studio-primary uppercase group-hover:text-studio-red-bright transition-colors">
                      {style.title}
                    </h3>
                    <p className="text-[11px] sm:text-xs lg:text-sm text-[#E2DDD4] mt-1.5 leading-relaxed font-light">
                      {style.desc}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Studio Atmosphere Section */}
        <StudioAtmosphereSection />

        {/* Section: SELECTED WORKS (Tabbed: Flash & Portfolio) */}
        <section className="space-y-4 sm:space-y-6">
          <div className="flex justify-between items-end border-b border-studio-border pb-3 sm:pb-5 gap-2">
            <div>
              <div className="inline-flex items-center space-x-1.5 bg-studio-sec border border-studio-border px-2.5 py-0.5 rounded text-studio-red-bright text-[10px] uppercase font-bold tracking-widest mb-1">
                <span>SELECTED WORKS</span>
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-heading font-normal tracking-[0.04em] text-studio-primary">
                ผลงานจาก 157 TATTOO
              </h2>
            </div>
            {selectedWorksTab === 'portfolio' ? (
              <Link
                href="/portfolio"
                className="text-xs sm:text-sm text-studio-primary hover:text-studio-red-bright hover:underline font-medium flex items-center space-x-1 shrink-0 pb-1 transition-colors"
              >
                <span>ดูผลงานทั้งหมด</span>
                <ArrowRight size={13} />
              </Link>
            ) : (
              <Link
                href="/flash"
                className="text-xs sm:text-sm text-studio-primary hover:text-studio-red-bright hover:underline font-medium flex items-center space-x-1 shrink-0 pb-1 transition-colors"
              >
                <span>ดู Flash ทั้งหมด</span>
                <ArrowRight size={13} />
              </Link>
            )}
          </div>

          {/* Editorial Tabs Bar */}
          <div className="flex items-center space-x-6 sm:space-x-8 border-b border-studio-border text-xs sm:text-sm tracking-wider uppercase">
            <button
              type="button"
              onClick={() => setSelectedWorksTab('portfolio')}
              className={`pb-3 transition-colors relative font-heading cursor-pointer tracking-wider ${
                selectedWorksTab === 'portfolio'
                  ? 'text-studio-primary font-medium border-b-2 border-studio-red-base -mb-[1px]'
                  : 'text-studio-muted hover:text-studio-secondary border-b-2 border-transparent -mb-[1px]'
              }`}
            >
              PORTFOLIO — ผลงานล่าสุด
            </button>
            <button
              type="button"
              onClick={() => setSelectedWorksTab('flash')}
              className={`pb-3 transition-colors relative font-heading cursor-pointer tracking-wider ${
                selectedWorksTab === 'flash'
                  ? 'text-studio-primary font-medium border-b-2 border-studio-red-base -mb-[1px]'
                  : 'text-studio-muted hover:text-studio-secondary border-b-2 border-transparent -mb-[1px]'
              }`}
            >
              FLASH — พร้อมจอง
            </button>
          </div>

          {/* Tab 1: PORTFOLIO Cards (Default) */}
          {selectedWorksTab === 'portfolio' && (
            <>
              {/* Loading Skeleton */}
              {portfolioLoading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="bg-studio-card border border-studio-border rounded-[6px] overflow-hidden animate-pulse aspect-square"
                    >
                      <div className="w-full h-full bg-studio-sec/60" />
                    </div>
                  ))}
                </div>
              )}

              {/* Empty State */}
              {!portfolioLoading && livePortfolio.length === 0 && (
                <div className="bg-studio-card border border-studio-border p-10 rounded-[6px] text-center space-y-2">
                  <p className="text-sm font-semibold text-studio-primary">ยังไม่มีผลงานที่เผยแพร่</p>
                  <p className="text-xs text-[#E2DDD4]">ผลงานสักคัสตอมใหม่จะถูกเพิ่มในหน้านี้เร็วๆ นี้</p>
                  <Link
                    href="/portfolio"
                    className="inline-block text-xs text-studio-red-bright hover:underline pt-2 font-medium"
                  >
                    ไปที่หน้า Portfolio →
                  </Link>
                </div>
              )}

              {/* Live Portfolio Grid - Clean 4 Cards with mobile horizontal swipe */}
              {!portfolioLoading && livePortfolio.length > 0 && (
                <div className="flex lg:grid overflow-x-auto lg:overflow-visible pb-4 lg:pb-0 gap-4 lg:grid-cols-4 scrollbar-none snap-x -mx-4 px-4 lg:mx-0 lg:px-0">
                  {livePortfolio.slice(0, 4).map((item) => (
                    <div
                      key={item.id}
                      className="w-[72vw] max-w-[300px] shrink-0 snap-center lg:w-auto bg-studio-card border border-studio-border hover:border-studio-red/60 rounded-[6px] overflow-hidden group relative transition-all duration-300 flex flex-col justify-between shadow-md"
                    >
                      {/* Image Container - Click to open Lightbox (aspect-square to match Flash) */}
                      <div
                        onClick={() => setPreviewImage(item.originalImage || item.image)}
                        className="aspect-square bg-studio-main overflow-hidden relative cursor-zoom-in group/img"
                        role="button"
                        tabIndex={0}
                        aria-label={`ดูภาพขนาดใหญ่ ${item.title}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setPreviewImage(item.originalImage || item.image);
                          }
                        }}
                      >
                        <img
                          src={item.image}
                          onError={(e) => handleThumbnailError(e, item.originalImage || item.image)}
                          alt={item.title}
                          className="w-full h-full object-cover object-center transform group-hover/img:scale-[1.03] transition-transform duration-500"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>

                      {/* Card Info & CTA */}
                      <div className="p-3.5 flex flex-col justify-between flex-1 space-y-2.5 min-w-0">
                        <div className="space-y-1 min-w-0">
                          <span className="text-[9px] uppercase tracking-wider text-studio-red-bright font-bold block truncate">
                            {item.style}
                          </span>
                          <Link
                            href="/portfolio"
                            className="text-sm sm:text-base font-bold tracking-wide text-studio-primary truncate hover:text-studio-red-bright transition-colors block"
                          >
                            {item.title}
                          </Link>
                          <p className="text-xs text-[#E2DDD4] truncate">
                            ช่าง: <strong className="text-studio-primary font-medium">{item.artistName}</strong>
                          </p>
                        </div>
                        <div className="pt-2.5 border-t border-studio-border/50 flex items-center justify-end text-xs mt-auto">
                          <Link
                            href="/portfolio"
                            className="inline-flex items-center space-x-1 text-studio-red-bright font-semibold transition-all hover:text-tattoo-red-dark text-[11px] sm:text-xs cursor-pointer group/cta"
                          >
                            <span>ดูผลงาน</span>
                            <ArrowRight size={13} className="transform group-hover/cta:translate-x-0.5 transition-transform" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Tab 2: FLASH Cards */}
          {selectedWorksTab === 'flash' && (
            <div className="flex lg:grid overflow-x-auto lg:overflow-visible pb-4 lg:pb-0 gap-4 lg:grid-cols-4 scrollbar-none snap-x -mx-4 px-4 lg:mx-0 lg:px-0">
              {liveFlash.map((item) => (
                <div
                  key={item.id}
                  className="w-[72vw] max-w-[300px] shrink-0 snap-center lg:w-auto bg-studio-card border border-studio-border hover:border-studio-red/50 rounded-[6px] overflow-hidden flex flex-col justify-between group transition-all duration-300 shadow-md"
                >
                  {/* Image Container with Top-Right Badge Stack - Click to open Lightbox */}
                  <div
                    onClick={() => setPreviewImage(item.image)}
                    className="aspect-square bg-studio-main overflow-hidden relative block cursor-zoom-in group/img"
                    role="button"
                    tabIndex={0}
                    aria-label={`ดูภาพขนาดใหญ่ ${item.title}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setPreviewImage(item.image);
                      }
                    }}
                  >
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover transform group-hover/img:scale-[1.02] transition-transform duration-500"
                    />
                    {/* Top-Right Badge Stack */}
                    <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5 pointer-events-none">
                      {/* 1. Availability Status Badge (matching /flash 100%) */}
                      {item.status === 'AVAILABLE' ? (
                        <span className="text-[9px] bg-emerald-950/60 border border-emerald-600/40 text-emerald-400 px-2 py-0.5 rounded font-bold shadow">
                          ● ว่าง (พร้อมจอง)
                        </span>
                      ) : item.status === 'HELD' ? (
                        <span className="text-[9px] bg-amber-950/60 border border-amber-600/40 text-amber-300 px-2 py-0.5 rounded font-bold shadow">
                          ● รอการยืนยัน
                        </span>
                      ) : item.status === 'RESERVED' ? (
                        <span className="text-[9px] bg-indigo-950/60 border border-indigo-600/40 text-indigo-300 px-2 py-0.5 rounded font-bold shadow">
                          ● จองแล้ว
                        </span>
                      ) : (
                        <span className="text-[9px] bg-[#171512] border border-[#4A443A] text-[#7A7265] px-2 py-0.5 rounded font-bold shadow">
                          ✕ ปิดจอง
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Info Container */}
                  <div className="p-3.5 flex flex-col justify-between flex-1 space-y-2.5 min-w-0">
                    <div className="space-y-1 min-w-0">
                      {/* Style Text */}
                      <span className="text-[9px] text-studio-red-bright font-bold uppercase tracking-wider block">
                        {item.style || 'FLASH'}
                      </span>

                      {/* Title - clickable to /flash?select=${item.id} */}
                      <Link
                        href={`/flash?select=${item.id}`}
                        className="text-sm sm:text-base font-bold tracking-wide text-studio-primary truncate hover:text-studio-red-bright transition-colors block"
                      >
                        {item.title}
                      </Link>

                      {/* Artist */}
                      <p className="text-xs text-[#E2DDD4] truncate">
                        ช่าง: <strong className="text-studio-primary font-medium">{item.artistName}</strong>
                      </p>
                    </div>

                    {/* Bottom Single CTA Row */}
                    <div className="pt-2.5 border-t border-studio-border/50 flex items-center justify-end text-xs mt-auto">
                      {item.status === 'AVAILABLE' ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/booking?flash=${item.id}`);
                          }}
                          className="inline-flex items-center space-x-1 text-studio-red-bright hover:text-tattoo-red-dark font-semibold transition-all group/btn text-[11px] sm:text-xs cursor-pointer"
                        >
                          <span>จองลายนี้</span>
                          <ArrowRight size={13} className="transform group-hover/btn:translate-x-0.5 transition-transform" />
                        </button>
                      ) : (
                        <span className="text-[11px] sm:text-xs text-studio-muted font-medium">
                          {item.status === 'HELD' ? 'รอการยืนยัน' : item.status === 'RESERVED' ? 'จองแล้ว' : 'ปิดจอง'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {liveFlash.length === 0 && (
                <div className="col-span-4 py-8 text-center text-xs text-[#E2DDD4] bg-studio-card border border-studio-border rounded-[6px]">
                  ไม่มีรายการลาย Flash ที่พร้อมจองในขณะนี้
                </div>
              )}
            </div>
          )}
        </section>

        {/* Section 3: Featured Artists */}
        <section className="space-y-4 sm:space-y-6">
          <div className="flex justify-between items-end border-b border-studio-border pb-3 sm:pb-5 gap-2">
            <div>
              <div className="inline-flex items-center space-x-1.5 bg-studio-sec border border-studio-border px-2.5 py-0.5 rounded text-studio-secondary text-[10px] uppercase font-bold tracking-widest mb-1">
                <span>The Tattoo Masters</span>
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-heading font-normal tracking-[0.04em] text-studio-primary">
                ช่างสักประจำร้าน (RESIDENT ARTISTS)
              </h2>
            </div>
            <Link
              href="/artists"
              className="text-xs sm:text-sm text-studio-primary hover:text-studio-red-bright hover:underline font-medium flex items-center space-x-1 shrink-0 pb-1"
            >
              <span>ดูช่างทุกคน</span>
              <ArrowRight size={13} />
            </Link>
          </div>

          {featuredArtists.length === 0 ? (
            <div className="py-12 px-6 text-center bg-studio-card border border-studio-border rounded-[8px] max-w-lg mx-auto shadow-md space-y-2">
              <div className="w-12 h-12 rounded-full bg-studio-main border border-studio-border flex items-center justify-center mx-auto text-studio-secondary">
                <Users size={20} className="text-studio-red" />
              </div>
              <h3 className="text-base font-heading text-studio-primary">
                กำลังอัปเดตข้อมูลรายชื่อช่างสักประจำสตูดิโอ
              </h3>
              <p className="text-xs text-[#E2DDD4]">
                กรุณาติดตามข้อมูลช่างสักและผลงานล่าสุดผ่านทางสตูดิโอ
              </p>
              <div className="pt-2">
                <Link
                  href="/artists"
                  className="text-xs text-studio-red-bright hover:underline font-semibold"
                >
                  ดูหน้ารวมช่างสัก →
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-6 justify-start">
              {featuredArtists.slice(0, 2).map((artist) => {
                const artistPortfolio = livePortfolio.filter((p) => p.artistId === artist.id);
                const artistWorks = artistPortfolio.slice(0, 3);
                return (
                  <div
                    key={artist.id}
                    className="w-full md:w-[380px] shrink-0 bg-studio-card border border-studio-border rounded-[8px] overflow-hidden flex flex-col justify-between group hover:border-studio-red/50 transition-all shadow-md"
                  >
                    <div className="p-4 sm:p-6 space-y-3.5">
                      <div className="flex items-center space-x-3.5">
                        <img
                          src={artist.avatar_url || artist.avatar}
                          alt={artist.name}
                          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-studio-border shrink-0"
                        />
                        <div className="min-w-0">
                          <span className="text-[10px] uppercase tracking-wider text-studio-red font-bold block truncate">
                            {artist.specialties && artist.specialties.length > 0 ? artist.specialties.join(' / ') : artist.specialty}
                          </span>
                          <h3 className="text-base sm:text-lg font-heading tracking-wide text-studio-primary mt-0.5 truncate">
                            {artist.name}
                          </h3>
                          <span className="text-[10px] text-[#F2EEE8]">ช่างประจำสตูดิโอ 157 TATTOO</span>
                        </div>
                      </div>

                      <p className="text-xs text-[#E2DDD4] font-light leading-relaxed line-clamp-2">
                        {artist.bio || 'ช่างสักมืออาชีพประจำ 157 TATTOO'}
                      </p>

                      {/* Mini portfolio preview strip (fits exactly 3 per row) */}
                      {artistWorks.length > 0 && (
                        <div className="pt-1">
                          <span className="text-[9px] uppercase tracking-wider text-[#F2EEE8] block mb-1.5">ตัวอย่างผลงาน:</span>
                          <div className="grid grid-cols-3 gap-2 w-full">
                            {artistWorks.map((w) => (
                              <div key={w.id} className="w-full aspect-square bg-studio-main rounded overflow-hidden border border-studio-border/60">
                                <img src={w.image} alt="" className="w-full h-full object-cover" />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="p-3.5 sm:p-4 bg-studio-main/40 border-t border-studio-border">
                      <Link
                        href={`/artists?id=${artist.id}`}
                        className="min-h-[44px] w-full text-center bg-transparent border border-studio-border text-studio-primary hover:bg-studio-sec hover:border-studio-red/50 active:scale-[0.99] text-xs font-semibold tracking-wider uppercase py-2.5 px-4 rounded-[4px] flex items-center justify-center transition-colors"
                      >
                        ดูผลงาน & นัดหมาย
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 5: Studio Standard & Info */}
        <section className="bg-studio-card border border-studio-border p-5 sm:p-8 md:p-12 rounded-[8px] space-y-6 shadow-xl">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-studio-border pb-4">
            <div>
              <span className="text-[10px] uppercase tracking-widest text-studio-secondary font-bold">Studio Standard</span>
              <h2 className="text-xl sm:text-2xl md:text-3xl font-heading font-normal tracking-wide text-studio-primary mt-0.5">
                157 TATTOO STUDIO • ข้อมูลและมาตรฐาน
              </h2>
            </div>
            <div className="inline-flex items-center space-x-2 text-[11px] sm:text-xs text-studio-paper bg-studio-sec border border-studio-border px-3 py-1.5 rounded">
              <ShieldCheck size={14} className="text-studio-red" />
              <span className="font-semibold">ปลอดเชื้อ 100% (Sterilized)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-8 text-xs sm:text-sm text-[#E2DDD4]">
            <div className="space-y-1.5">
              <div className="flex items-center space-x-1.5 text-studio-primary font-semibold text-xs sm:text-sm">
                <MapPin size={15} className="text-studio-red" />
                <span>ที่ตั้งสตูดิโอ</span>
              </div>
              <p className="font-light leading-relaxed text-xs">
                151/3 1299 อำเภอเวียงชัย, จังหวัดเชียงราย 57210
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center space-x-1.5 text-studio-primary font-semibold text-xs sm:text-sm">
                <Clock size={15} className="text-studio-red" />
                <span>เวลาเปิดทำการ</span>
              </div>
              <p className="font-light leading-relaxed text-xs">
                เปิดบริการทุกวัน: 10:00 — 23:00 น. (รับเฉพาะนัดหมาย)
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center space-x-1.5 text-studio-primary font-semibold text-xs sm:text-sm">
                <Phone size={15} className="text-studio-red" />
                <span>ติดต่อสอบถาม</span>
              </div>
              <p className="font-light leading-relaxed text-xs break-words">
                IG: 157_tattoo • FB: 157 Tattoo • โทร: 091 070 2369
              </p>
            </div>
          </div>
        </section>

      </main>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <MobileBottomNav />

      {/* Homepage Portfolio & Flash Pure Image Lightbox */}
      {previewImage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 sm:p-6"
          onClick={() => setPreviewImage(null)}
        >
          {/* Close Button Top-Right */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPreviewImage(null);
            }}
            aria-label="ปิดรูปภาพ"
            className="absolute top-4 right-4 sm:top-6 sm:right-6 w-11 h-11 flex items-center justify-center rounded-full bg-studio-card/80 border border-studio-border text-studio-primary hover:text-studio-red hover:border-studio-red/50 transition-colors cursor-pointer z-10"
          >
            <X size={22} />
          </button>

          {/* Centered Image Container */}
          <div
            className="relative flex items-center justify-center max-w-[90vw] max-h-[88vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewImage}
              alt="ผลงานรอยสัก"
              className="max-w-[90vw] max-h-[88vh] w-auto h-auto object-contain select-none rounded-[4px] shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
