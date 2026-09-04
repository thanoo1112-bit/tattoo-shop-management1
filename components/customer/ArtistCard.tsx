'use client';

import React from 'react';
import { Artist } from '@/data/mockArtists';

interface ArtistCardProps {
  artist: Artist;
  onSelect: (artistId: string) => void;
}

export default function ArtistCard({ artist, onSelect }: ArtistCardProps) {
  return (
    <div className="w-full max-w-[400px] bg-studio-card border border-studio-border hover:border-studio-red/60 transition-all duration-300 rounded-[6px] overflow-hidden flex flex-col justify-between group font-prompt shadow-md mx-auto sm:mx-0">
      <div>
        {/* Profile Header Image/Cover with proportional 4:3 Aspect Ratio */}
        <div className="relative aspect-[4/3] bg-studio-main overflow-hidden">
          <img
            src={artist.avatar}
            alt={artist.name}
            className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-studio-card/80 via-transparent to-transparent"></div>
          
          {/* Status Badge */}
          <div className="absolute top-3 left-3 bg-studio-main/80 backdrop-blur-sm border border-studio-border px-2.5 py-1 rounded-[4px] flex items-center space-x-1.5">
            <span className={`w-2 h-2 rounded-full ${
              (artist.status === 'Available' || artist.status === 'AVAILABLE') ? 'bg-green-500' :
              (artist.status === 'Tattooing' || artist.status === 'TATTOOING') ? 'bg-studio-red' :
              (artist.status === 'Break' || artist.status === 'BREAK') ? 'bg-blue-500' : 'bg-studio-muted'
            }`}></span>
            <span className="text-[10px] text-studio-secondary font-medium uppercase tracking-wider">
              {(artist.status === 'Available' || artist.status === 'AVAILABLE') ? 'ว่าง' :
               (artist.status === 'Tattooing' || artist.status === 'TATTOOING') ? 'กำลังสัก' :
               (artist.status === 'Break' || artist.status === 'BREAK') ? 'พักเบรค' : 'หยุดปฏิบัติงาน'}
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="p-5">
          <span className="text-[10px] uppercase tracking-widest text-studio-red font-bold">
            {artist.specialties && artist.specialties.length > 0 ? artist.specialties.join(' / ') : artist.specialty}
          </span>
          <h3 className="text-xl font-heading font-normal tracking-wide text-studio-primary mt-1 mb-2">
            {artist.name}
          </h3>
          <p className="text-xs text-studio-secondary line-clamp-2 mb-4 leading-relaxed font-light">
            {artist.bio}
          </p>

          {/* Mini Portfolio Preview Row */}
          {artist.portfolio && artist.portfolio.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-studio-border/60">
              {artist.portfolio.map((img, idx) => (
                <div key={idx} className="h-14 bg-studio-main rounded-[4px] overflow-hidden border border-studio-border/60">
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="p-5 pt-0">
        <button
          onClick={() => onSelect(artist.id)}
          className="w-full bg-transparent border border-studio-border text-studio-primary hover:bg-studio-main active:scale-[0.99] text-xs uppercase tracking-wider py-2.5 px-4 font-semibold transition-all rounded-[4px]"
        >
          ดู Portfolio
        </button>
      </div>
    </div>
  );
}
