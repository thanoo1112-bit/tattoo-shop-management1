'use client';

import React from 'react';

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

export default function StudioAtmosphereSection() {
  return (
    <section className="space-y-6 sm:space-y-8 font-prompt">
      {/* Concept 4 Swapped Portion: Left ~65% Main Image + Right ~35% Text Block */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
        
        {/* TEXT BLOCK: Mobile Order 1, Desktop Order 2 (~35% / lg:col-span-4 on Right) */}
        <div className="lg:col-span-4 lg:order-2 flex flex-col justify-center space-y-3 lg:pl-2">
          <div className="inline-flex items-center space-x-1.5 bg-studio-sec border border-studio-border px-2.5 py-0.5 rounded text-studio-red-bright text-[10px] uppercase font-bold tracking-widest w-fit">
            <span>INSIDE 157 TATTOO</span>
          </div>
          
          <h2 className="text-3xl sm:text-4xl lg:text-4xl xl:text-5xl font-heading font-normal tracking-[0.04em] text-studio-primary leading-[1.05]">
            STUDIO<br />
            ATMOSPHERE
          </h2>
          
          <p className="text-xs sm:text-sm text-studio-secondary font-light leading-relaxed pt-1 max-w-sm">
            พื้นที่ส่วนตัว เรียบสงบ และตั้งใจออกแบบเพื่องานสัก
          </p>
        </div>

        {/* MAIN IMAGE (01 — TATTOO ROOM): Mobile Order 2, Desktop Order 1 (~65% / lg:col-span-8 on Left) */}
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
        <div className="flex md:grid overflow-x-auto md:overflow-visible snap-x snap-mandatory scrollbar-none gap-3 sm:gap-4 md:grid-cols-4 -mx-4 px-4 md:mx-0 md:px-0">
          {secondaryStudioImages.map((img) => (
            <div
              key={img.id}
              className="relative flex-none w-[75vw] sm:w-[65vw] md:w-auto h-[190px] sm:h-[210px] md:h-auto md:aspect-[4/3] snap-center bg-studio-card border border-studio-border rounded-[6px] overflow-hidden group"
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
    </section>
  );
}
