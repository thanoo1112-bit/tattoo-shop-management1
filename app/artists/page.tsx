'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import CustomerHeader from '@/components/customer/CustomerHeader';
import MobileBottomNav from '@/components/customer/MobileBottomNav';
import ArtistCard from '@/components/customer/ArtistCard';
import ArtistProfile from '@/components/customer/ArtistProfile';
import EstimateForm from '@/components/estimate/EstimateForm';
import BookingFlow from '@/components/booking/BookingFlow';
import { useApp } from '@/components/AppContext';
import { Artist } from '@/data/mockArtists';
import { ArrowLeft, Users, Loader2, AlertCircle } from 'lucide-react';

function ArtistsContent() {
  const searchParams = useSearchParams();
  const { supabase } = useApp();

  const [artists, setArtists] = useState<Artist[]>([]);
  const [allArtists, setAllArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected Artist state
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [inactiveArtistNotice, setInactiveArtistNotice] = useState<string | null>(null);

  // Form states loaded from artist profile details
  const [activeForm, setActiveForm] = useState<'none' | 'estimate' | 'booking'>('none');
  const [selectedArtwork, setSelectedArtwork] = useState<any | null>(null);

  // Fetch Public Visible Artists
  const loadPublicArtists = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('artists')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      const { data: portData } = await supabase
        .from('portfolio_artworks')
        .select('id, artist_id, image_url, sort_order, created_at')
        .eq('is_visible', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (!error && data) {
        const mapped: Artist[] = data.map((item: any) => {
          const artistPort = (portData || [])
            .filter((p: any) => p.artist_id === item.id)
            .slice(0, 3)
            .map((p: any) => p.image_url);

          return {
            id: item.id,
            name: item.name,
            nickname: item.nickname || undefined,
            slug: item.slug || undefined,
            specialty: (item.specialties && item.specialties.length > 0) ? item.specialties.join(' / ') : '',
            specialties: item.specialties || [],
            bio: item.bio || '',
            avatar: item.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500',
            avatar_url: item.avatar_url || undefined,
            portfolio: artistPort,
            availability: item.working_days || [],
            working_days: item.working_days || [],
            status: item.status || 'AVAILABLE',
            is_active: item.is_active,
            is_visible: item.is_visible,
            sort_order: item.sort_order,
            created_at: item.created_at,
            updated_at: item.updated_at,
          };
        });
        setAllArtists(mapped);
        const activeOnly = mapped.filter((a) => a.is_active !== false && a.is_visible !== false);
        setArtists(activeOnly);
      }
    } catch (_) {}
    finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadPublicArtists();
  }, [loadPublicArtists]);

  // Inspect URL parameters (e.g. ?id=<artist_uuid>)
  useEffect(() => {
    if (loading) return;

    const artistId = searchParams.get('id');
    if (artistId) {
      const target = allArtists.find(a => a.id === artistId);
      if (target && target.is_active !== false && target.is_visible !== false) {
        setSelectedArtist(target);
        setInactiveArtistNotice(null);
        setActiveForm('none');
      } else {
        setSelectedArtist(null);
        setInactiveArtistNotice('ช่างคนนี้ถูกปิดใช้งาน');
      }
    } else {
      setSelectedArtist(null);
      setInactiveArtistNotice(null);
    }
  }, [searchParams, allArtists, loading]);

  const handleArtistSelect = (artistId: string) => {
    const artist = artists.find(a => a.id === artistId);
    if (artist && artist.is_active !== false && artist.is_visible !== false) {
      setSelectedArtist(artist);
      setInactiveArtistNotice(null);
      setActiveForm('none');
    }
  };

  const handleBackToList = () => {
    setSelectedArtist(null);
    setInactiveArtistNotice(null);
    setActiveForm('none');
    if (typeof window !== 'undefined' && searchParams.get('id')) {
      window.history.pushState({}, '', '/artists');
    }
  };

  return (
    <div className="min-h-screen bg-studio-main pb-28 md:pb-16 text-studio-primary font-prompt">
      {/* Header */}
      <CustomerHeader />

      <main className="max-w-[1560px] mx-auto px-4 sm:px-6 md:px-12 xl:px-16 py-6 md:py-10">
        
        {/* Title */}
        {!selectedArtist && (
          <div className="border-b border-studio-border pb-4 mb-6 md:mb-8">
            <span className="text-[10px] uppercase tracking-widest text-studio-red font-bold">Resident Artists</span>
            <h1 className="text-xl md:text-3xl font-bold tracking-wider text-studio-primary mt-0.5">ทีมช่างสักประจำร้าน</h1>
            <p className="text-xs text-studio-secondary mt-1">พบกับศิลปินผู้สร้างสรรค์ผลงานศิลปะบนผิวหนังประจำสตูดิโอ 157 TATTOO</p>
          </div>
        )}

        {/* Inactive Artist Notice Banner */}
        {inactiveArtistNotice && (
          <div className="py-16 px-6 text-center space-y-4 bg-studio-card border border-studio-border rounded-[8px] max-w-lg mx-auto shadow-lg my-6">
            <div className="w-14 h-14 rounded-full bg-amber-950/40 border border-amber-600/40 flex items-center justify-center mx-auto text-amber-400">
              <AlertCircle size={28} />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-heading text-studio-primary">
                {inactiveArtistNotice}
              </h3>
              <p className="text-xs text-studio-secondary leading-relaxed">
                ช่างสักที่คุณกำลังค้นหาไม่เปิดให้จองคิวในขณะนี้ คุณสามารถเลือกชมทีมช่างสักท่านอื่นของสตูดิโอ 157 TATTOO ได้ด้านล่าง
              </p>
            </div>
            <button
              onClick={handleBackToList}
              className="inline-block bg-studio-red hover:bg-tattoo-red-dark text-studio-paper px-4 py-2 rounded text-xs font-semibold tracking-wider uppercase transition-colors"
            >
              ดูรายชื่อช่างสักทั้งหมด
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && !selectedArtist && (
          <div className="py-24 text-center space-y-3">
            <Loader2 size={24} className="text-studio-red animate-spin mx-auto" />
            <p className="text-xs text-studio-secondary">กำลังโหลดข้อมูลช่างสัก...</p>
          </div>
        )}

        {/* Empty State (When DB has 0 visible artists) */}
        {!loading && !selectedArtist && artists.length === 0 && (
          <div className="py-20 px-6 text-center space-y-4 bg-studio-card border border-studio-border rounded-[8px] max-w-lg mx-auto shadow-lg">
            <div className="w-14 h-14 rounded-full bg-studio-main border border-studio-border flex items-center justify-center mx-auto text-studio-secondary">
              <Users size={24} className="text-studio-red" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-heading text-studio-primary">
                ยังไม่มีรายชื่อช่างสักที่เปิดเผยในขณะนี้
              </h3>
              <p className="text-xs text-studio-secondary leading-relaxed">
                ทางสตูดิโอกำลังอัปเดตข้อมูลรายชื่อช่างสักประจำร้าน กรุณาติดต่อสตูดิโอโดยตรงสำหรับข้อมูลเพิ่มเติม
              </p>
            </div>
          </div>
        )}

        {/* 1. List View */}
        {!loading && !selectedArtist && artists.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl">
            {artists.map((artist) => (
              <ArtistCard
                key={artist.id}
                artist={artist}
                onSelect={handleArtistSelect}
              />
            ))}
          </div>
        )}

        {/* 2. Detail View */}
        {selectedArtist && activeForm === 'none' && (
          <ArtistProfile
            artist={selectedArtist}
            onBack={handleBackToList}
            onSelectEstimate={() => setActiveForm('estimate')}
            onSelectBooking={() => setActiveForm('booking')}
            onItemSelect={(item) => {
              setSelectedArtwork(item);
              setActiveForm('booking');
            }}
          />
        )}

        {/* 3. Form views */}
        {selectedArtist && activeForm !== 'none' && (
          <div className="max-w-xl mx-auto bg-studio-card border border-studio-border p-6 rounded-[8px] animate-fadeIn">
            <button
              onClick={() => setActiveForm('none')}
              className="flex items-center space-x-1.5 text-xs text-studio-secondary hover:text-studio-red transition-colors uppercase font-semibold mb-6"
            >
              <ArrowLeft size={14} />
              <span>ย้อนกลับไปประวัติช่างสัก</span>
            </button>

            {activeForm === 'estimate' && (
              <EstimateForm
                preselectedArtistId={selectedArtist.id}
                compact={true}
                onSuccess={() => setActiveForm('none')}
              />
            )}

            {activeForm === 'booking' && (
              <BookingFlow
                preselectedArtist={selectedArtist}
                preselectedArtwork={selectedArtwork}
                onSuccess={() => setActiveForm('none')}
              />
            )}
          </div>
        )}

      </main>

      {/* Mobile Nav */}
      <MobileBottomNav />
    </div>
  );
}

export default function ArtistsPage() {
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-studio-main flex items-center justify-center font-prompt text-studio-secondary text-xs">กำลังโหลดข้อมูลช่างสัก...</div>}>
      <ArtistsContent />
    </React.Suspense>
  );
}
