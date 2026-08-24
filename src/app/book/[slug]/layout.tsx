import { ReactNode } from 'react';
import PublicBookingHeader from '@/components/booking/PublicBookingHeader';

export const metadata = {
  title: 'Book an Appointment',
};

export default function BookingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5] font-sans flex flex-col">
      <PublicBookingHeader />
      <main className="flex-1 w-full max-w-[1050px] lg:max-w-[1280px] mx-auto px-4 sm:px-5 md:px-8 lg:px-10 py-8 md:py-12 pb-24">
        {children}
      </main>
    </div>
  );
}
