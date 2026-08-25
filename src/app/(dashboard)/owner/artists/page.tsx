import { requireOwner } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { EmptyState } from '@/components/owner/empty-state'
import { Users } from 'lucide-react'
import { CreateInviteModal } from '@/components/owner/artists/create-invite-modal'
import { ArtistTable } from '@/components/owner/artists/artist-table'
import { PendingInvitesTable } from '@/components/owner/artists/pending-invites-table'

export default async function ArtistsPage() {
  const { membership } = await requireOwner()
  const shopId = membership.shop_id

  const supabase = await createClient()

  // Fetch active artists
  const { data: artists } = await supabase
    .from('shop_members')
    .select(`
      id,
      user_id,
      role,
      status,
      joined_at,
      profiles (
        full_name,
        email,
        phone,
        avatar_url
      )
    `)
    .eq('shop_id', shopId)
    .in('role', ['artist', 'owner'])
    .order('joined_at', { ascending: false })

  // Fetch pending invites
  const { data: invites } = await supabase
    .from('shop_invites')
    .select(`
      id,
      token,
      role,
      status,
      created_at,
      expires_at
    `)
    .eq('shop_id', shopId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  const typedArtists = (artists || []) as any[]
  const typedInvites = (invites || []) as any[]

  const totalArtists = typedArtists.length
  const activeArtists = typedArtists.filter(a => a.status === 'active').length
  const pendingInvites = typedInvites.length

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-light text-[#FFFFFF] mb-1">ช่างสัก</h1>
          <p className="text-sm text-[#A3A3A3]">จัดการทีมช่างสักภายในร้าน</p>
        </div>
        {/* Invite link generation is hidden in favor of direct artist registration */}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5">
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-4 sm:p-5 shadow-sm">
          <p className="text-xs font-medium text-[#A3A3A3] uppercase tracking-wider mb-1">ช่างทั้งหมด</p>
          <p className="text-3xl font-light text-[#FFFFFF]">{totalArtists}</p>
        </div>
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 shadow-sm">
          <p className="text-xs font-medium text-[#A3A3A3] uppercase tracking-wider mb-1">ใช้งานอยู่</p>
          <p className="text-3xl font-light text-[#FFFFFF]">{activeArtists}</p>
        </div>
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-5 shadow-sm">
          <p className="text-xs font-medium text-[#A3A3A3] uppercase tracking-wider mb-1">คำเชิญที่รอดำเนินการ</p>
          <p className="text-3xl font-light text-[#FFFFFF]">{pendingInvites}</p>
        </div>
      </div>

      <div className="space-y-8">
        <section>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
            <h2 className="text-lg font-medium text-[#FFFFFF] tracking-wide">ทีมช่างสัก</h2>
          </div>
          
          {typedArtists.length > 0 ? (
            <ArtistTable artists={typedArtists} shopId={shopId} />
          ) : (
            <div className="bg-[#171717] rounded-xl border border-[#262626]">
              <EmptyState 
                icon={Users}
                title="ยังไม่มีช่างสักในทีม"
                description="สร้างลิงก์เชิญด้านบนเพื่อเพิ่มช่างสักเข้าสู่ร้าน"
              />
            </div>
          )}
        </section>

        {typedInvites.length > 0 && (
          <section>
            <PendingInvitesTable invites={typedInvites} />
          </section>
        )}
      </div>
    </div>
  )
}
