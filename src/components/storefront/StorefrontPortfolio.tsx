'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function StorefrontPortfolio() {
  const params = useParams()
  const router = useRouter()
  const slug = (params?.slug as string) || '157-tattoo'
  const supabase = createClient()
  const [selectedStyle, setSelectedStyle] = useState<string>('ทั้งหมด')
  const [selectedArtist, setSelectedArtist] = useState<string>('ช่างทั้งหมด')
  const [selectedItem, setSelectedItem] = useState<any | null>(null)

  // Real data state
  const [shopName, setShopName] = useState<string>('157 TATTOO')
  const [artists, setArtists] = useState<any[]>([])
  const [styles, setStyles] = useState<string[]>(['ทั้งหมด'])
  const [portfolio, setPortfolio] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [portfolioError, setPortfolioError] = useState<boolean>(false)

  // Fetch real shop and artist data
  useEffect(() => {
    async function initData() {
      try {
        setLoading(true)
        // Fetch shop name
        const { data: shopData } = await supabase.rpc('get_public_shop_by_slug', { p_slug: slug })
        if (shopData && shopData.length > 0) {
          setShopName(shopData[0].name || '157 TATTOO')
        }

        // Fetch active artists
        const { data: artistsData } = await supabase.rpc('get_public_artists_by_shop_slug', { p_slug: slug })
        if (artistsData && artistsData.length > 0) {
          // Resolve specialties for each artist
          const artistsWithSpecialties = await Promise.all(
            artistsData.map(async (art: any) => {
              const { data: stylesData } = await supabase.rpc('get_public_artist_tattoo_styles', {
                p_shop_slug: slug,
                p_artist_id: art.artist_id
              })
              const specialties = stylesData && stylesData.length > 0
                ? stylesData.map((s: any) => s.name)
                : ['Tattoo Artist']
              return {
                id: art.artist_id,
                name: art.display_name,
                avatar: art.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=300&auto=format&fit=crop&q=80',
                specialties
              }
            })
          )
          setArtists(artistsWithSpecialties)

          // Aggregate all unique specialties to shop-level style list
          const uniqueStyles = new Set<string>()
          artistsWithSpecialties.forEach(art => {
            art.specialties.forEach((spec: string) => {
              if (spec !== 'Tattoo Artist') {
                uniqueStyles.add(spec)
              }
            })
          })
          if (uniqueStyles.size > 0) {
            setStyles([...new Set(['ทั้งหมด', ...Array.from(uniqueStyles)])])
          }
        }
        
        // Fetch published portfolio items via narrow RPC
        const { data: portfolioData, error: portfolioErr } = await supabase.rpc('get_public_portfolio_items', {
          p_shop_slug: slug
        })
        if (portfolioErr) {
          setPortfolioError(true)
        } else {
          setPortfolio(portfolioData || [])
        }
      } catch (e) {
        console.error('Error loading storefront data:', e)
      } finally {
        setLoading(false)
      }
    }

    initData()
  }, [slug])

  const artistsList = ['ช่างทั้งหมด', ...artists.map(a => a.name)]

  // Map real portfolio items and derive public URLs
  const displayPortfolio = portfolio.map(item => {
    const { data: urlData } = supabase.storage.from('portfolio-images').getPublicUrl(item.image_path)
    return {
      id: item.id,
      name: item.title,
      style: item.style_name || 'ไม่ระบุสไตล์',
      artist: item.artist_name || 'ไม่ระบุช่าง',
      image: urlData.publicUrl,
      concept: item.concept || null,
      placement: item.placement || null,
      size: item.size_dimensions || null
    }
  })

  // Filter logic
  const filteredPortfolio = displayPortfolio.filter(item => {
    const matchesStyle = selectedStyle === 'ทั้งหมด' || item.style === selectedStyle
    const matchesArtist = selectedArtist === 'ช่างทั้งหมด' || item.artist === selectedArtist
    return matchesStyle && matchesArtist
  })

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E5E5E5] flex flex-col items-center selection:bg-white selection:text-black font-sans antialiased overflow-x-hidden">
      {/* Header */}
      <header className="w-full h-14 border-b border-[#262626] bg-[#0A0A0A] px-4 flex items-center justify-between sticky top-0 z-50 max-w-[1280px]">
        <button
          onClick={() => router.push(`/shop/${slug}`)}
          className="flex items-center gap-2 text-xs font-semibold text-[#A3A3A3] hover:text-[#F5F5F5] transition-colors cursor-pointer"
        >
          <ArrowLeft size={16} /> กลับหน้าร้าน
        </button>
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="157 TATTOO Logo" className="h-6 w-6 object-contain grayscale" />
          <span className="text-sm font-bold tracking-[0.2em] text-[#F5F5F5]">{shopName}</span>
        </div>
        <div className="w-[80px]" /> {/* Spacer */}
      </header>

      {/* Main Container */}
      <div className="max-w-[1280px] w-full mx-auto px-4 sm:px-8 py-8 flex flex-col flex-1">
        
        {/* Page Title */}
        <div className="border-b border-[#262626] pb-6 mb-8 space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-[#737373] font-semibold">Our Work</span>
          <h1 className="text-2xl md:text-3xl font-bold text-[#F5F5F5]">ผลงานทั้งหมดของเรา</h1>
        </div>

        {/* Filter Section */}
        <div className="border-b border-[#262626] pb-6 mb-8 space-y-5">
          <h2 className="text-sm font-semibold text-[#F5F5F5]">ตัวกรอง</h2>
          
          <div className="space-y-4">
            {/* Style Pills with Wrap */}
            <div className="space-y-2">
              <label className="text-[11px] font-medium text-[#737373] uppercase tracking-wider block">สไตล์งาน</label>
              <div className="flex flex-wrap gap-2">
                {styles.map((styleName) => (
                  <button
                    key={styleName}
                    onClick={() => setSelectedStyle(styleName)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border cursor-pointer ${
                      selectedStyle === styleName
                        ? 'bg-white text-black border-white'
                        : 'bg-[#121212] text-[#A3A3A3] border-[#262626] hover:border-[#404040]'
                    }`}
                  >
                    {styleName === 'ทั้งหมด' ? 'ทั้งหมด' : styleName}
                  </button>
                ))}
              </div>
            </div>

            {/* Artist Dropdown */}
            <div className="space-y-1.5 max-w-xs">
              <label className="text-[11px] font-medium text-[#737373] uppercase tracking-wider block">ผลงานโดย</label>
              <select
                value={selectedArtist}
                onChange={(e) => setSelectedArtist(e.target.value)}
                className="w-full h-11 bg-[#121212] border border-[#262626] text-[#F5F5F5] rounded-md text-xs font-semibold px-3 focus:outline-none focus:border-[#404040] cursor-pointer"
              >
                {artistsList.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Portfolio Grid */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        ) : portfolioError ? (
          <div className="py-20 text-center text-red-400/85 text-sm bg-red-500/5 rounded-xl border border-red-500/10">
            ไม่สามารถโหลดผลงานได้ในขณะนี้
          </div>
        ) : filteredPortfolio.length === 0 ? (
          <div className="py-20 text-center text-[#737373] text-sm bg-[#171717] rounded-xl border border-[#262626]">
            {portfolio.length === 0 ? 'ยังไม่มีผลงานที่เผยแพร่' : 'ไม่พบผลงานตามสไตล์หรือช่างที่เลือก'}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
            {filteredPortfolio.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className="bg-[#171717] border border-[#262626] rounded-xl overflow-hidden flex flex-col h-full group cursor-pointer hover:border-[#404040] transition-colors"
              >
                <div className="relative aspect-[4/5] bg-[#121212] overflow-hidden">
                  <img 
                    src={item.image} 
                    alt={item.name}
                    className="w-full h-full object-cover grayscale group-hover:scale-[1.02] transition-transform duration-300"
                  />
                </div>
                <div className="p-4 md:p-[18px] flex-1 flex flex-col justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-xs md:text-sm font-bold text-[#F5F5F5] tracking-wide truncate">{item.name}</h3>
                    <p className="text-[11px] md:text-xs text-[#A3A3A3] leading-relaxed">
                      {item.style} • โดย {item.artist}
                    </p>
                  </div>

                  <div className="flex items-center justify-end text-[11px] md:text-xs font-semibold text-[#F5F5F5] border-t border-[#262626]/60 pt-2.5 md:pt-3 mt-auto">
                    <span>ดูรายละเอียด →</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="w-full max-w-[1280px] border-t border-[#262626] bg-[#0A0A0A] py-8 text-center text-xs text-[#555555]">
        <p>© 2026 {shopName}. All rights reserved.</p>
      </footer>

      {/* Details Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#171717] border border-[#262626] rounded-2xl w-full max-w-[440px] md:max-w-[850px] h-[88vh] max-h-[88vh] flex flex-col relative overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="h-14 flex items-center justify-between border-b border-[#262626] px-5 bg-[#171717] z-20 flex-shrink-0">
              <span className="text-sm font-bold uppercase tracking-wider text-[#F5F5F5] truncate pr-4">
                {selectedItem.name}
              </span>
              <button 
                onClick={() => setSelectedItem(null)}
                className="p-1.5 rounded-md hover:bg-[#262626] text-[#A3A3A3] hover:text-[#F5F5F5] transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto flex flex-col md:flex-row min-h-0">
              {/* Left Side (Image Area) */}
              <div className="w-full md:w-[50%] md:h-full md:border-r border-[#262626] bg-[#171717] flex-shrink-0 flex items-center justify-center relative overflow-hidden">
                {/* Mobile View: Full image without cropping */}
                <img 
                  src={selectedItem.image} 
                  alt={selectedItem.name}
                  className="w-full h-auto object-contain grayscale md:hidden"
                />
                {/* Desktop View: Full frame cover */}
                <img 
                  src={selectedItem.image} 
                  alt={selectedItem.name}
                  className="hidden md:block w-full h-full object-cover grayscale"
                />
              </div>

              {/* Right Side */}
              <div className="flex-1 p-5 space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.15em] text-[#737373] font-bold">
                      {selectedItem.style}
                    </span>
                    <span className="text-[10px] font-mono text-[#F5F5F5] bg-[#121212] px-2 py-0.5 border border-[#262626] rounded">
                      ออกแบบโดยช่าง {selectedItem.artist}
                    </span>
                  </div>
                  
                  {(selectedItem.placement || selectedItem.size) && (
                    <div className="grid grid-cols-2 gap-3 text-xs bg-[#121212]/40 border border-[#262626] p-3.5 rounded-lg">
                      {selectedItem.placement ? (
                        <div className="space-y-0.5">
                          <span className="text-[9px] uppercase tracking-wider text-[#737373] block">ตำแหน่งแนะนำ</span>
                          <span className="text-[#F5F5F5] font-semibold">{selectedItem.placement}</span>
                        </div>
                      ) : <div />}
                      {selectedItem.size ? (
                        <div className={`space-y-0.5 ${selectedItem.placement ? 'border-l border-[#262626] pl-3.5' : ''}`}>
                          <span className="text-[9px] uppercase tracking-wider text-[#737373] block">ขนาดตัวอย่าง</span>
                          <span className="text-[#F5F5F5] font-semibold">{selectedItem.size}</span>
                        </div>
                      ) : <div />}
                    </div>
                  )}
                </div>

                <div className="text-[#A3A3A3] text-xs md:text-sm leading-relaxed space-y-3 pt-3 border-t border-[#262626]/60">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-[0.15em] text-[#737373] font-bold block">รายละเอียด</span>
                    <p>สไตล์: {selectedItem.style}</p>
                    <p>ผู้ออกแบบและลงเข็ม: ช่าง {selectedItem.artist}</p>
                  </div>
                  
                  {selectedItem.concept && (
                    <div className="space-y-1.5 pt-2">
                      <span className="text-[10px] uppercase tracking-[0.15em] text-[#737373] font-bold block">Concept / Story</span>
                      <p className="bg-[#121212] border border-[#262626] p-4 rounded-lg text-[#D4D4D4] italic font-serif leading-relaxed">
                        "{selectedItem.concept}"
                      </p>
                    </div>
                  )}

                  {selectedItem.placement && (
                    <div className="space-y-1 pt-2 border-t border-[#262626]/30">
                      <p>งานดีไซน์ชิ้นนี้มีมิติความโค้งมนที่สอดคล้องกับสรีระบริเวณ <span className="text-[#F5F5F5] font-medium">{selectedItem.placement}</span> เป็นพิเศษ</p>
                      {selectedItem.size && (
                        <p>สามารถปรับเปลี่ยนย่อ-ขยายขนาดจากขนาดมาตรฐานคือ <span className="text-[#F5F5F5] font-medium">{selectedItem.size}</span> เพื่อให้รับกับสัดส่วนจริงของลูกค้าได้โดยตรง</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
