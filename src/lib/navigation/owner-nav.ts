import { 
  LayoutDashboard, 
  CalendarDays, 
  ClipboardList, 
  Inbox, 
  Users, 
  UserSquare, 
  Wallet, 
  BarChart3, 
  Settings,
  Image,
  ExternalLink
} from 'lucide-react'

export const ownerNavigation = [
  { name: 'ภาพรวม', href: '/owner/dashboard', icon: LayoutDashboard },
  { name: 'คิวงาน', href: '/owner/appointments', icon: ClipboardList },
  { name: 'ปฏิทิน', href: '/owner/calendar', icon: CalendarDays },
  { name: 'คำขอจอง', href: '/owner/booking-requests', icon: Inbox },
  { name: 'ช่างสัก', href: '/owner/artists', icon: Users },
  { name: 'ลูกค้า', href: '/owner/customers', icon: UserSquare },
  { name: 'ผลงาน', href: '/owner/portfolio', icon: Image },
  { name: 'การเงิน', href: '/owner/finance', icon: Wallet },
  { name: 'รายงาน', href: '/owner/reports', icon: BarChart3 },
  { name: 'ตั้งค่าร้าน', href: '/owner/settings', icon: Settings },
  { name: 'หน้าร้านสาธารณะ', href: '/shop/157-tattoo', icon: ExternalLink },
]
