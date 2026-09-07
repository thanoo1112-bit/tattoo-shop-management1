'use client';

import React, { useState } from 'react';
import { useApp } from '../AppContext';
import { EstimateRequest } from '@/data/mockEstimateRequests';
import BookingStatusBadge from '../portal/BookingStatusBadge';
import { Mail, Check, X, Calendar, MapPin, Ruler, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import { createClient } from '@/lib/supabase/client';

interface EstimateRequestQueueProps {
  singleArtistId?: string | null;
}

export default function EstimateRequestQueue({ singleArtistId = null }: EstimateRequestQueueProps) {
  const { estimateRequests, updateEstimateStatus } = useApp();
  
  // Local state for active confirm submission
  const [activeConfirmId, setActiveConfirmId] = useState<string | null>(null);
  const [appointmentDate, setAppointmentDate] = useState('');
  const [startTime, setStartTime] = useState('13:00');
  const [endTime, setEndTime] = useState('16:00');
  const [priceInput, setPriceInput] = useState('0');
  const [depositInput, setDepositInput] = useState('0');
  const [noteInput, setNoteInput] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filter requests
  const displayedRequests = singleArtistId
    ? estimateRequests.filter(req => req.artistId === singleArtistId)
    : estimateRequests;

  const handleOpenConfirmForm = (req: EstimateRequest) => {
    setActiveConfirmId(req.id);
    setAppointmentDate(new Date().toISOString().split('T')[0]);
    setStartTime('13:00');
    setEndTime('16:00');
    setPriceInput(req.quotedPrice ? String(req.quotedPrice) : '0');
    setDepositInput('0');
    setNoteInput('');
    setError('');
  };

  const handleConfirmSubmit = async (id: string) => {
    setError('');
    if (!appointmentDate) {
      setError('กรุณาระบุวันนัดจริง');
      return;
    }
    if (!startTime || !endTime) {
      setError('กรุณาระบุเวลาเริ่มและเวลาสิ้นสุด');
      return;
    }
    if (endTime <= startTime) {
      setError('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม');
      return;
    }

    const priceVal = Number(priceInput);
    if (isNaN(priceVal) || priceVal < 0) {
      setError('กรุณากรอกราคางานสักที่ถูกต้อง (ใส่ 0 หากยังไม่กำหนดราคา)');
      return;
    }

    const depositVal = Number(depositInput);
    if (isNaN(depositVal) || depositVal < 0) {
      setError('กรุณากรอกค่ามัดจำที่ถูกต้อง (ใส่ 0 หากไม่ต้องมัดจำ)');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const formattedStartTime = startTime.length === 5 ? `${startTime}:00` : startTime;
      const formattedEndTime = endTime.length === 5 ? `${endTime}:00` : endTime;

      if (!isNaN(priceVal)) {
        await supabase
          .from('estimate_requests')
          .update({ quoted_price: priceVal })
          .eq('id', id);
      }

      const { data, error: rpcErr } = await supabase.rpc('admin_confirm_booking_request', {
        p_estimate_request_id: id,
        p_appointment_date: appointmentDate,
        p_start_time: formattedStartTime,
        p_end_time: formattedEndTime,
        p_deposit_required: depositVal,
        p_admin_note: noteInput.trim() || null,
      });

      if (rpcErr) {
        if (rpcErr.code === '23P01' || rpcErr.message?.includes('no_artist_double_booking')) {
          setError('ช่วงเวลานี้มีคิวของช่างอยู่แล้ว กรุณาเลือกเวลาอื่น');
        } else if (rpcErr.code === '42501') {
          setError('คุณไม่มีสิทธิ์ยืนยันคำขอนี้');
        } else {
          setError(rpcErr.message || 'เกิดข้อผิดพลาดในการยืนยันคิวสัก');
        }
        return;
      }

      setActiveConfirmId(null);
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถบันทึกข้อมูลการยืนยันคิวได้');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (id: string) => {
    if (!window.confirm('คุณต้องการปฏิเสธคำขอจองนี้ใช่หรือไม่?')) return;
    setError('');
    try {
      await updateEstimateStatus(id, 'REJECTED');
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาดในการปฏิเสธคำขอ');
    }
  };

  return (
    <div className="bg-studio-card border border-studio-border rounded-[8px] overflow-hidden w-full font-prompt">
      <div className="p-4 border-b border-studio-border bg-studio-sec/40 flex justify-between items-center">
        <h3 className="text-xs font-bold uppercase tracking-wider text-studio-primary">
          คำขอจองคิวสัก (Booking Requests Queue)
        </h3>
        <span className="text-[9px] bg-studio-red/10 text-studio-red border border-studio-red/30 px-2 py-0.5 rounded font-mono font-bold uppercase">
          Database Active
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-studio-border text-[10px] uppercase tracking-wider text-studio-secondary bg-studio-main/30">
              <th className="p-4 font-semibold">ลูกค้า</th>
              {!singleArtistId && <th className="p-4 font-semibold">ช่างที่ระบุ</th>}
              <th className="p-4 font-semibold">ภาพอ้างอิง</th>
              <th className="p-4 font-semibold">รายละเอียดงาน</th>
              <th className="p-4 font-semibold">สถานะ</th>
              <th className="p-4 font-semibold text-right">ดำเนินการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-studio-border/60 text-xs text-studio-primary">
            {displayedRequests.map((req) => (
              <tr key={req.id} className="hover:bg-studio-sec/40 transition-colors">
                <td className="p-4">
                  <div className="font-bold">{req.customerName}</div>
                  <div className="text-[10px] text-studio-secondary flex items-center space-x-1 mt-0.5">
                    <Mail size={10} />
                    <span className="font-mono">{req.customerEmail}</span>
                  </div>
                </td>
                {!singleArtistId && (
                  <td className="p-4 font-semibold text-studio-secondary">
                    {req.artistName}
                  </td>
                )}
                <td className="p-4">
                  <div className="block w-12 h-12 bg-studio-main border border-studio-border rounded-[4px] overflow-hidden hover:border-studio-red transition-colors">
                    <CustomerReferenceImage src={req.referenceImage} alt="" className="w-full h-full object-cover" />
                  </div>
                </td>
                <td className="p-4 space-y-1">
                  <div className="flex items-center space-x-1">
                    <Ruler size={11} className="text-studio-red" />
                    <span>ขนาด: <span className="font-bold">{req.width}x{req.height} ซม.</span></span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <MapPin size={11} className="text-studio-red" />
                    <span>ตำแหน่ง: <span className="font-semibold text-studio-secondary">{req.placement}</span></span>
                  </div>
                  <div className="text-[10px] text-studio-muted font-light max-w-xs line-clamp-1 italic">
                    “{req.description}”
                  </div>
                </td>
                <td className="p-4">
                  <BookingStatusBadge status={req.status} type="estimate" />
                </td>
                <td className="p-4 text-right">
                  {req.status === 'PENDING' && (
                    <div className="flex items-center justify-end space-x-2">
                      {activeConfirmId === req.id ? (
                        <div className="bg-studio-main border border-studio-border p-4 rounded-[6px] shadow-2xl flex flex-col space-y-2 text-left z-20 w-64 animate-fadeIn">
                          <span className="text-[10px] font-bold text-emerald-400 border-b border-studio-border pb-1 mb-1 block uppercase">
                            จัดการคำขอจองคิวสัก
                          </span>
                          
                          {error && (
                            <div className="bg-red-950/40 border border-red-900/60 p-2 rounded-[3px] flex items-start space-x-1 text-[9px] text-red-400 mb-1 leading-normal">
                              <AlertCircle size={12} className="shrink-0 mt-0.5" />
                              <span>{error}</span>
                            </div>
                          )}

                          <div>
                            <label className="text-[9px] uppercase tracking-wider text-studio-secondary block mb-1">วันนัดจริง</label>
                            <input
                              type="date"
                              value={appointmentDate}
                              onChange={(e) => setAppointmentDate(e.target.value)}
                              className="bg-studio-card border border-studio-border focus:border-emerald-400 text-xs px-2 py-1.5 outline-none rounded-[3px] w-full"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] uppercase tracking-wider text-studio-secondary block mb-1">เวลาเริ่ม</label>
                              <input
                                type="time"
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                                className="bg-studio-card border border-studio-border focus:border-emerald-400 text-xs px-2 py-1.5 outline-none rounded-[3px] w-full"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] uppercase tracking-wider text-studio-secondary block mb-1">เวลาสิ้นสุด</label>
                              <input
                                type="time"
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                                className="bg-studio-card border border-studio-border focus:border-emerald-400 text-xs px-2 py-1.5 outline-none rounded-[3px] w-full"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <label className="text-[9px] uppercase tracking-wider text-studio-secondary block mb-1">ราคางานสัก (บาท)</label>
                              <input
                                type="number"
                                min="0"
                                value={priceInput}
                                onChange={(e) => setPriceInput(e.target.value)}
                                placeholder="0"
                                className="bg-studio-card border border-studio-border focus:border-emerald-400 text-xs px-2 py-1.5 outline-none rounded-[3px] w-full"
                              />
                            </div>
                            <div>
                              <label className="text-[9px] uppercase tracking-wider text-studio-secondary block mb-1">เงินมัดจำ (บาท)</label>
                              <input
                                type="number"
                                min="0"
                                value={depositInput}
                                onChange={(e) => setDepositInput(e.target.value)}
                                placeholder="0"
                                className="bg-studio-card border border-studio-border focus:border-emerald-400 text-xs px-2 py-1.5 outline-none rounded-[3px] w-full"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="text-[9px] uppercase tracking-wider text-studio-secondary block mb-1">หมายเหตุของร้าน</label>
                            <textarea
                              value={noteInput}
                              onChange={(e) => setNoteInput(e.target.value)}
                              rows={2}
                              placeholder="บันทึกเพิ่มเติม..."
                              className="bg-studio-card border border-studio-border focus:border-emerald-400 text-[10px] p-1.5 outline-none rounded-[3px] w-full resize-none"
                            />
                          </div>

                          <div className="flex gap-1.5 pt-1.5">
                            <button
                              onClick={() => handleConfirmSubmit(req.id)}
                              disabled={loading}
                              className="bg-emerald-600 text-white px-3 py-1.5 text-[10px] font-bold rounded-[3px] hover:bg-emerald-500 transition-colors flex-1 flex items-center justify-center gap-1"
                            >
                              {loading ? <Loader2 size={12} className="animate-spin" /> : <><CheckCircle2 size={11} /><span>ยืนยันคิว</span></>}
                            </button>
                            <button
                              onClick={() => {
                                setActiveConfirmId(null);
                                setError('');
                              }}
                              disabled={loading}
                              className="bg-transparent border border-studio-border text-studio-secondary px-3 py-1.5 text-[10px] font-bold rounded-[3px] hover:bg-studio-card transition-colors"
                            >
                              ยกเลิก
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => handleOpenConfirmForm(req)}
                            className="bg-emerald-600 text-white hover:bg-emerald-500 text-[10px] font-bold tracking-wide uppercase px-2.5 py-1.5 rounded-[3px] transition-colors flex items-center space-x-1 shadow"
                          >
                            <Calendar size={10} />
                            <span>จัดการคำขอจอง</span>
                          </button>
                          <button
                            onClick={() => handleReject(req.id)}
                            className="bg-transparent border border-studio-border hover:border-red-500/40 text-studio-muted hover:text-red-500 text-[10px] font-bold tracking-wide uppercase p-1.5 rounded-[3px] transition-colors"
                            title="ปฏิเสธ"
                          >
                            <X size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {req.status === 'ACCEPTED' && (
                    <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">ยืนยันคำขอแล้ว</span>
                  )}
                  {req.status === 'REJECTED' && (
                    <span className="text-[10px] text-red-500 font-semibold italic">ปฏิเสธแล้ว</span>
                  )}
                </td>
              </tr>
            ))}

            {displayedRequests.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-studio-secondary italic">
                  ไม่มีรายการคำขอจองคิวสักเข้ามาในขณะนี้
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
