'use client'

import React, { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Menu, X, ArrowRight, MapPin, Phone, Clock, Calendar, Pencil, Layers, Plus, MessageSquare, UserRound, Images, CalendarCheck, Palette } from 'lucide-react'
import { mockArtists } from '@/app/design-lab/customer-home-v2/_data/mockData'
import { createClient } from '@/lib/supabase/client'

export default function StorefrontHome() {
  const params = useParams()
  const slug = (params?.slug as string) || '157-tattoo'
  const supabase = createClient()
  const [selectedStyle, setSelectedStyle] = useState<string>('ทั้งหมด')
  const [selectedArtist, setSelectedArtist] = useState<string>('ช่างทั้งหมด')
  const [selectedItem, setSelectedItem] = useState<any | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false)
  const [activeTab, setActiveTab] = useState<string>('หน้าแรก')
  const [expandedSection, setExpandedSection] = useState<'concept' | 'placement' | 'prebooking' | null>('concept')

  // Customer session state
  const [currentUser, setCurrentUser] = useState<any | null>(null)
  const [isStaff, setIsStaff] = useState<boolean>(false)
  const [customerName, setCustomerName] = useState<string>('')
  const [accountDropdownOpen, setAccountDropdownOpen] = useState<boolean>(false)

  // Real data state
  const [shopName, setShopName] = useState<string>('157 TATTOO')
  const [artists, setArtists] = useState<any[]>([])
  const [styles, setStyles] = useState<string[]>(['ทั้งหมด', 'Fine Line', 'Botanical', 'Cyber Sigil', 'Blackwork', 'Japanese', 'Minimal'])
  const [portfolio, setPortfolio] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [portfolioError, setPortfolioError] = useState<boolean>(false)
  const [flashDesigns, setFlashDesigns] = useState<any[]>([])
  const [flashLoading, setFlashLoading] = useState<boolean>(true)
  const [flashHoldError, setFlashHoldError] = useState<string | null>(null)
  const [holdingFlashId, setHoldingFlashId] = useState<string | null>(null)
  const [selectedFlash, setSelectedFlash] = useState<any | null>(null)
  const [selectedFlashVariants, setSelectedFlashVariants] = useState<any[]>([])
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)

  // Check user session and customer role
  useEffect(() => {
    async function checkUserSession() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          setCurrentUser(user)
          
          // Check if they are a shop member (Staff)
          const { data: membership } = await supabase
            .from('shop_members')
            .select('role, status')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .maybeSingle()

          if (membership) {
            setIsStaff(true)
          } else {
            // Not staff -> load customer record for name
            const { data: shopData } = await supabase.rpc('get_public_shop_by_slug', { p_slug: slug })
            if (shopData && shopData.length > 0) {
              const shopId = shopData[0].id
              
              const { data: customerRow } = await supabase
                .from('customers')
                .select('full_name')
                .eq('shop_id', shopId)
                .eq('auth_user_id', user.id)
                .maybeSingle()
                
              if (customerRow) {
                setCustomerName(customerRow.full_name)
              } else {
                // Fallback name
                setCustomerName(user.user_metadata?.full_name || user.email?.split('@')[0] || 'ลูกค้า')
                console.log('Customer row not found for logged in auth user, using fallback metadata name')
              }
            }
          }
        }
      } catch (err) {
        console.error('Error checking user session in storefront:', err)
      }
    }
    checkUserSession()
  }, [slug])

  // Sign out handler
  async function handleSignOut() {
    try {
      await supabase.auth.signOut()
      setCurrentUser(null)
      setIsStaff(false)
      setCustomerName('')
      setMobileMenuOpen(false)
      window.location.href = `/shop/${slug}`
    } catch (err) {
      console.error('Error signing out:', err)
    }
  }

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

        // Fetch public Flash designs
        try {
          const { data: flashData } = await supabase
            .from('flash_designs')
            .select(`
              id, flash_code, artist_id, style_id, image_path, size, price, status, style_name, held_expires_at,
              profiles ( full_name )
            `)
            .eq('status', 'open')
            .order('created_at', { ascending: false })
          setFlashDesigns(
            (flashData || []).map((f: any) => ({
              ...f,
              artist_name: f.profiles?.full_name || 'ช่างนิรนาม',
              style_name: f.style_name || '',
            }))
          )
        } catch {
          // non-fatal: flash section just stays empty
        } finally {
          setFlashLoading(false)
        }
      } catch (err) {
        console.error('Error fetching storefront database data:', err)
        setPortfolioError(true)
        setFlashLoading(false)
      } finally {
        setLoading(false)
      }
    }
    initData()
  }, [slug])

  // Auto open flash modal if flash_id is in URL query parameters (e.g. after redirecting back from login)
  useEffect(() => {
    if (flashDesigns.length === 0) return;
    const urlParams = new URLSearchParams(window.location.search);
    const urlFlashId = urlParams.get('flash_id');
    if (urlFlashId) {
      const matched = flashDesigns.find(f => f.id === urlFlashId);
      if (matched) {
        // Prevent infinite redirect by clearing URL search parameters safely
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
        openFlashModal(matched);
      }
    }
  }, [flashDesigns]);

  const getFlashImageUrl = (path: string) => {
    const { data } = supabase.storage.from('flash-images').getPublicUrl(path)
    return data.publicUrl
  }

  const openFlashModal = async (flash: any) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      const returnTo = `/shop/${slug}?flash_id=${flash.id}`
      window.location.href = `/customer/login?shop=${slug}&returnTo=${encodeURIComponent(returnTo)}`
      return
    }

    setSelectedFlash(flash)
    setSelectedFlashVariants([])
    setSelectedVariantId(null)
    setFlashHoldError(null)

    try {
      const { data: variants, error } = await supabase
        .from('flash_design_variants')
        .select('*')
        .eq('flash_design_id', flash.id)
        .eq('is_enabled', true)
        .order('sort_order', { ascending: true })

      if (!error && variants) {
        setSelectedFlashVariants(variants)
        if (variants.length > 0) {
          setSelectedVariantId(variants[0].id)
        }
      }
    } catch (e) {
      console.error('Failed to load flash variants:', e)
    }
  }

  const handleBookFlash = async (flash: any) => {
    if (selectedFlashVariants.length > 0 && !selectedVariantId) {
      setFlashHoldError('กรุณาเลือกขนาดที่ต้องการ')
      return
    }

    const params = new URLSearchParams()
    if (selectedVariantId) {
      params.set('variant_id', selectedVariantId)
    }
    const queryString = params.toString()
    window.location.href = `/shop/${slug}/flash/${flash.id}/book${queryString ? `?${queryString}` : ''}`
  }

  const getFlashDisplayState = (flash: any) => {
    if (!flash) return 'open';
    if (flash.status === 'sold') return 'sold';
    if (flash.status === 'closed') return 'closed';
    return 'open';
  };

  // Resolve active artists and styles (falls back to mock if empty)
  const displayArtists = artists.length > 0 ? artists : mockArtists
  const artistsList = ['ช่างทั้งหมด', ...displayArtists.map(a => a.name)]

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

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [mobileMenuOpen])

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5] font-sans selection:bg-[#F5F5F5] selection:text-black">
      
      {/* 1. NAVBAR / MOBILE HEADER */}
      {/* Desktop Navbar (>= 768px) */}
      <nav className="hidden md:flex h-16 border-b border-[#262626] bg-[#0A0A0A] sticky top-0 z-50">
        <div className="max-w-[1280px] w-full mx-auto px-8 flex items-center justify-between">
          <a href="#home" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="flex items-center gap-2.5 group">
            <img src="/logo.png" alt="157 TATTOO Logo" className="h-7 w-7 object-contain grayscale" />
            <span className="text-sm font-bold tracking-[0.2em] text-[#F5F5F5] group-hover:text-white transition-colors">{shopName}</span>
          </a>
          
          <div className="flex items-center gap-6 text-xs font-semibold uppercase tracking-wider text-[#A3A3A3]">
            <a href="#home" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="hover:text-[#F5F5F5] transition-colors">หน้าแรก</a>
            <a href="#tattoos" onClick={(e) => { e.preventDefault(); document.getElementById('tattoos')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-[#F5F5F5] transition-colors">ผลงาน</a>
            <a href="#artists" onClick={(e) => { e.preventDefault(); document.getElementById('artists')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-[#F5F5F5] transition-colors">ช่างสัก</a>
            <a href="#services" onClick={(e) => { e.preventDefault(); document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-[#F5F5F5] transition-colors">บริการ</a>
            <a href="#about" onClick={(e) => { e.preventDefault(); document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-[#F5F5F5] transition-colors">เกี่ยวกับเรา</a>
            <a href="#contact" onClick={(e) => { e.preventDefault(); document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-[#F5F5F5] transition-colors">ติดต่อเรา</a>
          </div>

          <div className="flex items-center gap-4">
            {/* Social Icons */}
            <div className="flex items-center gap-1">
              <a 
                href="https://www.instagram.com/157_tattoo" 
                target="_blank" 
                rel="noopener noreferrer" 
                aria-label="Instagram"
                className="w-9 h-9 flex items-center justify-center text-[#A3A3A3] hover:text-[#F5F5F5] transition-colors"
              >
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                </svg>
              </a>
              <a 
                href="https://www.facebook.com/profile.php?id=61550501946125" 
                target="_blank" 
                rel="noopener noreferrer" 
                aria-label="Facebook"
                className="w-9 h-9 flex items-center justify-center text-[#A3A3A3] hover:text-[#F5F5F5] transition-colors"
              >
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
                </svg>
              </a>
            </div>

            {/* Divider */}
            <div className="w-px h-5 bg-[#262626] self-center" />

            {/* Actions */}
            <div className="flex items-center gap-3">
              <a href="/track" className="px-4 py-2 bg-[#171717] border border-[#404040] text-[#F5F5F5] hover:bg-[#262626] transition-colors rounded-md text-xs font-semibold cursor-pointer block text-center">
                ติดตามสถานะ
              </a>
              <a href={`/book/${slug}`} className="px-4 py-2 bg-[#FFFFFF] hover:bg-[#E5E5E5] text-black transition-colors rounded-md text-xs font-semibold cursor-pointer block text-center">
                จองคิวสัก
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Header (< 768px) */}
      <header className="md:hidden h-14 border-b border-[#262626] bg-[#0A0A0A] px-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="157 TATTOO Logo" className="h-6 w-6 object-contain grayscale" />
          <span className="text-sm font-bold tracking-[0.2em] text-[#F5F5F5]">{shopName}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Social Icons */}
          <div className="flex items-center gap-1.5">
            <a 
              href="https://www.instagram.com/157_tattoo" 
              target="_blank" 
              rel="noopener noreferrer" 
              aria-label="Instagram"
              className="w-8 h-8 flex items-center justify-center text-[#A3A3A3] active:text-[#F5F5F5] transition-colors"
            >
              <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
              </svg>
            </a>
            <a 
              href="https://www.facebook.com/profile.php?id=61550501946125" 
              target="_blank" 
              rel="noopener noreferrer" 
              aria-label="Facebook"
              className="w-8 h-8 flex items-center justify-center text-[#A3A3A3] active:text-[#F5F5F5] transition-colors"
            >
              <svg className="w-[17px] h-[17px]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
              </svg>
            </a>
          </div>
          
          {/* Hamburger button */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 ml-1 text-[#A3A3A3] hover:text-[#F5F5F5] active:scale-95 transition-transform"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Backdrop */}
      {mobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 z-[90] bg-[#000000]/70 transition-opacity animate-fade-in" 
          onClick={() => setMobileMenuOpen(false)} 
        />
      )}

      {/* Mobile Drawer (Slides in from the RIGHT) */}
      <div className={`md:hidden fixed inset-y-0 right-0 z-[100] w-[320px] max-w-[85vw] bg-[#121212] border-l border-[#262626] transform transition-transform duration-300 ease-in-out flex flex-col ${
        mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {/* Drawer Header */}
        <div className="h-14 flex items-center justify-between border-b border-[#262626] px-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="157 TATTOO Logo" className="h-6 w-6 object-contain grayscale" />
            <span className="text-sm font-bold tracking-[0.2em] text-[#F5F5F5]">{shopName}</span>
          </div>
          <button 
            onClick={() => setMobileMenuOpen(false)}
            className="p-2 text-[#A3A3A3] hover:text-[#F5F5F5] active:scale-95 transition-transform"
          >
            <X size={20} />
          </button>
        </div>

        {/* Menu Items */}
        <div className="flex-1 px-4 py-6 flex flex-col gap-1 text-base font-semibold uppercase tracking-wider text-[#A3A3A3] overflow-y-auto">
          <a 
            href="#home" 
            onClick={() => {
              setMobileMenuOpen(false)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }} 
            className="h-12 flex items-center border-b border-[#262626]/40 text-[#F5F5F5] hover:text-[#F5F5F5] transition-colors text-[14px] tracking-[0.1em]"
          >
            หน้าแรก
          </a>
          <a 
            href="#tattoos" 
            onClick={(e) => {
              e.preventDefault()
              setMobileMenuOpen(false)
              document.getElementById('tattoos')?.scrollIntoView({ behavior: 'smooth' })
            }} 
            className="h-12 flex items-center border-b border-[#262626]/40 text-[#F5F5F5] hover:text-[#F5F5F5] transition-colors text-[14px] tracking-[0.1em]"
          >
            ผลงาน
          </a>
          <a 
            href="#artists" 
            onClick={(e) => {
              e.preventDefault()
              setMobileMenuOpen(false)
              document.getElementById('artists')?.scrollIntoView({ behavior: 'smooth' })
            }} 
            className="h-12 flex items-center border-b border-[#262626]/40 text-[#F5F5F5] hover:text-[#F5F5F5] transition-colors text-[14px] tracking-[0.1em]"
          >
            ช่างสัก
          </a>
          <a 
            href="#services" 
            onClick={(e) => {
              e.preventDefault()
              setMobileMenuOpen(false)
              document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' })
            }} 
            className="h-12 flex items-center border-b border-[#262626]/40 text-[#F5F5F5] hover:text-[#F5F5F5] transition-colors text-[14px] tracking-[0.1em]"
          >
            บริการ
          </a>
          <a 
            href="#about" 
            onClick={(e) => {
              e.preventDefault()
              setMobileMenuOpen(false)
              document.getElementById('about-mobile')?.scrollIntoView({ behavior: 'smooth' })
            }} 
            className="h-12 flex items-center border-b border-[#262626]/40 text-[#F5F5F5] hover:text-[#F5F5F5] transition-colors text-[14px] tracking-[0.1em]"
          >
            เกี่ยวกับเรา
          </a>
          <a 
            href="#contact" 
            onClick={(e) => {
              e.preventDefault()
              setMobileMenuOpen(false)
              document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' })
            }} 
            className="h-12 flex items-center border-b border-[#262626]/40 text-[#F5F5F5] hover:text-[#F5F5F5] transition-colors text-[14px] tracking-[0.1em]"
          >
            ติดต่อเรา
          </a>

          <div className="flex flex-col gap-3 pt-6 border-t border-[#262626]/60 mt-4">
            <a href="/track" className="w-full py-2.5 bg-[#171717] border border-[#404040] text-[#F5F5F5] rounded-md text-xs font-semibold text-center cursor-pointer hover:bg-[#262626] transition-colors block">
              ติดตามสถานะ
            </a>
            <a href={`/book/${slug}`} className="w-full py-2.5 bg-[#FFFFFF] text-black rounded-md text-xs font-bold text-center cursor-pointer hover:bg-[#E5E5E5] transition-colors block">
              จองคิวสัก
            </a>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-[1280px] min-[1440px]:max-w-[1560px] w-full mx-auto px-4 sm:px-8 py-6 md:py-12 flex flex-col">

        {/* 2. HERO SECTION */}
        <section id="home" className="w-full relative rounded-xl rounded-b-none overflow-hidden border border-[#262626] bg-[#0A0A0A] h-[360px] md:h-[540px] flex items-end md:items-center p-6 md:p-12 lg:p-16">
          {/* Full Background Image Layer */}
          <div className="absolute inset-0 z-0 select-none">
            <img 
              src="/images/studio/hero-cover.jpg" 
              alt="ช่างสักกำลังสักลายให้ลูกค้าที่ 157 TATTOO" 
              className="w-full h-full object-cover object-[92%_center] md:object-[38%_center] grayscale opacity-[0.6] md:opacity-[0.65] contrast-[1.04]"
            />
            {/* Desktop Left-to-Right Gradient Overlay */}
            <div className="hidden md:block absolute inset-0 bg-gradient-to-r from-[#0A0A0A] via-[#0A0A0A]/80 via-[40%] to-transparent" />
            {/* Mobile Dark Overlays */}
            <div className="md:hidden absolute inset-0 bg-black/15" />
            <div className="md:hidden absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/35 to-transparent" />
            {/* Mobile Right-Edge Fade */}
            <div className="md:hidden absolute inset-0 bg-gradient-to-l from-[#0A0A0A] via-[#0A0A0A]/20 via-[30%] to-transparent" />
          </div>

          {/* Content Layer */}
          <div className="relative z-10 w-full md:max-w-md lg:max-w-xl flex flex-col gap-4 md:gap-6 items-start">
            <div className="space-y-2">
              <span className="text-[10px] uppercase tracking-[0.25em] font-semibold text-[#A3A3A3] md:text-[#737373]">157 TATTOO STUDIO</span>
              <h1 className="text-[30px] md:text-[44px] lg:text-[52px] leading-[1.1] font-bold text-[#F5F5F5] font-sans">
                ศิลปะบนร่างกาย<br />ที่เป็นตัวคุณ
              </h1>
              <p className="text-xs md:text-sm text-[#A3A3A3] leading-relaxed max-w-sm mt-3">
                ค้นหาสไตล์ที่ใช่ หรือส่งไอเดียของคุณให้ช่างสักของเราช่วยออกแบบและพัฒนาต่อเพื่อให้ได้งานที่เป็นชิ้นเดียวในโลก
              </p>
            </div>

            <div className="flex gap-2 md:gap-3 w-full md:w-auto pt-2">
              <a href={`/book/${slug}`} className="flex-1 md:flex-none px-6 py-3 bg-[#FFFFFF] hover:bg-[#E5E5E5] text-black transition-colors rounded-md text-xs font-bold shadow-md cursor-pointer block text-center">
                จองคิว Custom
              </a>
              <a 
                href="#tattoos"
                className="flex-1 md:flex-none px-6 py-3 bg-[#171717]/80 border border-[#404040] text-[#F5F5F5] hover:bg-[#262626] transition-colors rounded-md text-xs font-semibold text-center whitespace-nowrap"
              >
                ดูผลงาน
              </a>
            </div>
          </div>
        </section>

        {/* 2.5 TRUST / VALUE STRIP */}
        <section className="w-full mt-0">
          <div className="grid grid-cols-2 lg:grid-cols-4 border border-t-0 border-[#262626] rounded-b-xl bg-[#0D0D0D] overflow-hidden">
            
            {/* Item 1 */}
            <div className="flex items-start gap-3 md:gap-3.5 p-4 md:p-5 lg:p-6 border-r border-b border-[#262626] lg:border-b-0 bg-[#0D0D0D]">
              <div className="mt-0.5 flex-shrink-0 text-[#A3A3A3]">
                <UserRound className="w-[18px] h-[18px] md:w-[22px] md:h-[22px]" />
              </div>
              <div className="space-y-1 min-w-0">
                <h3 className="text-xs md:text-sm font-semibold text-[#F5F5F5] truncate">เลือกช่างที่ใช่</h3>
                <p className="text-[10px] md:text-xs text-[#737373] leading-relaxed line-clamp-2 md:line-clamp-none">
                  เลือกช่างสักตามสไตล์และผลงานที่คุณชื่นชอบ
                </p>
              </div>
            </div>

            {/* Item 2 */}
            <div className="flex items-start gap-3 md:gap-3.5 p-4 md:p-5 lg:p-6 border-b border-[#262626] lg:border-b-0 lg:border-r bg-[#0D0D0D]">
              <div className="mt-0.5 flex-shrink-0 text-[#A3A3A3]">
                <Images className="w-[18px] h-[18px] md:w-[22px] md:h-[22px]" />
              </div>
              <div className="space-y-1 min-w-0">
                <h3 className="text-xs md:text-sm font-semibold text-[#F5F5F5] truncate">ดูผลงานก่อนจอง</h3>
                <p className="text-[10px] md:text-xs text-[#737373] leading-relaxed line-clamp-2 md:line-clamp-none">
                  ชมผลงานและสไตล์ของช่างแต่ละคนก่อนตัดสินใจ
                </p>
              </div>
            </div>

            {/* Item 3 */}
            <div className="flex items-start gap-3 md:gap-3.5 p-4 md:p-5 lg:p-6 border-r border-[#262626] lg:border-r bg-[#0D0D0D]">
              <div className="mt-0.5 flex-shrink-0 text-[#A3A3A3]">
                <CalendarCheck className="w-[18px] h-[18px] md:w-[22px] md:h-[22px]" />
              </div>
              <div className="space-y-1 min-w-0">
                <h3 className="text-xs md:text-sm font-semibold text-[#F5F5F5] truncate">ส่งคำขอจองคิว</h3>
                <p className="text-[10px] md:text-xs text-[#737373] leading-relaxed line-clamp-2 md:line-clamp-none">
                  กรอกรายละเอียดงานและเลือกวันเวลาที่สะดวกเพื่อส่งคำขอ
                </p>
              </div>
            </div>

            {/* Item 4 */}
            <div className="flex items-start gap-3 md:gap-3.5 p-4 md:p-5 lg:p-6 bg-[#0D0D0D]">
              <div className="mt-0.5 flex-shrink-0 text-[#A3A3A3]">
                <MessageSquare className="w-[18px] h-[18px] md:w-[22px] md:h-[22px]" />
              </div>
              <div className="space-y-1 min-w-0">
                <h3 className="text-xs md:text-sm font-semibold text-[#F5F5F5] truncate">ติดตามสถานะได้ง่าย</h3>
                <p className="text-[10px] md:text-xs text-[#737373] leading-relaxed line-clamp-2 md:line-clamp-none">
                  ใช้รหัสติดตามเพื่อตรวจสอบสถานะการจองและการชำระเงิน
                </p>
              </div>
            </div>

          </div>
        </section>

        {/* 3. & 4. STYLE FILTER AND PORTFOLIO SECTION WRAPPER */}
        <div className="space-y-12 md:space-y-14 mt-16 md:mt-14 lg:mt-16">
          {/* 3. STYLE FILTER SECTION */}
          <section className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#262626] pb-4">
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-[#737373]">Explore Styles</span>
                <h2 className="text-xl md:text-2xl font-bold text-[#F5F5F5]">ค้นหาสไตล์ที่ใช่</h2>
              </div>

              {/* Artist Dropdown for Desktop */}
              <div className="hidden md:block">
                <select 
                  value={selectedArtist}
                  onChange={(e) => setSelectedArtist(e.target.value)}
                  className="bg-[#171717] border border-[#2A2A2A] text-xs font-semibold text-[#A3A3A3] px-3 py-2 rounded-md focus:outline-none focus:border-[#737373] cursor-pointer"
                >
                  {artistsList.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Style Chips (Wrapped on Mobile, Single Row on Desktop) */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap md:flex-nowrap gap-2 overflow-x-visible md:overflow-x-auto pb-1 md:pb-2 scrollbar-none snap-x">
                {styles.map((style) => {
                  const isActive = selectedStyle === style
                  return (
                    <button
                      key={style}
                      onClick={() => setSelectedStyle(style)}
                      className={`px-3.5 rounded-full text-xs font-medium border whitespace-nowrap snap-align-start transition-all cursor-pointer h-[40px] ${
                        isActive
                          ? 'bg-[#F5F5F5] border-[#F5F5F5] text-[#0A0A0A]'
                          : 'bg-[#171717] border-[#2A2A2A] text-[#A3A3A3] hover:text-[#F5F5F5]'
                      }`}
                    >
                      {style === 'ทั้งหมด' ? 'ทั้งหมด' : style}
                    </button>
                  )
                })}
              </div>

              {/* Artist Dropdown for Mobile (< 768px) */}
              <div className="md:hidden w-full">
                <select
                  value={selectedArtist}
                  onChange={(e) => setSelectedArtist(e.target.value)}
                  className="w-full bg-[#171717] border border-[#2A2A2A] text-xs font-semibold text-[#A3A3A3] px-4 py-3 rounded-md focus:outline-none focus:border-[#737373]"
                >
                  {artistsList.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>


          {/* 4. PORTFOLIO GRID */}
          <section id="tattoos" className="space-y-6 scroll-mt-20">
            <div className="flex items-end justify-between border-b border-[#262626] pb-4">
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-[#737373] font-semibold">Our Work</span>
                <h2 className="text-lg md:text-xl font-bold text-[#F5F5F5]">ผลงานของเรา</h2>
              </div>
              <a 
                href={`/shop/${slug}/portfolio`}
                className="text-xs font-semibold text-[#A3A3A3] hover:text-[#F5F5F5] flex items-center gap-1 cursor-pointer"
              >
                ดูทั้งหมด <ArrowRight size={14} />
              </a>
            </div>

            {portfolioError ? (
              <div className="py-20 text-center text-red-400/85 text-sm bg-red-500/5 rounded-xl border border-red-500/10">
                ไม่สามารถโหลดผลงานได้ในขณะนี้
              </div>
            ) : filteredPortfolio.length === 0 ? (
              <div className="py-20 text-center text-[#737373] text-sm bg-[#171717] rounded-xl border border-[#262626]">
                {portfolio.length === 0 ? 'ยังไม่มีผลงานที่เปิดแสดงในขณะนี้' : 'ไม่พบผลงานตามสไตล์หรือช่างที่เลือก'}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
                {filteredPortfolio.slice(0, 4).map((item) => (
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
          </section>
        </div>


        {/* FLASH DESIGNS SECTION */}
        {(flashDesigns.length > 0 || flashLoading) && (
          <section id="flash" className="space-y-6 mt-16 md:mt-24 scroll-mt-20">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-[10px] uppercase tracking-wider text-[#737373] font-semibold">Ready to Ink</span>
                <h2 className="text-lg md:text-xl font-bold text-[#F5F5F5]">FLASH DESIGNS</h2>
                <p className="text-xs text-[#737373]">แบบพร้อมสัก — จองได้เพียงครั้งเดียว</p>
              </div>
            </div>

            {flashHoldError && (
              <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {flashHoldError}
              </div>
            )}

            {flashLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="bg-[#171717] border border-[#262626] rounded-xl overflow-hidden animate-pulse">
                    <div className="aspect-square bg-[#262626]" />
                    <div className="p-4 space-y-2">
                      <div className="h-3 bg-[#262626] rounded w-16" />
                      <div className="h-3 bg-[#262626] rounded w-24" />
                      <div className="h-8 bg-[#262626] rounded-xl mt-3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {flashDesigns.map(flash => (
                  <div
                    key={flash.id}
                    className="bg-[#171717] border border-[#262626] rounded-xl overflow-hidden flex flex-col group hover:border-[#404040] transition-colors cursor-pointer"
                    onClick={() => openFlashModal(flash)}
                  >
                    <div className="relative aspect-square bg-[#121212] overflow-hidden">
                      <img
                        src={getFlashImageUrl(flash.image_path)}
                        alt={flash.flash_code}
                        className="w-full h-full object-cover grayscale group-hover:scale-[1.03] transition-transform duration-300"
                      />
                      <div className="absolute top-2 left-2">
                        <span className="bg-[#000]/70 backdrop-blur-sm text-[#F5F5F5] font-mono text-[10px] px-1.5 py-0.5 rounded-md font-semibold tracking-widest">
                          {flash.flash_code}
                        </span>
                      </div>
                    </div>
                    <div className="p-3 md:p-4 flex-1 flex flex-col gap-2.5">
                      <div>
                        <p className="text-xs font-medium text-[#F5F5F5] truncate">{flash.artist_name}</p>
                        <p className="text-[10px] text-[#737373] truncate">{flash.style_name}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-[#A3A3A3] border border-[#262626] px-2 py-0.5 rounded-md">
                          ขนาด {flash.size}
                        </span>
                        <span className="text-sm font-bold text-[#F5F5F5]">฿{Number(flash.price).toLocaleString()}</span>
                      </div>
                      {(() => {
                        const state = getFlashDisplayState(flash);
                        if (state === 'sold') {
                          return (
                            <button disabled className="w-full py-2 rounded-xl text-xs font-semibold bg-[#262626] text-[#737373] mt-auto cursor-not-allowed">
                              SOLD OUT
                            </button>
                          );
                        }
                        if (state === 'closed') {
                          return (
                            <button disabled className="w-full py-2 rounded-xl text-xs font-semibold bg-[#262626] text-[#737373] mt-auto cursor-not-allowed">
                              ปิดรับจอง
                            </button>
                          );
                        }
                        return (
                          <button
                            onClick={e => { e.stopPropagation(); handleBookFlash(flash) }}
                            disabled={holdingFlashId === flash.id}
                            className="w-full py-2 rounded-xl text-xs font-semibold bg-[#F5F5F5] text-[#0A0A0A] hover:bg-white transition-colors active:scale-95 disabled:opacity-60 mt-auto"
                          >
                            {holdingFlashId === flash.id ? '...' : 'จองลายนี้'}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* FLASH DETAIL MODAL */}
        {selectedFlash && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-[#000]/80 backdrop-blur-sm" onClick={() => setSelectedFlash(null)} />
            <div className="relative z-10 w-full sm:max-w-md bg-[#121212] border border-[#1F1F1F] rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="relative aspect-square bg-[#0A0A0A]">
                <img
                  src={getFlashImageUrl(selectedFlash.image_path)}
                  alt={selectedFlash.flash_code}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => setSelectedFlash(null)}
                  className="absolute top-3 right-3 bg-[#000]/60 backdrop-blur-sm p-2 rounded-full text-[#F5F5F5] hover:bg-[#000]/80 transition-colors"
                >
                  <X size={16} />
                </button>
                <div className="absolute top-3 left-3">
                  <span className="bg-[#000]/70 backdrop-blur-sm text-[#F5F5F5] font-mono text-xs px-2 py-1 rounded-lg font-semibold tracking-widest">
                    {selectedFlash.flash_code}
                  </span>
                </div>
              </div>
              <div className="p-5 space-y-4 overflow-y-auto max-h-[45vh]">
                <div>
                  <p className="text-sm font-semibold text-[#F5F5F5]">{selectedFlash.artist_name}</p>
                  <p className="text-xs text-[#737373]">{selectedFlash.style_name}</p>
                </div>

                {selectedFlashVariants.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-[#A3A3A3] uppercase tracking-wider">เลือกขนาด</p>
                    <p className="text-[10px] text-[#737373] italic -mt-1">
                      * ขนาดวัดจากด้านที่ยาวที่สุดของลาย
                    </p>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                      {selectedFlashVariants.map(v => {
                        const isSelected = selectedVariantId === v.id;
                        let sizeRangeText = '';
                        if (v.min_size_cm !== null && v.min_size_cm !== undefined) {
                          if (v.max_size_cm !== null && v.max_size_cm !== undefined) {
                            sizeRangeText = ` (${v.min_size_cm}–${v.max_size_cm} ซม.)`;
                          } else {
                            sizeRangeText = ` (${v.min_size_cm} ซม. ขึ้นไป)`;
                          }
                        }
                        return (
                          <label
                            key={v.id}
                            className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-white/5 border-white/20 text-[#F5F5F5]'
                                : 'bg-[#171717] border-[#262626] text-[#A3A3A3] hover:border-[#404040]'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="radio"
                                name="flash_size_variant"
                                value={v.id}
                                checked={isSelected}
                                onChange={() => setSelectedVariantId(v.id)}
                                className="w-4 h-4 accent-white"
                              />
                              <span className="text-xs font-semibold">
                                {v.size_name}
                                <span className="text-[10px] font-normal text-[#737373] block sm:inline sm:ml-1">
                                  {sizeRangeText}
                                </span>
                              </span>
                            </div>
                            <span className="text-xs font-bold">฿{Number(v.price).toLocaleString()}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold border border-[#262626] px-2.5 py-1 rounded-lg text-[#A3A3A3]">
                      ขนาด {selectedFlash.size}
                    </span>
                    <span className="text-sm font-bold text-[#F5F5F5]">
                      ฿{Number(selectedFlash.price).toLocaleString()}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-[#1F1F1F] pt-4">
                  {selectedFlashVariants.length > 0 && selectedVariantId ? (
                    (() => {
                      const activeVariant = selectedFlashVariants.find(v => v.id === selectedVariantId);
                      return (
                        <span className="text-xl font-bold text-[#F5F5F5]">
                          ฿{activeVariant ? Number(activeVariant.price).toLocaleString() : '0'}
                        </span>
                      );
                    })()
                  ) : (
                    <span className="text-xl font-bold text-[#F5F5F5]">
                      ฿{Number(selectedFlash.price).toLocaleString()}
                    </span>
                  )}

                  {(() => {
                    const state = getFlashDisplayState(selectedFlash);
                    if (state === 'sold') {
                      return (
                        <button disabled className="px-6 py-3 rounded-xl text-sm font-semibold bg-[#262626] text-[#737373] cursor-not-allowed">
                          SOLD OUT
                        </button>
                      );
                    }
                    if (state === 'closed') {
                      return (
                        <button disabled className="px-6 py-3 rounded-xl text-sm font-semibold bg-[#262626] text-[#737373] cursor-not-allowed">
                          ปิดรับจอง
                        </button>
                      );
                    }
                    return (
                      <button
                        onClick={() => handleBookFlash(selectedFlash)}
                        disabled={holdingFlashId === selectedFlash.id || (selectedFlashVariants.length > 0 && !selectedVariantId)}
                        className="px-6 py-3 rounded-xl text-sm font-semibold bg-[#F5F5F5] text-[#0A0A0A] hover:bg-white transition-colors active:scale-95 disabled:opacity-60"
                      >
                        {holdingFlashId === selectedFlash.id ? 'กำลังจอง...' : 'จองลายนี้'}
                      </button>
                    );
                  })()}
                </div>
                {flashHoldError && (
                  <p className="text-xs text-red-400 text-center">{flashHoldError}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 5. TATTOO ARTISTS */}
        <section id="artists" className="space-y-6 mt-16 md:mt-28 scroll-mt-20">
          <div className="space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-[#737373]">Meet the Artists</span>
            <h2 className="text-lg md:text-xl font-bold text-[#F5F5F5]">ช่างสักของเรา</h2>
          </div>

          {/* Desktop Layout (>= 768px) */}
          <div className="hidden md:grid grid-cols-3 min-[1440px]:grid-cols-4 gap-6 min-[1440px]:gap-8">
            {displayArtists.map((artist) => (
              <div 
                key={artist.id}
                className="bg-[#171717] border border-[#262626] rounded-xl overflow-hidden flex flex-col group hover:border-[#404040] transition-colors w-full min-[1440px]:max-w-[360px] mx-0"
              >
                <div className="aspect-[4/5] md:aspect-auto md:h-[340px] bg-[#121212] overflow-hidden relative">
                  <img 
                    src={artist.avatar} 
                    alt={artist.name}
                    className="w-full h-full object-cover grayscale group-hover:grayscale-0 group-hover:scale-[1.03] transition-all duration-300"
                  />
                </div>
                <div className="p-6 md:p-7 flex flex-col justify-between gap-5 flex-1">
                  <div className="space-y-1.5">
                    <h3 className="text-base md:text-lg font-bold text-[#F5F5F5]">{artist.name}</h3>
                    <p className="text-xs md:text-[13px] text-[#A3A3A3] font-medium">
                      {artist.specialties.join(' • ')}
                    </p>
                  </div>
                  <button className="w-full py-2.5 md:py-3 bg-[#171717] border border-[#404040] text-[#F5F5F5] hover:bg-[#262626] transition-colors text-xs font-semibold rounded-md cursor-pointer">
                    ดูผลงานช่าง →
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Mobile Layout (< 768px Horizontal Scroll) */}
          <div className="md:hidden flex gap-4 overflow-x-auto pb-2 scrollbar-none snap-x">
            {displayArtists.map((artist) => (
              <div 
                key={artist.id}
                className="bg-[#171717] border border-[#262626] rounded-xl overflow-hidden w-[160px] flex-shrink-0 snap-align-start group"
              >
                <div className="aspect-square bg-[#121212] overflow-hidden">
                  <img 
                    src={artist.avatar} 
                    alt={artist.name}
                    className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-300"
                  />
                </div>
                <div className="p-3 space-y-1">
                  <h4 className="text-xs font-bold text-[#F5F5F5]">{artist.name}</h4>
                  <p className="text-[10px] text-[#A3A3A3] truncate">
                    {artist.specialties.join(' • ')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>


        {/* 5.5 SERVICES + ABOUT */}
        <section id="services" className="w-full mt-16 md:mt-28 scroll-mt-20">
          {/* Desktop: 2 columns */}
          <div className="hidden md:flex border border-[#262626] rounded-xl overflow-hidden h-[360px]">

            {/* LEFT — บริการของเรา */}
            <div className="relative flex-1 flex flex-col justify-start p-8 lg:p-10 bg-[#121212] overflow-hidden">
              {/* Background image */}
              <div className="absolute inset-0 z-0">
                <img
                  src="/images/studio/hero-cover.jpg"
                  alt="Studio background"
                  className="w-full h-full object-cover object-[62%_center] grayscale opacity-[0.55] contrast-[1.05]"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#121212] via-[#121212]/85 to-transparent" />
              </div>

              {/* Content — all top-aligned, heading directly above service list */}
              <div className="relative z-10 space-y-8 max-w-[420px]">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-[0.25em] text-[#737373] font-semibold">Our Services</span>
                  <h2 className="text-2xl font-bold text-[#F5F5F5]">บริการของเรา</h2>
                </div>

                <div className="flex flex-col gap-[20px]">
                  {[
                    { icon: <Pencil size={18} />, title: 'งานสักใหม่ (New Tattoo)', desc: 'รับงานสักใหม่ตามแบบหรือไอเดียที่พูดคุยกับช่าง' },
                    { icon: <Layers size={18} />, title: 'แก้ไข / Cover Up', desc: 'แก้ไขงานเก่า หรือปกปิดรอยสักเดิม' },
                    { icon: <Palette size={18} />, title: 'ออกแบบลายสักเฉพาะบุคคล (Custom Design)', desc: 'ออกแบบและปรับลายให้เหมาะกับสไตล์ ตำแหน่ง และความต้องการของลูกค้า' },
                    { icon: <MessageSquare size={18} />, title: 'ให้คำปรึกษาก่อนจอง', desc: 'พูดคุยแนวทาง ตำแหน่ง ขนาด และรายละเอียดของงานก่อนส่งคำขอจอง' },
                  ].map((s, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="mt-0.5 text-[#A3A3A3] flex-shrink-0">{s.icon}</div>
                      <div>
                        <p className="text-sm font-semibold text-[#F5F5F5] leading-tight">{s.title}</p>
                        <p className="text-xs text-[#737373] mt-1">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Center Divider */}
            <div className="w-px bg-[#262626] flex-shrink-0" />

            {/* RIGHT — เกี่ยวกับเรา */}
            <div id="about" className="relative flex-1 flex flex-col justify-start p-10 bg-[#121212] overflow-hidden scroll-mt-20">
              {/* Background image */}
              <div className="absolute inset-0 z-0">
                <img
                  src="/images/studio/hero-studio.jpg"
                  alt="157 TATTOO Studio"
                  className="w-full h-full object-cover object-[70%_center] grayscale opacity-[0.6] contrast-[1.05]"
                />
                {/* Primary gradient: left solid → right open */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#121212] from-[0%] via-[#121212]/85 via-[45%] to-transparent to-[100%]" />
                {/* Secondary layer: reinforce top-left text zone */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#121212]/60 via-transparent to-transparent" />
              </div>

              {/* Content — top-left block, ~40% visual weight */}
              <div className="relative z-10 space-y-8 max-w-[340px]">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-[0.25em] text-[#737373] font-semibold">About Us</span>
                  <h2 className="text-2xl font-bold text-[#F5F5F5]">เกี่ยวกับเรา</h2>
                </div>
                <div className="space-y-4">
                  <p className="text-sm text-[#A3A3A3] leading-[1.75]">
                    157 Tattoo Studio คือพื้นที่สำหรับงานสักที่ให้ความสำคัญกับตัวตนของแต่ละคน
                    เราร่วมพัฒนาไอเดียและรายละเอียดของงาน เพื่อให้ผลงานเหมาะกับสไตล์และความต้องการของคุณ
                  </p>
                  <div>
                    <a 
                      href={`/shop/${slug}/about`}
                      className="inline-flex items-center text-xs font-semibold text-[#A3A3A3] hover:text-[#F5F5F5] transition-colors cursor-pointer group"
                    >
                      อ่านเพิ่มเติม <ArrowRight size={14} className="ml-1 group-hover:translate-x-0.5 transition-transform" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile: Stacked */}
          <div className="md:hidden flex flex-col gap-4">

            {/* Mobile Services */}
            <div className="relative bg-[#121212] border border-[#262626] rounded-xl overflow-hidden p-5">
              <div className="absolute inset-0 z-0">
                <img
                  src="/images/studio/hero-cover.jpg"
                  alt="Studio background"
                  className="w-full h-full object-cover object-[62%_center] grayscale opacity-[0.32] contrast-[1.05]"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#121212]/98 via-[#121212]/85 to-[#121212]/50" />
              </div>
              <div className="relative z-10 space-y-4">
                <div className="space-y-0.5">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-[#737373] font-semibold">Our Services</span>
                  <h2 className="text-lg font-bold text-[#F5F5F5]">บริการของเรา</h2>
                </div>
                <div className="flex flex-col gap-4 pt-1">
                  {[
                    { icon: <Pencil size={16} />, title: 'งานสักใหม่ (New Tattoo)', desc: 'รับงานสักใหม่ตามแบบหรือไอเดียที่พูดคุยกับช่าง' },
                    { icon: <Layers size={16} />, title: 'แก้ไข / Cover Up', desc: 'แก้ไขงานเก่า หรือปกปิดรอยสักเดิม' },
                    { icon: <Palette size={16} />, title: 'ออกแบบลายสักเฉพาะบุคคล (Custom Design)', desc: 'ออกแบบและปรับลายให้เหมาะกับสไตล์ ตำแหน่ง และความต้องการของลูกค้า' },
                    { icon: <MessageSquare size={16} />, title: 'ให้คำปรึกษาก่อนจอง', desc: 'พูดคุยแนวทาง ตำแหน่ง ขนาด และรายละเอียดของงานก่อนส่งคำขอจอง' },
                  ].map((s, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="mt-0.5 text-[#A3A3A3] flex-shrink-0">{s.icon}</div>
                      <div>
                        <p className="text-sm font-semibold text-[#F5F5F5] leading-tight">{s.title}</p>
                        <p className="text-xs text-[#737373] mt-0.5">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Mobile About */}
            <div id="about-mobile" className="relative bg-[#121212] border border-[#262626] rounded-xl overflow-hidden p-5 min-h-[180px] scroll-mt-20">
              <div className="absolute inset-0 z-0">
                <img
                  src="/images/studio/hero-studio.jpg"
                  alt="157 TATTOO Studio"
                  className="w-full h-full object-cover object-[70%_center] grayscale opacity-[0.45] contrast-[1.05]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#121212]/98 via-[#121212]/85 to-[#121212]/30" />
              </div>
              <div className="relative z-10 space-y-3">
                <div className="space-y-0.5">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-[#737373] font-semibold">About Us</span>
                  <h2 className="text-lg font-bold text-[#F5F5F5]">เกี่ยวกับเรา</h2>
                </div>
                <p className="text-sm text-[#A3A3A3] leading-[1.75]">
                  157 Tattoo Studio คือพื้นที่สำหรับงานสักที่ให้ความสำคัญกับตัวตนของแต่ละคน
                  เราร่วมพัฒนาไอเดียและรายละเอียดของงาน เพื่อให้ผลงานเหมาะกับสไตล์และความต้องการของคุณ
                </p>
                <div className="pt-1">
                  <a 
                    href={`/shop/${slug}/about`}
                    className="inline-flex items-center text-xs font-semibold text-[#A3A3A3] hover:text-[#F5F5F5] transition-colors cursor-pointer group"
                  >
                    อ่านเพิ่มเติม <ArrowRight size={14} className="ml-1 group-hover:translate-x-0.5 transition-transform" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>


        {/* 6. CUSTOM TATTOO CTA CARD */}
        <section className="w-full mt-16 md:mt-28">
          {/* Desktop Banner (>= 768px) */}
          <div className="hidden md:flex flex-row items-center justify-between bg-[#121212] border border-[#262626] rounded-xl overflow-hidden p-6 md:p-8 relative min-h-[140px] w-full">
            {/* Logo Watermark in the right corner (Enlarged to fill the entire right side height) */}
            <div className="absolute right-[-60px] top-1/2 -translate-y-1/2 w-[440px] h-[440px] z-0 pointer-events-none select-none">
              <img 
                src="/logo.png" 
                alt="157 TATTOO Logo Watermark" 
                className="w-full h-full object-contain grayscale opacity-[0.08]"
              />
            </div>

            {/* Left part: Icon block & Content */}
            <div className="relative z-10 flex items-center gap-6 flex-1 min-w-0 pr-6">
              {/* Icon block */}
              <div className="w-14 h-14 rounded-lg bg-[#171717] border border-[#2A2A2A] flex items-center justify-center flex-shrink-0 text-[#F5F5F5]">
                <Calendar size={24} className="text-[#F5F5F5]" />
              </div>

              {/* Text content */}
              <div className="space-y-1 min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#A3A3A3]">Custom Tattoo</span>
                <h3 className="text-lg font-bold text-[#F5F5F5]">มีแบบหรือไอเดียของตัวเอง?</h3>
                <p className="text-xs text-[#A3A3A3] leading-relaxed max-w-[520px] truncate md:whitespace-normal">
                  ส่งรายละเอียดไอเดีย ตำแหน่ง และขนาดที่ต้องการคร่าว ๆ เพื่อให้ช่างตรวจสอบคิวล่วงหน้า
                </p>
              </div>
            </div>

            {/* Right part: CTA Button */}
            <div className="relative z-10 flex-shrink-0">
              <a href={`/book/${slug}`} className="px-6 py-3 bg-[#FFFFFF] hover:bg-[#E5E5E5] text-black transition-colors rounded-md text-xs font-bold shadow-md cursor-pointer block text-center">
                เริ่มส่งคำขอจอง
              </a>
            </div>
          </div>

          {/* Mobile Card (< 768px Stacked -> Horizontal Banner) */}
          <div className="md:hidden flex flex-row items-center justify-between bg-[#121212] border border-[#262626] rounded-xl overflow-hidden p-4 relative min-h-[110px] w-full gap-3">
            {/* Logo Watermark in the right corner (Enlarged to fill the mobile card height) */}
            <div className="absolute right-[-40px] top-1/2 -translate-y-1/2 w-[260px] h-[260px] z-0 pointer-events-none select-none">
              <img 
                src="/logo.png" 
                alt="157 TATTOO Logo Watermark" 
                className="w-full h-full object-contain grayscale opacity-[0.07]"
              />
            </div>

            {/* Left part: Icon block & Content */}
            <div className="relative z-10 flex items-center gap-3 flex-1 min-w-0">
              {/* Icon block */}
              <div className="w-10 h-10 rounded-lg bg-[#171717] border border-[#2A2A2A] flex items-center justify-center flex-shrink-0 text-[#F5F5F5]">
                <Calendar size={18} className="text-[#F5F5F5]" />
              </div>

              {/* Text content */}
              <div className="space-y-0.5 min-w-0">
                <span className="text-[8px] font-bold uppercase tracking-[0.15em] text-[#A3A3A3]">Custom Tattoo</span>
                <h3 className="text-xs font-bold text-[#F5F5F5] truncate">มีแบบหรือไอเดียของตัวเอง?</h3>
                <p className="text-[10px] text-[#A3A3A3] leading-tight line-clamp-2 max-w-[280px]">
                  ส่งรายละเอียดไอเดีย ตำแหน่ง และขนาดที่ต้องการคร่าว ๆ เพื่อให้ช่างตรวจสอบคิวล่วงหน้า
                </p>
              </div>
            </div>

            {/* Right part: CTA Button */}
            <div className="relative z-10 flex-shrink-0">
              <a href={`/book/${slug}`} className="px-3 py-2 bg-[#FFFFFF] hover:bg-[#E5E5E5] text-black transition-colors rounded-md text-[10px] font-bold shadow-md cursor-pointer whitespace-nowrap block text-center">
                เริ่มส่งคำขอจอง
              </a>
            </div>
          </div>
        </section>


        {/* 7. FOOTER */}
        <footer id="contact" className="border-t border-[#262626] pt-12 pb-12 scroll-mt-20">
          <div className="flex flex-col lg:grid lg:grid-cols-12 gap-10 lg:gap-8 px-4 md:px-0">
            
            {/* COLUMN 1: BRAND */}
            <div className="lg:col-span-5 flex flex-col items-center lg:items-start gap-4">
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="157 TATTOO Logo" className="h-6 w-6 object-contain grayscale" />
                <span className="text-sm font-bold tracking-[0.2em] text-[#F5F5F5]">{shopName}</span>
              </div>
              <div className="flex flex-col items-center lg:items-start gap-1 text-center lg:text-left">
                <span className="text-[10px] text-[#737373] tracking-wider uppercase">{shopName} STUDIO • CHIANG RAI</span>
                <p className="text-xs text-[#A3A3A3] leading-relaxed max-w-[280px]">
                  สตูดิโอศิลปะบนเรือนร่าง รังสรรค์งานสักที่สะท้อนตัวตนในแบบของคุณ
                </p>
              </div>
            </div>

            {/* COLUMN 2: CONTACT */}
            <div className="lg:col-span-3 flex flex-col items-center lg:items-start gap-4">
              <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase text-center lg:text-left w-full">Contact</span>
              <div className="flex flex-col items-start gap-3 w-fit mx-auto lg:mx-0">
                <div className="flex items-center gap-2 text-xs">
                  <Clock size={14} className="text-[#737373]" />
                  <span className="text-[#A3A3A3]">เวลาเปิดร้าน:</span>
                  <span className="text-[#F5F5F5] font-semibold">10:00 - 23:30</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <Phone size={14} className="text-[#737373]" />
                  <span className="text-[#A3A3A3]">โทรศัพท์:</span>
                  <a href="tel:0910702369" className="text-[#F5F5F5] font-semibold hover:underline">
                    091-070-2369
                  </a>
                </div>
              </div>
            </div>

            {/* COLUMN 3: LOCATION */}
            <div className="lg:col-span-4 flex flex-col items-center lg:items-start gap-4">
              <span className="text-[10px] font-bold tracking-[0.2em] text-[#737373] uppercase text-center lg:text-left w-full">Location</span>
              <div className="text-xs text-[#A3A3A3] text-center lg:text-left leading-relaxed">
                <p>151/3 1299</p>
                <p>อำเภอเวียงชัย</p>
                <p>จังหวัดเชียงราย 57210</p>
                <p>Thailand</p>
              </div>
              <a 
                href="https://www.bing.com/maps/search?v=2&pc=FACEBK&mid=8100&mkt=en-US&fbclid=IwY2xjawT32Y1wZG9mBWV4dG4DYWVtAjEwAGJyaWQRMW1nYVBGM0dsVVp3REFQQ3FzcnRjBmFwcF9pZBAyMjIwMzkxNzg4MjAwODkyAAEendTeuLcMX0dV77mxns2RL8NqkB1xe2Njq15q_OOyJvq7VJFW7LxycE615h0_aem_Vbnl89GKXar3whZS1h7mFg&FORM=FBKPL1&q=151%2F3+1299%2C+Chiang+Rai%2C+Thailand%2C+57210&cp=18.789941~119.397118&lvl=4&style=r" 
                target="_blank" 
                rel="noopener noreferrer"
                className="mt-1 px-4 py-2 bg-[#171717] border border-[#404040] text-[#F5F5F5] hover:bg-[#262626] transition-colors rounded-md text-xs font-semibold cursor-pointer flex items-center gap-2"
              >
                <MapPin size={14} />
                ดูแผนที่
              </a>
            </div>
            
          </div>

          {/* FOOTER BOTTOM: SOCIAL & COPYRIGHT */}
          <div className="mt-12 pt-6 border-t border-[#262626] flex flex-col-reverse md:flex-row items-center justify-between gap-6 px-4 md:px-0">
            <span className="text-[10px] text-[#737373] tracking-wider uppercase text-center md:text-left">
              © 2026 {shopName.toUpperCase()} STUDIO. ALL RIGHTS RESERVED.
            </span>
            <div className="flex items-center gap-6 text-[#A3A3A3]">
              <a href="https://www.instagram.com/157_tattoo" target="_blank" rel="noopener noreferrer" className="hover:text-[#F5F5F5] transition-colors">
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                </svg>
              </a>
              <a href="https://www.facebook.com/profile.php?id=61550501946125" target="_blank" rel="noopener noreferrer" className="hover:text-[#F5F5F5] transition-colors">
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
                </svg>
              </a>
            </div>
          </div>
        </footer>

      </div>


      {/* 9. PORTFOLIO ITEM DETAIL INTERACTION (Modal / Sheet) */}
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
