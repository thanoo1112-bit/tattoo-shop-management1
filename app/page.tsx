'use client';

import React, { useState, useEffect } from 'react';
import CustomerHeader from '@/components/customer/CustomerHeader';
import MobileBottomNav from '@/components/customer/MobileBottomNav';
import HeroSection from '@/components/customer/HeroSection';
import { Artist } from '@/data/mockArtists';
import { useApp } from '@/components/AppContext';
import Link from 'next/link';
import { Sparkles, Compass, Award, MapPin, Clock, Phone, ShieldCheck, ArrowRight, ArrowUpRight, Users } from 'lucide-react';

export default function HomePage() {
  const { supabase } = useApp();
  const [featuredArtists, setFeaturedArtists] = useState<Artist[]>([]);
  const [artistsLoading, setArtistsLoading] = useState(true);
  const [liveFlash, setLiveFlash] = useState<any[]>([]);
  const [livePortfolio, setLivePortfolio] = useState<any[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);

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
          .limit(4);

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
            artists (
              id,
              name,
              nickname
            )
          `)
          .eq('is_visible', true)
          .order('sort_order', { ascending: true })
          .limit(4);

        if (flashData && isMounted) {
          setLiveFlash(flashData.map((f: any) => ({
            id: f.id,
            title: f.title,
            artistName: f.artists?.name || 'ช่างประจำร้าน',
            style: f.style || 'Fine Line',
            size: f.size_label || '8x8 cm',
            price: Number(f.price) || 0,
            deposit: Number(f.deposit_amount) || 0,
            image: f.image_url,
            status: f.status,
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
          .order('created_at', { ascending: false })
          .limit(6);

        if (!portErr && portfolioData && isMounted) {
          setLivePortfolio(portfolioData.map((p: any) => ({
            id: p.id,
            title: p.title,
            style: p.style || 'Fine Line',
            image: p.image_url,
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
    { title: 'Fine Line', desc: 'ลายเส้นบางคม รายละเอียดประณีต สไตล์มินิมอลและเรขาคณิต', icon: Compass },
    { title: 'Blackwork', desc: 'งานสีดำสนิท แรเงาลายมิติเข้มข้น ลวดลายดาร์กทรงพลัง', icon: Sparkles },
    { title: 'Traditional', desc: 'สไตล์ดั้งเดิม สีสันสดใส ลายเส้นหนาคมชัดเป็นเอกลักษณ์', icon: Award },
  ];

  return (
    <div className="min-h-screen bg-studio-main pb-28 md:pb-16 text-studio-primary font-prompt">
      {/* Top Header Navigation */}
      <CustomerHeader />

      {/* Hero Section */}
      <HeroSection />

      {/* Main Content Area */}
      <main className="max-w-[1560px] mx-auto px-4 sm:px-6 md:px-12 xl:px-16 py-10 md:py-20 space-y-16 sm:space-y-24 md:space-y-28">
        
        {/* Section 1: Featured Flash (Flash Sheet aesthetic) */}
        <section className="space-y-4 sm:space-y-6">
          <div className="flex justify-between items-end border-b border-studio-border pb-3 sm:pb-5 gap-2">
            <div>
              <div className="inline-flex items-center space-x-1.5 bg-studio-sec border border-studio-border px-2.5 py-0.5 rounded text-studio-red text-[10px] uppercase font-bold tracking-widest mb-1">
                <span>Available Flash Sheet</span>
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-heading font-normal tracking-[0.04em] text-studio-primary">
                FLASH ที่พร้อมจอง
              </h2>
            </div>
            <Link
              href="/flash"
              className="text-xs sm:text-sm text-studio-primary hover:text-studio-red hover:underline font-medium flex items-center space-x-1 shrink-0 pb-1"
            >
              <span>ดูลายว่างทั้งหมด</span>
              <ArrowRight size={13} />
            </Link>
          </div>

          {/* Horizontal Snap Scroll on Mobile / Grid on Desktop */}
          <div className="flex lg:grid overflow-x-auto lg:overflow-visible pb-4 lg:pb-0 gap-4 lg:grid-cols-4 scrollbar-none snap-x -mx-4 px-4 lg:mx-0 lg:px-0">
            {liveFlash.map((item) => (
              <div
                key={item.id}
                className="w-[78vw] max-w-[300px] shrink-0 snap-center lg:w-auto bg-studio-card border border-studio-border hover:border-studio-red/60 rounded-[6px] overflow-hidden flex flex-col justify-between group transition-all duration-300 shadow-md"
              >
                <Link
                  href={`/flash?select=${item.id}`}
                  className="aspect-square bg-studio-main overflow-hidden relative block"
                >
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-2.5 left-2.5 bg-studio-sec/90 border border-studio-border text-studio-paper text-[9px] font-bold px-2 py-0.5 rounded">
                    {item.status === 'AVAILABLE' ? 'ว่าง (พร้อมจอง)' : item.status === 'HELD' ? 'รอการยืนยัน' : item.status === 'RESERVED' ? 'จองแล้ว' : 'ปิดจอง'}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-studio-main/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                    <span className="text-xs text-studio-paper font-bold flex items-center gap-1">
                      ดูรายละเอียด <ArrowUpRight size={14} />
                    </span>
                  </div>
                </Link>

                <div className="p-3.5 space-y-3">
                  <div>
                    <h3 className="text-base sm:text-lg font-heading tracking-wide text-studio-primary truncate">{item.title}</h3>
                    <div className="flex justify-between items-center text-xs text-studio-secondary mt-0.5">
                      <span>ช่าง: {item.artistName}</span>
                      <span>ขนาด: {item.size}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center border-t border-studio-border/60 pt-2.5">
                    <div>
                      <span className="text-[9px] text-studio-muted block leading-none">ราคาค่าสัก</span>
                      <span className="text-sm font-bold text-studio-red mt-0.5 block">
                        ฿{item.price.toLocaleString()}
                      </span>
                    </div>
                    <Link
                      href={`/flash?select=${item.id}`}
                      className="min-h-[38px] bg-studio-red text-studio-paper hover:bg-tattoo-red-dark active:scale-95 py-2 px-4 rounded-[4px] text-xs font-semibold uppercase tracking-wider transition-all flex items-center justify-center text-center border border-studio-red"
                    >
                      จองลายนี้
                    </Link>
                  </div>
                </div>
              </div>
            ))}
            {liveFlash.length === 0 && (
              <div className="col-span-4 py-8 text-center text-xs text-studio-muted bg-studio-card border border-studio-border rounded-[6px]">
                ไม่มีรายการลาย Flash ที่พร้อมจองในขณะนี้
              </div>
            )}
          </div>
        </section>

        {/* Section 2: Portfolio Showcase */}
        <section className="space-y-4 sm:space-y-6">
          <div className="flex justify-between items-end border-b border-studio-border pb-3 sm:pb-5 gap-2">
            <div>
              <div className="inline-flex items-center space-x-1.5 bg-studio-sec border border-studio-border px-2.5 py-0.5 rounded text-studio-secondary text-[10px] uppercase font-bold tracking-widest mb-1">
                <span>Recent Studio Works</span>
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-heading font-normal tracking-[0.04em] text-studio-primary">
                ผลงานล่าสุด (PORTFOLIO)
              </h2>
            </div>
            <Link
              href="/portfolio"
              className="text-xs sm:text-sm text-studio-primary hover:text-studio-red hover:underline font-medium flex items-center space-x-1 shrink-0 pb-1"
            >
              <span>ดูทั้งหมด</span>
              <ArrowRight size={13} />
            </Link>
          </div>

          {/* Loading Skeleton */}
          {portfolioLoading && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-4">
              {[1, 2, 3, 4, 5, 6].map((idx) => (
                <div
                  key={idx}
                  className={`bg-studio-card border border-studio-border rounded-[6px] overflow-hidden animate-pulse ${
                    idx === 0 || idx === 3 ? 'lg:col-span-2 aspect-[4/3]' : 'aspect-square'
                  }`}
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
              <p className="text-xs text-studio-secondary">ผลงานสักคัสตอมใหม่จะถูกเพิ่มในหน้านี้เร็วๆ นี้</p>
              <Link
                href="/portfolio"
                className="inline-block text-xs text-studio-red hover:underline pt-2 font-medium"
              >
                ไปที่หน้า Portfolio →
              </Link>
            </div>
          )}

          {/* Live Portfolio Grid */}
          {!portfolioLoading && livePortfolio.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-4">
              {livePortfolio.map((item, idx) => (
                <Link
                  key={item.id}
                  href={`/portfolio?select=${item.id}`}
                  className={`bg-studio-card border border-studio-border hover:border-studio-red/60 rounded-[6px] overflow-hidden group relative transition-all block ${
                    idx === 0 || idx === 3 ? 'lg:col-span-2 aspect-[4/3]' : 'aspect-square'
                  }`}
                >
                  <img
                    src={item.image}
                    alt={item.title}
                    className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-studio-main/90 via-studio-main/30 to-transparent flex flex-col justify-end p-2.5 sm:p-4">
                    <span className="text-[9px] uppercase tracking-wider text-studio-red font-bold">
                      {item.style}
                    </span>
                    <h4 className="text-xs sm:text-sm font-heading font-normal tracking-wide text-studio-paper truncate">
                      {item.title}
                    </h4>
                    <span className="text-[10px] text-studio-muted truncate">
                      ช่าง: {item.artistName}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="pt-2 text-center lg:hidden">
            <Link
              href="/portfolio"
              className="inline-flex min-h-[44px] items-center justify-center w-full bg-studio-card border border-studio-border text-studio-secondary hover:text-studio-primary text-xs font-semibold uppercase tracking-wider rounded-[4px] py-3 px-4"
            >
              ดูผลงานทั้งหมดใน Portfolio →
            </Link>
          </div>
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
              className="text-xs sm:text-sm text-studio-primary hover:text-studio-red hover:underline font-medium flex items-center space-x-1 shrink-0 pb-1"
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
              <p className="text-xs text-studio-secondary">
                กรุณาติดตามข้อมูลช่างสักและผลงานล่าสุดผ่านทางสตูดิโอ
              </p>
              <div className="pt-2">
                <Link
                  href="/artists"
                  className="text-xs text-studio-red hover:underline font-semibold"
                >
                  ดูหน้ารวมช่างสัก →
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {featuredArtists.map((artist) => {
                const artistWorks = livePortfolio.filter((p) => p.artistId === artist.id).slice(0, 3);
                return (
                  <div
                    key={artist.id}
                    className="bg-studio-card border border-studio-border rounded-[8px] overflow-hidden flex flex-col justify-between group hover:border-studio-red/50 transition-all shadow-md"
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
                          <span className="text-[10px] text-studio-muted">ช่างประจำสตูดิโอ 157 TATTOO</span>
                        </div>
                      </div>

                      <p className="text-xs text-studio-secondary font-light leading-relaxed line-clamp-2">
                        {artist.bio || 'ช่างสักมืออาชีพประจำ 157 TATTOO'}
                      </p>

                      {/* Mini portfolio preview strip (3 images) */}
                      {artistWorks.length > 0 && (
                        <div className="pt-1">
                          <span className="text-[9px] uppercase tracking-wider text-studio-muted block mb-1.5">ตัวอย่างผลงาน:</span>
                          <div className="grid grid-cols-3 gap-1.5">
                            {artistWorks.map(w => (
                              <div key={w.id} className="aspect-square bg-studio-main rounded overflow-hidden border border-studio-border/60">
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
                        className="min-h-[44px] w-full text-center bg-transparent border border-studio-border text-studio-primary hover:bg-studio-sec active:scale-[0.99] text-xs font-semibold tracking-wider uppercase py-2.5 px-4 rounded-[4px] flex items-center justify-center transition-colors"
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

        {/* Section 4: Specialties */}
        <section className="space-y-4 sm:space-y-6">
          <div className="border-b border-studio-border pb-3 sm:pb-5">
            <span className="text-[10px] uppercase tracking-widest text-studio-secondary font-bold">Craftsmanship</span>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-heading font-normal tracking-[0.04em] text-studio-primary mt-0.5">
              สไตล์งานสักยอดนิยม (TATTOO STYLES)
            </h2>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
            {styleCards.map((style, idx) => {
              const Icon = style.icon;
              return (
                <div
                  key={idx}
                  className="bg-studio-card border border-studio-border p-5 sm:p-8 rounded-[8px] hover:border-studio-red/50 transition-colors group"
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-studio-main border border-studio-border text-studio-red rounded-[4px] flex items-center justify-center mb-3 sm:mb-5">
                    <Icon size={20} />
                  </div>
                  <h3 className="text-lg sm:text-xl font-heading tracking-wide text-studio-primary uppercase">
                    {style.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-studio-secondary mt-1.5 leading-relaxed font-light">
                    {style.desc}
                  </p>
                </div>
              );
            })}
          </div>
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 sm:gap-8 text-xs sm:text-sm text-studio-secondary">
            <div className="space-y-1.5">
              <div className="flex items-center space-x-1.5 text-studio-primary font-semibold text-xs sm:text-sm">
                <MapPin size={15} className="text-studio-red" />
                <span>ที่ตั้งสตูดิโอ</span>
              </div>
              <p className="font-light leading-relaxed text-xs">
                157 สุขุมวิท 24 คลองเตย กทม. 10110 (BTS พร้อมพงษ์)
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center space-x-1.5 text-studio-primary font-semibold text-xs sm:text-sm">
                <Clock size={15} className="text-studio-red" />
                <span>เวลาเปิดทำการ</span>
              </div>
              <p className="font-light leading-relaxed text-xs">
                เปิดบริการทุกวัน: 09:00 — 19:00 น. (รับเฉพาะนัดหมาย)
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center space-x-1.5 text-studio-primary font-semibold text-xs sm:text-sm">
                <Phone size={15} className="text-studio-red" />
                <span>ติดต่อสอบถาม</span>
              </div>
              <p className="font-light leading-relaxed text-xs">
                LINE: @157tattoo • IG: @157tattoo_official
              </p>
            </div>
          </div>
        </section>

      </main>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <MobileBottomNav />
    </div>
  );
}
