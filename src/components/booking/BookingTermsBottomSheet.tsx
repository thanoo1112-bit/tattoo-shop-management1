'use client';

import { X } from 'lucide-react';
import BookingTermsContent from './BookingTermsContent';
import { useEffect, useState } from 'react';

interface BookingTermsBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BookingTermsBottomSheet({ isOpen, onClose }: BookingTermsBottomSheetProps) {
  const [isRendered, setIsRendered] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      // Small delay to allow DOM render before animating in
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    } else {
      setIsAnimating(false);
      // Wait for animation to finish before removing from DOM
      const timer = setTimeout(() => {
        setIsRendered(false);
      }, 300);
      document.body.style.overflow = '';
      return () => clearTimeout(timer);
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isRendered) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity duration-300 ${isAnimating ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      
      {/* Sheet */}
      <div 
        className={`relative w-full bg-[#121212] rounded-t-3xl border-t border-[#262626] flex flex-col shadow-2xl transition-transform duration-300 ease-out h-[80vh] ${isAnimating ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div className="flex items-center justify-between p-5 border-b border-[#262626]">
          <h2 className="text-xl font-semibold text-[#F5F5F5]">เงื่อนไขการจองคิว</h2>
          <button 
            onClick={onClose}
            className="p-2 -mr-2 text-[#737373] hover:text-[#F5F5F5] transition-colors rounded-full hover:bg-[#1A1A1A] bg-[#1A1A1A]"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-[#262626]">
          <BookingTermsContent />
        </div>
        
        <div className="p-6 border-t border-[#262626] bg-[#0A0A0A] pb-safe">
          <button
            onClick={onClose}
            className="w-full py-4 bg-[#F5F5F5] text-black rounded-xl font-medium hover:bg-[#E5E5E5] transition-colors active:scale-[0.98]"
          >
            รับทราบ
          </button>
        </div>
      </div>
    </div>
  );
}
