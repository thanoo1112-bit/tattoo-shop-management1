'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useBookingState } from './BookingStateProvider';

interface Style {
  style_id: string;
  name: string;
}

interface Artist {
  artist_id: string;
  display_name: string;
  avatar_url: string | null;
  styles?: Style[];
}

interface Props {
  artists: Artist[];
  shopSlug: string;
  initialArtistId?: string;
  initialStyleId?: string;
}

export default function ArtistSelectionList({ artists, shopSlug, initialArtistId, initialStyleId }: Props) {
  const router = useRouter();
  const { formData, setFormData } = useBookingState();
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(initialArtistId || null);
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(initialStyleId || null);
  const [colorOptions, setColorOptions] = useState<{value: string, label: string}[]>([]);
  const [isFetchingColors, setIsFetchingColors] = useState(false);
  const [colorFetchError, setColorFetchError] = useState(false);
  
  const [workTypes, setWorkTypes] = useState<{value: string, label: string}[]>([]);
  const [isFetchingWorkTypes, setIsFetchingWorkTypes] = useState(false);
  const [workTypeFetchError, setWorkTypeFetchError] = useState(false);
  
  const [isListExpanded, setIsListExpanded] = useState(!initialArtistId);
  
  const supabase = createClient();

  // Hydrate options if initial artist is present
  useEffect(() => {
    if (initialArtistId) {
      const fetchInitialOptions = async () => {
        setIsFetchingColors(true);
        setIsFetchingWorkTypes(true);

        const [colorRes, workTypeRes] = await Promise.all([
          supabase.rpc('get_public_artist_color_options', { p_shop_slug: shopSlug, p_artist_id: initialArtistId }),
          supabase.rpc('get_public_artist_work_types', { p_shop_slug: shopSlug, p_artist_id: initialArtistId })
        ]);
        
        setIsFetchingColors(false);
        setIsFetchingWorkTypes(false);

        if (!colorRes.error && colorRes.data) {
          setColorOptions(colorRes.data);
        }
        if (!workTypeRes.error && workTypeRes.data) {
          setWorkTypes(workTypeRes.data);
        }
      };
      fetchInitialOptions();
    }
  }, [initialArtistId, shopSlug]);

  if (!artists || artists.length === 0) {
    return (
      <div className="py-16 text-center border border-[#262626] bg-[#171717]/30 rounded-2xl">
        <p className="text-[#A3A3A3] mb-2">ยังไม่มีช่างที่เปิดรับจองคิว</p>
        <p className="text-[#737373] text-sm">กรุณาติดต่อร้านเพื่อสอบถามคิว</p>
      </div>
    );
  }

  const handleArtistClick = async (artistId: string) => {
    if (selectedArtistId === artistId) {
      setIsListExpanded(false);
      return;
    }
    
    setSelectedArtistId(artistId);
    setIsListExpanded(false);
    setSelectedStyleId(null);
    setColorOptions([]);
    setColorFetchError(false);
    setWorkTypes([]);
    setWorkTypeFetchError(false);
    setFormData(prev => ({ ...prev, colorMode: '', workType: '', selectedDate: '', preferredTime: '' }));
    
    // Fetch color options
    setIsFetchingColors(true);
    setIsFetchingWorkTypes(true);

    const [colorRes, workTypeRes] = await Promise.all([
      supabase.rpc('get_public_artist_color_options', { p_shop_slug: shopSlug, p_artist_id: artistId }),
      supabase.rpc('get_public_artist_work_types', { p_shop_slug: shopSlug, p_artist_id: artistId })
    ]);
    
    setIsFetchingColors(false);
    setIsFetchingWorkTypes(false);

    // Handle colors
    if (colorRes.error) {
      setColorFetchError(true);
    } else if (!colorRes.data || colorRes.data.length === 0) {
      setColorOptions([]);
    } else {
      setColorOptions(colorRes.data);
      if (colorRes.data.length === 1) {
        setFormData(prev => ({ ...prev, colorMode: colorRes.data[0].value }));
      }
    }

    // Handle work types
    if (workTypeRes.error) {
      setWorkTypeFetchError(true);
    } else if (!workTypeRes.data || workTypeRes.data.length === 0) {
      setWorkTypes([]);
    } else {
      setWorkTypes(workTypeRes.data);
      if (workTypeRes.data.length === 1) {
        setFormData(prev => ({ ...prev, workType: workTypeRes.data[0].value }));
      }
    }
  };

  const handleContinue = () => {
    if (selectedArtistId && (formData.flashId || selectedStyleId) && formData.colorMode && formData.workType) {
      const styleParamVal = selectedStyleId || '';
      router.push(`/book/${shopSlug}?step=2&artist=${selectedArtistId}&style=${styleParamVal}`);
    }
  };

  return (
    <div className="space-y-6 md:space-y-8 max-w-[1024px] mx-auto w-full">
      {formData.flashId && (
        <div className="bg-[#FFFFFF]/5 border border-[#FFFFFF]/10 rounded-2xl p-5 md:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#FFFFFF]/10 pb-4">
            <div>
              <span className="text-[10px] font-bold tracking-[0.2em] text-[#A3A3A3] uppercase block mb-1">SELECTED DESIGN</span>
              <h4 className="text-base font-bold text-[#F5F5F5] font-mono tracking-wider">รหัสลาย Flash: {formData.flashCode}</h4>
            </div>
            <div className="shrink-0 text-sm font-bold text-white bg-[#262626] px-4 py-2 rounded-xl border border-[#333]">
              ราคา ฿{Number(formData.flashPrice || 0).toLocaleString()}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            <div className="bg-[#0A0A0A] border border-[#1F1F1F] p-3 rounded-xl">
              <span className="text-[10px] text-[#737373] block">ช่างสัก</span>
              <span className="text-sm font-semibold text-[#F5F5F5] mt-1 block">
                {artists.find(a => a.artist_id === selectedArtistId)?.display_name || 'ช่างสักประจำแบบ'}
              </span>
            </div>
            <div className="bg-[#0A0A0A] border border-[#1F1F1F] p-3 rounded-xl">
              <span className="text-[10px] text-[#737373] block">สไตล์งาน</span>
              <span className="text-sm font-semibold text-[#F5F5F5] mt-1 block">
                {formData.flashStyle || '-'}
              </span>
            </div>
            <div className="bg-[#0A0A0A] border border-[#1F1F1F] p-3 rounded-xl">
              <span className="text-[10px] text-[#737373] block">ขนาด</span>
              <span className="text-sm font-semibold text-[#F5F5F5] mt-1 block">
                {formData.flashSize || '-'}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className={`space-y-2 ${selectedArtistId ? 'hidden md:block' : ''}`}>
        <h2 className="text-2xl md:text-[28px] font-semibold text-[#F5F5F5]">เลือกช่างสัก</h2>
        <p className="text-sm md:text-base text-[#A3A3A3]">เลือกช่างที่คุณต้องการจองคิว</p>
      </div>
      
      {(!selectedArtistId || isListExpanded) ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {artists.map((artist) => {
            const isSelected = selectedArtistId === artist.artist_id;
            
            return (
              <div key={artist.artist_id} className="w-full flex flex-col gap-2">
                <button 
                  type="button"
                  onClick={() => handleArtistClick(artist.artist_id)}
                  aria-selected={isSelected}
                  className={`group flex items-center p-4 md:p-5 min-h-[88px] md:min-h-[104px] rounded-2xl border transition-all duration-200 active:scale-[0.98] ${isSelected ? 'border-[#F5F5F5] bg-[#171717]' : 'border-[#262626] bg-[#121212] hover:bg-[#1a1a1a] hover:border-[#404040]'}`}
                >
                  <div className="w-[72px] h-[72px] rounded-[12px] overflow-hidden bg-[#121212] flex-shrink-0 border border-[#262626] relative self-start mt-0.5">
                    {artist.avatar_url ? (
                      <Image 
                        src={artist.avatar_url} 
                        alt={artist.display_name} 
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#A3A3A3] font-medium text-lg">
                        {artist.display_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  
                  <div className="ml-4 flex-1 overflow-hidden text-left">
                    <h3 className="text-[15px] md:text-[16px] font-semibold text-[#F5F5F5] group-hover:text-white transition-colors truncate">
                      {artist.display_name}
                    </h3>
                    <p className="text-[13px] md:text-[14px] text-[#737373] mt-0.5">ช่างสัก</p>
                    
                    {artist.styles && artist.styles.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                        {artist.styles.slice(0, 2).map((s: any) => (
                          <span key={s.style_id} className="text-[11px] md:text-[12px] text-[#A3A3A3] bg-[#171717] border border-[#2A2A2A] px-2.5 py-0.5 rounded-md whitespace-nowrap group-hover:border-[#404040] transition-colors">
                            {s.name}
                          </span>
                        ))}
                        {artist.styles.length > 2 && (
                          <span className="text-[11px] md:text-[12px] text-[#737373] bg-[#171717] border border-[#262626] px-2 py-0.5 rounded-md whitespace-nowrap">
                            +{artist.styles.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="ml-4 flex items-center text-[#A3A3A3] group-hover:text-white transition-colors self-center">
                    {isSelected ? (
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#F5F5F5]">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                      </svg>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-top-2 duration-200">
          <h3 className="text-[13px] font-medium text-[#A3A3A3] mb-3">ช่างที่เลือก</h3>
          <div className="flex items-start justify-between p-3.5 md:p-4 rounded-2xl border border-[#262626] bg-[#121212] gap-3">
            {(() => {
              const sa = artists.find(a => a.artist_id === selectedArtistId);
              if (!sa) return null;
              return (
                <div className="flex items-start gap-3 md:gap-3.5 min-w-0">
                  <div className="w-[72px] h-[72px] rounded-[12px] overflow-hidden bg-[#171717] border border-[#262626] relative flex-shrink-0 mt-0.5">
                    {sa.avatar_url ? (
                      <Image src={sa.avatar_url} alt={sa.display_name} fill className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#A3A3A3] font-medium text-lg">
                        {sa.display_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col text-left min-w-0">
                    <span className="text-[14px] md:text-[16px] font-semibold text-[#F5F5F5] truncate">{sa.display_name}</span>
                    <span className="text-[12px] md:text-[14px] text-[#A3A3A3] mt-0.5">ช่างสัก</span>
                    
                    {sa.styles && sa.styles.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                        {sa.styles.slice(0, 3).map((s: any) => (
                          <span key={s.style_id} className="text-[11px] md:text-[12px] text-[#A3A3A3] bg-[#171717] border border-[#2A2A2A] px-2.5 py-0.5 rounded-md whitespace-nowrap">
                            {s.name}
                          </span>
                        ))}
                        {sa.styles.length > 3 && (
                          <span className="text-[11px] md:text-[12px] text-[#737373] bg-[#171717] border border-[#262626] px-2 py-0.5 rounded-md whitespace-nowrap">
                            +{sa.styles.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            
            {artists.length > 1 && (
              <button 
                type="button" 
                onClick={() => setIsListExpanded(true)}
                className="text-[12px] md:text-[13px] text-[#F5F5F5] font-medium flex items-center justify-center gap-1.5 px-3 md:px-4 py-2 min-h-[36px] md:min-h-[40px] rounded-xl border border-[#404040] bg-[#171717] hover:bg-[#262626] hover:border-[#525252] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#F5F5F5]/40 transition-all flex-shrink-0 self-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#F5F5F5]">
                  <polyline points="17 1 21 5 17 9"></polyline>
                  <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                  <polyline points="7 23 3 19 7 15"></polyline>
                  <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                </svg>
                เปลี่ยนช่าง
              </button>
            )}
          </div>
        </div>
      )}

      {selectedArtistId && !isListExpanded && (() => {
        const selectedArtist = artists.find(a => a.artist_id === selectedArtistId);
        if (!selectedArtist) return null;
        const styles = selectedArtist.styles || [];
        
        
        
        return (
          <>


            <div className="bg-[#121212] border border-[#262626] rounded-2xl p-4 md:p-6 lg:p-7 animate-in fade-in slide-in-from-top-4 duration-300 mt-4 md:mt-5 w-full">
              <div className="mb-5 md:mb-6">
                <h3 className="text-[17px] md:text-lg font-medium text-[#F5F5F5]">เลือกรูปแบบงาน</h3>
                <p className="text-[#737373] text-[13px] mt-1">ตัวเลือกด้านล่างอ้างอิงจากงานที่ช่างคนนี้รับ</p>
              </div>
              
              <div className="space-y-6 md:space-y-8">
                {/* Styles Section */}
                {!formData.flashId && (
                  <div>
                    <h4 className="text-[13px] font-medium text-[#A3A3A3] mb-3">สไตล์</h4>
                    {styles.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {styles.map(s => {
                          const isSelected = selectedStyleId === s.style_id;
                          return (
                            <button
                              key={s.style_id}
                              type="button"
                              onClick={() => setSelectedStyleId(s.style_id)}
                              className={`flex items-center px-3.5 py-2 text-[13px] rounded-full border transition-all ${
                                isSelected 
                                  ? 'bg-[#F5F5F5] text-[#0A0A0A] border-[#F5F5F5] font-medium' 
                                  : 'bg-[#171717] text-[#A3A3A3] border-[#2A2A2A] hover:border-[#404040] hover:text-[#F5F5F5]'
                              }`}
                            >
                              {isSelected && (
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5 flex-shrink-0">
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                              )}
                              {s.name}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[#737373] text-[13px]">ไม่มีตัวเลือกที่เปิดรับในหมวดนี้</p>
                    )}
                  </div>
                )}

                <div className="flex flex-col lg:flex-row gap-6 md:gap-8 lg:gap-12 pt-6 md:pt-8 border-t border-[#262626]">
                  {/* Colors Section */}
                  <div className={`w-full ${formData.flashId ? 'lg:w-full' : 'lg:w-[40%]'}`}>
                    <h4 className="text-[13px] font-medium text-[#A3A3A3] mb-3">โทนสี <span className="text-red-500">*</span></h4>
                    {isFetchingColors ? (
                      <p className="text-[#737373] text-[13px] animate-pulse">กำลังโหลด...</p>
                    ) : colorFetchError ? (
                      <p className="text-red-400 text-[13px]">ไม่สามารถโหลดข้อมูลได้</p>
                    ) : colorOptions.length === 0 ? (
                      <p className="text-[#737373] text-[13px]">ไม่มีตัวเลือกที่เปิดรับในหมวดนี้</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {colorOptions.map(opt => {
                          const isSelectedColor = formData.colorMode === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, colorMode: opt.value }))}
                              className={`flex items-center px-3.5 py-2 text-[13px] rounded-full border transition-all ${
                                isSelectedColor 
                                  ? 'bg-[#F5F5F5] text-[#0A0A0A] border-[#F5F5F5] font-medium' 
                                  : 'bg-[#171717] text-[#A3A3A3] border-[#2A2A2A] hover:border-[#404040] hover:text-[#F5F5F5]'
                              }`}
                            >
                              {isSelectedColor && (
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5 flex-shrink-0">
                                  <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                              )}
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Work Types Section */}
                  {!formData.flashId && (
                    <div className="w-full lg:w-[60%]">
                      <h4 className="text-[13px] font-medium text-[#A3A3A3] mb-3">ประเภทงาน <span className="text-red-500">*</span></h4>
                      {isFetchingWorkTypes ? (
                        <p className="text-[#737373] text-[13px] animate-pulse">กำลังโหลด...</p>
                      ) : workTypeFetchError ? (
                        <p className="text-red-400 text-[13px]">ไม่สามารถโหลดข้อมูลได้</p>
                      ) : workTypes.length === 0 ? (
                        <p className="text-[#737373] text-[13px]">ไม่มีตัวเลือกที่เปิดรับในหมวดนี้</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {workTypes.map(opt => {
                            const isSelectedType = formData.workType === opt.value;
                            const mappedLabel = 
                              opt.value === 'new_work' ? 'งานใหม่' :
                              opt.value === 'extension' ? 'ต่อเติมลายเดิม' :
                              opt.value === 'touch_up' ? 'เก็บงาน/เติมสี' :
                              opt.value === 'cover_up' ? 'แก้/ทับลายเดิม' :
                              opt.value === 'scar_cover' ? 'สักทับรอยแผลเป็น' :
                              opt.label;

                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, workType: opt.value }))}
                                className={`flex items-center px-3.5 py-2 text-[13px] rounded-full border transition-all ${
                                  isSelectedType 
                                    ? 'bg-[#F5F5F5] text-[#0A0A0A] border-[#F5F5F5] font-medium' 
                                    : 'bg-[#171717] text-[#A3A3A3] border-[#2A2A2A] hover:border-[#404040] hover:text-[#F5F5F5]'
                                }`}
                              >
                                {isSelectedType && (
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5 flex-shrink-0">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                  </svg>
                                )}
                                {mappedLabel}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-[#262626] flex flex-col-reverse sm:flex-row gap-4">
              <button
                disabled={(!formData.flashId && !selectedStyleId) || !formData.colorMode || !formData.workType}
                onClick={handleContinue}
                className="flex-1 py-4 text-center rounded-xl font-medium transition-all flex items-center justify-center disabled:bg-[#1A1A1A] disabled:text-[#404040] disabled:cursor-not-allowed bg-[#F5F5F5] text-black hover:bg-[#E5E5E5] active:scale-[0.98]"
              >
                รายละเอียดงานสัก
              </button>
            </div>
          </>
        );
      })()}
    </div>
  );
}
