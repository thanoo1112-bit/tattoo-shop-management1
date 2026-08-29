import { getCurrentCustomer } from '@/lib/auth/customer'
import { updateProfile } from './actions'
import ProfileForm from './ProfileForm'

export default async function CustomerProfilePage() {
  const customer = await getCurrentCustomer()

  if (!customer) {
    return <div className="text-center py-12 text-[#A3A3A3]">กรุณาเข้าสู่ระบบ</div>
  }

  return (
    <div className="max-w-xl mx-auto py-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#F5F5F5]">โปรไฟล์ของฉัน</h1>
        <p className="text-xs text-[#737373] mt-1">จัดการข้อมูลส่วนตัวของคุณเพื่อใช้ในการจองคิว</p>
      </div>

      <div className="bg-[#121212] border border-[#262626] rounded-2xl p-6 sm:p-8">
        <ProfileForm initialCustomer={customer} />
      </div>
    </div>
  )
}
