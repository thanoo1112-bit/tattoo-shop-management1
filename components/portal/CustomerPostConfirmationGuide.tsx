'use client';

import React, { useState } from 'react';
import {
  BookOpen,
  MapPin,
  ExternalLink,
  X,
  CheckCircle2,
  HeartPulse,
  ChevronRight,
  Info,
} from 'lucide-react';

interface CustomerPostConfirmationGuideProps {
  hasApprovedSubmission: boolean;
}

export default function CustomerPostConfirmationGuide({
  hasApprovedSubmission,
}: CustomerPostConfirmationGuideProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Strict Display Condition: Hidden if customer has no approved deposit submission
  if (!hasApprovedSubmission) {
    return null;
  }

  const SHOP_NAME = '157 TATTOO';
  const SHOP_ADDRESS = '151/3 1299 ตำบลเวียงชัย อำเภอเวียงชัย จังหวัดเชียงราย 57210';
  const GOOGLE_MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(SHOP_ADDRESS)}`;

  const guideItems = [
    {
      step: 1,
      title: 'พักผ่อนให้เพียงพอ',
      description: 'ควรนอนให้เต็มที่ก่อนวันนัดหมาย เพื่อให้ร่างกายพร้อมสำหรับการสัก',
    },
    {
      step: 2,
      title: 'รับประทานอาหารก่อนมา',
      description: 'ไม่ควรมารับบริการขณะท้องว่าง ป้องกันอาการหน้ามืดหรือระดับน้ำตาลในเลือดต่ำ',
    },
    {
      step: 3,
      title: 'งดแอลกอฮอล์',
      description: 'หลีกเลี่ยงเครื่องดื่มแอลกอฮอล์ก่อนเข้ารับบริการ',
    },
    {
      step: 4,
      title: 'สวมเสื้อผ้าที่สะดวก',
      description: 'เลือกเสื้อผ้าที่เข้าถึงตำแหน่งสักได้ง่าย',
    },
    {
      step: 5,
      title: 'ดูแลผิวบริเวณที่จะสัก',
      description: 'รักษาความสะอาดและหลีกเลี่ยงการระคายเคือง',
    },
    {
      step: 6,
      title: 'หากมีข้อสงสัย',
      description: 'ติดต่อร้านก่อนวันนัดหมาย',
    },
  ];

  return (
    <>
      {/* DESKTOP ONLY CARD CONTAINER */}
      <div className="hidden lg:block bg-studio-card border border-studio-border p-4 rounded-[8px] space-y-3 shadow-md animate-fadeIn">
        <div className="space-y-0.5 border-b border-studio-border/60 pb-2">
          <div className="flex items-center gap-2">
            <HeartPulse size={15} className="text-studio-red" />
            <span className="text-xs uppercase tracking-wider font-heading text-studio-primary font-bold">
              เตรียมตัวก่อนเข้ารับบริการ
            </span>
          </div>
          <p className="text-[11px] text-studio-secondary font-light">
            เตรียมตัวให้พร้อม เพื่อประสบการณ์ที่ดีที่สุดในวันสัก
          </p>
        </div>

        <div className="space-y-2.5">
          {/* ACTION CARD A: คู่มือเตรียมตัวก่อนสัก */}
          <div className="bg-studio-main border border-studio-border p-3 rounded-[6px] space-y-2.5 hover:border-studio-border/80 transition-colors">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-[4px] bg-studio-sec border border-studio-border text-studio-red shrink-0 mt-0.5">
                <BookOpen size={15} />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-xs font-semibold text-studio-primary">
                  คู่มือเตรียมตัวก่อนสัก
                </h4>
                <p className="text-[11px] text-studio-secondary font-light leading-snug">
                  ดูคำแนะนำและสิ่งที่ควรเตรียมก่อนวันนัด
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="w-full min-h-[34px] bg-studio-sec hover:bg-studio-card border border-studio-border text-studio-primary px-3 py-1.5 rounded-[4px] text-xs font-medium flex items-center justify-between transition-all group"
            >
              <span className="text-studio-red font-semibold">ดูคู่มือทั้งหมด</span>
              <ChevronRight size={14} className="text-studio-muted group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          {/* ACTION CARD B: แผนที่และการเดินทาง */}
          <div className="bg-studio-main border border-studio-border p-3 rounded-[6px] space-y-2.5 hover:border-studio-border/80 transition-colors">
            <div className="flex items-start gap-2.5">
              <div className="p-1.5 rounded-[4px] bg-studio-sec border border-studio-border text-studio-red shrink-0 mt-0.5">
                <MapPin size={15} />
              </div>
              <div className="space-y-0.5">
                <h4 className="text-xs font-semibold text-studio-primary">
                  แผนที่และการเดินทาง
                </h4>
                <div className="text-[11px] font-semibold text-studio-primary pt-0.5">
                  {SHOP_NAME}
                </div>
                <p className="text-[10px] text-studio-muted leading-tight font-light">
                  151/3 1299 ตำบลเวียงชัย อำเภอเวียงชัย จังหวัดเชียงราย 57210
                </p>
              </div>
            </div>

            <a
              href={GOOGLE_MAPS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[34px] bg-studio-sec hover:bg-studio-card border border-studio-border text-studio-primary px-3 py-1.5 rounded-[4px] text-xs font-medium flex items-center justify-between transition-all group"
            >
              <span className="flex items-center gap-1.5 font-semibold text-studio-primary group-hover:text-studio-red transition-colors">
                <MapPin size={13} className="text-studio-red" />
                <span>เปิด Google Maps</span>
              </span>
              <ExternalLink size={13} className="text-studio-muted group-hover:text-studio-primary transition-colors" />
            </a>
          </div>
        </div>
      </div>

      {/* FULL GUIDE MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-studio-card border border-studio-border rounded-[8px] max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-prompt">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-studio-border flex items-center justify-between bg-studio-main">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-[4px] bg-studio-sec border border-studio-border text-studio-red">
                  <HeartPulse size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-studio-primary">
                    เตรียมตัวก่อนวันสัก
                  </h3>
                  <p className="text-[11px] text-studio-secondary font-light">
                    ข้อแนะนำและขั้นตอนการเตรียมตัวสำหรับวันเข้ารับบริการ
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-[4px] hover:bg-studio-sec text-studio-muted hover:text-studio-primary transition-colors"
                title="ปิด"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-3">
              {guideItems.map((item) => (
                <div
                  key={item.step}
                  className="p-3 bg-studio-main border border-studio-border/70 rounded-[6px] flex items-start gap-3"
                >
                  <div className="w-5 h-5 rounded-full bg-studio-red/10 border border-studio-red/30 text-studio-red font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    {item.step}
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-semibold text-studio-primary">
                      {item.title}
                    </h4>
                    <p className="text-[11px] text-studio-secondary font-light leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}

              <div className="p-3 bg-studio-sec/60 border border-studio-border/50 rounded-[6px] flex items-center gap-2 text-[11px] text-studio-muted">
                <Info size={14} className="text-studio-red shrink-0" />
                <span>ขอบคุณที่ไว้วางใจใช้บริการกับ 157 TATTOO</span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-studio-border bg-studio-main flex justify-end">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="min-h-[38px] bg-studio-red text-studio-paper hover:bg-tattoo-red-dark px-5 py-2 rounded-[4px] text-xs font-semibold transition-all"
              >
                รับทราบ และปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
