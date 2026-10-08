'use client';

import React, { useState, useMemo } from 'react';
import { useApp } from '../AppContext';
import { formatTattooSize } from '@/lib/utils/formatters';
import { getBookingStatusConfig } from './calendar/calendarUtils';
import { Calendar, User, Clock, CheckCircle, Clock3, AlertCircle, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

interface ArtistTimelineProps {
  singleArtistId?: string | null;
}

export default function ArtistTimeline({ singleArtistId = null }: ArtistTimelineProps) {
  const { artists, bookings } = useApp();

  const startDayHour = 10; // 10:00
  const endDayHour = 23;  // 23:00
  const totalHours = endDayHour - startDayHour; // 13 hours

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

  const parseBangkokDateTime = (isoString?: string) => {
    if (!isoString) return { date: '', time: '' };
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { date: '', time: '' };
    const bkkDate = new Intl.DateTimeFormat('en-CA', { 
      timeZone: 'Asia/Bangkok', 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    }).format(d);
    const bkkTime = new Intl.DateTimeFormat('en-GB', { 
      timeZone: 'Asia/Bangkok', 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false 
    }).format(d);
    return { date: bkkDate, time: bkkTime };
  };

  const timeToDecimal = (timeStr: string): number => {
    if (!timeStr) return startDayHour;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours + (minutes || 0) / 60;
  };

  interface ScheduleEvent {
    id: string;
    bookingId: string;
    sessionId?: string;
    artistId: string;
    date: string;
    startTime: string;
    endTime: string;
    duration: number;
    status: string;
    bookingStatus: string;
    style?: string;
    width?: number;
    height?: number;
    placement?: string;
    artworkTitle?: string;
    customerName?: string;
    customerEmail?: string;
  }

  const getEventTitle = (event: ScheduleEvent): string => {
    const styleName = event.style || (event.artworkTitle && !event.artworkTitle.includes('Custom') && !event.artworkTitle.includes('ประเมินราคา') ? event.artworkTitle : '');
    const hasSize = Boolean(event.width && event.height);

    if (styleName && hasSize) {
      return `${styleName} • ${formatTattooSize(event.width, event.height)}`;
    }
    if (styleName) {
      return styleName;
    }
    if (hasSize) {
      return `งานสัก • ${formatTattooSize(event.width, event.height)}`;
    }
    return 'งานสัก';
  };

  const getArtistEventsToday = useMemo(() => {
    return (artistId: string, targetDate: string): ScheduleEvent[] => {
      const events: ScheduleEvent[] = [];

      bookings.forEach((b) => {
        // Skip cancelled or rejected bookings
        if (['CANCELLED', 'REJECTED'].includes(b.status)) return;

        const sessions = b.sessions || [];

        if (sessions.length > 0) {
          // Process each session attached to the booking
          sessions.forEach((s) => {
            if (s.status === 'CANCELLED') return;

            const sessionArtistId = s.artist_id || b.artistId;
            if (sessionArtistId !== artistId) return;

            const startParsed = parseBangkokDateTime(s.start_at);
            const endParsed = parseBangkokDateTime(s.end_at);

            const sessionDate = startParsed.date || b.date;
            if (sessionDate !== targetDate) return;

            const startTime = startParsed.time || b.startTime;
            const endTime = endParsed.time || b.endTime;

            const startDec = timeToDecimal(startTime);
            let endDec = timeToDecimal(endTime);
            if (!endTime || endDec <= startDec) {
              endDec = startDec + (b.duration || 1);
            }
            const duration = Math.max(1, endDec - startDec);

            events.push({
              id: `session-${s.id}`,
              bookingId: b.id,
              sessionId: s.id,
              artistId: sessionArtistId,
              date: sessionDate,
              startTime,
              endTime,
              duration,
              status: s.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : s.status === 'COMPLETED' ? 'COMPLETED' : b.status,
              bookingStatus: b.status,
              style: b.style,
              width: b.width,
              height: b.height,
              placement: b.placement,
              artworkTitle: b.artworkTitle,
              customerName: b.customerName,
              customerEmail: b.customerEmail,
            });
          });
        } else {
          // Fallback for bookings without sessions
          if (b.artistId !== artistId || b.date !== targetDate) return;

          const startDec = timeToDecimal(b.startTime);
          let endDec = timeToDecimal(b.endTime);
          if (!b.endTime || endDec <= startDec) {
            endDec = startDec + (b.duration || 1);
          }
          const duration = Math.max(1, endDec - startDec);

          const endHour = Math.floor(endDec);
          const endMin = Math.round((endDec - endHour) * 60);
          const formattedEndTime = b.endTime || `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;

          events.push({
            id: `booking-${b.id}`,
            bookingId: b.id,
            artistId: b.artistId,
            date: b.date,
            startTime: b.startTime,
            endTime: formattedEndTime,
            duration,
            status: b.status,
            bookingStatus: b.status,
            style: b.style,
            width: b.width,
            height: b.height,
            placement: b.placement,
            artworkTitle: b.artworkTitle,
            customerName: b.customerName,
            customerEmail: b.customerEmail,
          });
        }
      });

      return events;
    };
  }, [bookings]);

  const getEventStyle = (event: ScheduleEvent) => {
    const startDec = timeToDecimal(event.startTime);
    let endDec = timeToDecimal(event.endTime);
    if (!event.endTime || endDec <= startDec) {
      endDec = startDec + event.duration;
    }
    
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
            10:00 — 23:00 น.
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. MOBILE DAY AGENDA VIEW (<768px) */}
      {/* ========================================================================= */}
      <div className="block md:hidden p-4 space-y-6">
        {displayedArtists.map((artist) => {
          const artistBookingsToday = getArtistEventsToday(artist.id, selectedDate);

          return (
            <div key={artist.id} className="bg-studio-main border border-studio-border rounded-[6px] p-4 space-y-3.5 shadow-sm">
              {/* Artist Header */}
              <div className="flex items-center space-x-3 border-b border-studio-border/60 pb-3">
                <img
                  src={artist.avatar}
                  alt={artist.name}
                  className="w-10 h-10 rounded-full object-cover border border-studio-border shrink-0"
                />
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-studio-primary">{artist.name}</h4>
                  <span className="text-[10px] text-studio-muted font-normal block">ช่างสักประจำร้าน</span>
                </div>
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
                  artistBookingsToday.map((booking) => {
                    const statusKey = (booking.bookingStatus || booking.status) as any;
                    const statusConfig = getBookingStatusConfig(statusKey);
                    
                    let badgeLabel = statusConfig.label;
                    let badgeClass = `${statusConfig.bg} ${statusConfig.border} ${statusConfig.text}`;

                    if (booking.status === 'IN_PROGRESS') {
                      badgeLabel = 'กำลังสัก';
                      badgeClass = 'bg-[#9C2F2F]/20 border-[#9C2F2F] text-[#9C2F2F] animate-pulse';
                    } else if (booking.status === 'COMPLETED') {
                      badgeLabel = 'เสร็จแล้ว';
                      badgeClass = 'bg-[#171512] border-[#4A443A] text-[#A89F91]';
                    }

                    const startTimeDisplay = booking.startTime.endsWith('น.') || booking.startTime.endsWith('น')
                      ? booking.startTime
                      : `${booking.startTime} น.`;

                    return (
                      <div
                        key={booking.id}
                        className="bg-studio-card border border-studio-border p-3 rounded-[4px] space-y-1 text-xs"
                      >
                        <div className="flex justify-between items-center gap-1">
                          <span className="font-bold text-studio-primary text-xs truncate">
                            {getEventTitle(booking)}
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-bold border shrink-0 ${badgeClass}`}>
                            {badgeLabel}
                          </span>
                        </div>

                        {booking.placement && (
                          <div className="text-[11px] text-studio-muted truncate">
                            ตำแหน่ง: {booking.placement}
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[11px] text-studio-secondary pt-0.5">
                          <span className="flex items-center gap-1">
                            <Clock size={12} className="text-studio-red" />
                            <span>เวลานัด {startTimeDisplay}</span>
                          </span>
                          <span className="text-studio-muted font-medium truncate max-w-[120px]">
                            • {booking.customerName || booking.customerEmail}
                          </span>
                        </div>
                      </div>
                    );
                  })
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
          <div className="flex border-b border-studio-border bg-studio-main/80 text-[11px] text-studio-secondary font-semibold">
            <div className="w-[220px] shrink-0 p-3.5 border-r border-studio-border flex items-center text-studio-muted">
              ช่างสักประจำร้าน (Artist)
            </div>
            <div className="flex-1 min-w-0 relative py-3 select-none">
              {/* Background Grid Lines */}
              <div className="absolute inset-0 grid divide-x divide-studio-border/40 pointer-events-none" style={{ gridTemplateColumns: `repeat(${totalHours}, minmax(0, 1fr))` }}>
                {Array.from({ length: totalHours }).map((_, i) => (
                  <div key={i} className="h-full" />
                ))}
              </div>

              {/* Hour Labels aligned to vertical grid lines */}
              <div className="relative w-full text-[10px] font-mono text-studio-secondary">
                {Array.from({ length: totalHours + 1 }).map((_, i) => {
                  const hour = startDayHour + i;
                  const percent = (i / totalHours) * 100;
                  
                  let alignClass = "-translate-x-1/2 text-center";
                  if (i === 0) {
                    alignClass = "translate-x-1 text-left";
                  } else if (i === totalHours) {
                    alignClass = "-translate-x-full -ml-1 text-right";
                  }

                  return (
                    <span
                      key={hour}
                      className={`absolute top-0 transform ${alignClass} whitespace-nowrap`}
                      style={{ left: `${percent}%` }}
                    >
                      {hour.toString().padStart(2, '0')}:00
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Artist Rows */}
          <div className="divide-y divide-studio-border/60">
            {displayedArtists.map((artist) => {
              const artistBookings = getArtistEventsToday(artist.id, selectedDate);

              return (
                <div key={artist.id} className="flex hover:bg-studio-sec/20 transition-colors">
                  
                  {/* Left Column: Artist Profile */}
                  <div className="w-[220px] shrink-0 p-3.5 border-r border-studio-border flex items-center bg-studio-main/30">
                    <div className="flex items-center space-x-3 min-w-0">
                      <img
                        src={artist.avatar}
                        alt={artist.name}
                        className="w-9 h-9 rounded-full object-cover border border-studio-border shrink-0"
                      />
                      <div className="min-w-0">
                        <h4 className="text-xs sm:text-sm font-bold text-studio-primary truncate">{artist.name}</h4>
                        <span className="text-[10px] text-studio-muted block truncate font-normal">ช่างสักประจำร้าน</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: 13-Hour Gantt Timeline Slot Area */}
                  <div className="flex-1 min-w-0 relative h-20 bg-studio-main/10 flex items-center">
                    
                    {/* Background Grid Lines */}
                    <div className="absolute inset-0 grid divide-x divide-studio-border/20 pointer-events-none" style={{ gridTemplateColumns: `repeat(${totalHours}, minmax(0, 1fr))` }}>
                      {Array.from({ length: totalHours }).map((_, i) => (
                        <div key={i} className="h-full" />
                      ))}
                    </div>

                    {/* Timeline Booking Bars */}
                    {artistBookings.map((booking) => {
                      const posStyle = getEventStyle(booking);

                      const statusKey = (booking.bookingStatus || booking.status) as any;
                      const statusConfig = getBookingStatusConfig(statusKey);

                      let badgeLabel = statusConfig.label;
                      let badgeStyle = `${statusConfig.bg} ${statusConfig.border} ${statusConfig.text}`;
                      let cardStyle = `${statusConfig.bg} ${statusConfig.border} text-studio-primary`;

                      if (booking.status === 'IN_PROGRESS') {
                        badgeLabel = 'กำลังสัก';
                        badgeStyle = 'bg-[#9C2F2F]/20 border-[#9C2F2F] text-[#9C2F2F] animate-pulse';
                        cardStyle = 'bg-[#9c2f2f]/20 border-[#9c2f2f] text-rose-200 ring-1 ring-[#9c2f2f]/40';
                      } else if (booking.status === 'COMPLETED') {
                        badgeLabel = 'เสร็จแล้ว';
                        badgeStyle = 'bg-[#171512] border-[#4A443A] text-[#A89F91]';
                        cardStyle = 'bg-[#171512] border-[#4A443A] text-[#A89F91] opacity-75';
                      }

                      const titleLabel = getEventTitle(booking);
                      const customerDisplayName = booking.customerName || booking.customerEmail;
                      const startTimeDisplay = booking.startTime.endsWith('น.') || booking.startTime.endsWith('น')
                        ? booking.startTime
                        : `${booking.startTime} น.`;

                      return (
                        <div
                          key={booking.id}
                          style={posStyle}
                          className={`absolute h-16 rounded-[4px] border p-1.5 flex flex-col justify-between overflow-hidden shadow-md cursor-pointer transition-all hover:scale-[1.01] z-10 ${cardStyle}`}
                        >
                          {/* Row 1: Title Label & Status Badge */}
                          <div className="flex justify-between items-start gap-1 min-w-0">
                            <span className="text-[11px] font-bold truncate leading-tight tracking-wide">
                              {titleLabel}
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase border shrink-0 ${badgeStyle}`}>
                              {badgeLabel}
                            </span>
                          </div>

                          {/* Row 2: Placement (if present) */}
                          {booking.placement && (
                            <div className="text-[10px] text-studio-muted truncate leading-tight">
                              {booking.placement}
                            </div>
                          )}

                          {/* Row 3: Time & Customer Name */}
                          <div className="flex justify-between items-center text-[10px] text-studio-secondary gap-1 truncate min-w-0">
                            <span className="truncate shrink-0 font-mono font-medium text-[#ECE4D3]">เวลานัด {startTimeDisplay}</span>
                            <span className="truncate text-studio-muted font-medium">• {customerDisplayName}</span>
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
