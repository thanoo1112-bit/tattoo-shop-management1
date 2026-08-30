'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ArrowLeft, User, PenTool, Calendar, MapPin, Tag, Palette, Scissors, Image as ImageIcon, X, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { ArtistBalanceVerificationCard } from './ArtistBalanceVerificationCard';
import { ProjectLifecycleCard } from '@/components/payments/ProjectLifecycleCard';
import { formatThaiDate, formatThaiTime } from '@/lib/dateUtils';

type ProjectReference = {
  id: string;
  storage_path: string;
  reference_type: string;
  signedUrl?: string;
  error?: boolean;
};

type TattooProject = {
  id: string;
  name: string;
  description: string;
  tattoo_style: string;
  body_placement: string;
  width_cm: number;
  height_cm: number;
  color_mode: string;
  work_type: string;
  references: ProjectReference[];
};

type BookingRequest = {
  id: string;
  requested_start_at: string;
  status: string;
  submitted_full_name: string;
  submitted_email: string | null;
  submitted_phone: string;
  health_note: string | null;
  is_first_tattoo: boolean | null;
  safety_notice_acknowledged: boolean | null;
  terms_accepted_at?: string | null;
  flash_design_id?: string | null;
  flash_booking_mode?: string | null;
  created_at: string;
  project: TattooProject | null;
};

type ArtistBookingRequestDetailProps = {
  request: BookingRequest;
};

const WORK_TYPE_MAP: Record<string, string> = {
  new_work: 'งานใหม่',
  extension: 'ต่อเติมลายเดิม',
  touch_up: 'เก็บงาน/เติมสี',
  cover_up: 'แก้/ทับลายเดิม',
  scar_cover: 'สักทับรอยแผลเป็น',
};

const COLOR_MODE_MAP: Record<string, string> = {
  black_grey: 'Black & Grey',
  color: 'Color',
};

const REF_TYPE_MAP: Record<string, string> = {
  real_area: 'รูปพื้นที่จริง',
  design_reference: 'รูปอ้างอิงแบบสัก',
};

