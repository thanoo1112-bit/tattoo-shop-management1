'use client';

import React, { useState } from 'react';
import { useApp } from '../AppContext';
import { EstimateRequest } from '@/data/mockEstimateRequests';
import BookingStatusBadge from '../portal/BookingStatusBadge';
import { Mail, Check, X, DollarSign, Calendar, MapPin, Ruler, Loader2, AlertCircle } from 'lucide-react';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';

interface EstimateRequestQueueProps {
  singleArtistId?: string | null;
}

export default function EstimateRequestQueue({ singleArtistId = null }: EstimateRequestQueueProps) {
  const { estimateRequests, updateEstimateStatus } = useApp();
  
  // Local state for active quote submission
  const [activeQuoteId, setActiveQuoteId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [depositInput, setDepositInput] = useState('');
  const [durationInput, setDurationInput] = useState('2');
  const [noteInput, setNoteInput] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filter requests
  const displayedRequests = singleArtistId
    ? estimateRequests.filter(req => req.artistId === singleArtistId)
    : estimateRequests;

  const handleOpenQuoteForm = (req: EstimateRequest) => {
    setActiveQuoteId(req.id);
    setPriceInput('5000');
    setDepositInput('1500');
    setDurationInput('3');
    setNoteInput('งานสไตล์ ' + req.style + ' ขนาด ' + req.width + 'x' + req.height + ' ซม. แนะนำมัดจำเพื่อล็อคคิวครับ');
    setError('');
  };

  const handleSubmitQuote = async (id: string) => {
    setError('');
    const priceVal = Number(priceInput);
    const depositVal = Number(depositInput);
    const durationVal = Number(durationInput);

    if (isNaN(priceVal) || priceVal < 0) {
      setError('กรุณากรอกราคาค่าสักที่ถูกต้อง');
      return;
    }
    if (isNaN(depositVal) || depositVal < 0) {
      setError('กรุณากรอกค่ามัดจำที่ถูกต้อง');
      return;
    }
    if (depositVal > priceVal) {
      setError('เงินมัดจำต้องไม่เกินราคาค่าสัก');
      return;
    }
    if (isNaN(durationVal) || durationVal <= 0) {
      setError('กรุณากรอกระยะเวลาชั่วโมงที่มากกว่า 0');
      return;
    }

    setLoading(true);
    try {
      await updateEstimateStatus(id, 'QUOTED', priceVal, depositVal, durationVal, noteInput);
      setActiveQuoteId(null);
    } catch (err: any) {
      setError(err.message || 'ไม่สามารถบันทึกข้อมูลราคาประเมินลงฐานข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (id: string) => {
    if (!window.confirm('คุณต้องการปฏิเสธคำขอประเมินราคานี้ใช่หรือไม่?')) return;
    setError('');
    try {
      await updateEstimateStatus(id, 'REJECTED');
    } catch (err: any) {
      alert(err.message || 'เกิดข้อผิดพลาดในการปฏิเสธคำขอ');
    }
  };

  return (
    <div className="bg-studio-card border border-studio-border rounded-[8px] overflow-hidden w-full">
      <div className="p-4 border-b border-studio-border bg-studio-sec/40 flex justify-between items-center">
        <h3 className="text-xs font-bold uppercase tracking-wider text-studio-primary">
          คำขอประเมินราคา (Price Estimate Requests Queue) — REAL DATABASE
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
                  {req.quotedPrice && (
                    <div className="text-[10px] text-studio-red font-semibold mt-1">
                      ฿{req.quotedPrice.toLocaleString()} (มัดจำ ฿{req.quotedDeposit?.toLocaleString()})
                    </div>
                  )}
                </td>
                <td className="p-4 text-right">
                  {req.status === 'PENDING' && (
                    <div className="flex items-center justify-end space-x-2">
                      {activeQuoteId === req.id ? (
                        <div className="bg-studio-main border border-studio-border p-4 rounded-[6px] shadow-2xl flex flex-col space-y-2 text-left z-20 w-56 animate-fadeIn">
                          <span className="text-[10px] font-bold text-studio-red border-b border-studio-border pb-1 mb-1 block uppercase">
                            ส่งราคาประเมิน
                          </span>
                          
                          {error && (
                            <div className="bg-red-950/40 border border-red-900/60 p-2 rounded-[3px] flex items-start space-x-1 text-[9px] text-red-400 mb-1 leading-normal">
                              <AlertCircle size={12} className="shrink-0 mt-0.5" />
                              <span>{error}</span>
                            </div>
                          )}

                          <div>
                            <label className="text-[9px] uppercase tracking-wider text-studio-secondary block mb-1">ราคาค่าสัก (บาท)</label>
                            <input
                              type="number"
                              value={priceInput}
                              onChange={(e) => setPriceInput(e.target.value)}
                              className="bg-studio-card border border-studio-border focus:border-studio-red text-xs px-2 py-1.5 outline-none rounded-[3px] w-full"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] uppercase tracking-wider text-studio-secondary block mb-1">มัดจำที่ต้องชำระ (บาท)</label>
                            <input
                              type="number"
                              value={depositInput}
                              onChange={(e) => setDepositInput(e.target.value)}
                              className="bg-studio-card border border-studio-border focus:border-studio-red text-xs px-2 py-1.5 outline-none rounded-[3px] w-full"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] uppercase tracking-wider text-studio-secondary block mb-1">เวลาสักโดยประมาณ (ชั่วโมง)</label>
                            <input
                              type="number"
                              value={durationInput}
                              onChange={(e) => setDurationInput(e.target.value)}
                              className="bg-studio-card border border-studio-border focus:border-studio-red text-xs px-2 py-1.5 outline-none rounded-[3px] w-full"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] uppercase tracking-wider text-studio-secondary block mb-1">หมายเหตุจากช่าง</label>
                            <textarea
                              value={noteInput}
                              onChange={(e) => setNoteInput(e.target.value)}
                              rows={2}
                              className="bg-studio-card border border-studio-border focus:border-studio-red text-[10px] p-1.5 outline-none rounded-[3px] w-full resize-none"
                            />
                          </div>
                          <div className="flex gap-1.5 pt-1.5">
                            <button
                              onClick={() => handleSubmitQuote(req.id)}
                              disabled={loading}
                              className="bg-studio-red text-studio-primary px-3 py-1.5 text-[10px] font-bold rounded-[3px] hover:bg-studio-red/80 transition-colors flex-1 flex items-center justify-center"
                            >
                              {loading ? <Loader2 size={12} className="animate-spin" /> : 'ส่งใบเสนอราคา'}
                            </button>
                            <button
                              onClick={() => {
                                setActiveQuoteId(null);
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
                            onClick={() => handleOpenQuoteForm(req)}
                            className="bg-studio-red text-studio-primary hover:bg-studio-red/80 text-[10px] font-bold tracking-wide uppercase px-2.5 py-1.5 rounded-[3px] transition-colors flex items-center space-x-1"
                          >
                            <DollarSign size={10} />
                            <span>เสนอราคา</span>
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

                  {req.status === 'QUOTED' && (
                    <span className="text-[10px] text-studio-muted italic">ส่งใบเสนอราคาแล้ว</span>
                  )}
                  {req.status === 'ACCEPTED' && (
                    <span className="text-[10px] text-studio-red font-bold uppercase tracking-wider">ลูกค้ายอมรับแล้ว</span>
                  )}
                  {req.status === 'REJECTED' && (
                    <span className="text-[10px] text-red-500 font-semibold italic">ยกเลิกแล้ว</span>
                  )}
                </td>
              </tr>
            ))}

            {displayedRequests.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-studio-secondary italic">
                  ไม่มีรายการคำขอประเมินราคาเข้ามาในขณะนี้
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
