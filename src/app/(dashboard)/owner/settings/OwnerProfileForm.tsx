'use client';

import { useState } from 'react';
import { updateOwnerProfile } from './actions';

interface OwnerProfileFormProps {
  initialFullName: string;
  initialPhone: string;
  email: string;
}

export function OwnerProfileForm({ initialFullName, initialPhone, email }: OwnerProfileFormProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsPending(true);
    setError(null);
    setSuccess(false);

    const formData = new FormData(e.currentTarget);
    const result = await updateOwnerProfile(formData);

    if (result.error) {
      setError(result.error);
    } else if (result.success) {
      setSuccess(true);
      // Hide success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
    }
    
    setIsPending(false);
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      {error && (
        <div className="p-3 bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-md text-sm text-[#EF4444]">
          {error}
        </div>
      )}
      
      {success && (
        <div className="p-3 bg-[#22C55E]/10 border border-[#22C55E]/20 rounded-md text-sm text-[#22C55E]">
          บันทึกข้อมูลเรียบร้อยแล้ว
        </div>
      )}

      <div>
        <label htmlFor="full_name" className="block text-xs font-medium text-[#9EA4AA] uppercase tracking-wider mb-2">
          ชื่อที่ใช้แสดง <span className="text-[#EF4444]">*</span>
        </label>
        <input
          type="text"
          id="full_name"
          name="full_name"
          defaultValue={initialFullName}
          required
          className="w-full bg-[#0B0B0B] border border-[#2A2A2A] text-[#F5F5F5] px-4 py-3 rounded-md focus:outline-none focus:border-[#F5F5F5] transition-colors"
        />
      </div>

      <div>
        <label htmlFor="phone" className="block text-xs font-medium text-[#9EA4AA] uppercase tracking-wider mb-2">
          เบอร์โทรศัพท์ <span className="text-[#EF4444]">*</span>
        </label>
        <input
          type="tel"
          id="phone"
          name="phone"
          defaultValue={initialPhone}
          required
          className="w-full bg-[#0B0B0B] border border-[#2A2A2A] text-[#F5F5F5] px-4 py-3 rounded-md focus:outline-none focus:border-[#F5F5F5] transition-colors"
        />
      </div>

      <div>
        <label htmlFor="email" className="block text-xs font-medium text-[#9EA4AA] uppercase tracking-wider mb-2">
          อีเมล
        </label>
        <input
          type="email"
          id="email"
          value={email}
          readOnly
          className="w-full bg-[#1A1A1A] border border-[#2A2A2A] text-[#7A7A7A] px-4 py-3 rounded-md cursor-not-allowed"
        />
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2.5 bg-[#FFFFFF] text-black text-sm font-medium rounded-md hover:bg-[#E5E5E5] disabled:opacity-50 transition-colors"
        >
          {isPending ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
        </button>
      </div>
    </form>
  );
}
