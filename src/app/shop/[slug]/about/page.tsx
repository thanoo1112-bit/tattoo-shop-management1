import { Metadata } from 'next'
import StorefrontAbout from '@/components/storefront/StorefrontAbout'

export const metadata: Metadata = {
  title: '157 TATTOO - เกี่ยวกับเรา',
  description: 'เรื่องราว แนวคิด และขั้นตอนการทำงานของสตูดิโอสัก 157 TATTOO'
}

export default function ShopAboutPage() {
  return <StorefrontAbout />
}
