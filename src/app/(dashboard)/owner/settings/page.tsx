import { requireOwner, getShopDetails } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { OwnerProfileForm } from './OwnerProfileForm'
import { OwnerPaymentSettingsForm } from './OwnerPaymentSettingsForm'
import { OwnerShopSettingsForm } from './OwnerShopSettingsForm'
import { PublicStorefrontLink } from '@/components/owner/dashboard/PublicStorefrontLink'

export default async function SettingsPage() {
  const { membership, user } = await requireOwner()
  const shop = await getShopDetails(membership.shop_id)
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone, email')
    .eq('id', user.id)
    .single()

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-light text-[#F5F5F5] mb-1">ตั้งค่าร้าน</h1>
        <p className="text-sm text-[#9EA4AA]">จัดการข้อมูลพื้นฐานและการตั้งค่าของร้าน</p>
      </div>

      <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#2A2A2A] bg-[#181818]">
          <h2 className="text-lg font-medium text-[#F5F5F5]">ข้อมูลร้าน</h2>
        </div>
        
        <div className="p-6">
          <OwnerShopSettingsForm
            shopId={membership.shop_id}
            initialName={shop?.name || ''}
            initialPhone={shop?.phone || ''}
            initialAddress={shop?.address || ''}
            slug={shop?.slug || ''}
          />
        </div>
      </div>

      <PublicStorefrontLink shopSlug={shop?.slug || '157-tattoo'} />

      <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#2A2A2A] bg-[#181818]">
          <h2 className="text-lg font-medium text-[#F5F5F5]">การรับชำระเงิน</h2>
          <p className="text-sm text-[#9EA4AA] mt-1">ตั้งค่าข้อมูลสำหรับรับเงินมัดจำจากลูกค้า</p>
        </div>
        
        <OwnerPaymentSettingsForm shopId={membership.shop_id} />
      </div>

      <div className="bg-[#141414] border border-[#2A2A2A] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#2A2A2A] bg-[#181818]">
          <h2 className="text-lg font-medium text-[#F5F5F5]">ข้อมูลผู้ดูแลระบบ</h2>
        </div>
        
        <div className="p-6">
          <OwnerProfileForm 
            initialFullName={profile?.full_name || ''} 
            initialPhone={profile?.phone || ''}
            email={user.email || ''}
          />
        </div>
      </div>
    </div>
  )
}
