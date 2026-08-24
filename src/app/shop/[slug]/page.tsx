import { Metadata } from 'next'
import StorefrontHome from '@/components/storefront/StorefrontHome'

export const metadata: Metadata = {
  title: '157 TATTOO - สตูดิโอศิลปะบนเรือนร่าง เชียงราย',
  description: 'สตูดิโอศิลปะบนเรือนร่าง รังสรรค์งานสักที่สะท้อนตัวตนในแบบของคุณ ณ เชียงราย'
}

export default function ShopStorefrontPage() {
  return <StorefrontHome />
}
