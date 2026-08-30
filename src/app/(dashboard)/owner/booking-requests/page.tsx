import { requireOwner } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import ArtistBookingRequestsList from '@/components/artist/booking-requests/ArtistBookingRequestsList'
import { AlertCircle } from 'lucide-react'

export default async function OwnerBookingRequestsPage() {
  const { membership } = await requireOwner()
  const supabase = await createClient()

  const { data: requests, error } = await supabase
    .from('booking_requests')
    .select(`
      id,
      shop_id,
      requested_start_at,
      requested_end_at,
      status,
      submitted_full_name,
      submitted_email,
      submitted_phone,
      health_note,
      is_first_tattoo,
      safety_notice_acknowledged,
      terms_accepted_at,
      created_at,
      project_id,
      confirmed_start_at,
      confirmed_end_at,
      artist_id,
      flash_design_id,
      flash_booking_mode,
      artist:profiles!booking_requests_artist_id_fkey(
        full_name,
        email
      ),
      payments (
        id,
        status,
        payment_type,
        amount,
        proof_storage_path,
        proof_submitted_at,
        created_at
      ),
      project:tattoo_projects (
        id,
        name,
        description,
        tattoo_style,
        body_placement,
        width_cm,
        height_cm,
        color_mode,
        work_type,
        size_note,
        agreed_price,
        flash_design_id,
        flash_variant_id,
        flash_booking_mode,
        references:tattoo_project_references (
          id
        )
      ),
      flash_designs:flash_designs!booking_requests_flash_design_id_fkey (
        id,
        flash_code,
        image_path,
        size,
        price,
        style_name
      ),
      flash_variant:flash_design_variants (
        id,
        size_name,
        min_size_cm,
        max_size_cm,
        price
      )
    `)
    .eq('shop_id', membership.shop_id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch booking requests for owner:', error)
    return (
      <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto pb-12">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
          <h2 className="text-lg font-medium text-[#F3F3F3] tracking-wide">คำขอจองทั้งหมดในร้าน</h2>
        </div>
        <div className="md:border border-red-500/20 rounded-xl bg-red-500/5 p-8 flex flex-col items-center justify-center text-center">
          <AlertCircle className="h-10 w-10 text-red-400 mb-4" />
          <h3 className="text-base font-medium text-[#F3F3F3] mb-2">ไม่สามารถโหลดคำขอจองได้</h3>
          <p className="text-sm text-[#747C85] max-w-xs mb-6">เกิดความผิดพลาดในการดึงข้อมูลจากเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง</p>
          <a
            href="/owner/booking-requests"
            className="px-5 py-2.5 text-xs font-medium text-black bg-[#FFFFFF] hover:bg-[#E5E5E5] border border-[#E5E5E5] rounded-md transition-all"
          >
            ลองใหม่
          </a>
        </div>
      </div>
    )
  }

  // Map reference lists to get length correctly in JS
  const mappedRequests = (requests || []).map((req: any) => ({
    ...req,
    artist: Array.isArray(req.artist) ? req.artist[0] : req.artist,
    project: req.project ? {
      ...req.project,
      references: req.project.references || []
    } : null
  }))

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto pb-12">
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
          <h2 className="text-lg font-medium text-[#F3F3F3] tracking-wide">คำขอจองทั้งหมดในร้าน</h2>
        </div>
        <p className="text-sm text-[#9CA3AB]">ตรวจสอบคำขอจองใหม่และยอดเงินมัดจำของช่างทุกคนในร้าน</p>
      </div>
      
      <div className="md:border border-[#262626] rounded-xl bg-[#171717] shadow-md p-6">
        <ArtistBookingRequestsList initialRequests={mappedRequests} isOwnerView={true} />
      </div>
    </div>
  )
}
