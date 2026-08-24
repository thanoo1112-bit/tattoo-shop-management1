import { requireArtist } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import ArtistBookingRequestDetail from '@/components/artist/booking-requests/ArtistBookingRequestDetail'
import { AlertCircle } from 'lucide-react'
import Link from 'next/link'

type Props = {
  params: Promise<{ id: string }>
}

export default async function BookingRequestDetailPage({ params }: Props) {
  const { id } = await params
  const { user, membership } = await requireArtist()
  const supabase = await createClient()

  // Fetch the booking request details
  const { data: request, error } = await supabase
    .from('booking_requests')
    .select(`
      id,
      requested_start_at,
      status,
      submitted_full_name,
      submitted_email,
      submitted_phone,
      health_note,
      is_first_tattoo,
      safety_notice_acknowledged,
      created_at,
      artist_id,
      shop_id,
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
        references:tattoo_project_references (
          id,
          storage_path,
          reference_type
        )
      )
    `)
    .eq('id', id)
    .single()

  // If request not found, return safe Not Found UI (do not leak existence)
  if (error || !request) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500 max-w-lg mx-auto py-24 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#171717] border border-[#262626] mb-5">
          <AlertCircle className="h-6 w-6 text-[#A3A3A3]" />
        </div>
        <h2 className="text-lg font-medium text-[#F5F5F5] mb-2">ไม่พบข้อมูลคำขอจอง</h2>
        <p className="text-sm text-[#737373] mb-8">
          ไม่มีข้อมูลคำขอจองนี้ในระบบ หรือคุณไม่มีสิทธิ์ในการเข้าถึงข้อมูล
        </p>
        <Link
          href="/artist/booking-requests"
          className="inline-flex items-center justify-center px-5 py-2.5 text-xs font-medium text-black bg-[#FFFFFF] hover:bg-[#E5E5E5] border border-[#E5E5E5] rounded-md transition-all font-sans"
        >
          กลับไปหน้ารายการ
        </Link>
      </div>
    )
  }

  // Authorization Check: Must be assigned artist or active shop owner
  const isOwner = membership.role === 'owner' && membership.status === 'active' && membership.shop_id === request.shop_id
  const isAssignedArtist = request.artist_id === user.id

  if (!isOwner && !isAssignedArtist) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500 max-w-lg mx-auto py-24 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#171717] border border-[#262626] mb-5">
          <AlertCircle className="h-6 w-6 text-[#A3A3A3]" />
        </div>
        <h2 className="text-lg font-medium text-[#F5F5F5] mb-2">ไม่พบข้อมูลคำขอจอง</h2>
        <p className="text-sm text-[#737373] mb-8">
          ไม่มีข้อมูลคำขอจองนี้ในระบบ หรือคุณไม่มีสิทธิ์ในการเข้าถึงข้อมูล
        </p>
        <Link
          href="/artist/booking-requests"
          className="inline-flex items-center justify-center px-5 py-2.5 text-xs font-medium text-black bg-[#FFFFFF] hover:bg-[#E5E5E5] border border-[#E5E5E5] rounded-md transition-all font-sans"
        >
          กลับไปหน้ารายการ
        </Link>
      </div>
    )
  }

  // Map references and batch sign them in storage (TTL 300s)
  const rawProject = Array.isArray(request.project) ? request.project[0] : (request.project as any);
  const project = rawProject || null;
  const references = (project?.references || []) as any[];
  let mappedReferences = [...references];

  if (references.length > 0) {
    const paths = references.map((ref: any) => ref.storage_path);
    const { data: signedData, error: signedError } = await supabase.storage
      .from('tattoo-references')
      .createSignedUrls(paths, 300);

    if (signedError || !signedData) {
      console.error('Failed to create signed URLs for references:', signedError);
      mappedReferences = references.map((ref: any) => ({
        ...ref,
        error: true
      }));
    } else {
      mappedReferences = references.map((ref: any) => {
        const signedObj = signedData.find((s: any) => s.path === ref.storage_path);
        return {
          ...ref,
          signedUrl: signedObj?.signedUrl || undefined,
          error: !signedObj?.signedUrl
        };
      });
    }
  }

  // Create the mapped request structure matching the BookingRequest type exactly
  const mappedRequest = {
    id: request.id,
    requested_start_at: request.requested_start_at,
    status: request.status,
    submitted_full_name: request.submitted_full_name,
    submitted_email: request.submitted_email,
    submitted_phone: request.submitted_phone,
    health_note: request.health_note,
    is_first_tattoo: request.is_first_tattoo,
    safety_notice_acknowledged: request.safety_notice_acknowledged,
    created_at: request.created_at,
    project: project ? {
      id: project.id,
      name: project.name,
      description: project.description,
      tattoo_style: project.tattoo_style,
      body_placement: project.body_placement,
      width_cm: Number(project.width_cm || 0),
      height_cm: Number(project.height_cm || 0),
      color_mode: project.color_mode,
      work_type: project.work_type,
      references: mappedReferences
    } : null
  };

  return <ArtistBookingRequestDetail request={mappedRequest} />;
}
