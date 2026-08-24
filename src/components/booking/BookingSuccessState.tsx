'use client';

import { useRouter } from 'next/navigation';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { useBookingState } from './BookingStateProvider';

interface BookingSuccessStateProps {
  shopSlug: string;
}

export default function BookingSuccessState({ shopSlug }: BookingSuccessStateProps) {
  const router = useRouter();
  const { setSubmissionComplete } = useBookingState();

  const handleReturnToShop = () => {
    // Reset success mode before navigating so the guard resumes normal
    // validation for any fresh booking the customer starts next.
    setSubmissionComplete(false);
    router.push(`/book/${shopSlug}`);
  };

  return (
    <div className="max-w-2xl mx-auto w-full pt-8 md:pt-12 pb-20 px-4">
      <div className="bg-[#121212] border border-[#262626] rounded-3xl p-8 md:p-12 text-center flex flex-col items-center">
        <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-green-500" />
        </div>
        
        <h2 className="text-2xl md:text-3xl font-bold text-[#F5F5F5] mb-4">
          ส่งคำขอจองเรียบร้อยแล้ว
        </h2>
        
        <div className="text-[#A3A3A3] text-base md:text-lg mb-8 max-w-md space-y-2">
          <p>ช่างจะตรวจสอบรายละเอียดและติดต่อกลับเพื่อยืนยันคำขอ</p>
        </div>

        <div className="w-full max-w-sm space-y-4">
          <button
            onClick={handleReturnToShop}
            className="w-full py-4 text-center rounded-xl bg-[#FFFFFF] text-black hover:bg-[#E5E5E5] transition-colors font-medium shadow-[0_0_15px_rgba(255,255,255,0.1)] flex items-center justify-center gap-2"
          >
            กลับสู่หน้าหลักของร้าน
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

