import Link from 'next/link';

export default function StepTwoPlaceholder({ shopSlug, artistName }: { shopSlug: string, artistName: string }) {
  // Back to Step 1 removes the step and artist query parameters
  const backHref = `/book/${shopSlug}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-[#F5F5F5]">เลือกวันและเวลา</h2>
          <p className="text-sm text-[#737373]">สำหรับช่าง: <span className="text-neutral-300 font-medium">{artistName}</span></p>
        </div>
      </div>
      
      <div className="py-24 text-center border border-dashed border-[#404040] bg-[#121212]/20 rounded-2xl">
        <p className="text-neutral-300 mb-2">Calendar และช่วงเวลาว่าง</p>
        <p className="text-[#737373] text-sm">จะพัฒนาใน STEP 6D.2</p>
      </div>
      
      <div className="pt-4">
        <Link 
          href={backHref}
          className="inline-flex items-center justify-center px-6 py-3 rounded-xl border border-[#262626] bg-[#121212] hover:bg-[#262626] text-sm font-medium text-[#F5F5F5] transition-colors active:bg-[#404040]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          เปลี่ยนช่าง
        </Link>
      </div>
    </div>
  );
}
