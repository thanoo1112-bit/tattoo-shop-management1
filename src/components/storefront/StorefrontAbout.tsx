'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Clock, Phone, MapPin, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function StorefrontAbout() {
  const params = useParams()
  const router = useRouter()
  const slug = (params?.slug as string) || '157-tattoo'
  const supabase = createClient()

  // Real data state
  const [shopName, setShopName] = useState<string>('157 TATTOO')
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [portfolio, setPortfolio] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [shopPhone, setShopPhone] = useState<string>('091-070-2369')
  const [shopAddress, setShopAddress] = useState<string>('151/3 1299 อำเภอเวียงชัย จังหวัดเชียงราย 57210')

  useEffect(() => {
    async function initData() {
      try {
        setLoading(true)
        // Fetch shop name and details
        const { data: shopData } = await supabase.rpc('get_public_shop_by_slug', { p_slug: slug })
        if (shopData && shopData.length > 0) {
          setShopName(shopData[0].name || '157 TATTOO')
          setLogoUrl(shopData[0].logo_url || null)
        }

        // Try to query shops table for extra details
        try {
          const { data: directShop } = await supabase
            .from('shops')
            .select('phone, address')
            .eq('slug', slug)
            .maybeSingle()
          
          if (directShop) {
            if (directShop.phone) setShopPhone(directShop.phone)
            if (directShop.address) setShopAddress(directShop.address)
          }
        } catch {
          // ignore: fallback used
        }



        // Fetch published portfolio items for dynamically pulling visual artworks
        const { data: portfolioData } = await supabase.rpc('get_public_portfolio_items', {
          p_shop_slug: slug
        })
        if (portfolioData) {
          setPortfolio(portfolioData)
        }
      } catch (e) {
        console.error('Error loading storefront about data:', e)
      } finally {
        setLoading(false)
      }
    }

    initData()
  }, [slug])

  // Resolve public URLs for portfolio images
  const displayPortfolioUrls = portfolio.map(item => {
    const { data: urlData } = supabase.storage.from('portfolio-images').getPublicUrl(item.image_path)
    return urlData.publicUrl
  })

  // Concept illustrations: fall back to premium default assets if portfolio has few uploads
  const conceptImg1 = '/images/studio/concept-back.jpg'
  const conceptImg2 = '/images/studio/hero-cover.jpg'
  const conceptImg3 = '/images/studio/story-art.jpg'

  return (
    <div className="min-h-screen bg-[#080808] text-[#E5E5E5] flex flex-col items-center selection:bg-white selection:text-black font-sans antialiased overflow-x-hidden">
      
      {/* Header */}
      <header className="w-full h-14 border-b border-[#292929] bg-[#080808] flex justify-center sticky top-0 z-50">
        <div className="w-full max-w-4xl px-5 sm:px-8 flex items-center justify-between">
          <button
            onClick={() => router.push(`/shop/${slug}`)}
            className="flex items-center gap-2 text-xs font-semibold text-[#A3A3A3] hover:text-[#F5F5F5] transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} /> กลับหน้าร้าน
          </button>
          <div className="flex items-center gap-2">
            {logoUrl ? (
              <img src={logoUrl} alt={`${shopName} Logo`} className="h-6 w-6 object-contain grayscale" />
            ) : (
              <img src="/logo.png" alt={`${shopName} Logo`} className="h-6 w-6 object-contain grayscale" />
            )}
            <span className="text-sm font-bold tracking-[0.2em] text-[#F5F5F5]">{shopName}</span>
          </div>
          <div className="w-[80px]" /> {/* Spacer */}
        </div>
      </header>

      {/* Main Container */}
      <div className="w-full flex flex-col flex-1">
        
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        ) : (
          <div className="w-full flex flex-col">
            
            {/* 2. STORY SECTION */}
            <div className="w-full bg-[#080808] py-12 md:py-20 border-b border-[#292929]/30">
              <div className="max-w-4xl mx-auto px-5 sm:px-8">
                <section className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-16 items-center">
                  {/* Mobile Headings */}
                  <div className="space-y-1 md:hidden">
                    <span className="text-[9px] uppercase tracking-wider text-[#8A8A8A] font-semibold">Our Story</span>
                    <h2 className="text-xl font-bold text-[#F5F5F5]">เรื่องราวของ {shopName}</h2>
                  </div>

                  {/* Image container */}
                  <div className="aspect-[4/3] rounded-xl overflow-hidden border border-[#292929] bg-[#121212] relative">
                    <img 
                      src="/images/studio/story-beds.jpg" 
                      alt="Tattoo Studio Space" 
                      className="w-full h-full object-cover grayscale contrast-[1.05] transition-transform duration-500 hover:scale-102"
                    />
                  </div>

                  {/* Story Content column */}
                  <div className="bg-[#111111] border border-[#292929] rounded-xl p-6 md:p-8 space-y-4 max-w-md">
                    {/* Desktop Headings */}
                    <div className="space-y-1 hidden md:block">
                      <span className="text-[9px] uppercase tracking-wider text-[#8A8A8A] font-semibold">Our Story</span>
                      <h2 className="text-xl md:text-2xl font-bold text-[#F5F5F5]">เรื่องราวของ {shopName}</h2>
                    </div>
                    <div className="space-y-4 text-xs md:text-sm text-[#A3A3A3] leading-relaxed">
                      <p>
                        {shopName} เป็นสตูดิโอสักที่ให้ความสำคัญกับการออกแบบงานให้เหมาะกับตัวตน สไตล์ และความต้องการของลูกค้าแต่ละคน
                      </p>
                      <p>
                        เราเชื่อว่างานสักไม่ได้เป็นเพียงภาพบนร่างกาย แต่เป็นงานศิลปะที่สะท้อนความชอบ เรื่องราว และความหมายของแต่ละคน
                      </p>
                      <p>
                        ทีมช่างของเราจึงให้ความสำคัญตั้งแต่การพูดคุยแนวคิด การเลือกตำแหน่ง ขนาด และสไตล์ ไปจนถึงการวางแผนงานก่อนเริ่มสักจริง
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            {/* 3. OUR PHILOSOPHY SECTION */}
            {/* Philosophy Heading Band */}
            <div className="w-full bg-[#080808] pt-16 pb-6">
              <div className="max-w-4xl mx-auto px-5 sm:px-8">
                <div className="space-y-1 text-left">
                  <span className="text-[9px] uppercase tracking-wider text-[#8A8A8A] font-semibold">Our Philosophy</span>
                  <h2 className="text-xl md:text-2xl font-bold text-[#F5F5F5]">แนวคิดของเรา</h2>
                </div>
              </div>
            </div>

            {/* Concept 1 Band (Page Base bg-[#080808]) */}
            <div className="w-full bg-[#080808] pb-12 md:pb-16">
              <div className="max-w-4xl mx-auto px-5 sm:px-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-16 items-center">
                  <div className="space-y-3 max-w-md order-1 md:order-2 bg-[#111111] border border-[#292929] rounded-xl p-6 md:p-8">
                    <span className="text-xs font-mono font-bold text-[#8A8A8A]">01 / CUSTOM DESIGN</span>
                    <h3 className="text-base md:text-lg font-bold text-[#F5F5F5]">ออกแบบให้เหมาะกับแต่ละคน</h3>
                    <p className="text-xs md:text-sm text-[#A3A3A3] leading-relaxed">
                      เราให้ความสำคัญกับรายละเอียดของงาน เพื่อให้ลายสักเหมาะกับสไตล์ ตำแหน่ง และตัวตนของแต่ละคน
                    </p>
                  </div>
                  <div className="aspect-[4/3] md:aspect-[3/4] rounded-xl overflow-hidden border border-[#292929] bg-[#121212] relative order-2 md:order-1">
                    <img 
                      src={conceptImg1} 
                      alt="ออกแบบให้เหมาะกับแต่ละคน" 
                      className="w-full h-full object-cover grayscale contrast-[1.03] transition-transform duration-500 hover:scale-102" 
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Concept 2 Band (Alternate Section Background bg-[#111111] & card elevated to bg-[#161616]) */}
            <div className="w-full bg-[#111111] py-16 md:py-20 border-y border-[#292929]/55 shadow-inner">
              <div className="max-w-4xl mx-auto px-5 sm:px-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-16 items-center">
                  <div className="space-y-3 max-w-md order-1 md:order-1 bg-[#161616] border border-[#292929] rounded-xl p-6 md:p-8">
                    <span className="text-xs font-mono font-bold text-[#8A8A8A]">02 / CRAFTSMANSHIP</span>
                    <h3 className="text-base md:text-lg font-bold text-[#F5F5F5]">ใส่ใจในทุกรายละเอียด</h3>
                    <p className="text-xs md:text-sm text-[#A3A3A3] leading-relaxed">
                      ตั้งแต่การออกแบบ เส้น น้ำหนัก และองค์ประกอบของลาย เราให้ความสำคัญกับคุณภาพของผลงานในทุกขั้นตอน
                    </p>
                  </div>
                  <div className="aspect-[4/3] rounded-xl overflow-hidden border border-[#292929] bg-[#121212] order-2 md:order-2 relative">
                    <img 
                      src={conceptImg2} 
                      alt="ใส่ใจในทุกรายละเอียด" 
                      className="w-full h-full object-cover grayscale contrast-[1.03] transition-transform duration-500 hover:scale-102" 
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Concept 3 Band (Page Base bg-[#080808]) */}
            <div className="w-full bg-[#080808] py-16 md:py-20 border-b border-[#292929]/30">
              <div className="max-w-4xl mx-auto px-5 sm:px-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-16 items-center">
                  <div className="space-y-3 max-w-md order-1 md:order-2 bg-[#111111] border border-[#292929] rounded-xl p-6 md:p-8">
                    <span className="text-xs font-mono font-bold text-[#8A8A8A]">03 / STUDIO</span>
                    <h3 className="text-base md:text-lg font-bold text-[#F5F5F5]">พื้นที่สำหรับศิลปะและตัวตน</h3>
                    <p className="text-xs md:text-sm text-[#A3A3A3] leading-relaxed">
                      157 TATTOO ต้องการเป็นพื้นที่ที่เปิดให้แต่ละคนถ่ายทอดความชอบ เรื่องราว และตัวตนผ่านงานสักในแบบของตัวเอง
                    </p>
                  </div>
                  <div className="aspect-[4/3] md:aspect-[3/4] rounded-xl overflow-hidden border border-[#292929] bg-[#121212] relative order-2 md:order-1">
                    <img 
                      src={conceptImg3} 
                      alt="พื้นที่สำหรับศิลปะและตัวตน" 
                      className="w-full h-full object-cover grayscale contrast-[1.03] transition-transform duration-500 hover:scale-102" 
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 6. SHOP INFORMATION (Full Width bg-[#111111] & card bg-[#151515]) */}
            <div className="w-full bg-[#111111] py-16 md:py-20 border-b border-[#292929]/55 shadow-inner">
              <div className="max-w-4xl mx-auto px-5 sm:px-8">
                <div className="space-y-1 text-left mb-8 md:mb-12">
                  <span className="text-[9px] uppercase tracking-wider text-[#8A8A8A] font-semibold">Visit Us</span>
                  <h2 className="text-xl md:text-2xl font-bold text-[#F5F5F5]">ข้อมูลร้าน</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 border border-[#292929] bg-[#151515] rounded-xl overflow-hidden shadow-xl">
                  <div className="p-6 md:p-8 space-y-6 text-xs md:text-sm text-[#A3A3A3] flex flex-col justify-center">
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <span className="text-[9px] uppercase tracking-wider text-[#8A8A8A] font-semibold block">ชื่อร้าน</span>
                        <span className="text-[#F5F5F5] font-semibold">{shopName}</span>
                      </div>
                      {shopPhone && (
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase tracking-wider text-[#8A8A8A] font-semibold block">เบอร์โทรศัพท์</span>
                          <a href={`tel:${shopPhone}`} className="text-[#F5F5F5] font-semibold hover:underline block">
                            {shopPhone}
                          </a>
                        </div>
                      )}
                      <div className="space-y-1">
                        <span className="text-[9px] uppercase tracking-wider text-[#8A8A8A] font-semibold block">เวลาเปิดทำการ</span>
                        <span className="text-[#F5F5F5] font-semibold">10:00 - 23:30 น.</span>
                      </div>
                      {shopAddress && (
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase tracking-wider text-[#8A8A8A] font-semibold block">ที่อยู่</span>
                          <span className="text-[#F5F5F5] font-semibold leading-relaxed block">{shopAddress}</span>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shopAddress)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hidden md:inline-flex items-center text-[10px] font-semibold text-[#A3A3A3] hover:text-[#F5F5F5] transition-colors mt-1 hover:underline gap-1 cursor-pointer"
                          >
                            เปิดใน Google Maps →
                          </a>
                        </div>
                      )}

                      {/* Mobile Action Buttons */}
                      <div className="flex gap-3 md:hidden pt-2">
                        {shopPhone && (
                          <a
                            href={`tel:${shopPhone}`}
                            className="flex-1 py-2.5 px-4 bg-[#1A1A1A] border border-[#292929] hover:bg-[#262626] text-[#F5F5F5] transition-colors text-xs font-semibold rounded-md text-center"
                          >
                            โทรหาร้าน
                          </a>
                        )}
                        {shopAddress && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shopAddress)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 py-2.5 px-4 bg-[#1A1A1A] border border-[#292929] hover:bg-[#262626] text-[#F5F5F5] transition-colors text-xs font-semibold rounded-md text-center"
                          >
                            เปิดแผนที่
                          </a>
                        )}
                      </div>

                      {/* Desktop Social Links */}
                      <div className="space-y-2 hidden md:block">
                        <span className="text-[9px] uppercase tracking-wider text-[#8A8A8A] font-semibold block">ช่องทางติดต่อ</span>
                        <div className="flex gap-4 text-[#A3A3A3]">
                          <a href="https://www.instagram.com/157_tattoo" target="_blank" rel="noopener noreferrer" className="hover:text-[#F5F5F5] transition-colors">
                            Instagram
                          </a>
                          <a href="https://www.facebook.com/profile.php?id=61550501946125" target="_blank" rel="noopener noreferrer" className="hover:text-[#F5F5F5] transition-colors">
                            Facebook
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Map on desktop / Map + Social below on mobile */}
                  <div className="flex flex-col border-t md:border-t-0 md:border-l border-[#292929] w-full">
                    <div className="relative overflow-hidden w-full h-[280px] md:h-full min-h-[280px]">
                      <iframe
                        src={`https://maps.google.com/maps?q=${encodeURIComponent(shopAddress)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                        className="w-full h-full border-0 grayscale invert-[0.92] contrast-[1.2] opacity-80"
                        allowFullScreen
                        loading="lazy"
                        title={`${shopName} Location Map`}
                      />
                    </div>
                    
                    {/* Mobile Social Links below Map */}
                    <div className="p-5 border-t border-[#292929] flex flex-col gap-2 md:hidden bg-[#151515]">
                      <span className="text-[9px] uppercase tracking-wider text-[#8A8A8A] font-semibold">ช่องทางติดต่อ</span>
                      <div className="flex gap-4 text-xs text-[#A3A3A3]">
                        <a href="https://www.instagram.com/157_tattoo" target="_blank" rel="noopener noreferrer" className="hover:text-[#F5F5F5] transition-colors">
                          Instagram
                        </a>
                        <a href="https://www.facebook.com/profile.php?id=61550501946125" target="_blank" rel="noopener noreferrer" className="hover:text-[#F5F5F5] transition-colors">
                          Facebook
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 7. CTA BOTTOM (Full Width bg-[#080808] & card bg-[#111111]) */}
            <div className="w-full bg-[#080808] py-16 md:py-24 border-t border-[#292929]/20">
              <div className="max-w-4xl mx-auto px-5 sm:px-8">
                <section className="bg-[#111111] border border-[#292929] rounded-xl p-8 md:p-12 text-center space-y-6 relative overflow-hidden shadow-xl">
                  <div className="relative z-10 space-y-4">
                    <h2 className="text-xl md:text-2xl font-bold text-[#F5F5F5]">
                      พร้อมเริ่มต้นงานสักของคุณแล้วหรือยัง?
                    </h2>
                    <p className="text-xs text-[#8A8A8A] max-w-sm mx-auto">
                      เข้าชมแกลเลอรีผลงานการออกแบบ หรือกรอกรายละเอียดความต้องการเพื่อส่งคำขอจองคิวงานสักได้ทันที
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-sm mx-auto pt-2 w-full">
                      <a
                        href={`/shop/${slug}/portfolio`}
                        className="py-3.5 px-5 bg-[#1A1A1A] border border-[#292929] hover:bg-[#262626] text-[#F5F5F5] transition-colors text-xs font-semibold rounded-md text-center cursor-pointer w-full sm:flex-1"
                      >
                        ดูผลงาน
                      </a>
                      <a
                        href={`/book/${slug}`}
                        className="py-3.5 px-5 bg-white hover:bg-neutral-200 text-black transition-colors text-xs font-semibold rounded-md text-center cursor-pointer w-full sm:flex-1"
                      >
                        ส่งคำขอจอง
                      </a>
                    </div>
                  </div>
                </section>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
