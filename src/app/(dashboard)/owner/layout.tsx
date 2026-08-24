import { requireOwner } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { OwnerSidebar } from '@/components/owner/owner-sidebar'
import { OwnerMobileNav } from '@/components/owner/owner-mobile-nav'
import { OwnerTopbar } from '@/components/owner/owner-topbar'

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireOwner()
  const supabase = await createClient()
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const ownerName = profile?.full_name || user.email || 'Admin'
  
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F3F3F3] flex flex-col md:flex-row font-sans relative">
      <OwnerSidebar ownerName={ownerName} />
      <OwnerMobileNav ownerName={ownerName} />
      
      <div className="flex-1 md:pl-64 flex flex-col min-h-screen selection:bg-[#8E232B] selection:text-white relative z-10">
        <OwnerTopbar />
        
        <main className="flex-1 p-4 md:p-8 relative">
          {children}
        </main>
      </div>
    </div>
  )
}
