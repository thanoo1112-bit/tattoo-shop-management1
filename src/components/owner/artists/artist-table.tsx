'use client'

import { User, MoreHorizontal, Power, PowerOff } from 'lucide-react'
import { useState, useTransition } from 'react'
import { setArtistStatus } from '@/app/(dashboard)/owner/artists/actions'
import Link from 'next/link'

type Artist = {
  id: string
  user_id: string
  role: string
  status: string
  joined_at: string
  profiles: {
    full_name: string
    email: string
    phone: string | null
    avatar_url: string | null
  }
}

export function ArtistTable({ artists, shopId }: { artists: Artist[], shopId: string }) {
  const [isPending, startTransition] = useTransition()
  const [confirmingArtist, setConfirmingArtist] = useState<Artist | null>(null)

  if (!artists || artists.length === 0) return null

  function handleDeactivate(artist: Artist) {
    setConfirmingArtist(artist)
  }

  function handleReactivate(artistId: string) {
    startTransition(async () => {
      await setArtistStatus(shopId, artistId, 'active')
    })
  }

  function confirmDeactivate() {
    if (!confirmingArtist) return
    startTransition(async () => {
      await setArtistStatus(shopId, confirmingArtist.user_id, 'inactive')
      setConfirmingArtist(null)
    })
  }

  return (
    <>
      <div className="bg-[#171717] border border-[#262626] rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse hidden sm:table">
            <thead>
              <tr className="bg-[#121212] border-b border-[#262626] text-xs uppercase tracking-wider text-[#A3A3A3]">
                <th className="px-6 py-4 font-medium">ช่างสัก</th>
                <th className="px-6 py-4 font-medium">เบอร์ติดต่อ</th>
                <th className="px-6 py-4 font-medium">อีเมลบัญชี</th>
                <th className="px-6 py-4 font-medium">สถานะ</th>
                <th className="px-6 py-4 font-medium">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262626]">
              {artists.map((artist) => {
                const isActive = artist.status === 'active'

                return (
                  <tr key={artist.id} className={`hover:bg-[#262626]/50 transition-colors ${!isActive ? 'opacity-70' : ''}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#262626] border border-[#333] flex items-center justify-center overflow-hidden flex-shrink-0">
                          {artist.profiles?.avatar_url ? (
                            <img src={artist.profiles.avatar_url} alt={artist.profiles.full_name || 'Profile'} className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-5 h-5 text-[#A3A3A3]" />
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-[#FFFFFF]">{artist.profiles?.full_name || 'ไม่พบข้อมูลโปรไฟล์'}</div>
                          <div className="text-xs text-[#A3A3A3] capitalize">{artist.role === 'artist' ? 'ช่างสัก' : artist.role}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-[#A3A3A3]">{artist.profiles?.phone || 'ยังไม่ได้ระบุ'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-[#A3A3A3]">{artist.profiles?.email || 'ไม่พบข้อมูลโปรไฟล์'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isActive ? 'text-green-400 bg-green-400/10' : 'text-gray-400 bg-gray-400/10'}`}>
                        {isActive ? 'ใช้งานอยู่' : 'ไม่ได้ใช้งาน'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-[#A3A3A3] flex items-center gap-3">
                      <Link
                        href={`/owner/artists/${artist.user_id}`}
                        className="text-white hover:text-gray-300 font-medium transition-colors"
                      >
                        จัดการ
                      </Link>
                      <span className="text-[#333]">|</span>
                      {isActive ? (
                        <button
                          onClick={() => handleDeactivate(artist)}
                          disabled={isPending}
                          className="text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                        >
                          นำช่างออกจากร้าน
                        </button>
                      ) : (
                        <button
                          onClick={() => handleReactivate(artist.user_id)}
                          disabled={isPending}
                          className="text-white hover:text-gray-300 transition-colors disabled:opacity-50"
                        >
                          เปิดใช้งานอีกครั้ง
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          
          {/* Mobile View */}
          <div className="sm:hidden flex flex-col divide-y divide-[#262626]">
            {artists.map((artist) => {
              const isActive = artist.status === 'active'

              return (
                <div key={artist.id} className={`p-4 flex flex-col gap-4 ${!isActive ? 'opacity-70' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="w-10 h-10 rounded-full bg-[#262626] border border-[#333] flex items-center justify-center overflow-hidden flex-shrink-0">
                        {artist.profiles?.avatar_url ? (
                          <img src={artist.profiles.avatar_url} alt={artist.profiles.full_name || 'Profile'} className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-5 h-5 text-[#A3A3A3]" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#FFFFFF] truncate">{artist.profiles?.full_name || 'ไม่พบข้อมูลโปรไฟล์'}</div>
                        <div className="text-xs text-[#A3A3A3] capitalize">{artist.role === 'artist' ? 'ช่างสัก' : artist.role}</div>
                      </div>
                    </div>
                    <span className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${isActive ? 'text-green-400 bg-green-400/10' : 'text-gray-400 bg-gray-400/10'}`}>
                      {isActive ? 'ใช้งานอยู่' : 'ไม่ได้ใช้งาน'}
                    </span>
                  </div>
                  
                  <div className="flex flex-col gap-2.5 text-sm">
                    <div className="flex items-baseline gap-3">
                      <div className="w-20 flex-shrink-0 text-[13px] text-[#737373]">เบอร์ติดต่อ</div>
                      <div className="text-[#F3F3F3] text-[13px]">{artist.profiles?.phone || 'ยังไม่ได้ระบุ'}</div>
                    </div>
                    
                    <div className="flex items-baseline gap-3">
                      <div className="w-20 flex-shrink-0 text-[13px] text-[#737373]">อีเมลบัญชี</div>
                      <div className="text-[#F3F3F3] text-[13px] min-w-0 truncate">
                        {artist.profiles?.email ? (
                          <a href={`mailto:${artist.profiles.email}`} className="hover:underline">{artist.profiles.email}</a>
                        ) : (
                          'ไม่พบข้อมูลโปรไฟล์'
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 flex justify-between items-center">
                    <Link
                      href={`/owner/artists/${artist.user_id}`}
                      className="text-white hover:text-gray-300 text-sm font-medium transition-colors"
                    >
                      จัดการข้อมูล
                    </Link>
                    {isActive ? (
                      <button
                        onClick={() => handleDeactivate(artist)}
                        disabled={isPending}
                        className="text-red-400 hover:text-red-300 text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        นำช่างออกจากร้าน
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReactivate(artist.user_id)}
                        disabled={isPending}
                        className="text-white hover:text-gray-300 text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        เปิดใช้งานอีกครั้ง
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {confirmingArtist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-[#171717] border border-[#262626] rounded-xl p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-medium text-white mb-2">นำช่างออกจากร้าน?</h3>
            <p className="text-sm text-[#A3A3A3] mb-6 leading-relaxed">
              ช่างคนนี้จะไม่สามารถรับคิวใหม่หรือเข้าใช้งานระบบของร้านได้
              แต่ประวัติงาน คิว รายได้ และข้อมูลย้อนหลังจะยังคงอยู่
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmingArtist(null)}
                disabled={isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-[#262626] hover:bg-[#333] rounded-md transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={confirmDeactivate}
                disabled={isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors disabled:opacity-50"
              >
                {isPending ? 'กำลังดำเนินการ...' : 'นำออกจากร้าน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
