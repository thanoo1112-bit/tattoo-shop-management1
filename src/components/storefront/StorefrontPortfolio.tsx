'use client'

import React, { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function StorefrontPortfolio() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const slug = (params?.slug as string) || '157-tattoo'
  const supabase = createClient()
  const [selectedStyle, setSelectedStyle] = useState<string>('ทั้งหมด')
  const [selectedArtistId, setSelectedArtistId] = useState<string>('all')
  const [selectedItem, setSelectedItem] = useState<any | null>(null)

  useEffect(() => {
    const artistParam = searchParams ? searchParams.get('artist') : null
    if (artistParam) {
      setSelectedArtistId(artistParam)
    } else {
      setSelectedArtistId('all')
    }
  }, [searchParams])

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

  // Map real portfolio items and derive public URLs
  const displayPortfolio = portfolio.map(item => {
    const { data: urlData } = supabase.storage.from('portfolio-images').getPublicUrl(item.image_path)
    return {
      id: item.id,
      name: item.title,
      style: item.style_name || 'ไม่ระบุสไตล์',
      artist: item.artist_name || 'ไม่ระบุช่าง',
      artistId: item.artist_id || null,
      image: urlData.publicUrl,
      concept: item.concept || null,
      placement: item.placement || null,
      size: item.size_dimensions || null
    }
  })

  // Filter logic
  const filteredPortfolio = displayPortfolio.filter(item => {
    const matchesStyle = selectedStyle === 'ทั้งหมด' || item.style === selectedStyle
    const matchesArtist = selectedArtistId === 'all' || item.artistId === selectedArtistId
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
                value={selectedArtistId}
                onChange={(e) => {
                  setSelectedArtistId(e.target.value)
                  const url = new URL(window.location.href)
                  if (e.target.value === 'all') {
                    url.searchParams.delete('artist')
                  } else {
                    url.searchParams.set('artist', e.target.value)
                  }
                  router.replace(url.pathname + url.search)
                }}
                className="w-full h-11 bg-[#121212] border border-[#262626] text-[#F5F5F5] rounded-md text-xs font-semibold px-3 focus:outline-none focus:border-[#404040] cursor-pointer"
              >
                <option value="all">ช่างทั้งหมด</option>
                {artists.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
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
                    className="w-full h-full object-cover grayscale group-hover:grayscale-0 group-hover:scale-[1.02] transition-all duration-300"
                  />
                </div>
                <div className="p-4 md:p-[18px] flex-1 flex flex-col justify-center">
                  <div className="space-y-1">
                    <h3 className="text-xs md:text-sm font-bold text-[#F5F5F5] tracking-wide truncate">{item.name}</h3>
                    <p className="text-[11px] md:text-xs text-[#A3A3A3] leading-relaxed">
                      {item.style} • โดย {item.artist}
                    </p>
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
        <div 
          className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in cursor-zoom-out"
          onClick={() => setSelectedItem(null)}
        >
          {/* Close Button */}
          <button 
            onClick={() => setSelectedItem(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-colors z-50 cursor-pointer"
          >
            <X size={24} />
          </button>
          
          {/* Image */}
          <div className="relative max-w-full max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <img 
              src={selectedItem.image} 
              alt={selectedItem.name}
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  )
}
