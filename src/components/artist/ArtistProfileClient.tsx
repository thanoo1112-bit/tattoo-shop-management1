'use client';

import { useState, useRef } from 'react';
import { User, Plus, X, Check, Loader2 } from 'lucide-react';
import { EmptyState } from '@/components/owner/empty-state';
import { updateArtistProfile, addArtistSpecialty, removeArtistSpecialty, updateArtistAvatar } from '@/app/(dashboard)/artist/profile/actions';
import { createClient } from '@/lib/supabase/client';
import { optimizeImage } from '@/lib/images/optimize-image';

type ProfileData = {
  displayName: string;
  phone: string;
  email: string;
  bio: string;
  avatarUrl: string | null;
  acceptsBlackGrey: boolean;
  acceptsColor: boolean;
  acceptsNewWork: boolean;
  acceptsExtension: boolean;
  acceptsTouchUp: boolean;
  acceptsCoverUp: boolean;
  acceptsScarCover: boolean;
};

type Specialty = {
  style_id: string;
  name: string;
};

interface ArtistProfileClientProps {
  initialData: ProfileData;
  initialSpecialties: Specialty[];
  catalog: Specialty[];
}

export function ArtistProfileClient({ initialData, initialSpecialties, catalog }: ArtistProfileClientProps) {
  const [formData, setFormData] = useState(initialData);
  const [customStyle, setCustomStyle] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toastMessage, setToastMessage] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [isStylePending, setIsStylePending] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAvatar(true);
    setErrors(prev => ({ ...prev, avatar: '' }));

    try {
      // Optimize image before upload
      let fileToUpload = file;
      try {
        fileToUpload = await optimizeImage(file, { preset: 'avatar' });
      } catch (optError: any) {
        // Validation errors (size, type) should stop upload, others fallback if needed
        if (optError.message.includes('10 MB') || optError.message.includes('JPG, PNG และ WebP')) {
          throw optError;
        }
        console.warn('Image optimization failed, falling back to original:', optError);
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const fileName = `${user.id}/avatar`;

      // Upload/overwrite file
      const { error: uploadError } = await supabase.storage
        .from('profile-avatars')
        .upload(fileName, fileToUpload, { upsert: true, contentType: fileToUpload.type });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('profile-avatars')
        .getPublicUrl(fileName);
        
      // Append a timestamp to avoid cache issues
      const avatarUrlWithCacheBust = `${publicUrl}?t=${Date.now()}`;

      // Update local state immediately
      setFormData(prev => ({ ...prev, avatarUrl: avatarUrlWithCacheBust }));

      // Update backend via Server Action
      const result = await updateArtistAvatar(avatarUrlWithCacheBust);
      if (result.error) throw new Error(result.error);

      setToastMessage('อัปเดตรูปโปรไฟล์เรียบร้อยแล้ว');
      setTimeout(() => setToastMessage(''), 3000);
    } catch (err: any) {
      console.error('Upload avatar error:', err);
      setErrors(prev => ({ ...prev, avatar: err.message || 'ไม่สามารถอัปโหลดรูปได้' }));
    } finally {
      setIsUploadingAvatar(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAddStyle = async (styleName: string) => {
    if (isStylePending) return;
    const name = styleName.trim();
    if (!name) return;
    
    // Prevent obvious duplicates in UI before sending to server
    if (initialSpecialties.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      setCustomStyle('');
      return;
    }

    setIsStylePending(true);
    setErrors(prev => ({ ...prev, styles: '' }));
    
    const result = await addArtistSpecialty(name);
    
    if (result.error) {
      setErrors(prev => ({ ...prev, styles: result.error as string }));
    } else {
      setCustomStyle('');
    }
    
    setIsStylePending(false);
  };

  const removeStyle = async (styleId: string) => {
    if (initialSpecialties.length <= 1) {
      setErrors(prev => ({ ...prev, styles: 'ต้องมีสไตล์งานที่รับอย่างน้อย 1 รายการ' }));
      return;
    }

    setIsStylePending(true);
    setErrors(prev => ({ ...prev, styles: '' }));
    
    const result = await removeArtistSpecialty(styleId);
    
    if (result.error) {
      setErrors(prev => ({ ...prev, styles: result.error as string }));
    }
    
    setIsStylePending(false);
  };

  const handleAddCustomStyle = (e: React.FormEvent) => {
    e.preventDefault();
    handleAddStyle(customStyle);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const newErrors: Record<string, string> = {};
    if (!formData.displayName.trim()) newErrors.displayName = 'กรุณากรอกชื่อที่ใช้แสดง';
    if (!formData.phone.trim()) newErrors.phone = 'กรุณากรอกเบอร์โทรศัพท์';
    if (initialSpecialties.length === 0) newErrors.styles = 'กรุณากำหนดอย่างน้อย 1 สไตล์งานที่รับ';
    if (!formData.acceptsBlackGrey && !formData.acceptsColor) {
      newErrors.colors = 'กรุณาเลือกประเภทสีงานอย่างน้อย 1 ประเภท';
    }
    if (!formData.acceptsNewWork && !formData.acceptsExtension && !formData.acceptsTouchUp && !formData.acceptsCoverUp && !formData.acceptsScarCover) {
      newErrors.workTypes = 'กรุณาเลือกประเภทงานอย่างน้อย 1 ประเภท';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsPending(true);
    const form = new FormData(e.currentTarget);
    const result = await updateArtistProfile(form);

    if (result.error) {
      setErrors({ form: result.error });
    } else if (result.success) {
      setToastMessage('บันทึกข้อมูลเรียบร้อยแล้ว');
      setTimeout(() => setToastMessage(''), 3000);
    }
    setIsPending(false);
  };

  const inputClassName = "w-full bg-[#0A0A0A] border border-[#262626] text-[#F5F5F5] rounded-xl px-4 py-3 placeholder:text-[#737373] focus:outline-none focus:border-[#737373] transition-shadow";


  return (
    <div className="max-w-[1100px] w-full pb-20 animate-in fade-in duration-500">
      <form onSubmit={handleSubmit} className="space-y-8">
        <input type="hidden" name="avatarUrl" value={formData.avatarUrl || ''} />
        
        {/* Profile Header */}
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 bg-[#262626] rounded-full flex items-center justify-center text-[#F5F5F5] font-medium text-2xl shrink-0 overflow-hidden border border-[#333]">
              {formData.avatarUrl ? (
                <img src={formData.avatarUrl} alt={formData.displayName} className="w-full h-full object-cover" />
              ) : (
                formData.displayName ? formData.displayName.charAt(0) : '?'
              )}
            </div>
            <div>
              <h2 className="text-[#F3F3F3] text-xl font-medium tracking-wide">{formData.displayName || 'ชื่อช่าง'}</h2>
              <p className="text-[#9CA3AB] text-sm">ช่างสัก</p>
              <p className="text-[#737373] text-xs mt-1">รองรับ JPG, PNG และ WebP สูงสุด 10 MB ระบบจะปรับขนาดรูปให้อัตโนมัติ</p>
              {errors.avatar && <p className="text-red-400 text-xs mt-1">{errors.avatar}</p>}
            </div>
          </div>
          <div>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleAvatarUpload} 
              accept="image/jpeg,image/png,image/webp" 
              className="hidden" 
            />
            <button 
              type="button" 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingAvatar}
              className="px-4 py-2 bg-[#262626] hover:bg-[#333333] disabled:opacity-50 text-[#F3F3F3] text-sm font-medium rounded-md transition-colors min-h-[44px] flex items-center gap-2"
            >
              {isUploadingAvatar ? (
                <><Loader2 size={16} className="animate-spin" /> กำลังอัปโหลด...</>
              ) : (
                'เปลี่ยนรูปโปรไฟล์'
              )}
            </button>
          </div>
        </div>

        {/* ข้อมูลโปรไฟล์ */}
        <section>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
            <h2 className="text-lg font-medium text-[#F3F3F3] tracking-wide">ข้อมูลโปรไฟล์</h2>
          </div>
          <div className="bg-[#171717] border border-[#262626] rounded-xl p-6 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm text-[#9CA3AB] mb-2">ชื่อที่ใช้แสดง *</label>
                <input
                  type="text"
                  name="displayName"
                  placeholder="เช่น ธน"
                  value={formData.displayName}
                  onChange={handleInputChange}
                  className={inputClassName}
                />
                {errors.displayName && <p className="text-red-400 text-xs mt-1.5">{errors.displayName}</p>}
              </div>
              
              <div>
                <label className="block text-sm text-[#9CA3AB] mb-2">เบอร์โทรศัพท์ *</label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className={inputClassName}
                />
                {errors.phone && <p className="text-red-400 text-xs mt-1.5">{errors.phone}</p>}
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm text-[#9CA3AB] mb-2">อีเมล</label>
              <input
                type="email"
                value={formData.email}
                readOnly
                className="w-full bg-[#121212] border border-[#262626] text-[#737373] rounded-xl px-4 py-3 focus:outline-none cursor-not-allowed"
                aria-readonly="true"
              />
              <p className="text-[#737373] text-xs mt-1.5">อีเมลนี้ใช้สำหรับเข้าสู่ระบบ</p>
            </div>

            <div>
              <label className="block text-sm text-[#9CA3AB] mb-2">คำแนะนำตัว</label>
              <textarea
                name="bio"
                rows={4}
                placeholder="เล่าเกี่ยวกับแนวงาน ประสบการณ์ หรือสไตล์การทำงานของคุณ"
                value={formData.bio}
                onChange={handleInputChange}
                className={`${inputClassName} resize-none`}
              />
            </div>
          </div>
        </section>

        {/* สไตล์งานที่รับ */}
        <section>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
            <h2 className="text-lg font-medium text-[#F3F3F3] tracking-wide">สไตล์งานที่รับ</h2>
          </div>
          <div className={`bg-[#171717] border border-[#262626] rounded-xl p-6 shadow-sm ${isStylePending ? 'opacity-70' : ''} transition-opacity`}>
            <p className="text-[#9CA3AB] text-sm mb-6">ลูกค้าจะเลือกได้เฉพาะสไตล์ที่คุณกำหนดไว้</p>
            
            <div className="mb-6">
              <p className="text-xs text-[#737373] mb-3 uppercase tracking-wider">สไตล์ที่เลือกแล้ว</p>
              {initialSpecialties.length > 0 ? (
                <div className="flex flex-wrap gap-2.5">
                  {initialSpecialties.map(specialty => (
                    <div 
                      key={`selected-${specialty.style_id}`} 
                      className="inline-flex items-center bg-[#F5F5F5] text-black rounded-full px-4 min-h-[40px] text-sm font-medium"
                    >
                      {specialty.name}
                      <button
                        type="button"
                        onClick={() => removeStyle(specialty.style_id)}
                        disabled={isStylePending}
                        className="ml-2 -mr-1 p-1 hover:bg-[#E5E5E5] disabled:opacity-50 rounded-full transition-colors"
                        aria-label={`Remove ${specialty.name}`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[#737373] text-sm italic">กรุณาเพิ่มสไตล์งานที่คุณรับอย่างน้อย 1 รายการ</p>
              )}
              {errors.styles && <p className="text-red-400 text-xs mt-3">{errors.styles}</p>}
            </div>

            <div className="border-t border-[#262626] pt-6">
              <p className="text-xs text-[#737373] mb-3 uppercase tracking-wider">เพิ่มสไตล์งาน</p>
              <div className="flex flex-wrap gap-2.5 mb-5">
                {catalog.filter(s => !initialSpecialties.some(is => is.style_id === s.style_id)).map(specialty => (
                  <button
                    key={`catalog-${specialty.style_id}`}
                    type="button"
                    disabled={isStylePending}
                    onClick={() => handleAddStyle(specialty.name)}
                    className="px-4 py-2 rounded-full text-sm font-medium min-h-[40px] bg-[#121212] text-[#A3A3A3] border border-[#262626] hover:border-[#737373] hover:text-[#E5E5E5] disabled:opacity-50 transition-all"
                  >
                    {specialty.name}
                  </button>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <input
                  type="text"
                  placeholder="พิมพ์ชื่อสไตล์"
                  value={customStyle}
                  disabled={isStylePending}
                  onChange={e => setCustomStyle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomStyle(e);
                    }
                  }}
                  className="w-full sm:w-auto flex-1 max-w-[300px] bg-[#0A0A0A] border border-[#262626] text-[#F5F5F5] rounded-full px-4 py-2.5 text-sm placeholder:text-[#737373] focus:outline-none focus:border-[#737373] min-h-[44px] disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={handleAddCustomStyle}
                  disabled={isStylePending || !customStyle.trim()}
                  className={`px-5 min-h-[44px] flex items-center justify-center rounded-full border border-[#262626] font-medium transition-colors ${
                    isStylePending || !customStyle.trim()
                      ? 'bg-[#121212] text-[#737373] cursor-not-allowed'
                      : 'bg-[#F5F5F5] text-[#0A0A0A] hover:bg-[#E5E5E5] cursor-pointer'
                  }`}
                >
                  <Plus size={18} className="mr-2" /> เพิ่มสไตล์
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ประเภทสีงานที่รับ */}
        <section>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
            <h2 className="text-lg font-medium text-[#F3F3F3] tracking-wide">ประเภทสีงานที่รับ</h2>
          </div>
          <div className="bg-[#171717] border border-[#262626] rounded-xl p-6 shadow-sm">
            <p className="text-[#9CA3AB] text-sm mb-6">เลือกประเภทสีของงานสักที่คุณเปิดรับ ลูกค้าจะเห็นเฉพาะตัวเลือกที่คุณเปิดไว้</p>
            
            <div className="flex flex-col sm:flex-row gap-4 mb-2">
              <label className={`flex-1 flex items-center p-4 border rounded-xl cursor-pointer transition-colors ${formData.acceptsBlackGrey ? 'bg-[#F5F5F5] border-[#F5F5F5] text-black' : 'bg-[#121212] border-[#262626] text-[#A3A3A3] hover:border-[#737373]'}`}>
                <input 
                  type="checkbox" 
                  name="acceptsBlackGrey"
                  className="hidden" 
                  checked={formData.acceptsBlackGrey}
                  onChange={(e) => {
                    const nextVal = e.target.checked;
                    if (!nextVal && !formData.acceptsColor) {
                      setErrors(prev => ({ ...prev, colors: 'กรุณาเลือกประเภทสีงานอย่างน้อย 1 ประเภท' }));
                      return;
                    }
                    setFormData(prev => ({ ...prev, acceptsBlackGrey: nextVal }));
                    setErrors(prev => ({ ...prev, colors: '' }));
                  }}
                />
                <div className={`w-5 h-5 rounded flex items-center justify-center mr-3 border ${formData.acceptsBlackGrey ? 'bg-black border-black text-white' : 'border-[#404040]'}`}>
                  {formData.acceptsBlackGrey && <Check size={14} />}
                </div>
                <span className="font-medium">Black & Grey / ขาวดำ</span>
              </label>

              <label className={`flex-1 flex items-center p-4 border rounded-xl cursor-pointer transition-colors ${formData.acceptsColor ? 'bg-[#F5F5F5] border-[#F5F5F5] text-black' : 'bg-[#121212] border-[#262626] text-[#A3A3A3] hover:border-[#737373]'}`}>
                <input 
                  type="checkbox" 
                  name="acceptsColor"
                  className="hidden" 
                  checked={formData.acceptsColor}
                  onChange={(e) => {
                    const nextVal = e.target.checked;
                    if (!nextVal && !formData.acceptsBlackGrey) {
                      setErrors(prev => ({ ...prev, colors: 'กรุณาเลือกประเภทสีงานอย่างน้อย 1 ประเภท' }));
                      return;
                    }
                    setFormData(prev => ({ ...prev, acceptsColor: nextVal }));
                    setErrors(prev => ({ ...prev, colors: '' }));
                  }}
                />
                <div className={`w-5 h-5 rounded flex items-center justify-center mr-3 border ${formData.acceptsColor ? 'bg-black border-black text-white' : 'border-[#404040]'}`}>
                  {formData.acceptsColor && <Check size={14} />}
                </div>
                <span className="font-medium">Color / งานสี</span>
              </label>
            </div>
            {errors.colors && <p className="text-red-400 text-xs mt-2">{errors.colors}</p>}
          </div>
        </section>

        {/* ประเภทงานที่รับ */}
        <section>
          <div className="flex items-center gap-3 mb-5">
            <div className="w-1 h-5 bg-[#FFFFFF] rounded-full" />
            <h2 className="text-lg font-medium text-[#F3F3F3] tracking-wide">ประเภทงานที่รับ</h2>
          </div>
          <div className="bg-[#171717] border border-[#262626] rounded-xl p-6 shadow-sm">
            <p className="text-[#9CA3AB] text-sm mb-6">เลือกประเภทงานสักที่คุณเปิดรับ ลูกค้าจะเห็นเฉพาะประเภทงานที่คุณเปิดไว้</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-2">
              {[
                { key: 'acceptsNewWork', label: 'งานใหม่' },
                { key: 'acceptsExtension', label: 'ต่อเติมลายเดิม' },
                { key: 'acceptsTouchUp', label: 'เก็บงาน/เติมสี' },
                { key: 'acceptsCoverUp', label: 'แก้/ทับลายเดิม' },
                { key: 'acceptsScarCover', label: 'สักทับรอยแผลเป็น' },
              ].map((opt) => (
                <label key={opt.key} className={`flex items-center p-4 border rounded-xl cursor-pointer transition-colors ${formData[opt.key as keyof ProfileData] ? 'bg-[#F5F5F5] border-[#F5F5F5] text-black' : 'bg-[#121212] border-[#262626] text-[#A3A3A3] hover:border-[#737373]'}`}>
                  <input 
                    type="checkbox" 
                    name={opt.key}
                    className="hidden" 
                    checked={formData[opt.key as keyof ProfileData] as boolean}
                    onChange={(e) => {
                      const nextVal = e.target.checked;
                      
                      // Validation: prevent unchecking the last option
                      if (!nextVal) {
                        const otherKeys = ['acceptsNewWork', 'acceptsExtension', 'acceptsTouchUp', 'acceptsCoverUp', 'acceptsScarCover'].filter(k => k !== opt.key);
                        const hasOtherChecked = otherKeys.some(k => formData[k as keyof ProfileData]);
                        
                        if (!hasOtherChecked) {
                          setErrors(prev => ({ ...prev, workTypes: 'กรุณาเลือกประเภทงานอย่างน้อย 1 ประเภท' }));
                          return;
                        }
                      }
                      
                      setFormData(prev => ({ ...prev, [opt.key]: nextVal }));
                      setErrors(prev => ({ ...prev, workTypes: '' }));
                    }}
                  />
                  <div className={`w-5 h-5 rounded flex items-center justify-center mr-3 border ${formData[opt.key as keyof ProfileData] ? 'bg-black border-black text-white' : 'border-[#404040]'}`}>
                    {formData[opt.key as keyof ProfileData] && <Check size={14} />}
                  </div>
                  <span className="font-medium">{opt.label}</span>
                </label>
              ))}
            </div>
            {errors.workTypes && <p className="text-red-400 text-xs mt-2">{errors.workTypes}</p>}
          </div>
        </section>



        {/* Save Button */}
        <div className="pt-6 flex flex-col md:flex-row items-center justify-end gap-4 border-t border-[#262626]">
          {errors.form && (
            <div className="flex items-center gap-2 text-[#EF4444] bg-[#EF4444]/10 px-4 py-2 rounded-md w-full md:w-auto justify-center">
              <span className="text-sm font-medium">{errors.form}</span>
            </div>
          )}
          {toastMessage && (
            <div className="flex items-center gap-2 text-[#4ADE80] bg-[#4ADE80]/10 px-4 py-2 rounded-md w-full md:w-auto justify-center">
              <Check size={16} />
              <span className="text-sm font-medium">{toastMessage}</span>
            </div>
          )}
          <button
            type="submit"
            disabled={isPending}
            className="w-full md:w-auto px-8 py-3.5 bg-[#F5F5F5] hover:bg-[#E5E5E5] disabled:opacity-50 text-black font-medium rounded-xl transition-colors min-h-[44px]"
          >
            {isPending ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
          </button>
        </div>

      </form>
    </div>
  );
}
