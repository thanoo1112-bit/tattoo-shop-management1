'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Upload, Link as LinkIcon, Check, Image as ImageIcon, Loader2, AlertCircle, Camera, Trash2, CheckCircle2 } from 'lucide-react';
import { uploadCustomerReference, getCustomerReferenceSignedUrl } from '@/lib/utils/storageUploader';

interface ReferenceUploaderProps {
  value: string; // Storage object path (e.g. "<auth.uid()>/<uuid>.webp") OR legacy external/preset URL
  onChange: (storagePathOrUrl: string) => void;
  disabled?: boolean;
}

export default function ReferenceUploader({ value, onChange, disabled = false }: ReferenceUploaderProps) {
  const [urlInput, setUrlInput] = useState('');
  const [showUrlField, setShowUrlField] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewSignedUrl, setPreviewSignedUrl] = useState<string>('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preset references for quick selection
  const presets = [
    { name: 'Skull', url: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=500' },
    { name: 'Wave', url: 'https://images.unsplash.com/photo-1590246814883-57c511e76523?w=500' },
    { name: 'Traditional', url: 'https://images.unsplash.com/photo-1560707303-4e980c87f92e?w=500' },
  ];

  // Resolve Preview URL whenever `value` changes
  useEffect(() => {
    let isMounted = true;

    async function resolvePreview() {
      if (!value) {
        setPreviewSignedUrl('');
        return;
      }

      // If value is already an HTTP(S) URL or Data URL, use directly
      if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')) {
        setPreviewSignedUrl(value);
        return;
      }

      // Value is an Object Path in private 'customer-references' bucket -> get Signed URL
      setLoadingPreview(true);
      try {
        const signedUrl = await getCustomerReferenceSignedUrl(value, 3600);
        if (isMounted) {
          setPreviewSignedUrl(signedUrl || '');
        }
      } catch (err) {
        console.error('[ReferenceUploader] Error resolving signed URL for preview:', err);
        if (isMounted) {
          setPreviewSignedUrl('');
        }
      } finally {
        if (isMounted) {
          setLoadingPreview(false);
        }
      }
    }

    resolvePreview();

    return () => {
      isMounted = false;
    };
  }, [value]);

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim()) {
      onChange(urlInput.trim());
      setUrlInput('');
      setShowUrlField(false);
      setUploadError(null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      // 1. Upload to customer-references private bucket via shared helper (derives auth user ID internally)
      const result = await uploadCustomerReference(file);
      
      // 2. Pass the Storage Object Path (e.g. "<auth.uid()>/<uuid>.webp") to the form state
      onChange(result.path);
    } catch (err: any) {
      console.error('[ReferenceUploader] Upload error:', err);
      setUploadError(err?.message || 'ไม่สามารถอัปโหลดรูปภาพได้ กรุณาลองใหม่');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setUploadError(null);
    setPreviewSignedUrl('');
    onChange('');
  };

  return (
    <div className="bg-studio-main border border-studio-border p-4 rounded-[6px] flex flex-col space-y-4 font-prompt">
      <span className="text-[10px] uppercase tracking-wider text-studio-muted font-bold block">
        รูปภาพอ้างอิง (Reference Image)
      </span>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        disabled={isUploading || disabled}
        className="hidden"
      />

      {isUploading ? (
        <div className="aspect-video rounded-[4px] border border-dashed border-studio-border bg-studio-card/40 flex flex-col items-center justify-center space-y-2 p-6 animate-pulse">
          <Loader2 size={24} className="animate-spin text-studio-red" />
          <p className="text-xs text-studio-primary font-medium">กำลังอัปโหลดรูปภาพอ้างอิง...</p>
          <p className="text-[10px] text-studio-muted">ระบบกำลังบีบอัดและส่งขึ้น Secure Storage</p>
        </div>
      ) : previewSignedUrl || value ? (
        <div className="relative group aspect-video rounded-[4px] overflow-hidden border border-studio-border bg-[#0E0D0C]">
          {loadingPreview ? (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 size={20} className="animate-spin text-studio-red" />
            </div>
          ) : (
            <img
              src={previewSignedUrl || value}
              alt="Reference"
              className="w-full h-full object-cover"
              onError={(e: any) => {
                e.target.style.display = 'none';
              }}
            />
          )}

          <div className="absolute inset-0 bg-studio-main/70 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={isUploading || disabled}
              onClick={() => fileInputRef.current?.click()}
              className="bg-studio-card hover:bg-studio-sec border border-studio-border text-studio-primary text-[10px] tracking-wider uppercase px-3 py-1.5 font-medium rounded-[4px] transition-colors flex items-center gap-1.5 shadow"
            >
              <Camera size={13} className="text-studio-red" />
              <span>เปลี่ยนรูปภาพ</span>
            </button>
            <button
              type="button"
              disabled={isUploading || disabled}
              onClick={handleRemove}
              className="bg-studio-card hover:bg-red-950/40 border border-studio-border hover:border-red-900/60 text-red-400 text-[10px] tracking-wider uppercase px-3 py-1.5 font-medium rounded-[4px] transition-colors flex items-center gap-1.5 shadow"
            >
              <Trash2 size={13} />
              <span>ลบรูป</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="border border-dashed border-studio-border hover:border-studio-red/40 p-6 rounded-[4px] flex flex-col items-center justify-center text-center transition-colors">
          <button
            type="button"
            disabled={isUploading || disabled}
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center w-full focus:outline-none"
          >
            <Upload className="text-studio-muted mb-2.5 hover:text-studio-red transition-colors" size={28} />
            <p className="text-xs text-studio-primary font-medium mb-1">
              คลิกเพื่อเลือกภาพจากเครื่อง
            </p>
            <p className="text-[10px] text-studio-muted mb-4 max-w-[200px]">
              รองรับ JPG, PNG, WEBP สูงสุด 5 MB (บีบอัดอัตโนมัติ)
            </p>
          </button>

          {uploadError && (
            <p className="text-xs text-red-400 mb-2 flex items-center space-x-1">
              <AlertCircle size={13} className="shrink-0" />
              <span>{uploadError}</span>
            </p>
          )}

          <div className="flex flex-col space-y-2 w-full max-w-[240px]">
            {/* Quick Presets */}
            <div className="flex justify-center gap-1.5 mb-2">
              {presets.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  disabled={isUploading || disabled}
                  onClick={() => onChange(preset.url)}
                  className="bg-studio-card hover:bg-studio-card/80 border border-studio-border px-2 py-1 text-[9px] text-studio-secondary rounded-[4px] transition-colors"
                >
                  ใช้แบบ {preset.name}
                </button>
              ))}
            </div>

            {/* Paste URL Toggle */}
            <button
              type="button"
              onClick={() => setShowUrlField(!showUrlField)}
              className="text-[10px] text-studio-red hover:underline flex items-center justify-center space-x-1"
            >
              <LinkIcon size={12} />
              <span>ใส่ URL ของรูปภาพ</span>
            </button>

            {showUrlField && (
              <form onSubmit={handleUrlSubmit} className="flex gap-1.5 pt-1">
                <input
                  type="url"
                  placeholder="https://..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="flex-1 bg-studio-card border border-studio-border text-[10px] text-studio-primary px-2 py-1 rounded-[4px] focus:outline-none focus:border-studio-red"
                />
                <button
                  type="submit"
                  className="bg-studio-red text-studio-primary text-[10px] px-2 py-1 rounded-[4px] hover:bg-studio-red/80 transition-colors"
                >
                  ใช้
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {uploadError && (previewSignedUrl || value) && (
        <p className="text-xs text-red-400 flex items-center space-x-1">
          <AlertCircle size={13} className="shrink-0" />
          <span>{uploadError}</span>
        </p>
      )}
    </div>
  );
}
