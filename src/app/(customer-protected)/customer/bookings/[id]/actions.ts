'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentCustomer } from '@/lib/auth/customer'
import { revalidatePath } from 'next/cache'

export async function cancelBooking(bookingId: string) {
  const customer = await getCurrentCustomer()
  if (!customer) return { error: 'กรุณาเข้าสู่ระบบก่อน' }

  const supabase = await createClient()

  // 1. Resolve and lock booking request
  const { data: booking, error: fetchErr } = await supabase
    .from('booking_requests')
    .select('id, status, customer_id, project_id')
    .eq('id', bookingId)
    .single()

  if (fetchErr || !booking) {
    return { error: 'ไม่พบข้อมูลการจอง' }
  }

  // 2. Validate ownership
  if (booking.customer_id !== customer.id) {
    return { error: 'ไม่มีสิทธิ์ยกเลิกรายการนี้' }
  }

  // 3. Check status is pending_review or pending_payment
  if (booking.status !== 'pending_review' && booking.status !== 'pending_payment') {
    return { error: 'ไม่สามารถยกเลิกงานนี้ได้เนื่องจากสถานะเปลี่ยนไปแล้ว' }
  }

  // Double check payment status: if any payment is confirmed (paid), block cancel
  const { data: payments } = await supabase
    .from('payments')
    .select('id, status')
    .eq('booking_request_id', booking.id)

  const hasPaidPayment = payments?.some(p => p.status === 'paid')
  if (hasPaidPayment) {
    return { error: 'ไม่สามารถยกเลิกคำขอจองได้ เนื่องจากได้รับการยืนยันชำระเงินเรียบร้อยแล้ว' }
  }

  // 4. Perform update to cancelled
  const { error: updateErr } = await supabase
    .from('booking_requests')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString()
    })
    .eq('id', booking.id)

  if (updateErr) {
    return { error: updateErr.message }
  }

  // Release booking schedule hold
  await supabase
    .from('booking_schedule_holds')
    .delete()
    .eq('booking_request_id', booking.id)

  // If there's an associated project, set its status to cancelled too
  if (booking.project_id) {
    await supabase
      .from('tattoo_projects')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', booking.project_id)
  }

  revalidatePath(`/customer/bookings/${booking.id}`)
  return { success: true }
}
