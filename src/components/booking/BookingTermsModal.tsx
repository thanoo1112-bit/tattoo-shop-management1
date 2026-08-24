'use client';

import { X } from 'lucide-react';
import BookingTermsContent from './BookingTermsContent';

interface BookingTermsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BookingTermsModal({ isOpen, onClose }: BookingTermsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div 
        className="bg-[#121212] border border-[#262626] rounded-2xl w-full max-w-lg overflow-hidden flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-[#262626]">
          <h2 className="text-xl font-semibold text-[#F5F5F5]">เงื่อนไขการจองคิว</h2>
          <button 
            onClick={onClose}
            className="p-2 -mr-2 text-[#737373] hover:text-[#F5F5F5] transition-colors rounded-full hover:bg-[#1A1A1A]"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[60vh] scrollbar-thin scrollbar-thumb-[#262626]">
          <BookingTermsContent />
        </div>
        
        <div className="p-6 border-t border-[#262626] bg-[#0A0A0A]">
          <button
            onClick={onClose}
            className="w-full py-3.5 bg-[#F5F5F5] text-black rounded-xl font-medium hover:bg-[#E5E5E5] transition-colors"
          >
            รับทราบ
          </button>
        </div>
      </div>
    </div>
  );
}
