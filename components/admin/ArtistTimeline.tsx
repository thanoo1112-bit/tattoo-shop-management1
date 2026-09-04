'use client';

import React, { useState, useMemo } from 'react';
import { useApp } from '../AppContext';
import { Booking } from '@/data/mockBookings';
import { Artist } from '@/data/mockArtists';
import { Calendar, User, Clock, CheckCircle, Clock3, AlertCircle, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import ArtistStatusToggle from './ArtistStatusToggle';

interface ArtistTimelineProps {
  singleArtistId?: string | null;
}

export default function ArtistTimeline({ singleArtistId = null }: ArtistTimelineProps) {
  const { artists, bookings, updateArtistStatus } = useApp();

  const startDayHour = 9;  // 09:00
  const endDayHour = 20;   // 20:00
  const totalHours = endDayHour - startDayHour; // 11 hours

  const todayStr = new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Asia/Bangkok', 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  }).format(new Date());

  const [selectedDate, setSelectedDate] = useState(todayStr);

  // Normalize: Exactly one row per active studio artist (ช่างบอม, ช่างบาส)
  const uniqueActiveArtists = useMemo(() => {
    const seen = new Set<string>();
    return artists
      .filter((a) => {
        if (!a || !a.id) return false;
        if (seen.has(a.id)) return false;
        seen.add(a.id);
        return a.is_active === true;
      })
      .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99));
  }, [artists]);

  const displayedArtists = singleArtistId 
    ? uniqueActiveArtists.filter(a => a.id === singleArtistId)
    : uniqueActiveArtists;

  const timeToDecimal = (timeStr: string): number => {
    if (!timeStr) return startDayHour;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours + (minutes || 0) / 60;
  };

  const getEventStyle = (booking: Booking) => {
    const startDec = timeToDecimal(booking.startTime);
    const endDec = timeToDecimal(booking.endTime);
    
    const startClamped = Math.max(startDec, startDayHour);
    const endClamped = Math.min(endDec, endDayHour);
    const duration = endClamped - startClamped;
    
    if (duration <= 0) return { display: 'none' };

    const leftPercent = ((startClamped - startDayHour) / totalHours) * 100;
    const widthPercent = (duration / totalHours) * 100;

    return {
      left: `${leftPercent}%`,
      width: `${widthPercent}%`,
    };
  };

  return (
    <div className="bg-studio-card border border-studio-border rounded-[8px] overflow-hidden flex flex-col w-full shadow-lg font-prompt">
      
      {/* Timeline Header Info */}
      <div className="p-4 sm:p-5 border-b border-studio-border bg-studio-sec/40 flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center space-x-2">
          <Calendar size={16} className="text-studio-red" />
          <h3 className="text-xs md:text-sm font-heading font-normal uppercase tracking-wider text-studio-primary">
            {singleArtistId ? 'SCHEDULE AGENDA • ตารางงานประจำวันของช่าง' : 'MASTER SCHEDULE • ตารางเวลาปฏิบัติงานช่างสัก'}
          </h3>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center space-x-2 text-xs text-studio-secondary bg-studio-main px-3 py-1.5 rounded border border-studio-border">
            <span className="text-[11px] font-semibold">วันที่:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-studio-primary text-xs focus:border-studio-red outline-none [color-scheme:dark]"
            />
          </div>
          <span className="text-[11px] text-studio-muted hidden sm:inline">
            09:00 — 20:00 น.
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. MOBILE DAY AGENDA VIEW (<768px) */}
      {/* ========================================================================= */}
      <div className="block md:hidden p-4 space-y-6">
        {displayedArtists.map((artist) => {
          const artistBookingsToday = bookings.filter(
            b => b.artistId === artist.id && b.date === selectedDate && ['CONFIRMED', 'WAITING_DEPOSIT', 'APPROVED'].includes(b.status)
          );

          return (
            <div key={artist.id} className="bg-studio-main border border-studio-border rounded-[6px] p-4 space-y-3.5 shadow-sm">
              {/* Artist Header */}
              <div className="flex justify-between items-center border-b border-studio-border/60 pb-3">
                <div className="flex items-center space-x-3">
                  <img
                    src={artist.avatar}
                    alt={artist.name}
                    className="w-10 h-10 rounded-full object-cover border border-studio-border"
                  />
                  <div>
                    <h4 className="text-xs font-bold text-studio-primary">{artist.name}</h4>
                    <span className="text-[10px] text-studio-red font-bold uppercase">{artist.specialty}</span>
                  </div>
                </div>

                {/* Status Toggle / Badge */}
                <ArtistStatusToggle artistId={artist.id} showLabel={false} />
              </div>

              {/* Sessions Agenda List */}
              <div className="space-y-2.5">
                <span className="text-[10px] uppercase font-bold text-studio-muted tracking-wider block">
                  คิวนัดหมายวันนี้ ({artistBookingsToday.length} คิว):
                </span>

                {artistBookingsToday.length === 0 ? (
                  <p className="text-xs text-studio-muted py-3 px-3 bg-studio-card border border-studio-border/50 rounded text-center">
                    ไม่มีคิวนัดหมายในวันที่เลือก
                  </p>
                ) : (
                  artistBookingsToday.map((booking) => (
                    <div
                      key={booking.id}
                      className="bg-studio-card border border-studio-border p-3 rounded-[4px] space-y-1.5 text-xs"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-studio-primary flex items-center gap-1.5">
                          <Clock size={12} className="text-studio-red" />
                          <span>{booking.startTime} - {booking.endTime} ({booking.duration} ชม.)</span>
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                          booking.status === 'CONFIRMED' ? 'bg-green-950/60 border-green-800 text-green-400' : 'bg-studio-red/10 border-studio-red/30 text-studio-red'
                        }`}>
                          {booking.status === 'CONFIRMED' ? 'มัดจำแล้ว' : 'รอมัดจำ'}
                        </span>
                      </div>

                      <div className="text-studio-secondary text-[11px] truncate">
                        งาน: <strong className="text-studio-primary">{booking.artworkTitle || 'Custom Tattoo'}</strong>
                      </div>
                      <div className="text-[10px] text-studio-muted">
                        ลูกค้า: <span className="text-studio-secondary">{booking.customerName || booking.customerEmail}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* 2. DESKTOP MASTER GANTT TIMELINE VIEW (>=768px) */}
      {/* ========================================================================= */}
      <div className="hidden md:block overflow-x-auto">
        <div className="min-w-[760px]">
          
          {/* Time Header Grid */}
          <div className="grid grid-cols-12 border-b border-studio-border bg-studio-main/80 text-[11px] text-studio-secondary font-semibold">
            <div className="col-span-3 p-3.5 border-r border-studio-border flex items-center text-studio-muted">
              ช่างสักประจำร้าน (Artist)
            </div>
            <div className="col-span-9 grid grid-cols-11 text-center divide-x divide-studio-border/40">
              {Array.from({ length: totalHours }).map((_, i) => {
                const hour = startDayHour + i;
                return (
                  <div key={hour} className="py-3 text-[10px] font-mono text-studio-secondary">
                    {hour.toString().padStart(2, '0')}:00
                  </div>
                );
              })}
            </div>
          </div>

          {/* Artist Rows */}
          <div className="divide-y divide-studio-border/60">
            {displayedArtists.map((artist) => {
              const artistBookings = bookings.filter(
                b => b.artistId === artist.id && b.date === selectedDate && ['CONFIRMED', 'WAITING_DEPOSIT', 'APPROVED'].includes(b.status)
              );

              return (
                <div key={artist.id} className="grid grid-cols-12 hover:bg-studio-sec/20 transition-colors">
                  
                  {/* Left Column: Artist Profile & Live Status */}
                  <div className="col-span-3 p-4 border-r border-studio-border flex items-center justify-between bg-studio-main/30">
                    <div className="flex items-center space-x-3 min-w-0">
                      <img
                        src={artist.avatar}
                        alt={artist.name}
                        className="w-10 h-10 rounded-full object-cover border border-studio-border shrink-0"
                      />
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-studio-primary truncate">{artist.name}</h4>
                        <span className="text-[10px] text-studio-red font-bold uppercase truncate block">{artist.specialty}</span>
                      </div>
                    </div>

                    <div className="shrink-0 ml-2">
                      <ArtistStatusToggle artistId={artist.id} showLabel={false} />
                    </div>
                  </div>

                  {/* Right Column: 11-Hour Gantt Timeline Slot Area */}
                  <div className="col-span-9 relative h-20 bg-studio-main/10 flex items-center">
                    
                    {/* Background Grid Lines */}
                    <div className="absolute inset-0 grid grid-cols-11 divide-x divide-studio-border/20 pointer-events-none">
                      {Array.from({ length: totalHours }).map((_, i) => (
                        <div key={i} className="h-full" />
                      ))}
                    </div>

                    {/* Timeline Booking Bars */}
                    {artistBookings.map((booking) => {
                      const posStyle = getEventStyle(booking);
                      const isConfirmed = booking.status === 'CONFIRMED';

                      return (
                        <div
                          key={booking.id}
                          style={posStyle}
                          className={`absolute h-14 rounded-[4px] border p-2 flex flex-col justify-between overflow-hidden shadow-md cursor-pointer transition-all hover:scale-[1.01] z-10 ${
                            isConfirmed
                              ? 'bg-studio-sec border-green-600/80 text-studio-primary'
                              : 'bg-studio-sec border-studio-red/80 text-studio-primary'
                          }`}
                        >
                          <div className="flex justify-between items-start gap-1">
                            <span className="text-[11px] font-bold truncate leading-tight">
                              {booking.artworkTitle || 'Custom Tattoo'}
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase shrink-0 ${
                              isConfirmed ? 'bg-green-950 text-green-400' : 'bg-studio-red/20 text-studio-red'
                            }`}>
                              {isConfirmed ? 'ยืนยัน' : 'รอมัดจำ'}
                            </span>
                          </div>

                          <div className="flex justify-between items-center text-[10px] text-studio-secondary">
                            <span>{booking.startTime} - {booking.endTime}</span>
                            <span className="truncate max-w-[80px] text-studio-muted">{booking.customerName || booking.customerEmail}</span>
                          </div>
                        </div>
                      );
                    })}

                    {artistBookings.length === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="text-[10px] text-studio-muted tracking-widest uppercase">
                          — ไม่มีคิวนัดหมาย —
                        </span>
                      </div>
                    )}

                  </div>

                </div>
              );
            })}
          </div>

        </div>
      </div>

    </div>
  );
}
