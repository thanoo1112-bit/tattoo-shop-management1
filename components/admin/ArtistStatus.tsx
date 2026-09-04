'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Artist } from '@/data/mockArtists';
import { ChevronDown, Check } from 'lucide-react';

interface ArtistStatusProps {
  status: Artist['status'];
  onChange?: (status: Artist['status']) => void;
  readOnly?: boolean;
}

export default function ArtistStatus({ status, onChange, readOnly = false }: ArtistStatusProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const statusConfig: Record<string, { label: string; dotColor: string; badge: string }> = {
    Available: {
      label: 'ว่าง',
      dotColor: 'bg-[#4E9F6E]',
      badge: 'bg-[#171512] border-[#4A443A] text-[#ECE4D3]',
    },
    AVAILABLE: {
      label: 'ว่าง',
      dotColor: 'bg-[#4E9F6E]',
      badge: 'bg-[#171512] border-[#4A443A] text-[#ECE4D3]',
    },
    Tattooing: {
      label: 'กำลังสัก',
      dotColor: 'bg-[#9C2F2F]',
      badge: 'bg-[#171512] border-[#4A443A] text-[#ECE4D3]',
    },
    TATTOOING: {
      label: 'กำลังสัก',
      dotColor: 'bg-[#9C2F2F]',
      badge: 'bg-[#171512] border-[#4A443A] text-[#ECE4D3]',
    },
    Break: {
      label: 'พัก',
      dotColor: 'bg-[#C9A86A]',
      badge: 'bg-[#171512] border-[#4A443A] text-[#ECE4D3]',
    },
    BREAK: {
      label: 'พัก',
      dotColor: 'bg-[#C9A86A]',
      badge: 'bg-[#171512] border-[#4A443A] text-[#ECE4D3]',
    },
    'Off Duty': {
      label: 'หยุด',
      dotColor: 'bg-[#7A7265]',
      badge: 'bg-[#171512] border-[#4A443A] text-[#ECE4D3]',
    },
    OFF_DUTY: {
      label: 'หยุด',
      dotColor: 'bg-[#7A7265]',
      badge: 'bg-[#171512] border-[#4A443A] text-[#ECE4D3]',
    },
  };

  const current = statusConfig[status as string] || statusConfig.Available;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (readOnly) {
    return (
      <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 border border-[#4A443A] bg-[#171512] rounded-[4px] text-xs font-medium text-[#ECE4D3] font-prompt">
        <span className={`w-2 h-2 rounded-full ${current.dotColor}`} />
        <span>{current.label}</span>
      </span>
    );
  }

  const options: { value: Artist['status']; label: string; dotColor: string }[] = [
    { value: 'Available', label: 'ว่าง', dotColor: 'bg-[#4E9F6E]' },
    { value: 'Tattooing', label: 'กำลังสัก', dotColor: 'bg-[#9C2F2F]' },
    { value: 'Break', label: 'พัก', dotColor: 'bg-[#C9A86A]' },
    { value: 'Off Duty', label: 'หยุด', dotColor: 'bg-[#7A7265]' },
  ];

  return (
    <div ref={dropdownRef} className="relative inline-block font-prompt text-xs">
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="h-[36px] px-3 bg-[#171512] border border-[#4A443A] hover:border-[#7A7265] rounded-[6px] text-[#ECE4D3] font-medium flex items-center justify-between gap-2 transition-all outline-none focus:ring-1 focus:ring-[#9C2F2F]"
      >
        <span className="flex items-center space-x-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${current.dotColor}`} />
          <span className="text-xs font-medium text-[#ECE4D3]">{current.label}</span>
        </span>
        <ChevronDown size={13} className={`text-[#A89F91] transition-transform ${isOpen ? 'rotate-180 text-[#ECE4D3]' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-1 right-0 z-50 w-[140px] bg-[#171512] border border-[#4A443A] rounded-[6px] p-1 shadow-2xl shadow-black/80 space-y-0.5 animate-fadeIn">
          {options.map((opt) => {
            const isSelected = opt.value === status;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  if (onChange) onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full h-[34px] px-2.5 rounded-[4px] flex items-center justify-between text-left text-xs font-medium transition-colors ${
                  isSelected ? 'bg-[#9C2F2F]/[0.14] text-[#ECE4D3]' : 'text-[#ECE4D3] hover:bg-[#ECE4D3]/[0.06]'
                }`}
              >
                <span className="flex items-center space-x-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dotColor}`} />
                  <span className="text-[#ECE4D3]">{opt.label}</span>
                </span>
                {isSelected && <Check size={13} className="text-[#9C2F2F] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
