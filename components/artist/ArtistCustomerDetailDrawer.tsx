'use client';

import React, { useState } from 'react';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import { formatThaiPhoneForDisplay } from '@/lib/phoneUtils';
import { formatDateBangkok, formatTimeBangkok, getBookingStatusConfig, getSessionStatusConfig } from '@/components/admin/calendar/calendarUtils';
import { 
  X, 
  User, 
  Phone, 
  Mail, 
  ShieldCheck, 
  ShieldAlert, 
  Calendar as CalendarIcon, 
  Clock, 
  Layers, 
  FileText, 
  ImageIcon, 
  ChevronRight,
  CheckCircle2,
  Sparkles,
  Inbox
} from 'lucide-react';

export interface ArtistCustomerDetail {
  user_id: string;
  display_name: string;
  phone?: string | null;
  email?: string | null;
  is_age_confirmed?: boolean;
  
  // Scoped strictly to current artist
  bookings: any[];
  sessions: any[];
  estimates: any[];
}

interface ArtistCustomerDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  customer: ArtistCustomerDetail | null;
}

export default function ArtistCustomerDetailDrawer({
  isOpen,
  onClose,
  customer,
}: ArtistCustomerDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<'bookings' | 'sessions' | 'estimates'>('bookings');

  if (!isOpen || !customer) return null;

  const phoneFormatted = customer.phone ? formatThaiPhoneForDisplay(customer.phone) : 'ไม่ระบุ';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-prompt">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-2xl bg-studio-main border-l border-studio-border shadow-2xl flex flex-col">
          {/* Drawer Header */}
          <div className="p-4 sm:p-6 bg-studio-card border-b border-studio-border flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-studio-red/20 border border-studio-red/40 flex items-center justify-center text-studio-red font-bold text-base">
                <User size={20} />
              </div>
              <div>
                <h2 className="text-lg font-heading font-semibold text-studio-primary">
                  {customer.display_name}
                </h2>
                <div className="flex items-center space-x-2 text-xs text-studio-secondary mt-0.5">
                  <span className="font-mono">{phoneFormatted}</span>
                  {customer.is_age_confirmed ? (
                    <span className="inline-flex items-center space-x-1 text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded text-[10px] border border-emerald-800/40">
                      <ShieldCheck size={11} />
                      <span>ยืนยันอายุแล้ว</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center space-x-1 text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded text-[10px] border border-amber-800/40">
                      <ShieldAlert size={11} />
                      <span>ยังไม่ยืนยันอายุ</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-studio-muted hover:text-studio-primary hover:bg-studio-sec rounded-lg transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Customer Summary Bar */}
          <div className="bg-studio-card/60 px-4 sm:px-6 py-3 border-b border-studio-border/60 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 rounded-lg bg-studio-sec/40 border border-studio-border/40">
              <div className="text-studio-muted text-[10px] uppercase">งานสัก / การจอง</div>
              <div className="text-base font-bold font-mono text-studio-primary mt-0.5">
                {customer.bookings.length}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-studio-sec/40 border border-studio-border/40">
              <div className="text-studio-muted text-[10px] uppercase">รอบการสัก</div>
              <div className="text-base font-bold font-mono text-studio-red mt-0.5">
                {customer.sessions.length}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-studio-sec/40 border border-studio-border/40">
              <div className="text-studio-muted text-[10px] uppercase">คำขอประเมินราคา</div>
              <div className="text-base font-bold font-mono text-amber-400 mt-0.5">
                {customer.estimates.length}
              </div>
            </div>
          </div>

          {/* Nav Tabs */}
          <div className="bg-studio-card border-b border-studio-border px-4 sm:px-6 flex space-x-2">
            <button
              onClick={() => setActiveTab('bookings')}
              className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'bookings'
                  ? 'border-studio-red text-studio-red'
                  : 'border-transparent text-studio-secondary hover:text-studio-primary'
              }`}
            >
              <CalendarIcon size={14} />
              <span>งานสัก ({customer.bookings.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('sessions')}
              className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'sessions'
                  ? 'border-studio-red text-studio-red'
                  : 'border-transparent text-studio-secondary hover:text-studio-primary'
              }`}
            >
              <Clock size={14} />
              <span>รอบสัก ({customer.sessions.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('estimates')}
              className={`py-3 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'estimates'
                  ? 'border-studio-red text-studio-red'
                  : 'border-transparent text-studio-secondary hover:text-studio-primary'
              }`}
            >
              <Inbox size={14} />
              <span>คำขอราคา ({customer.estimates.length})</span>
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {/* TAB 1: BOOKINGS */}
            {activeTab === 'bookings' && (
              <div className="space-y-4">
                {customer.bookings.length === 0 ? (
                  <div className="text-center py-10 bg-studio-card/40 border border-dashed border-studio-border rounded-xl p-6 text-studio-muted text-xs">
                    ยังไม่มีประวัติการจองงานสักกับช่างท่านนี้
                  </div>
                ) : (
                  customer.bookings.map((b: any) => {
                    const statusCfg = getBookingStatusConfig(b.status);
                    const refImages: string[] = b.reference_images?.length 
                      ? b.reference_images 
                      : (b.artwork_image_url ? [b.artwork_image_url] : []);

                    return (
                      <div
                        key={b.id}
                        className="bg-studio-card border border-studio-border p-4 rounded-xl space-y-3 shadow-md"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-mono font-bold text-studio-primary bg-studio-sec px-2 py-0.5 rounded border border-studio-border">
                                #{b.id.slice(0, 8)}
                              </span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                                {statusCfg.label}
                              </span>
                            </div>
                            <h4 className="text-sm font-semibold text-studio-primary pt-1">
                              {b.artwork_title || 'งานสัก Custom'}
                            </h4>
                          </div>

                          <div className="text-right">
                            <span className="text-[10px] text-studio-muted block">วันนัดหมาย</span>
                            <span className="text-xs font-mono text-studio-secondary">
                              {b.requested_date ? formatDateBangkok(b.requested_date) : 'ยังไม่ระบุ'}
                            </span>
                          </div>
                        </div>

                        {/* Details */}
                        <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-studio-border/60">
                          <div>
                            <span className="text-studio-muted">ตำแหน่ง: </span>
                            <span className="text-studio-primary font-medium">{b.placement || 'ไม่ระบุ'}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-studio-muted">ขนาด: </span>
                            <span className="font-mono text-studio-primary font-medium">
                              {b.width_cm && b.height_cm ? `${b.width_cm}x${b.height_cm} ซม.` : 'ไม่ระบุ'}
                            </span>
                          </div>
                        </div>

                        {b.description && (
                          <p className="text-xs text-studio-secondary bg-studio-sec/50 p-2.5 rounded border border-studio-border/60 leading-relaxed">
                            {b.description}
                          </p>
                        )}

                        {/* Reference Images */}
                        {refImages.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[11px] text-studio-secondary font-medium flex items-center space-x-1">
                              <ImageIcon size={13} className="text-studio-red" />
                              <span>ภาพอ้างอิง ({refImages.length})</span>
                            </span>
                            <div className="grid grid-cols-3 gap-2">
                              {refImages.map((imgSrc: string, idx: number) => (
                                <div key={idx} className="aspect-square rounded-lg bg-studio-main border border-studio-border overflow-hidden relative">
                                  <CustomerReferenceImage
                                    src={imgSrc}
                                    alt={`Ref image ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB 2: SESSIONS */}
            {activeTab === 'sessions' && (
              <div className="space-y-3">
                {customer.sessions.length === 0 ? (
                  <div className="text-center py-10 bg-studio-card/40 border border-dashed border-studio-border rounded-xl p-6 text-studio-muted text-xs">
                    ยังไม่มีประวัติตารางรอบสักกับช่างท่านนี้
                  </div>
                ) : (
                  customer.sessions.map((s: any) => {
                    const statusCfg = getSessionStatusConfig(s.status);
                    return (
                      <div
                        key={s.id}
                        className="bg-studio-card border border-studio-border p-4 rounded-xl space-y-2 shadow-md"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-mono font-bold text-studio-red bg-studio-red/10 px-2 py-0.5 rounded border border-studio-red/30">
                              รอบที่ {s.session_number || 1}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusCfg.badgeBg} ${statusCfg.badgeText} ${statusCfg.border}`}>
                              {statusCfg.label}
                            </span>
                          </div>
                        </div>

                        <div className="text-xs text-studio-primary font-medium flex items-center space-x-2 pt-1">
                          <Clock size={13} className="text-studio-muted" />
                          <span>
                            {formatDateBangkok(s.start_at)} · {formatTimeBangkok(s.start_at)} น.
                          </span>
                        </div>

                        {s.notes && (
                          <p className="text-xs text-studio-secondary bg-studio-sec/50 p-2 rounded border border-studio-border/60 font-mono">
                            {s.notes}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB 3: ESTIMATES */}
            {activeTab === 'estimates' && (
              <div className="space-y-4">
                {customer.estimates.length === 0 ? (
                  <div className="text-center py-10 bg-studio-card/40 border border-dashed border-studio-border rounded-xl p-6 text-studio-muted text-xs">
                    ยังไม่มีประวัติคำขอประเมินราคากับช่างท่านนี้
                  </div>
                ) : (
                  customer.estimates.map((e: any) => {
                    const refImages: string[] = e.reference_images || [];

                    return (
                      <div
                        key={e.id}
                        className="bg-studio-card border border-studio-border p-4 rounded-xl space-y-3 shadow-md"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-mono font-bold text-studio-primary bg-studio-sec px-2 py-0.5 rounded border border-studio-border">
                                REQ-{e.id.slice(0, 8).toUpperCase()}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full border bg-amber-950/60 text-amber-400 border-amber-800/60 font-medium">
                                {e.status}
                              </span>
                            </div>
                            <h4 className="text-sm font-semibold text-studio-primary pt-1">
                              {e.style || e.style_preference || 'งานสัก Custom'}
                            </h4>
                          </div>

                          <div className="text-right">
                            <span className="text-[10px] text-studio-muted block">ส่งเมื่อ</span>
                            <span className="text-xs font-mono text-studio-secondary">
                              {formatDateBangkok(e.created_at, true)}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-studio-border/60">
                          <div>
                            <span className="text-studio-muted">ตำแหน่ง: </span>
                            <span className="text-studio-primary font-medium">{e.placement || 'ไม่ระบุ'}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-studio-muted">ขนาด: </span>
                            <span className="font-mono text-studio-primary font-medium">
                              {e.width_cm && e.height_cm ? `${e.width_cm}x${e.height_cm} ซม.` : 'ไม่ระบุ'}
                            </span>
                          </div>
                        </div>

                        {e.description && (
                          <p className="text-xs text-studio-secondary bg-studio-sec/50 p-2.5 rounded border border-studio-border/60 leading-relaxed">
                            {e.description}
                          </p>
                        )}

                        {refImages.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[11px] text-studio-secondary font-medium flex items-center space-x-1">
                              <ImageIcon size={13} className="text-studio-red" />
                              <span>ภาพอ้างอิง ({refImages.length})</span>
                            </span>
                            <div className="grid grid-cols-3 gap-2">
                              {refImages.map((imgSrc: string, idx: number) => (
                                <div key={idx} className="aspect-square rounded-lg bg-studio-main border border-studio-border overflow-hidden relative">
                                  <CustomerReferenceImage
                                    src={imgSrc}
                                    alt={`Ref image ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
