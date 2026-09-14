'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface DeleteRejectedRequestDialogProps {
  isOpen: boolean;
  requestId: string | null;
  customerName?: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isLoading?: boolean;
}

export default function DeleteRejectedRequestDialog({
  isOpen,
  requestId,
  customerName,
  onClose,
  onConfirm,
  isLoading = false,
}: DeleteRejectedRequestDialogProps) {
  if (!isOpen || !requestId) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 font-prompt animate-fadeIn">
      <div className="bg-[#171512] border border-[#9C2F2F]/60 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#4A443A] pb-3">
          <div className="flex items-center space-x-2 text-[#9C2F2F]">
            <Trash2 size={18} />
            <h3 className="font-bold text-sm text-[#ECE4D3]">ลบคำขอนี้ถาวร?</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="text-[#A89F91] hover:text-[#ECE4D3] transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="space-y-2 text-xs">
          <div className="p-3 bg-[#2A1212]/60 border border-[#9C2F2F]/40 rounded-xl space-y-1">
            <p className="text-[#ECE4D3] font-medium leading-relaxed">
              {customerName ? `คำขอจากคุณ ${customerName}` : 'ข้อมูลคำขอที่ถูกปฏิเสธ'} จะถูกลบออกจากระบบและไม่สามารถกู้คืนได้
            </p>
          </div>
          <p className="text-[#A89F91] text-[11px]">
            การลบนี้จะลบเฉพาะรายการคำขอและข้อมูลที่เกี่ยวข้อง โดยไม่ส่งผลกระทบต่อบัญชีลูกค้า ข้อมูลการเงิน หรือประวัติคิวงานอื่นในระบบ
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#4A443A]">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 bg-[#0E0D0C] hover:bg-[#1F1D1A] text-xs text-[#A89F91] hover:text-[#ECE4D3] rounded-xl border border-[#4A443A] font-medium transition-colors cursor-pointer"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 bg-[#9C2F2F] hover:bg-[#B53838] active:scale-[0.98] text-xs text-white rounded-xl font-semibold shadow transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            <Trash2 size={14} />
            <span>{isLoading ? 'กำลังลบ...' : 'ลบถาวร'}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
