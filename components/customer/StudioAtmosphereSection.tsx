'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface StudioImage {
  id: string;
  src: string;
  alt: string;
  label: string;
}

const mainStudioImage: StudioImage = {
  id: 'studio-main',
  src: '/images/studio/tattoo-room-final.png',
  alt: '157 Tattoo Main Room — Tattoo Beds, Black Walls & Distinctive Studio Interior',
  label: '01 — TATTOO ROOM',
};

const secondaryStudioImages: StudioImage[] = [
  {
    id: 'studio-sec-1',
    src: '/images/studio/workspace-final.png',
    alt: '157 Tattoo Waiting Area & Studio Reception Lounge',
    label: '02 — WAITING AREA',
  },
  {
    id: 'studio-sec-2',
    src: '/images/studio/waiting-area-final.png',
    alt: '157 Tattoo Workstation Desk & Consultation Area',
    label: '03 — WORKSPACE',
  },
  {
    id: 'studio-sec-3',
    src: '/images/studio/details-final.png',
    alt: '157 Tattoo Wooden Shelves & Collectibles Detail',
    label: '04 — DETAILS',
  },
  {
    id: 'studio-sec-4',
    src: '/images/studio/corner-final.png',
    alt: '157 Tattoo Studio Corner — Floor Mirror & Pedestal Detail',
    label: '05 — CORNER',
  },
];

const allStudioImages: StudioImage[] = [
  mainStudioImage,
  ...secondaryStudioImages,
];

