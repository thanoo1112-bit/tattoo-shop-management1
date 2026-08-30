import { Metadata } from 'next'
import { Suspense } from 'react'
import StorefrontPortfolio from '@/components/storefront/StorefrontPortfolio'

export const metadata: Metadata = {
  title: '157 TATTOO - ผลงานทั้งหมด',
  description: 'ชมผลงานทั้งหมดจากช่างสักมืออาชีพของ 157 TATTOO'
}

export default function ShopPortfolioPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
      </div>
    }>
      <StorefrontPortfolio />
    </Suspense>
  )
}