export default function ArtistBookingRequestDetail({ request }: ArtistBookingRequestDetailProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const isFlash = !!request.flash_design_id;
  const project = request.project;
  const references = project?.references || [];

  // Group references
  const realAreaImages = references.filter((ref) => ref.reference_type === 'real_area');
  const designRefImages = references.filter((ref) => ref.reference_type === 'design_reference');

  // Unified list of images with valid signedUrl for Lightbox
  const lightboxImages = references.filter((ref) => ref.signedUrl && !ref.error);

  const getStatusBadge = (status: string) => {
    if (status === 'pending_review') {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#262626] text-[#F5F5F5] border border-[#262626]">
          รอตรวจสอบ
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#171717] text-[#A3A3A3]">
        {status}
      </span>
    );
  };

  // Lightbox Navigation
  const handlePrev = () => {
    if (activeImageIndex === null || lightboxImages.length === 0) return;
    setActiveImageIndex((prev) => (prev === 0 ? lightboxImages.length - 1 : (prev ?? 0) - 1));
  };

  const handleNext = () => {
    if (activeImageIndex === null || lightboxImages.length === 0) return;
    setActiveImageIndex((prev) => (prev === lightboxImages.length - 1 ? 0 : (prev ?? 0) + 1));
  };

  // Keyboard navigation listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!lightboxOpen || activeImageIndex === null) return;
      if (e.key === 'Escape') {
        setLightboxOpen(false);
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [lightboxOpen, activeImageIndex, lightboxImages.length]);

  // Body scroll lock
  useEffect(() => {
    if (lightboxOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [lightboxOpen]);

  // Open Lightbox for a specific image storage path
  const openImage = (storagePath: string) => {
    const index = lightboxImages.findIndex((img) => img.storage_path === storagePath);
    if (index !== -1) {
      setActiveImageIndex(index);
      setLightboxOpen(true);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
      {/* Back Button */}
      <div>
        <Link
          href="/artist/booking-requests"
          className="inline-flex items-center gap-2 text-sm text-[#A3A3A3] hover:text-[#F5F5F5] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          กลับไปคำขอจอง
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#262626] pb-5">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1 h-6 bg-[#FFFFFF] rounded-full" />
            <h1 className="text-2xl sm:text-3xl font-light text-[#F5F5F5] tracking-wide">คำขอจอง</h1>
          </div>
          <p className="text-sm text-[#737373]">ตรวจสอบรายละเอียดงานและข้อมูลที่ลูกค้าส่งมา</p>
        </div>
        <div className="self-start sm:self-center">
          {getStatusBadge(request.status)}
        </div>
      </div>

      {/* Row 1: Customer Info (8 cols) & Preferred Date/Time (4 cols) on Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Customer Info Card */}
        <section className="lg:col-span-8 bg-[#121212] border border-[#262626] rounded-xl p-6 flex flex-col justify-between shadow-sm">
          <div className="space-y-4 w-full">
            <div className="flex items-center gap-2.5 pb-3 border-b border-[#262626]">
              <User className="h-5 w-5 text-[#737373]" />
              <h2 className="text-base font-semibold text-[#F5F5F5] tracking-wide">ข้อมูลลูกค้า</h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <p className="text-xs text-[#737373] uppercase tracking-wider mb-1 font-medium">ชื่อ-นามสกุล</p>
                <p className="text-sm sm:text-base text-[#F5F5F5] font-medium">{request.submitted_full_name}</p>
              </div>
              <div>
                <p className="text-xs text-[#737373] uppercase tracking-wider mb-1 font-medium">เบอร์โทรศัพท์</p>
                <p className="text-sm sm:text-base text-[#F5F5F5] font-medium">{request.submitted_phone}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-[#737373] uppercase tracking-wider mb-1 font-medium">อีเมล</p>
                <p className="text-sm sm:text-base text-[#F5F5F5] font-medium">{request.submitted_email || 'ไม่ได้ระบุ'}</p>
              </div>
              
              {isFlash && request.terms_accepted_at && (
                <div className="sm:col-span-2 pt-3 border-t border-[#262626] flex items-center gap-2">
                  <span className="text-[#A3A3A3] text-sm">ความยินยอมในการใช้ข้อมูล:</span>
                  <span className="text-[#F5F5F5] text-sm font-medium">ยินยอมแล้ว</span>
                </div>
              )}
            </div>

            {!isFlash && request.health_note && (
              <div className="pt-3 border-t border-[#262626]">
                <p className="text-xs text-[#737373] uppercase tracking-wider mb-1 font-medium">ข้อมูลที่แจ้งช่างเพิ่มเติม</p>
                <p className="text-sm text-[#F5F5F5] whitespace-pre-wrap leading-relaxed">
                  {request.health_note}
                </p>
              </div>
            )}

            {!isFlash && (request.is_first_tattoo !== null || request.safety_notice_acknowledged !== null) && (
              <div className="pt-3 border-t border-[#262626]">
                <p className="text-xs text-[#737373] uppercase tracking-wider mb-2 font-medium">ข้อมูลสุขภาพและการสัก</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[#A3A3A3] text-sm">สักครั้งแรก:</span>
                    <span className="text-[#F5F5F5] text-sm">
                      {request.is_first_tattoo === null ? 'ไม่มีข้อมูล' : (request.is_first_tattoo ? 'ใช่' : 'ไม่ใช่')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[#A3A3A3] text-sm">ข้อมูลด้านความปลอดภัย:</span>
                    <span className="text-[#F5F5F5] text-sm">
                      {request.safety_notice_acknowledged === null ? 'ไม่มีข้อมูล' : (request.safety_notice_acknowledged ? 'รับทราบข้อมูลด้านความปลอดภัยแล้ว' : 'ไม่ได้รับทราบ')}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Preferred Date/Time Card */}
        <section className="lg:col-span-4 bg-[#121212] border border-[#262626] rounded-xl p-6 flex flex-col justify-between shadow-sm">
          <div className="space-y-4 h-full flex flex-col justify-between">
            <div className="w-full">
              <div className="flex items-center gap-2.5 pb-3 border-b border-[#262626] mb-4">
                <Calendar className="h-5 w-5 text-[#737373]" />
                <h2 className="text-base font-semibold text-[#F5F5F5] tracking-wide">วันที่และเวลาที่สะดวก</h2>
              </div>
              
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-[#737373] uppercase tracking-wider mb-1 font-medium">วันที่สะดวก</p>
                  <p className="text-base sm:text-lg text-[#F5F5F5] font-semibold">
                    {formatThaiDate(request.requested_start_at, { longMonth: true })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#737373] uppercase tracking-wider mb-1 font-medium">เวลาที่สะดวก</p>
                  <p className="text-base sm:text-lg text-[#F5F5F5] font-semibold">
                    {formatThaiTime(request.requested_start_at)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Row 2: Tattoo Specs Card (Full Width) */}
      <section className="w-full bg-[#121212] border border-[#262626] rounded-xl p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2.5 pb-3 border-b border-[#262626]">
          <PenTool className="h-5 w-5 text-[#737373]" />
          <h2 className="text-base font-semibold text-[#F5F5F5] tracking-wide">รายละเอียดงาน</h2>
        </div>

        {project ? (
          <div className="space-y-6">
            {/* Grid 1: Style, Work Type, Color (3 cols) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <p className="text-xs text-[#737373] uppercase tracking-wider mb-1.5 font-medium">สไตล์</p>
                <div className="flex items-center gap-2 text-sm sm:text-base text-[#F5F5F5] font-medium">
                  <Tag className="h-4 w-4 text-[#737373] flex-shrink-0" />
                  <span>{project.tattoo_style || 'ไม่ระบุ'}</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-[#737373] uppercase tracking-wider mb-1.5 font-medium">ประเภทงาน</p>
                <div className="flex items-center gap-2 text-sm sm:text-base text-[#F5F5F5] font-medium">
                  <Scissors className="h-4 w-4 text-[#737373] flex-shrink-0" />
                  <span>{WORK_TYPE_MAP[project.work_type] || project.work_type}</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-[#737373] uppercase tracking-wider mb-1.5 font-medium">สี</p>
                <div className="flex items-center gap-2 text-sm sm:text-base text-[#F5F5F5] font-medium">
                  <Palette className="h-4 w-4 text-[#737373] flex-shrink-0" />
                  <span>{COLOR_MODE_MAP[project.color_mode] || project.color_mode}</span>
                </div>
              </div>
            </div>

            {/* Grid 2: Size, Placement (2 cols) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-3 border-t border-[#262626]/40">
              <div>
                <p className="text-xs text-[#737373] uppercase tracking-wider mb-1.5 font-medium">ขนาด</p>
                <p className="text-sm sm:text-base text-[#F5F5F5] font-medium">
                  {project.width_cm && project.height_cm 
                    ? `กว้าง ${project.width_cm} ซม. × สูง ${project.height_cm} ซม.` 
                    : 'ไม่ระบุ'}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#737373] uppercase tracking-wider mb-1.5 font-medium">ตำแหน่งร่างกาย</p>
                <div className="flex items-center gap-2 text-sm sm:text-base text-[#F5F5F5] font-medium">
                  <MapPin className="h-4 w-4 text-[#737373] flex-shrink-0" />
                  <span>{project.body_placement || 'ไม่ระบุ'}</span>
                </div>
              </div>
            </div>

            {/* Description (Full Width) */}
            <div className="pt-3 border-t border-[#262626]">
              <p className="text-xs text-[#737373] uppercase tracking-wider mb-1.5 font-medium">รายละเอียด/แนวคิดงาน</p>
              <p className="text-sm sm:text-base text-[#F5F5F5] whitespace-pre-wrap leading-relaxed font-medium">
                {project.description || 'ไม่มีรายละเอียดเพิ่มเติม'}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#737373] italic">ไม่มีรายละเอียดงานสัก</p>
        )}
      </section>
      {/* Row 3: Balance + Project Lifecycle Cards */}
      {project && (
        <div className="space-y-6">
          <ArtistBalanceVerificationCard projectId={project.id} bookingRequestId={request.id} />
          <ProjectLifecycleCard projectId={project.id} bookingRequestId={request.id} />
        </div>
      )}

      {/* Row 4: Image References Section (Full Width) */}
      {references.length > 0 && (
        <div id="images" className="space-y-6 pt-4">
          <div className="flex items-center gap-3 border-b border-[#262626] pb-3">
            <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
            <h2 className="text-lg font-medium text-[#F3F3F3] tracking-wide">รูปภาพแนบจากลูกค้า</h2>
          </div>

          {/* Conditional side-by-side layout for Desktop when both categories exist */}
          <div className={`grid grid-cols-1 ${realAreaImages.length > 0 && designRefImages.length > 0 ? 'lg:grid-cols-2 gap-8' : 'gap-6'}`}>
            {/* Group 1: Real Area Photos */}
            {realAreaImages.length > 0 && (
              <div className="space-y-3 bg-[#121212] border border-[#262626] rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-[#A3A3A3] pb-2 border-b border-[#262626]/40 mb-3 flex items-center justify-between">
                  <span>รูปพื้นที่จริง</span>
                  <span className="text-xs font-normal text-[#737373] bg-[#171717] px-2 py-0.5 rounded-full border border-[#262626]">
                    {realAreaImages.length} รูป
                  </span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {realAreaImages.map((photo) => (
                    <div key={photo.id} className="relative group aspect-square rounded-lg border border-[#262626] overflow-hidden bg-[#171717] shadow-sm">
                      {photo.error || !photo.signedUrl ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                          <AlertCircle className="h-5 w-5 text-red-500 mb-1" />
                          <span className="text-[10px] text-[#737373]">ไม่สามารถโหลดรูปได้</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => openImage(photo.storage_path)}
                          className="absolute inset-0 w-full h-full text-left"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.signedUrl}
                            alt="พื้นที่จริง"
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-[#000000]/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                            <span className="text-xs font-medium text-[#F5F5F5] flex items-center gap-1.5">
                              <ImageIcon className="h-4 w-4" />
                              ดูภาพ
                            </span>
                          </div>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Group 2: Design Reference Photos */}
            {designRefImages.length > 0 && (
              <div className="space-y-3 bg-[#121212] border border-[#262626] rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-[#A3A3A3] pb-2 border-b border-[#262626]/40 mb-3 flex items-center justify-between">
                  <span>รูปอ้างอิงแบบสัก</span>
                  <span className="text-xs font-normal text-[#737373] bg-[#171717] px-2 py-0.5 rounded-full border border-[#262626]">
                    {designRefImages.length} รูป
                  </span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {designRefImages.map((photo) => (
                    <div key={photo.id} className="relative group aspect-square rounded-lg border border-[#262626] overflow-hidden bg-[#171717] shadow-sm">
                      {photo.error || !photo.signedUrl ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                          <AlertCircle className="h-5 w-5 text-red-500 mb-1" />
                          <span className="text-[10px] text-[#737373]">ไม่สามารถโหลดรูปได้</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => openImage(photo.storage_path)}
                          className="absolute inset-0 w-full h-full text-left"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.signedUrl}
                            alt="แบบสักอ้างอิง"
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-[#000000]/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                            <span className="text-xs font-medium text-[#F5F5F5] flex items-center gap-1.5">
                              <ImageIcon className="h-4 w-4" />
                              ดูภาพ
                            </span>
                          </div>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {mounted && lightboxOpen && activeImageIndex !== null && lightboxImages.length > 0 && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/94 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setLightboxOpen(false)}
        >
          {/* Close Button */}
          <button
            onClick={() => setLightboxOpen(false)}
            className="fixed top-[calc(env(safe-area-inset-top)+16px)] right-4 md:top-6 md:right-6 p-2 rounded-full bg-black/40 border border-white/12 text-white/85 hover:text-white hover:bg-black/65 transition-all z-[10000] focus:outline-none w-11 h-11 flex items-center justify-center"
            aria-label="ปิดรูปภาพ"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Large Image Container */}
          <div
            className="relative max-w-full max-h-full p-4 flex flex-col items-center justify-center z-40"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image Stage (Relative Flex container hosting the buttons and active image) */}
            <div className="relative w-[calc(100vw-32px)] h-[calc(100dvh-210px)] md:w-[min(72vw,1100px)] md:h-[80dvh] flex items-center justify-center rounded overflow-hidden">
              {/* Prev Button (Positioned relative to Image Stage) */}
              {lightboxImages.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrev();
                  }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/35 border border-white/10 text-white/85 hover:text-white hover:bg-black/60 transition-all z-50 focus:outline-none w-11 h-11 flex items-center justify-center"
                  aria-label="รูปก่อนหน้า"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightboxImages[activeImageIndex].signedUrl}
                alt={`รูปภาพประกอบที่ ${activeImageIndex + 1}`}
                className="max-w-full max-h-full md:max-w-full md:max-h-[80dvh] object-contain rounded"
              />

              {/* Next Button (Positioned relative to Image Stage) */}
              {lightboxImages.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNext();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/35 border border-white/10 text-white/85 hover:text-white hover:bg-black/60 transition-all z-50 focus:outline-none w-11 h-11 flex items-center justify-center"
                  aria-label="รูปถัดไป"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Category Label and Counter */}
            <div className="mt-4 flex flex-col items-center gap-1.5">
              <span className="text-xs text-[#737373] uppercase tracking-wider font-semibold">
                {REF_TYPE_MAP[lightboxImages[activeImageIndex].reference_type] || lightboxImages[activeImageIndex].reference_type}
              </span>
              <div className="px-3 py-1.5 rounded-full bg-[#121212]/80 border border-[#262626] text-xs font-medium text-[#A3A3A3]">
                {activeImageIndex + 1} / {lightboxImages.length}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
