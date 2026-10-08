'use client';

import React from 'react';
import { CustomerPortalBooking, CustomerPortalEstimate } from './types';
import EstimateForm, { EstimateFormInitialData } from '../estimate/EstimateForm';

interface CustomerEditBookingModalProps {
  item: CustomerPortalBooking | CustomerPortalEstimate | any;
  type: 'estimate' | 'booking' | 'flash';
  onClose: () => void;
  onSuccess: () => void;
}

export default function CustomerEditBookingModal({
  item,
  type,
  onClose,
  onSuccess,
}: CustomerEditBookingModalProps) {
  const isBooking = type === 'booking';
  const booking = item as CustomerPortalBooking;
  const estimate = item as CustomerPortalEstimate;

  const initialData: EstimateFormInitialData = {
    targetId: item.id,
    artistId: isBooking ? booking.artist_id : (estimate.artist_id || ''),
    style: isBooking ? (booking.style || 'Fine Line') : (estimate.style || 'Fine Line'),
    placement: isBooking ? (booking.placement || '') : (estimate.placement || ''),
    width: isBooking ? (booking.width_cm || 10) : (estimate.width_cm || 10),
    height: isBooking ? (booking.height_cm || 10) : (estimate.height_cm || 10),
    sizeTier: isBooking ? (booking as any).estimated_size_tier : estimate.estimated_size_tier,
    preferredDate: isBooking ? booking.requested_date : (estimate.preferred_date || ''),
    preferredTime: isBooking ? booking.requested_start_time : (estimate.preferred_time || '10:00'),
    referenceImages: isBooking
      ? (booking.reference_images && booking.reference_images.length > 0
          ? booking.reference_images
          : (booking.artwork_image_url ? [booking.artwork_image_url] : []))
      : (estimate.reference_images || []),
    description: isBooking ? (booking.customer_note || booking.description || '') : (estimate.description || ''),
    hasMedicalCondition: isBooking ? booking.has_medical_condition : estimate.has_medical_condition,
    medicalConditionNote: isBooking ? (booking.medical_condition_note || '') : (estimate.medical_condition_note || ''),
    hasAllergy: isBooking ? booking.has_allergy : estimate.has_allergy,
    allergyNote: isBooking ? (booking.allergy_note || '') : (estimate.allergy_note || ''),
    workType: isBooking ? (booking.work_type as any) : (estimate.work_type as any),
    status: item.status,
  };

  const currentStatus = (item?.status || '').toUpperCase();
  const isAcceptedOrWaitingDeposit = currentStatus === 'ACCEPTED' || currentStatus === 'WAITING_DEPOSIT';

  if (isAcceptedOrWaitingDeposit) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-studio-main/90 backdrop-blur-sm overflow-y-auto font-prompt animate-fadeIn">
        <div className="w-full max-w-md bg-studio-card border border-studio-border p-6 rounded-[8px] shadow-2xl relative text-center space-y-4">
          <div className="p-3.5 bg-red-950/80 border border-red-800 text-red-200 rounded-xl text-xs font-medium leading-relaxed">
            ไม่สามารถแก้ไขคำขอได้หลังจากทางร้านรับคำขอแล้ว
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 bg-studio-main border border-studio-border text-studio-primary hover:border-studio-red text-xs font-bold rounded-[4px] transition-all cursor-pointer"
          >
            กลับไปหน้ารายละเอียดคำขอ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-studio-main/90 backdrop-blur-sm overflow-y-auto font-prompt animate-fadeIn">
      <div className="w-full max-w-4xl bg-studio-card border border-studio-border p-4 sm:p-6 rounded-[8px] shadow-2xl relative my-6 max-h-[92vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-xs text-studio-muted hover:text-studio-red font-bold p-1 z-10"
          title="ปิด"
        >
          ✕ ปิดหน้าต่าง
        </button>

        <EstimateForm
          mode="edit"
          initialData={initialData}
          onSuccess={onSuccess}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}
