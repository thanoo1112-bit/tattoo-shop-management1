'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '../AppContext';
import ReferenceUploader from './ReferenceUploader';
import TattooSizeInput from './TattooSizeInput';
import PlacementSelector from './PlacementSelector';
import CustomerLoginModal from '../auth/CustomerLoginModal';
import { CheckCircle2, AlertCircle, Loader2, Sparkles, User, Calendar, Image as ImageIcon, Send } from 'lucide-react';

interface EstimateFormProps {
  initialArtistId?: string;
  preselectedArtistId?: string;
  preselectedArtworkImage?: string;
  preselectedStyle?: string;
  compact?: boolean;
  onSuccess?: (requestId: string) => void;
}

// Helper to extract clean specialties array from artist object
const getArtistSpecialties = (art?: any): string[] => {
  if (!art) return [];
  if (Array.isArray(art.specialties) && art.specialties.length > 0) {
    return art.specialties.map((s: string) => s.trim()).filter(Boolean);
  }
  if (typeof art.specialty === 'string' && art.specialty.trim()) {
    return art.specialty.split('/').map((s: string) => s.trim()).filter(Boolean);
  }
  return [];
};

export default function EstimateForm({ 
  initialArtistId = '', 
  preselectedArtistId,
  preselectedArtworkImage,
  preselectedStyle,
  compact = false,
  onSuccess 
}: EstimateFormProps) {
  const { 
    artists, 
    isLoggedIn, 
    addEstimateRequest, 
    estimateDraft, 
    setEstimateDraft 
  } = useApp();

  const [artistId, setArtistId] = useState(preselectedArtistId || initialArtistId || '');
  const [referenceImage, setReferenceImage] = useState(preselectedArtworkImage || '');
  const [width, setWidth] = useState(10);
  const [height, setHeight] = useState(10);
  const [placement, setPlacement] = useState('ท่อนแขน (Forearm)');
  const [style, setStyle] = useState(preselectedStyle || '');
  const [description, setDescription] = useState('');
  const [preferredDate, setPreferredDate] = useState('');

  const [submitted, setSubmitted] = useState(false);
  const [newRequestId, setNewRequestId] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 1. Sync from Draft on mount if draft exists
  useEffect(() => {
    if (estimateDraft) {
      if (estimateDraft.artistId) setArtistId(estimateDraft.artistId);
      if (estimateDraft.referenceImage) setReferenceImage(estimateDraft.referenceImage);
      if (estimateDraft.width) setWidth(estimateDraft.width);
      if (estimateDraft.height) setHeight(estimateDraft.height);
      if (estimateDraft.placement) setPlacement(estimateDraft.placement);
      if (estimateDraft.style) setStyle(estimateDraft.style);
      if (estimateDraft.description) setDescription(estimateDraft.description);
      if (estimateDraft.preferredDate) setPreferredDate(estimateDraft.preferredDate);
      
      setEstimateDraft(null);
    }
  }, [estimateDraft, setEstimateDraft]);

  // Sync preselected artist/style
  useEffect(() => {
    if (preselectedArtistId) {
      setArtistId(preselectedArtistId);
      const targetArtist = artists.find((a) => a.id === preselectedArtistId);
      const availableStyles = getArtistSpecialties(targetArtist);
      if (preselectedStyle && availableStyles.includes(preselectedStyle)) {
        setStyle(preselectedStyle);
      } else {
        setStyle('');
      }
    }
  }, [preselectedArtistId, preselectedStyle, artists]);

  const handleArtistSelect = (selectedId: string) => {
    if (selectedId === artistId) return;
    setArtistId(selectedId);
    const targetArtist = artists.find((a) => a.id === selectedId);
    const availableStyles = getArtistSpecialties(targetArtist);
    if (!style || !availableStyles.includes(style)) {
      setStyle('');
    }
    setError('');
  };

  const saveDraft = () => {
    setEstimateDraft({
      artistId,
      referenceImage,
      width,
      height,
      placement,
      style,
      description,
      preferredDate: preferredDate || undefined,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!artistId) {
      setError('กรุณาเลือกช่างสักที่ต้องการ');
      return;
    }

    if (!style) {
      setError('กรุณาเลือกสไตล์งานสัก');
      return;
    }

    const selectedArtistObj = artists.find((a) => a.id === artistId);
    const availableStyles = getArtistSpecialties(selectedArtistObj);
    if (!availableStyles.includes(style)) {
      setError('สไตล์งานสักที่เลือกไม่ตรงกับช่างสัก กรุณาเลือกใหม่');
      return;
    }

    if (!isLoggedIn) {
      saveDraft();
      setShowLogin(true);
      return;
    }

    setLoading(true);

    const artistName = selectedArtistObj ? selectedArtistObj.name : 'ช่างประจำร้าน';

    try {
      const resId = await addEstimateRequest({
        artistId,
        artistName,
        referenceImage: referenceImage || 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=800',
        width,
        height,
        placement,
        style,
        description,
        preferredDate: preferredDate || undefined,
      });

      setNewRequestId(resId);
      setSubmitted(true);
      if (onSuccess) onSuccess(resId);
    } catch (err: any) {
      setError(err?.message || 'เกิดข้อผิดพลาดในการส่งคำขอประเมินราคา กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = () => {
    setShowLogin(false);
  };

  if (submitted) {
    return (
      <div className="bg-studio-card border border-studio-border p-6 sm:p-8 rounded-[8px] text-center space-y-4 font-prompt">
        <div className="w-12 h-12 bg-green-500/10 border border-green-500/30 text-green-500 rounded-full flex items-center justify-center mx-auto mb-2">
          <CheckCircle2 size={24} />
        </div>
        <h3 className="text-lg font-bold text-studio-primary">ส่งคำขอประเมินราคาเรียบร้อยแล้ว</h3>
        <p className="text-xs text-studio-secondary leading-relaxed">
          รหัสคำขอ: <strong className="text-studio-red font-mono">#{newRequestId.slice(0, 8).toUpperCase()}</strong>
        </p>
        <p className="text-xs text-studio-secondary mb-6 leading-relaxed">
          ช่างสักได้รับข้อมูลของท่านในระบบเรียบร้อยแล้ว โดยคุณสามารถตรวจสอบคิว และตอบรับราคาประเมินของช่างได้ที่หน้าบริการลูกค้า
        </p>
        <button
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.location.href = '/portal?tab=estimates';
            }
          }}
          className="min-h-[44px] w-full bg-studio-red hover:bg-[#802222] text-studio-paper text-xs uppercase tracking-wider py-3 px-4 font-semibold transition-all rounded-[4px] border border-studio-red"
        >
          ไปที่หน้ารายการประเมินราคา (Portal)
        </button>
      </div>
    );
  }

  const selectedArtist = artists.find((a) => a.id === artistId);
  const artistSpecialties = getArtistSpecialties(selectedArtist);

  return (
    <div className={`w-full mx-auto space-y-5 animate-fadeIn font-prompt ${compact ? '' : 'max-w-4xl'}`}>
      
      {/* Header Banner */}
      {compact ? (
        <div className="border-b border-studio-border pb-3 mb-2">
          <div className="flex items-center space-x-1.5 text-studio-red text-[10px] uppercase tracking-widest font-bold mb-0.5">
            <Sparkles size={12} />
            <span>Custom Tattoo Estimate</span>
          </div>
          <h3 className="text-base sm:text-lg font-bold tracking-wide text-studio-primary">
            แบบฟอร์มขอประเมินราคางานสัก
          </h3>
          <p className="text-xs text-studio-secondary mt-0.5 font-light">
            ส่งภาพอ้างอิง ขนาด และตำแหน่ง เพื่อให้ช่างคำนวณระยะเวลาและประเมินราคา
          </p>
        </div>
      ) : (
        <div className="bg-studio-card border border-studio-border p-5 sm:p-6 rounded-[8px]">
          <div className="flex items-center space-x-2 text-studio-red text-xs uppercase tracking-widest font-heading font-normal mb-1">
            <Sparkles size={14} />
            <span>Custom Tattoo Estimate Request</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-heading font-normal tracking-wide text-studio-primary">
            แบบฟอร์มขอประเมินราคางานสัก (ESTIMATE SHEET)
          </h2>
          <p className="text-xs text-studio-secondary mt-1 font-light">
            ส่งภาพอ้างอิง ขนาด ตำแหน่ง และช่างสักที่ต้องการ เพื่อให้ช่างคำนวณระยะเวลาสักและประเมินราคาก่อนเริ่มจองคิว
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-950/40 border border-red-900/60 p-3.5 rounded-[6px] flex items-start space-x-3 text-xs text-red-400">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Form Container */}
      <form 
        onSubmit={handleSubmit} 
        className={compact 
          ? "space-y-6 w-full" 
          : "bg-studio-card border border-studio-border p-5 sm:p-8 rounded-[8px] space-y-8 shadow-xl"
        }
      >
        
        <div className={compact ? "space-y-6 w-full" : "grid grid-cols-1 lg:grid-cols-12 gap-8"}>
          
          {/* Reference Image Upload */}
          <div className={compact ? "space-y-4 w-full" : "lg:col-span-5 space-y-4"}>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-2 font-semibold flex items-center gap-1.5">
                <ImageIcon size={14} className="text-studio-red" />
                <span>ภาพตัวอย่าง / ลายที่สนใจ (Reference)</span>
              </label>
              <ReferenceUploader
                value={referenceImage}
                onChange={setReferenceImage}
              />
            </div>
          </div>

          {/* Artist Selection, Details, Size */}
          <div className={compact ? "space-y-5 w-full" : "lg:col-span-7 space-y-6"}>
            
            {/* 1. Artist Selection */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-2 font-semibold flex items-center gap-1.5">
                <User size={14} className="text-studio-red" />
                <span>1. เลือกช่างสักที่ต้องการ</span>
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {artists.map((art) => {
                  const specs = getArtistSpecialties(art);
                  const specsLabel = specs.length > 0 ? specs.join(' / ') : 'ช่างประจำร้าน';
                  return (
                    <button
                      key={art.id}
                      type="button"
                      onClick={() => handleArtistSelect(art.id)}
                      className={`p-2.5 rounded-[4px] border text-left flex items-center space-x-2.5 transition-all min-w-0 ${
                        artistId === art.id 
                          ? 'border-studio-red bg-studio-sec shadow-inner' 
                          : 'border-studio-border hover:border-studio-border/80 bg-studio-main/60'
                      }`}
                    >
                      <img src={art.avatar} alt={art.name} className="w-8 h-8 object-cover rounded-full shrink-0 border border-studio-border" />
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-semibold text-studio-primary truncate">{art.name}</h4>
                        <p className="text-[10px] text-studio-secondary truncate">{specsLabel}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Style */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
                2. สไตล์งานสัก <span className="text-studio-red">*</span>
              </label>
              {artists.length === 0 ? (
                <select
                  disabled
                  className="w-full min-h-[44px] bg-studio-main border border-studio-border text-xs text-studio-muted px-3 py-2 outline-none rounded-[4px] cursor-not-allowed opacity-60"
                >
                  <option value="">กำลังโหลดสไตล์ของช่าง...</option>
                </select>
              ) : !artistId ? (
                <select
                  disabled
                  className="w-full min-h-[44px] bg-studio-main border border-studio-border text-xs text-studio-muted px-3 py-2 outline-none rounded-[4px] cursor-not-allowed opacity-60"
                >
                  <option value="">กรุณาเลือกช่างก่อน</option>
                </select>
              ) : artistSpecialties.length === 0 ? (
                <div className="space-y-1">
                  <select
                    disabled
                    className="w-full min-h-[44px] bg-studio-main border border-studio-border text-xs text-studio-muted px-3 py-2 outline-none rounded-[4px] cursor-not-allowed opacity-60"
                  >
                    <option value="">ยังไม่มีข้อมูลสไตล์งานของช่างคนนี้</option>
                  </select>
                  <span className="text-[10px] text-amber-400 block">
                    ยังไม่มีข้อมูลสไตล์งานของช่างคนนี้
                  </span>
                </div>
              ) : (
                <select
                  value={style}
                  onChange={(e) => {
                    setStyle(e.target.value);
                    setError('');
                  }}
                  className="w-full min-h-[44px] bg-studio-main border border-studio-border focus:border-studio-red text-xs text-studio-primary px-3 py-2 outline-none rounded-[4px] cursor-pointer"
                >
                  <option value="">เลือกสไตล์งานสัก</option>
                  {artistSpecialties.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* 3. Placement */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
                3. ตำแหน่งบนร่างกาย
              </label>
              <PlacementSelector
                value={placement}
                onChange={setPlacement}
              />
            </div>

            {/* 4. Size Input */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
                4. ขนาดของงานสัก (เซนติเมตร)
              </label>
              <TattooSizeInput
                width={width}
                height={height}
                onWidthChange={setWidth}
                onHeightChange={setHeight}
              />
            </div>

            {/* 5. Description */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold">
                5. รายละเอียดเพิ่มเติมที่ต้องการบอกช่าง
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="เช่น ต้องการปรับเพิ่มดอกไม้, มีรอยสักเดิมทับ, ต้องการโทนเงาเข้ม..."
                rows={3}
                className="w-full bg-studio-main border border-studio-border focus:border-studio-red text-xs text-studio-primary p-3 outline-none rounded-[4px] resize-none"
              />
            </div>

            {/* 6. Preferred Date */}
            <div>
              <label className="text-[11px] uppercase tracking-wider text-studio-secondary block mb-1.5 font-semibold flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} className="text-studio-red" />
                  <span>6. วันที่สนใจเข้ารับบริการ (ทางเลือก / Optional)</span>
                </span>
              </label>
              <input
                type="date"
                value={preferredDate}
                onChange={(e) => setPreferredDate(e.target.value)}
                className="w-full min-h-[44px] bg-studio-main border border-studio-border focus:border-studio-red text-xs text-studio-primary px-3.5 py-2 outline-none rounded-[4px] [color-scheme:dark]"
              />
            </div>

          </div>

        </div>

        {/* Bottom Sticky / Summary Bar */}
        <div className="border-t border-studio-border pt-4 flex flex-col sm:flex-row justify-between items-center gap-3 bg-studio-sec p-3.5 rounded-[6px] border border-studio-border/60">
          <div className="text-xs text-studio-secondary space-y-0.5">
            <div>ช่าง: <strong className="text-studio-primary">{selectedArtist?.name || 'ยังไม่เลือกช่าง'}</strong> • สไตล์: <strong className="text-studio-primary">{style || 'ยังไม่เลือกสไตล์'}</strong></div>
            <div className="text-[11px]">ขนาด: <strong className="text-studio-red">{width}×{height} ซม.</strong> • ตำแหน่ง: <strong className="text-studio-primary">{placement}</strong></div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto min-h-[48px] bg-studio-red hover:bg-tattoo-red-dark text-studio-paper text-xs uppercase tracking-wider font-semibold py-3.5 px-8 rounded-[4px] transition-all border border-studio-red flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={15} className="mr-2 animate-spin" />
                กำลังส่งคำขอ...
              </>
            ) : (
              <>
                <Send size={14} className="mr-2" />
                <span>ส่งคำขอประเมินราคา</span>
              </>
            )}
          </button>
        </div>

      </form>

      {/* Lazy Auth Pop-up */}
      {showLogin && (
        <CustomerLoginModal
          onClose={() => setShowLogin(false)}
          onSuccess={handleLoginSuccess}
        />
      )}
    </div>
  );
}
