'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../AppContext';
import { Artist } from '@/data/mockArtists';
import { ChevronDown, Check } from 'lucide-react';

interface ArtistStatusToggleProps {
  artistId: string;
  className?: string;
  showLabel?: boolean;
}

interface StatusOption {
  value: Artist['status'];
  label: string;
  dotColor: string;
  description?: string;
}

export default function ArtistStatusToggle({
  artistId,
  className = '',
  showLabel = true,
}: ArtistStatusToggleProps) {
  const { artists, updateArtistStatus } = useApp();
  const artist = artists.find((a) => a.id === artistId);
  const currentStatus: Artist['status'] = artist?.status || 'Available';

  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Status definitions adhering strictly to the 4 system states and design colors
  const statusOptions: StatusOption[] = [
    {
      value: 'Available',
      label: 'ว่าง',
      dotColor: 'bg-[#4E9F6E]', // Muted Green
    },
    {
      value: 'Tattooing',
      label: 'กำลังสัก',
      dotColor: 'bg-[#9C2F2F]', // Tattoo Red #9C2F2F
    },
    {
      value: 'Break',
      label: 'พัก',
      dotColor: 'bg-[#C9A86A]', // Aged Paper / Amber-neutral
    },
    {
      value: 'Off Duty',
      label: 'หยุด',
      dotColor: 'bg-[#7A7265]', // Muted Gray
    },
  ];

  const currentOption =
    statusOptions.find((opt) => opt.value === currentStatus) || statusOptions[0];

  // Handle outside click
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

  const handleSelect = useCallback(
    (status: Artist['status']) => {
      updateArtistStatus(artistId, status);
      setIsOpen(false);
      triggerRef.current?.focus();
    },
    [artistId, updateArtistStatus]
  );

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
        const currentIndex = statusOptions.findIndex((opt) => opt.value === currentStatus);
        setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % statusOptions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + statusOptions.length) % statusOptions.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < statusOptions.length) {
        handleSelect(statusOptions[highlightedIndex].value);
      }
    } else if (e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  return (
    <div
      ref={dropdownRef}
      className={`relative inline-flex items-center space-x-2 font-prompt text-xs sm:text-sm ${className}`}
    >
      {showLabel && (
        <span className="text-xs text-studio-muted font-medium uppercase tracking-wider hidden sm:inline select-none">
          สถานะช่าง:
        </span>
      )}

      {/* Trigger Button (Closed State) */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`h-[44px] min-w-[130px] sm:min-w-[140px] px-3.5 bg-[#171512] border border-[#4A443A] hover:border-[#7A7265] rounded-[6px] text-[#ECE4D3] font-medium flex items-center justify-between gap-2.5 transition-all outline-none focus:ring-1 focus:ring-[#9C2F2F] shadow-sm select-none ${
          isOpen ? 'border-[#7A7265] ring-1 ring-[#9C2F2F]/40' : ''
        }`}
      >
        {/* Left: Status Dot + Label */}
        <span className="flex items-center space-x-2.5 truncate">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${currentOption.dotColor}`}
            aria-hidden="true"
          />
          <span className="text-sm font-medium tracking-wide truncate">
            {currentOption.label}
          </span>
        </span>

        {/* Right: Chevron */}
        <ChevronDown
          size={15}
          className={`text-[#A89F91] shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-[#ECE4D3]' : ''
          }`}
          aria-hidden="true"
        />
      </button>

      {/* Desktop & Tablet Dropdown Popover */}
      {isOpen && (
        <>
          {/* Backdrop for Mobile view to close smoothly */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] sm:hidden"
            onClick={() => setIsOpen(false)}
          />

          <div
            role="listbox"
            tabIndex={-1}
            aria-label="เลือกสถานะช่าง"
            className="absolute top-full mt-1.5 right-0 z-50 w-[170px] sm:w-[180px] bg-[#171512] border border-[#4A443A] rounded-[8px] p-1.5 shadow-2xl shadow-black/80 space-y-1 animate-fadeIn font-prompt"
          >
            {statusOptions.map((option, index) => {
              const isSelected = option.value === currentStatus;
              const isHighlighted = index === highlightedIndex;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(option.value)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`w-full h-[42px] sm:h-[40px] px-3 rounded-[6px] flex items-center justify-between text-left text-sm font-medium transition-colors select-none ${
                    isSelected
                      ? 'bg-[#9C2F2F]/[0.14] text-[#ECE4D3]'
                      : isHighlighted
                      ? 'bg-[#ECE4D3]/[0.06] text-[#ECE4D3]'
                      : 'text-[#ECE4D3] hover:bg-[#ECE4D3]/[0.06]'
                  }`}
                >
                  {/* Left: Dot + Label */}
                  <div className="flex items-center space-x-2.5">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${option.dotColor}`}
                      aria-hidden="true"
                    />
                    <span className="tracking-wide">{option.label}</span>
                  </div>

                  {/* Right: Selected Checkmark */}
                  {isSelected && (
                    <Check size={15} className="text-[#9C2F2F] shrink-0" strokeWidth={2.5} />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
