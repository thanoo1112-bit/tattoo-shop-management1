import { requireCustomer } from '@/lib/auth/customer'
import CustomerHeader from '@/components/customer/customer-header'

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const customer = await requireCustomer()

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F3F3F3] flex flex-col font-sans relative">
      <CustomerHeader customerName={customer.full_name} />
      
      <main className="flex-1 w-full max-w-[1050px] lg:max-w-[1280px] mx-auto px-4 sm:px-5 md:px-8 lg:px-10 py-8 md:py-12">
        {children}
      </main>
    </div>
  )
}
