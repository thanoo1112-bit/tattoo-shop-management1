'use client';

import React from 'react';
import { Calendar, User, Ruler, Maximize2, ShieldAlert } from 'lucide-react';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';

interface EstimateSummaryProps {
  artistName: string;
  referenceImage?: string;
  width: number;
  height: number;
  placement: string;
  style: string;
  description: string;
  preferredDate?: string;
}

export default function EstimateSummary({
  artistName,
  referenceImage,
  width,
  height,
  placement,
  style,
  description,
  preferredDate,
}: EstimateSummaryProps) {
  return (
    <div className="bg-paper text-studio-sec border border-studio-border p-5 rounded-[6px] w-full max-w-sm mx-auto flex flex-col space-y-3.5 shadow-md font-prompt">
      <div className="flex justify-between items-center border-b border-studio-border/50 pb-2">
        <span className="text-[11px] uppercase tracking-wider text-studio-sec font-heading font-normal">
          ESTIMATE FLASH SHEET • ใบสรุปคำขอ
        </span>
        <span className="text-[9px] bg-studio-sec text-studio-paper px-2 py-0.5 rounded font-medium">
          DRAFT
        </span>
      </div>

      {referenceImage && (
        <div className="w-full aspect-video rounded-[4px] border border-studio-border/60 overflow-hidden bg-studio-main">
          <CustomerReferenceImage src={referenceImage} alt="Reference" className="w-full h-full object-cover" />
        </div>
      )}

      <div className="space-y-2 text-xs text-studio-sec pt-1">
        <div className="flex justify-between border-b border-studio-border/30 pb-1.5">
          <span className="text-studio-muted">ช่างสัก:</span>
          <span className="font-semibold">{artistName}</span>
        </div>

        <div className="flex justify-between border-b border-studio-border/30 pb-1.5">
          <span className="text-studio-muted">ขนาดรอยสัก:</span>
          <span className="font-semibold">{width} × {height} ซม.</span>
        </div>

        <div className="flex justify-between border-b border-studio-border/30 pb-1.5">
          <span className="text-studio-muted">ตำแหน่ง:</span>
          <span className="font-semibold">{placement}</span>
        </div>

        <div className="flex justify-between border-b border-studio-border/30 pb-1.5">
          <span className="text-studio-muted">สไตล์งาน:</span>
          <span className="font-semibold">{style}</span>
        </div>

        {preferredDate && (
          <div className="flex justify-between border-b border-studio-border/30 pb-1.5">
            <span className="text-studio-muted">วันที่สะดวก:</span>
            <span className="font-semibold">{preferredDate}</span>
          </div>
        )}

        {description && (
          <div className="pt-1">
            <span className="text-studio-muted block text-[10px] uppercase tracking-wider">รายละเอียดเพิ่มเติม:</span>
            <p className="text-xs text-studio-sec mt-0.5 bg-paper-dark/30 p-2 rounded border border-studio-border/30 italic">
              {`"${description}"`}
            </p>
          </div>
        )}
      </div>

      <div className="pt-1 text-[10px] text-studio-muted text-center border-t border-studio-border/40">
        157 TATTOO STUDIO • ช่างจะตอบกลับราคาประเมินภายใน 24 ชม.
      </div>
    </div>
  );
}
