import { Metadata } from 'next'
import StorefrontPortfolio from '@/components/storefront/StorefrontPortfolio'

export const metadata: Metadata = {
  title: '157 TATTOO - ผลงานทั้งหมด',
  description: 'ชมผลงานทั้งหมดจากช่างสักมืออาชีพของ 157 TATTOO'
}

export default function ShopPortfolioPage() {
  return <StorefrontPortfolio />
}