export default function StudioAtmosphereSection() {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  const updateScrollState = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const cards = Array.from(el.querySelectorAll('article'));
    if (cards.length === 0) return;

    const scrollLeft = el.scrollLeft;
    const maxScroll = el.scrollWidth - el.clientWidth;

    // Boundary check for start (Card 01)
    if (scrollLeft <= 15) {
      setCurrentIndex(0);
      setCanScrollPrev(false);
      setCanScrollNext(true);
      return;
    }

    // Boundary check for end (Card 05)
    if (scrollLeft >= maxScroll - 15) {
      setCurrentIndex(cards.length - 1);
      setCanScrollPrev(true);
      setCanScrollNext(false);
      return;
    }

    // Calculate which card is closest to the current scroll position
    const baseOffset = cards[0].offsetLeft;
    let closestIndex = 0;
    let minDistance = Infinity;

    cards.forEach((card, idx) => {
      const cardScrollPos = card.offsetLeft - baseOffset;
      const distance = Math.abs(cardScrollPos - scrollLeft);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = idx;
      }
    });

    setCurrentIndex(closestIndex);
    setCanScrollPrev(closestIndex > 0);
    setCanScrollNext(closestIndex < cards.length - 1);
  }, []);

  useEffect(() => {
    updateScrollState();
    window.addEventListener('resize', updateScrollState);
    return () => window.removeEventListener('resize', updateScrollState);
  }, [updateScrollState]);

  const scrollToIndex = (targetIndex: number) => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const cards = Array.from(el.querySelectorAll('article'));
    if (targetIndex < 0 || targetIndex >= cards.length) return;

    const baseOffset = cards[0].offsetLeft;
    const targetCard = cards[targetIndex];
    const targetScrollLeft = targetCard.offsetLeft - baseOffset;

    el.scrollTo({
      left: targetScrollLeft,
      behavior: 'smooth',
    });
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      scrollToIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const cards = el.querySelectorAll('article');
    if (currentIndex < cards.length - 1) {
      scrollToIndex(currentIndex + 1);
    }
  };

  return (
    <section className="space-y-6 sm:space-y-8 font-prompt">
      {/* Mobile Layout (< md): Header with Arrows + 1 Row Horizontal Swipe Gallery */}
      <div className="md:hidden space-y-4">
        {/* TEXT BLOCK + GALLERY CONTROLS */}
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col justify-center space-y-2 min-w-0">
            <div className="inline-flex items-center space-x-1.5 bg-studio-sec border border-studio-border px-2.5 py-0.5 rounded text-studio-red-bright text-[10px] uppercase font-bold tracking-widest w-fit">
              <span>INSIDE 157 TATTOO</span>
            </div>
            
            <h2 className="text-3xl sm:text-4xl font-heading font-normal tracking-[0.04em] text-studio-primary leading-[1.05]">
              STUDIO<br />
              ATMOSPHERE
            </h2>
            
            <p className="text-xs sm:text-sm text-[#E2DDD4] font-light leading-relaxed pt-1 max-w-xs sm:max-w-sm">
              พื้นที่ส่วนตัว เรียบสงบ และตั้งใจออกแบบเพื่องานสัก
            </p>
          </div>

          {/* Navigation Arrows for Mobile Gallery (< >) */}
          <div className="flex items-center space-x-1.5 shrink-0 pb-1">
            <button
              type="button"
              onClick={handlePrev}
              disabled={!canScrollPrev}
              aria-label="รูปภาพก่อนหน้า"
              className="w-8 h-8 rounded-[4px] bg-studio-card border border-studio-border flex items-center justify-center text-studio-primary hover:text-studio-paper hover:border-studio-red/60 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={!canScrollNext}
              aria-label="รูปภาพถัดไป"
              className="w-8 h-8 rounded-[4px] bg-studio-card border border-studio-border flex items-center justify-center text-studio-primary hover:text-studio-paper hover:border-studio-red/60 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* 1 ROW HORIZONTAL SCROLL GALLERY (01 to 05) */}
        <div
          ref={scrollContainerRef}
          onScroll={updateScrollState}
          className="flex gap-3 overflow-x-auto overflow-y-hidden snap-x snap-mandatory touch-pan-x overscroll-x-contain scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4 sm:-mx-6 sm:px-6"
        >
          {allStudioImages.map((img) => (
            <article
              key={img.id}
              className="w-[81vw] shrink-0 snap-start relative aspect-[16/10] md:aspect-auto bg-studio-card border border-studio-border rounded-[6px] overflow-hidden group"
            >
              <img
                src={img.src}
                alt={img.alt}
                draggable={false}
                className="w-full h-full object-cover object-center transform group-hover:scale-[1.02] transition-transform duration-500 pointer-events-none select-none"
                loading="lazy"
              />
              {/* Overlay Gradient & Editorial Label */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-80 pointer-events-none" />
              <span className="absolute bottom-2.5 left-2.5 text-[9px] uppercase tracking-wider text-studio-paper font-heading opacity-95 bg-black/75 backdrop-blur-sm border border-white/10 px-2 py-0.5 rounded-[3px] truncate max-w-[85%] pointer-events-none">
                {img.label}
              </span>
            </article>
          ))}
          {/* Spacer ensuring last image 05 can fully scroll and snap cleanly */}
          <div className="w-1 shrink-0 pointer-events-none" aria-hidden="true" />
        </div>
      </div>

      {/* Desktop/Tablet Layout (>= md): Keep 100% of Current Layout */}
      <div className="hidden md:block space-y-6 sm:space-y-8">
        {/* Concept 4 Swapped Portion: Left ~65% Main Image + Right ~35% Text Block */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
          
          {/* TEXT BLOCK: Desktop Order 2 (~35% / lg:col-span-4 on Right) */}
          <div className="lg:col-span-4 lg:order-2 flex flex-col justify-center space-y-3 lg:pl-2">
            <div className="inline-flex items-center space-x-1.5 bg-studio-sec border border-studio-border px-2.5 py-0.5 rounded text-studio-red-bright text-[10px] uppercase font-bold tracking-widest w-fit">
              <span>INSIDE 157 TATTOO</span>
            </div>
            
            <h2 className="text-3xl sm:text-4xl lg:text-4xl xl:text-5xl font-heading font-normal tracking-[0.04em] text-studio-primary leading-[1.05]">
              STUDIO<br />
              ATMOSPHERE
            </h2>
            
            <p className="text-xs sm:text-sm text-[#E2DDD4] font-light leading-relaxed pt-1 max-w-sm">
              พื้นที่ส่วนตัว เรียบสงบ และตั้งใจออกแบบเพื่องานสัก
            </p>
          </div>

          {/* MAIN IMAGE (01 — TATTOO ROOM): Desktop Order 1 (~65% / lg:col-span-8 on Left) */}
          <div className="lg:col-span-8 lg:order-1">
            <div className="relative w-full h-[260px] sm:h-[300px] lg:h-[390px] xl:h-[420px] bg-studio-card border border-studio-border rounded-[6px] overflow-hidden group">
              <img
                src={mainStudioImage.src}
                alt={mainStudioImage.alt}
                className="w-full h-full object-cover object-center transform group-hover:scale-[1.01] transition-transform duration-700"
                loading="lazy"
              />
              {/* Subtle Gradient & Editorial Label */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80" />
              <span className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 text-[10px] uppercase tracking-widest text-studio-paper font-heading opacity-95 bg-black/75 backdrop-blur-sm border border-white/10 px-2.5 py-1 rounded-[3px]">
                {mainStudioImage.label}
              </span>
            </div>
          </div>

        </div>

        {/* Concept 4 Bottom Portion: 4 Secondary Studio Images Editorial Gallery */}
        <div className="border-t border-studio-border/60 pt-4 sm:pt-6">
          <div className="grid grid-cols-4 gap-3 sm:gap-4">
            {secondaryStudioImages.map((img) => (
              <div
                key={img.id}
                className="relative aspect-[4/3] bg-studio-card border border-studio-border rounded-[6px] overflow-hidden group"
              >
                <img
                  src={img.src}
                  alt={img.alt}
                  className="w-full h-full object-cover object-center transform group-hover:scale-[1.02] transition-transform duration-500"
                  loading="lazy"
                />
                {/* Overlay Gradient & Editorial Label */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-80 pointer-events-none" />
                <span className="absolute bottom-2.5 left-2.5 text-[9px] uppercase tracking-wider text-studio-paper font-heading opacity-95 bg-black/75 backdrop-blur-sm border border-white/10 px-2 py-0.5 rounded-[3px] truncate max-w-[85%] pointer-events-none">
                  {img.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
