'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '../AppContext';
import BookingStepper from './BookingStepper';
import BookingCalendar from './BookingCalendar';
import TimeSlotPicker, { TimeSlot } from './TimeSlotPicker';
import BookingSummary from './BookingSummary';
import CustomerLoginModal from '../auth/CustomerLoginModal';
import { Artist } from '@/data/mockArtists';
import { CheckCircle2, ChevronRight, ChevronLeft, Calendar, ArrowRight, AlertTriangle, Loader2 } from 'lucide-react';

export interface BookingArtworkReference {
  id: string;
  title: string;
  artistId?: string;
  artistName?: string;
  style?: string;
  size?: string;
  price?: number;
  deposit?: number;
  duration?: number;
  image?: string;
  type?: string;
}

export interface BookingFlowProps {
  preselectedArtwork?: BookingArtworkReference | null;
  preselectedArtist?: Artist | null;
  estimateRequestId?: string;
  onSuccess?: (newBookingId: string) => void;
}

export default function BookingFlow({
  preselectedArtwork = null,
  preselectedArtist = null,
  estimateRequestId,
  onSuccess,
}: BookingFlowProps) {
  const {
    isLoggedIn,
    artists,
    addBookingRequest,
    bookingDraft,
    setBookingDraft,
  } = useApp();

  // Multi-step state: 1 = Artist/Artwork selection, 2 = Date, 3 = Time Slot, 4 = Summary, 5 = Success
  const [step, setStep] = useState(1);
  const activeArtists = React.useMemo(() => artists.filter(a => a.is_active === true), [artists]);
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(preselectedArtist || activeArtists[0] || null);
  const [selectedArtwork, setSelectedArtwork] = useState<BookingArtworkReference | null>(preselectedArtwork || null);
  const [estimateReqId, setEstimateReqId] = useState<string | undefined>(estimateRequestId);

  const [date, setDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);

  const [newBookingId, setNewBookingId] = useState('');
  const [showLogin, setShowLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 1. Sync from preselected props
  useEffect(() => {
    if (preselectedArtist) setSelectedArtist(preselectedArtist);
    if (preselectedArtwork) setSelectedArtwork(preselectedArtwork);
    if (estimateRequestId) setEstimateReqId(estimateRequestId);
  }, [preselectedArtist, preselectedArtwork, estimateRequestId]);

  // 2. Sync from Draft on mount
  useEffect(() => {
    if (bookingDraft) {
      if (bookingDraft.artistId) {
        const foundArtist = artists.find(a => a.id === bookingDraft.artistId);
        if (foundArtist) setSelectedArtist(foundArtist);
      }
      if (bookingDraft.artworkTitle) {
        setSelectedArtwork({
          id: 'custom-draft',
          title: bookingDraft.artworkTitle,
          artistId: bookingDraft.artistId || '',
          artistName: bookingDraft.artistName || '',
          style: 'Fine Line',
          size: '10x10 cm',
          price: bookingDraft.price || 5000,
          deposit: bookingDraft.deposit || 1500,
          duration: bookingDraft.duration || 3,
          image: bookingDraft.artworkImage || '',
          type: (bookingDraft.bookingType as any) || 'custom',
        });
      }
      if (bookingDraft.estimateRequestId) {
        setEstimateReqId(bookingDraft.estimateRequestId);
      }
      if (bookingDraft.date) setDate(bookingDraft.date);
      if (bookingDraft.startTime && bookingDraft.endTime && bookingDraft.duration) {
        setSelectedSlot({
          start: bookingDraft.startTime,
          end: bookingDraft.endTime,
          duration: bookingDraft.duration,
        });
      }
      if (bookingDraft.date && bookingDraft.startTime) {
        setStep(4);
      }
    }
  }, [bookingDraft, artists]);

  // Sync draft to context when logging out or changing steps
  const saveDraft = () => {
    setBookingDraft({
      artistId: selectedArtist?.id || '',
      artistName: selectedArtist?.name || '',
      artworkTitle: selectedArtwork?.title || 'ออกแบบใหม่เฉพาะบุคคล',
      artworkImage: selectedArtwork?.image || '',
      date,
      startTime: selectedSlot?.start || '',
      endTime: selectedSlot?.end || '',
      duration: selectedSlot?.duration || 2,
      price: selectedArtwork?.price || 5000,
      deposit: selectedArtwork?.deposit || 1500,
      bookingType: (selectedArtwork?.type as any) || 'custom',
      estimateRequestId: estimateReqId,
    });
  };

  const handleNextStep = () => {
    if (step === 1 && !selectedArtist) return;
    if (step === 2 && !date) return;
    if (step === 3 && !selectedSlot) return;

    setStep(step + 1);
  };

  const handlePrevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleFinalSubmit = async () => {
    if (!isLoggedIn) {
      saveDraft();
      setShowLogin(true);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const bId = await addBookingRequest({
        artistId: selectedArtist?.id || artists[0]?.id || '',
        artistName: selectedArtist?.name || artists[0]?.name || 'ช่างประจำร้าน',
        artworkTitle: selectedArtwork?.title || 'ออกแบบใหม่เฉพาะบุคคล',
        artworkImage: selectedArtwork?.image || '',
        date,
        startTime: selectedSlot?.start || '10:00',
        endTime: selectedSlot?.end || '12:00',
        duration: selectedSlot?.duration || 2,
        price: selectedArtwork?.price || 5000,
        deposit: selectedArtwork?.deposit || 1500,
        bookingType: (selectedArtwork?.type as any) || 'custom',
        estimateRequestId: estimateReqId,
        bookingSource: estimateReqId ? 'ESTIMATE' : 'FLASH',
      });

      setNewBookingId(bId);
      setStep(5);
      if (onSuccess) {
        onSuccess(bId);
      }
    } catch (err: any) {
      setError(err.message || 'เกิดข้อผิดพลาดในการส่งคำขอจองคิว');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = () => {
    setShowLogin(false);
  };

  const isArtistLocked = !!preselectedArtist || !!preselectedArtwork;

  return (
    <div className="w-full max-w-lg mx-auto py-4 animate-fadeIn">
      {step < 5 && <BookingStepper currentStep={step} />}

      {/* Step 1: Artist / Artwork Selection */}
      {step === 1 && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-studio-main border border-studio-border p-4 rounded-[6px] flex flex-col space-y-3">
            <span className="text-[10px] uppercase tracking-wider text-studio-muted font-bold block">
              เลือกช่างสักสำหรับบริการ
            </span>

            {isArtistLocked ? (
              <div className="p-3 bg-studio-card border border-studio-red/40 rounded-[4px] flex justify-between items-center">
                <div>
                  <h4 className="text-xs font-bold text-studio-primary">{selectedArtist?.name}</h4>
                  <span className="text-[9px] text-studio-red uppercase tracking-wider font-semibold">
                    {selectedArtist?.specialties && selectedArtist.specialties.length > 0
                      ? selectedArtist.specialties.join(' / ')
                      : selectedArtist?.specialty}
                  </span>
                </div>
                <span className="text-[9px] text-studio-muted italic">(ช่างสักถูกล็อคตามรายการงาน)</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {activeArtists.map((artist) => {
                  const isSelected = selectedArtist?.id === artist.id;
                  const specLabel = artist.specialties && artist.specialties.length > 0
                    ? artist.specialties.join(' / ')
                    : artist.specialty;
                  return (
                    <button
                      key={artist.id}
                      type="button"
                      onClick={() => setSelectedArtist(artist)}
                      className={`p-3 rounded-[4px] border text-left flex items-center justify-between transition-all duration-200 ${
                        isSelected
                          ? 'bg-studio-red/10 border-studio-red text-studio-red shadow-sm'
                          : 'bg-studio-card border-studio-border text-studio-secondary hover:border-studio-red/50'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <img
                          src={artist.avatar}
                          alt={artist.name}
                          className="w-9 h-9 rounded-full object-cover border border-studio-border"
                        />
                        <div>
                          <div className={`text-xs font-bold ${isSelected ? 'text-studio-primary' : 'text-studio-secondary'}`}>
                            {artist.name}
                          </div>
                          <div className="text-[9px] uppercase tracking-wider opacity-80">
                            {specLabel}
                          </div>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full bg-studio-red mr-2" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {selectedArtwork && (
            <div className="bg-studio-main border border-studio-border p-4 rounded-[6px] flex items-center space-x-4">
              <img
                src={selectedArtwork.image}
                alt={selectedArtwork.title}
                className="w-14 h-14 object-cover rounded-[4px] border border-studio-border"
              />
              <div className="flex-1">
                <span className="text-[9px] uppercase tracking-wider text-studio-red font-bold block">
                  {selectedArtwork.type === 'flash' ? 'Flash Design พร้อมสัก' : 'งาน Custom จากการประเมิน'}
                </span>
                <h4 className="text-xs font-bold text-studio-primary mt-0.5">{selectedArtwork.title}</h4>
                <p className="text-[10px] text-studio-secondary mt-0.5">
                  {selectedArtwork.price ? `ราคาค่าสัก: ฿${selectedArtwork.price.toLocaleString()} • ` : ''}
                  {selectedArtwork.deposit ? `มัดจำ: ฿${selectedArtwork.deposit.toLocaleString()}` : ''}
                  {!selectedArtwork.price && !selectedArtwork.deposit && selectedArtwork.style ? `สไตล์: ${selectedArtwork.style}` : ''}
                </p>
              </div>
            </div>
          )}

          <button
            onClick={handleNextStep}
            className="w-full bg-studio-red border border-studio-red text-studio-primary hover:bg-transparent hover:text-studio-red text-xs uppercase tracking-wider py-3.5 px-4 font-semibold transition-all duration-300 rounded-[4px] flex items-center justify-center space-x-2"
          >
            <span>ดำเนินการต่อ</span>
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Step 2: Date Picker */}
      {step === 2 && (
        <div className="space-y-6 animate-fadeIn">
          <BookingCalendar
            selectedDate={date}
            onDateSelect={(d) => {
              setDate(d);
              setSelectedSlot(null);
            }}
            artistWorkingDays={selectedArtist?.working_days || (selectedArtist as any)?.availability}
          />

          <div className="flex gap-4">
            <button
              onClick={handlePrevStep}
              className="flex-1 bg-transparent border border-studio-border text-studio-primary hover:border-studio-red py-3.5 text-xs font-semibold rounded-[4px]"
            >
              ย้อนกลับ
            </button>
            <button
              onClick={handleNextStep}
              disabled={!date}
              className="flex-1 bg-studio-red border border-studio-red text-studio-primary hover:bg-transparent hover:text-studio-red py-3.5 text-xs font-semibold rounded-[4px] disabled:opacity-40"
            >
              เลือกช่วงเวลา
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Time Slot Picker */}
      {step === 3 && (
        <div className="space-y-6 animate-fadeIn">
          <TimeSlotPicker
            selectedSlot={selectedSlot}
            onSlotSelect={setSelectedSlot}
            requiredDuration={selectedArtwork?.duration || 2}
            artistId={selectedArtist?.id}
            selectedDate={date}
          />

          <div className="flex gap-4">
            <button
              onClick={handlePrevStep}
              className="flex-1 bg-transparent border border-studio-border text-studio-primary hover:border-studio-red py-3.5 text-xs font-semibold rounded-[4px]"
            >
              ย้อนกลับ
            </button>
            <button
              onClick={handleNextStep}
              disabled={!selectedSlot}
              className="flex-1 bg-studio-red border border-studio-red text-studio-primary hover:bg-transparent hover:text-studio-red py-3.5 text-xs font-semibold rounded-[4px] disabled:opacity-40"
            >
              ตรวจสอบสรุปรายการ
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Summary & Submit */}
      {step === 4 && (
        <div className="space-y-6 animate-fadeIn">
          {error && (
            <div className="bg-red-950/40 border border-red-900/60 p-3 rounded-[4px] flex items-start space-x-2 text-xs text-red-400">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <BookingSummary
            artworkImage={selectedArtwork?.image}
            artworkTitle={selectedArtwork?.title}
            artistName={selectedArtist?.name || ''}
            date={date}
            startTime={selectedSlot?.start || ''}
            endTime={selectedSlot?.end || ''}
            duration={selectedSlot?.duration || 2}
            price={selectedArtwork?.price || 5000}
            deposit={selectedArtwork?.deposit || 1500}
            onSubmit={handleFinalSubmit}
            isLoading={loading}
          />

          <button
            onClick={handlePrevStep}
            disabled={loading}
            className="w-full bg-transparent border border-studio-border text-studio-secondary hover:text-studio-primary py-2 text-xs font-semibold rounded-[4px]"
          >
            ← ย้อนกลับไปแก้ไขวันและเวลา
          </button>
        </div>
      )}

      {/* Step 5: Success Banner */}
      {step === 5 && (
        <div className="bg-studio-card border border-studio-border p-6 rounded-[8px] text-center space-y-4 animate-fadeIn">
          <div className="w-12 h-12 bg-studio-red/20 text-studio-red rounded-full flex items-center justify-center mx-auto mb-2 border border-studio-red/30">
            <CheckCircle2 size={28} />
          </div>

          <h3 className="text-base font-bold text-studio-primary">
            ส่งคำขอจองคิวสำเร็จ (Pending Approval)
          </h3>

          <p className="text-xs text-studio-secondary max-w-sm mx-auto leading-relaxed">
            ระบบได้บันทึกคำขอจองคิวของคุณลงในฐานข้อมูลเรียบร้อยแล้ว ช่างสักจะทำการตรวจสอบและอนุมัติคิวเวลาตามลำดับ 
            คุณสามารถตรวจสอบสถานะการอนุมัติและชำระมัดจำได้ในหน้าต่างบริการของคุณ
          </p>

          <div className="pt-4 flex flex-col space-y-2">
            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  window.location.href = '/portal?tab=bookings';
                }
              }}
              className="w-full bg-studio-red border border-studio-red text-studio-primary hover:bg-studio-red/80 text-xs uppercase tracking-wider py-3.5 px-4 font-semibold rounded-[4px] transition-all"
            >
              ไปยังหน้ารายการคิวจองของฉัน
            </button>
          </div>
        </div>
      )}

      {/* Lazy Login Modal */}
      {showLogin && (
        <CustomerLoginModal
          onClose={() => setShowLogin(false)}
          onSuccess={handleLoginSuccess}
        />
      )}
    </div>
  );
}
