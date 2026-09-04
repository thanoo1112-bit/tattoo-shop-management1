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
  return (
    <div className="bg-studio-card border border-studio-border p-5 rounded-[6px] flex items-center justify-between">
      <div className="space-y-1.5">
        <span className="text-[10px] uppercase tracking-wider text-studio-secondary font-bold block">
          {title}
        </span>
        <h3 className="text-2xl font-bold text-studio-primary">
          {value}
        </h3>
        {change && (
          <span className={`text-[10px] font-semibold ${
            changeType === 'positive' ? 'text-green-500' :
            changeType === 'negative' ? 'text-red-500' : 'text-studio-muted'
          }`}>
            {change}
          </span>
        )}
      </div>

      <div className="p-3 bg-studio-main border border-studio-border text-studio-red rounded-[4px]">
        <Icon size={20} />
      </div>
    </div>
  );
}
