'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: LucideIcon;
}

export default function KPICard({ title, value, change, changeType = 'neutral', icon: Icon }: KPICardProps) {
  const isLongText = typeof value === 'string' && value.length > 8;

  return (
    <div className="bg-studio-card border border-studio-border p-4 sm:p-5 rounded-[6px] flex items-center justify-between min-w-0 shadow-sm">
      <div className="space-y-1.5 min-w-0 flex-1 pr-2">
        <span className="text-[10px] uppercase tracking-wider text-studio-secondary font-bold block truncate">
          {title}
        </span>
        <h3 className={`font-bold text-studio-primary truncate ${isLongText ? 'text-xs sm:text-base md:text-lg' : 'text-xl sm:text-2xl'}`}>
          {value}
        </h3>
        {change && (
          <span className={`text-[10px] font-semibold block truncate ${
            changeType === 'positive' ? 'text-green-500' :
            changeType === 'negative' ? 'text-red-500' : 'text-studio-muted'
          }`}>
            {change}
          </span>
        )}
      </div>

      <div className="p-2.5 sm:p-3 bg-studio-main border border-studio-border text-studio-red rounded-[4px] shrink-0">
        <Icon size={18} className="sm:w-5 sm:h-5" />
      </div>
    </div>
  );
}

