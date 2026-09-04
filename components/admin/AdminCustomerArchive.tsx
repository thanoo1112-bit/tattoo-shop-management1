'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../AppContext';
import { Booking } from '@/data/mockBookings';
import { EstimateRequest } from '@/data/mockEstimateRequests';
import CustomerReferenceImage from '@/components/common/CustomerReferenceImage';
import {
  Search,
  User,
  Users,
  Calendar,
  Clock,
  MapPin,
  DollarSign,
  ChevronDown,
  Check,
  FileText,
  X,
  Sparkles,
  ArrowUpDown,
  Phone,
  Mail,
  History,
  Image as ImageIcon,
  CheckCircle2,
  Clock3,
  ChevronRight,
  Shield,
} from 'lucide-react';

interface CustomerRecord {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
  isActive?: boolean;
  bookings: Booking[];
  estimates: EstimateRequest[];
  totalBookings: number;
  totalSpent: number;
  lastArtistName: string;
  lastArtworkTitle: string;
  lastDate: string;
  nextAppointment: Booking | null;
  statusCategory: 'HAS_NEXT' | 'HAS_PENDING' | 'NO_APPOINTMENT';
}

export default function AdminCustomerArchive() {
  const { bookings, estimateRequests, artists, supabase } = useApp();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArtistFilter, setSelectedArtistFilter] = useState('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState<'latest' | 'alphabetical'>('latest');

  // Custom Dropdowns
  const [isArtistDropdownOpen, setIsArtistDropdownOpen] = useState(false);
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const artistDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  // Active Drawer State
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'overview' | 'bookings' | 'estimates' | 'tattoos'>('overview');

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        artistDropdownRef.current &&
        !artistDropdownRef.current.contains(event.target as Node)
      ) {
        setIsArtistDropdownOpen(false);
      }
      if (
        statusDropdownRef.current &&
        !statusDropdownRef.current.contains(event.target as Node)
      ) {
        setIsStatusDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [masterCustomers, setMasterCustomers] = useState<{
    id: string;
    user_id: string;
    display_name: string;
    email: string;
    phone: string;
    avatar_url?: string;
    is_active: boolean;
  }[]>([]);

  // Query public.customers joined with public.profiles
  useEffect(() => {
    let isMounted = true;
    async function loadMasterCustomers() {
      if (!supabase) return;
      try {
        const { data: custs } = await supabase
          .from('customers')
          .select('id, user_id, display_name, email, phone, avatar_url');

        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, role, is_active')
          .eq('role', 'customer');

        if (custs && isMounted) {
          const joined = custs.map((c: any) => {
            const p = profs?.find((pr: any) => pr.user_id === c.user_id);
            return {
              id: c.id,
              user_id: c.user_id,
              display_name: c.display_name || 'ลูกค้าประจำ',
              email: c.email || '-',
              phone: c.phone || '-',
              avatar_url: c.avatar_url || undefined,
              is_active: p?.is_active ?? true,
            };
          });
          setMasterCustomers(joined);
        }
      } catch (_) {}
    }
    loadMasterCustomers();
    return () => {
      isMounted = false;
    };
  }, [supabase]);

  // Compile unique customer records derived from customers master table, bookings and estimates
  const customerRecords: CustomerRecord[] = useMemo(() => {
    const customerMap = new Map<string, {
      name: string;
      email: string;
      phone: string;
      avatar?: string;
      isActive?: boolean;
      bookings: Booking[];
      estimates: EstimateRequest[];
    }>();

    // 1. Seed from Customer Master Table (public.customers + profiles)
    masterCustomers.forEach((mc) => {
      const key = (mc.email && mc.email !== '-' ? mc.email : mc.display_name).toLowerCase();
      customerMap.set(key, {
        name: mc.display_name,
        email: mc.email,
        phone: mc.phone,
        avatar: mc.avatar_url,
        isActive: mc.is_active,
        bookings: [],
        estimates: [],
      });
    });

    // 2. Group bookings by customer email (or name)
    bookings.forEach((b) => {
      const key = (b.customerEmail || b.customerName).toLowerCase();
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          name: b.customerName,
          email: b.customerEmail || '-',
          phone: '-',
          bookings: [],
          estimates: [],
        });
      }
      customerMap.get(key)!.bookings.push(b);
    });

    // 3. Group estimates
    estimateRequests.forEach((e) => {
      const key = (e.customerEmail || e.customerName).toLowerCase();
      if (!customerMap.has(key)) {
        customerMap.set(key, {
          name: e.customerName,
          email: e.customerEmail || '-',
          phone: '-',
          bookings: [],
          estimates: [],
        });
      }
      customerMap.get(key)!.estimates.push(e);
    });

    // Convert to rich CustomerRecord objects
    const records: CustomerRecord[] = [];

    customerMap.forEach((data, key) => {
      const sortedBookings = [...data.bookings].sort((a, b) => b.date.localeCompare(a.date));
      const sortedEstimates = [...data.estimates].sort((a, b) =>
        b.submittedDate.localeCompare(a.submittedDate)
      );

      // Total spent (confirmed or completed or in_progress)
      const totalSpent = sortedBookings
        .filter((b) => b.status === 'CONFIRMED' || b.status === 'COMPLETED' || b.status === 'IN_PROGRESS')
        .reduce((sum, b) => sum + (b.price || 0), 0);

      // Most recent artist & artwork
      const lastBooking = sortedBookings[0];
      const lastEstimate = sortedEstimates[0];
      const lastArtistName = lastBooking?.artistName || lastEstimate?.artistName || 'ช่างสักประจำร้าน';
      const lastArtworkTitle = lastBooking?.artworkTitle || (lastEstimate ? `งานสไตล์ ${lastEstimate.style}` : 'งานสัก');
      const lastDate = lastBooking?.date || lastEstimate?.submittedDate || '-';

      // Find next upcoming appointment
      const activeUpcoming = sortedBookings.find(
        (b) => b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS' || b.status === 'WAITING_DEPOSIT'
      );
      const pendingAppointment = sortedBookings.find((b) => b.status === 'PENDING');
      const nextAppointment = activeUpcoming || pendingAppointment || null;

      let statusCategory: CustomerRecord['statusCategory'] = 'NO_APPOINTMENT';
      if (activeUpcoming) {
        statusCategory = 'HAS_NEXT';
      } else if (pendingAppointment || sortedEstimates.some((e) => e.status === 'PENDING')) {
        statusCategory = 'HAS_PENDING';
      }

      records.push({
        id: `cust-${key.replace(/[^a-zA-Z0-9]/g, '')}`,
        name: data.name,
        email: data.email,
        phone: data.phone,
        avatar: data.avatar,
        isActive: data.isActive,
        bookings: sortedBookings,
        estimates: sortedEstimates,
        totalBookings: sortedBookings.length,
        totalSpent,
        lastArtistName,
        lastArtworkTitle,
        lastDate,
        nextAppointment,
        statusCategory,
      });
    });

    return records;
  }, [bookings, estimateRequests, masterCustomers]);

  // Filtered & Sorted Customer Records
  const filteredCustomers = useMemo(() => {
    return customerRecords
      .filter((c) => {
        const matchesSearch =
          searchQuery.trim() === '' ||
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.lastArtworkTitle.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesArtist =
          selectedArtistFilter === 'ALL' ||
          c.bookings.some((b) => b.artistId === selectedArtistFilter) ||
          c.estimates.some((e) => e.artistId === selectedArtistFilter);

        const matchesStatus =
          selectedStatusFilter === 'ALL' || c.statusCategory === selectedStatusFilter;

        return matchesSearch && matchesArtist && matchesStatus;
      })
      .sort((a, b) => {
        if (sortOrder === 'alphabetical') {
          return a.name.localeCompare(b.name, 'th');
        }
        return b.lastDate.localeCompare(a.lastDate);
      });
  }, [customerRecords, searchQuery, selectedArtistFilter, selectedStatusFilter, sortOrder]);

  // Helper Thai Date Formatter
  const formatThaiDate = (dateStr?: string) => {
    if (!dateStr || dateStr === '-') return '-';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const months = [
      'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
    ];
    return `${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10) - 1]} ${
      parseInt(parts[0], 10) + 543
    }`;
  };

  // Helper Initials Avatar
  const getInitials = (name: string) => {
    if (!name) return 'C';
    const clean = name.trim();
    // Thai character or English
    return clean.charAt(0).toUpperCase();
  };

  // Status Badge presentation
  const getBookingStatusBadge = (status: Booking['status']) => {
    switch (status) {
      case 'CONFIRMED':
        return { label: 'ยืนยันคิวแล้ว', dot: 'bg-green-400', badge: 'text-green-300 bg-green-950/60 border-green-800' };
      case 'IN_PROGRESS':
        return { label: 'กำลังสัก', dot: 'bg-[#9C2F2F]', badge: 'text-[#9C2F2F] bg-[#9C2F2F]/20 border-[#9C2F2F]' };
      case 'WAITING_DEPOSIT':
        return { label: 'รอมัดจำ', dot: 'bg-amber-400', badge: 'text-amber-300 bg-amber-950/60 border-amber-800' };
      case 'PENDING':
        return { label: 'รอตรวจสอบ', dot: 'bg-[#9C2F2F] animate-pulse', badge: 'text-[#9C2F2F] bg-[#9C2F2F]/20 border-[#9C2F2F]' };
      case 'COMPLETED':
        return { label: 'เสร็จสิ้น', dot: 'bg-zinc-500', badge: 'text-[#7A7265] bg-zinc-900 border-[#4A443A]' };
      case 'CANCELLED':
      case 'REJECTED':
        return { label: 'ยกเลิก', dot: 'bg-red-500', badge: 'text-red-400 bg-red-950/60 border-red-800' };
      default:
        return { label: status, dot: 'bg-[#7A7265]', badge: 'text-[#A89F91] bg-[#171512] border-[#4A443A]' };
    }
  };

  return (
    <div className="space-y-6 font-prompt text-[#ECE4D3] pb-24 md:pb-12">
      {/* 1. TOP PAGE HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-[#4A443A] pb-5">
        <div>
          <div className="inline-flex items-center space-x-2 bg-[#171512] border border-[#4A443A] px-2.5 py-0.5 rounded text-[#ECE4D3] text-[10px] uppercase font-heading tracking-widest mb-1.5">
            <Users size={12} className="text-[#9C2F2F]" />
            <span>CLIENT ARCHIVE • แฟ้มข้อมูลลูกค้า</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-heading font-normal tracking-wide text-[#ECE4D3]">
            ข้อมูลลูกค้า
          </h1>
          <p className="text-xs text-[#A89F91] mt-0.5 font-light">
            ดูข้อมูลและประวัติการใช้บริการของลูกค้าร้าน
          </p>
        </div>

        {/* Right Total Count Badge */}
        <div className="flex items-center space-x-3">
          <div className="px-3.5 py-2 bg-[#171512] border border-[#4A443A] rounded-[6px] flex items-center space-x-2">
            <User size={14} className="text-[#9C2F2F]" />
            <span className="text-xs font-semibold text-[#ECE4D3] font-mono">
              ลูกค้าทั้งหมด {customerRecords.length} คน
            </span>
          </div>
        </div>
      </div>

      {/* 2. CUSTOMER TOOLBAR (SEARCH + FILTERS + SORT) */}
      <div className="bg-[#171512] border border-[#4A443A] p-3 rounded-[8px] flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 shadow-md">
        {/* Search Box */}
        <div className="relative w-full sm:w-80">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7265]"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาชื่อ อีเมล หรือเบอร์โทร..."
            className="w-full h-[38px] pl-9 pr-8 bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] focus:border-[#9C2F2F] rounded-[6px] text-xs text-[#ECE4D3] placeholder-[#7A7265] outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#7A7265] hover:text-[#ECE4D3]"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Filters & Sort */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Custom Artist Filter */}
          <div ref={artistDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setIsArtistDropdownOpen((prev) => !prev)}
              className="h-[38px] px-3 bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] rounded-[6px] text-xs font-medium text-[#ECE4D3] flex items-center space-x-2 transition-colors outline-none focus:ring-1 focus:ring-[#9C2F2F]"
            >
              <User size={13} className="text-[#9C2F2F]" />
              <span className="truncate max-w-[120px]">
                {selectedArtistFilter === 'ALL'
                  ? 'ช่างที่เคยดูแลทั้งหมด'
                  : artists.find((a) => a.id === selectedArtistFilter)?.name || 'ช่างสัก'}
              </span>
              <ChevronDown size={13} className="text-[#7A7265]" />
            </button>

            {isArtistDropdownOpen && (
              <div className="absolute top-full mt-1 right-0 z-50 w-[190px] bg-[#171512] border border-[#4A443A] rounded-[8px] p-1.5 shadow-2xl shadow-black/90 space-y-0.5 animate-fadeIn">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedArtistFilter('ALL');
                    setIsArtistDropdownOpen(false);
                  }}
                  className={`w-full h-[34px] px-2.5 rounded-[4px] flex items-center justify-between text-left text-xs font-medium transition-colors ${
                    selectedArtistFilter === 'ALL'
                      ? 'bg-[#9C2F2F]/[0.14] text-[#ECE4D3]'
                      : 'text-[#ECE4D3] hover:bg-[#ECE4D3]/[0.06]'
                  }`}
                >
                  <span>ช่างที่เคยดูแลทั้งหมด</span>
                  {selectedArtistFilter === 'ALL' && (
                    <Check size={13} className="text-[#9C2F2F]" />
                  )}
                </button>
                {artists.map((artist) => (
                  <button
                    key={artist.id}
                    type="button"
                    onClick={() => {
                      setSelectedArtistFilter(artist.id);
                      setIsArtistDropdownOpen(false);
                    }}
                    className={`w-full h-[34px] px-2.5 rounded-[4px] flex items-center justify-between text-left text-xs font-medium transition-colors ${
                      selectedArtistFilter === artist.id
                        ? 'bg-[#9C2F2F]/[0.14] text-[#ECE4D3]'
                        : 'text-[#ECE4D3] hover:bg-[#ECE4D3]/[0.06]'
                    }`}
                  >
                    <span className="truncate">{artist.name}</span>
                    {selectedArtistFilter === artist.id && (
                      <Check size={13} className="text-[#9C2F2F]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Custom Status Filter */}
          <div ref={statusDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setIsStatusDropdownOpen((prev) => !prev)}
              className="h-[38px] px-3 bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] rounded-[6px] text-xs font-medium text-[#ECE4D3] flex items-center space-x-2 transition-colors outline-none focus:ring-1 focus:ring-[#9C2F2F]"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#9C2F2F]" />
              <span>
                {selectedStatusFilter === 'ALL' && 'สถานะทั้งหมด'}
                {selectedStatusFilter === 'HAS_NEXT' && 'มีคิวถัดไป'}
                {selectedStatusFilter === 'HAS_PENDING' && 'มีคำขอรออยู่'}
                {selectedStatusFilter === 'NO_APPOINTMENT' && 'ไม่มีคิว'}
              </span>
              <ChevronDown size={13} className="text-[#7A7265]" />
            </button>

            {isStatusDropdownOpen && (
              <div className="absolute top-full mt-1 right-0 z-50 w-[170px] bg-[#171512] border border-[#4A443A] rounded-[8px] p-1.5 shadow-2xl shadow-black/90 space-y-0.5 animate-fadeIn">
                {[
                  { id: 'ALL', label: 'สถานะทั้งหมด' },
                  { id: 'HAS_NEXT', label: 'มีคิวถัดไป' },
                  { id: 'HAS_PENDING', label: 'มีคำขอรออยู่' },
                  { id: 'NO_APPOINTMENT', label: 'ไม่มีคิว' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedStatusFilter(item.id);
                      setIsStatusDropdownOpen(false);
                    }}
                    className={`w-full h-[34px] px-2.5 rounded-[4px] flex items-center justify-between text-left text-xs font-medium transition-colors ${
                      selectedStatusFilter === item.id
                        ? 'bg-[#9C2F2F]/[0.14] text-[#ECE4D3]'
                        : 'text-[#ECE4D3] hover:bg-[#ECE4D3]/[0.06]'
                    }`}
                  >
                    <span>{item.label}</span>
                    {selectedStatusFilter === item.id && (
                      <Check size={13} className="text-[#9C2F2F]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sort Order Toggle */}
          <button
            type="button"
            onClick={() =>
              setSortOrder((prev) => (prev === 'latest' ? 'alphabetical' : 'latest'))
            }
            className="h-[38px] px-3 bg-[#0E0D0C] border border-[#4A443A] hover:border-[#7A7265] rounded-[6px] text-xs font-medium text-[#ECE4D3] flex items-center space-x-1.5 transition-colors"
            title="เรียงตาม"
          >
            <ArrowUpDown size={12} className="text-[#9C2F2F]" />
            <span>{sortOrder === 'latest' ? 'ล่าสุด' : 'ชื่อ A–Z'}</span>
          </button>
        </div>
      </div>

      {/* 3. DESKTOP CUSTOMER TABLE (Hidden on mobile <= md) */}
      <div className="hidden md:block bg-[#171512] border border-[#4A443A] rounded-[8px] overflow-hidden shadow-xl">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#4A443A] bg-[#0E0D0C] text-[10px] uppercase font-semibold text-[#7A7265] tracking-wider">
              <th className="py-3 px-4">ลูกค้า</th>
              <th className="py-3 px-4">ข้อมูลติดต่อ</th>
              <th className="py-3 px-4">ช่างล่าสุด</th>
              <th className="py-3 px-4">งานล่าสุด</th>
              <th className="py-3 px-4">นัดหมายถัดไป</th>
              <th className="py-3 px-4 text-center">จำนวนงาน</th>
              <th className="py-3 px-4 text-right">ดำเนินการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#4A443A]/50">
            {filteredCustomers.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-xs text-[#7A7265]">
                  {searchQuery ? 'ไม่พบลูกค้าที่ตรงกับการค้นหา' : 'ยังไม่มีข้อมูลลูกค้า'}
                </td>
              </tr>
            ) : (
              filteredCustomers.map((cust) => {
                const isSelected = selectedCustomer?.id === cust.id;

                return (
                  <tr
                    key={cust.id}
                    onClick={() => {
                      setSelectedCustomer(cust);
                      setActiveDetailTab('overview');
                    }}
                    className={`h-[68px] cursor-pointer transition-colors group ${
                      isSelected
                        ? 'bg-[#1C1A16] ring-1 ring-[#9C2F2F]'
                        : 'hover:bg-[#1C1A16]'
                    }`}
                  >
                    {/* Customer Name & Initial Avatar */}
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-3">
                        {cust.avatar ? (
                          <img
                            src={cust.avatar}
                            alt={cust.name}
                            className="w-9 h-9 rounded-full object-cover border border-[#4A443A] shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-[#171512] border border-[#4A443A] flex items-center justify-center font-bold text-xs text-[#ECE4D3] shrink-0">
                            {getInitials(cust.name)}
                          </div>
                        )}
                        <div>
                          <strong className="text-[#ECE4D3] font-medium block">
                            {cust.name}
                          </strong>
                          {cust.isActive !== undefined && (
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.5 rounded border inline-block mt-0.5 ${
                                cust.isActive
                                  ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/60'
                                  : 'text-red-400 bg-red-950/40 border-red-800/60'
                              }`}
                            >
                              {cust.isActive ? 'เปิดใช้งาน' : 'ระงับการใช้งาน'}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Contact */}
                    <td className="py-3 px-4">
                      <span className="text-[#A89F91] font-mono text-[11px] block">
                        {cust.email}
                      </span>
                      <span className="text-[#7A7265] font-mono text-[10px] block">
                        {cust.phone}
                      </span>
                    </td>

                    {/* Last Artist */}
                    <td className="py-3 px-4 text-[#ECE4D3] font-medium">
                      {cust.lastArtistName}
                    </td>

                    {/* Last Artwork */}
                    <td className="py-3 px-4">
                      <span className="text-[#ECE4D3] font-medium block truncate max-w-[160px]">
                        {cust.lastArtworkTitle}
                      </span>
                      <span className="text-[10px] text-[#7A7265] font-mono block">
                        {formatThaiDate(cust.lastDate)}
                      </span>
                    </td>

                    {/* Next Appointment */}
                    <td className="py-3 px-4">
                      {cust.nextAppointment ? (
                        <div className="flex items-center space-x-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#9C2F2F]" />
                          <div>
                            <span className="font-mono text-[#ECE4D3] block font-semibold">
                              {formatThaiDate(cust.nextAppointment.date)}
                            </span>
                            <span className="text-[10px] text-[#A89F91] font-mono block">
                              {cust.nextAppointment.startTime} • {cust.nextAppointment.artistName}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-[#7A7265] text-xs">-</span>
                      )}
                    </td>

                    {/* Total Bookings */}
                    <td className="py-3 px-4 text-center font-mono font-semibold text-[#ECE4D3]">
                      {cust.totalBookings} งาน
                    </td>

                    {/* Action */}
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCustomer(cust);
                          setActiveDetailTab('overview');
                        }}
                        className="px-3 py-1.5 bg-[#0E0D0C] hover:bg-[#9C2F2F] border border-[#4A443A] hover:border-[#9C2F2F] text-[#ECE4D3] rounded-[4px] text-xs font-semibold transition-colors"
                      >
                        ดูข้อมูล
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 4. MOBILE CUSTOMER CARD LIST (Visible on mobile <= md) */}
      <div className="md:hidden space-y-3">
        {filteredCustomers.length === 0 ? (
          <div className="p-8 bg-[#171512] border border-[#4A443A] rounded-[8px] text-center text-xs text-[#7A7265]">
            {searchQuery ? 'ไม่พบลูกค้าที่ตรงกับการค้นหา' : 'ยังไม่มีข้อมูลลูกค้า'}
          </div>
        ) : (
          filteredCustomers.map((cust) => (
            <div
              key={cust.id}
              onClick={() => {
                setSelectedCustomer(cust);
                setActiveDetailTab('overview');
              }}
              className="p-4 bg-[#171512] border border-[#4A443A] hover:border-[#9C2F2F] rounded-[8px] space-y-3 cursor-pointer shadow transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-[#0E0D0C] border border-[#4A443A] flex items-center justify-center font-bold text-sm text-[#ECE4D3] shrink-0">
                    {getInitials(cust.name)}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-[#ECE4D3]">
                      {cust.name}
                    </h4>
                    <span className="text-[11px] text-[#7A7265] font-mono block">
                      {cust.phone}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#0E0D0C] border border-[#4A443A] text-[#A89F91]">
                  {cust.totalBookings} งาน
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs border-t border-[#4A443A]/40 pt-2 text-[#A89F91]">
                <div>
                  <span className="text-[10px] text-[#7A7265] block">งานล่าสุด:</span>
                  <span className="text-[#ECE4D3] truncate block">
                    {cust.lastArtworkTitle}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#7A7265] block">ช่างล่าสุด:</span>
                  <span className="text-[#ECE4D3] block">{cust.lastArtistName}</span>
                </div>
              </div>

              {cust.nextAppointment && (
                <div className="p-2 bg-[#0E0D0C] border-l-2 border-[#9C2F2F] rounded text-xs flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-[#9C2F2F] font-bold block uppercase">
                      นัดหมายถัดไป:
                    </span>
                    <span className="font-mono text-[#ECE4D3] text-xs">
                      {formatThaiDate(cust.nextAppointment.date)} • {cust.nextAppointment.startTime}
                    </span>
                  </div>
                  <span className="text-[10px] text-[#A89F91]">
                    {cust.nextAppointment.artistName}
                  </span>
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCustomer(cust);
                    setActiveDetailTab('overview');
                  }}
                  className="px-3 py-1.5 bg-[#9C2F2F] text-[#ECE4D3] text-xs font-semibold rounded-[4px]"
                >
                  ดูข้อมูลลูกค้า
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 5. CUSTOMER DETAIL DRAWER (Desktop Side Drawer / Mobile Full Sheet) */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/80 backdrop-blur-sm font-prompt animate-fadeIn">
          <div className="absolute inset-0" onClick={() => setSelectedCustomer(null)} />

          <div className="relative w-full max-w-lg md:max-w-xl h-full bg-[#171512] border-l border-[#4A443A] p-6 sm:p-8 flex flex-col justify-between overflow-y-auto z-10 space-y-6 shadow-2xl animate-slideLeft">
            {/* Header */}
            <div className="space-y-4 border-b border-[#4A443A]/60 pb-5">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <Sparkles size={16} className="text-[#9C2F2F]" />
                  <span className="text-xs uppercase font-heading tracking-wider text-[#ECE4D3]">
                    CLIENT ARCHIVE • แฟ้มข้อมูลลูกค้า
                  </span>
                </div>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="text-[#7A7265] hover:text-[#9C2F2F] transition-colors p-1"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex items-center space-x-4">
                <div className="w-16 h-16 rounded-full bg-[#0E0D0C] border-2 border-[#4A443A] flex items-center justify-center font-bold text-2xl text-[#ECE4D3] shrink-0">
                  {getInitials(selectedCustomer.name)}
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl sm:text-2xl font-heading font-normal tracking-wide text-[#ECE4D3] truncate">
                    {selectedCustomer.name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#A89F91] mt-0.5">
                    <span className="flex items-center space-x-1">
                      <Mail size={11} className="text-[#7A7265]" />
                      <span className="font-mono">{selectedCustomer.email}</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Phone size={11} className="text-[#7A7265]" />
                      <span className="font-mono">{selectedCustomer.phone}</span>
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 mt-2">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[#0E0D0C] border border-[#4A443A] font-mono text-[#ECE4D3]">
                      ใช้บริการ {selectedCustomer.totalBookings} ครั้ง
                    </span>
                    {selectedCustomer.totalSpent > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-green-950/60 border border-green-800 text-green-300 font-mono">
                        ยอดสะสม ฿{selectedCustomer.totalSpent.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Detail Navigation Tabs */}
              <div className="flex border-b border-[#4A443A]/60 space-x-4 text-xs pt-2">
                <button
                  type="button"
                  onClick={() => setActiveDetailTab('overview')}
                  className={`pb-2 font-medium transition-colors relative ${
                    activeDetailTab === 'overview'
                      ? 'text-[#ECE4D3] font-semibold'
                      : 'text-[#7A7265] hover:text-[#A89F91]'
                  }`}
                >
                  ภาพรวม
                  {activeDetailTab === 'overview' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#9C2F2F]" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDetailTab('bookings')}
                  className={`pb-2 font-medium transition-colors relative ${
                    activeDetailTab === 'bookings'
                      ? 'text-[#ECE4D3] font-semibold'
                      : 'text-[#7A7265] hover:text-[#A89F91]'
                  }`}
                >
                  การจอง ({selectedCustomer.bookings.length})
                  {activeDetailTab === 'bookings' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#9C2F2F]" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDetailTab('estimates')}
                  className={`pb-2 font-medium transition-colors relative ${
                    activeDetailTab === 'estimates'
                      ? 'text-[#ECE4D3] font-semibold'
                      : 'text-[#7A7265] hover:text-[#A89F91]'
                  }`}
                >
                  ประเมินราคา ({selectedCustomer.estimates.length})
                  {activeDetailTab === 'estimates' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#9C2F2F]" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDetailTab('tattoos')}
                  className={`pb-2 font-medium transition-colors relative ${
                    activeDetailTab === 'tattoos'
                      ? 'text-[#ECE4D3] font-semibold'
                      : 'text-[#7A7265] hover:text-[#A89F91]'
                  }`}
                >
                  ประวัติงานสัก
                  {activeDetailTab === 'tattoos' && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#9C2F2F]" />
                  )}
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="space-y-4 flex-1 text-xs overflow-y-auto">
              {/* TAB 1: OVERVIEW */}
              {activeDetailTab === 'overview' && (
                <div className="space-y-4">
                  {/* NEXT APPOINTMENT (Section เด่นสุด) */}
                  {selectedCustomer.nextAppointment ? (
                    <div className="bg-[#171512] border-l-4 border-l-[#9C2F2F] border border-[#4A443A] p-4 rounded-[6px] space-y-3 shadow-lg">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-1.5 text-xs text-[#ECE4D3] font-bold">
                          <Clock3 size={14} className="text-[#9C2F2F]" />
                          <span>นัดหมายถัดไป (NEXT APPOINTMENT)</span>
                        </div>
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded font-semibold border ${
                            getBookingStatusBadge(selectedCustomer.nextAppointment.status).badge
                          }`}
                        >
                          {getBookingStatusBadge(selectedCustomer.nextAppointment.status).label}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-[#A89F91]">
                        <div>
                          <span className="text-[10px] text-[#7A7265] block">ผลงาน / ลายสัก:</span>
                          <strong className="text-[#ECE4D3]">
                            {selectedCustomer.nextAppointment.artworkTitle || 'Custom Tattoo'}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-[#7A7265] block">ช่างสัก:</span>
                          <strong className="text-[#ECE4D3]">
                            {selectedCustomer.nextAppointment.artistName}
                          </strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-[#7A7265] block">วันและเวลา:</span>
                          <span className="font-mono text-[#ECE4D3]">
                            {formatThaiDate(selectedCustomer.nextAppointment.date)}{' '}
                            {selectedCustomer.nextAppointment.startTime}–
                            {selectedCustomer.nextAppointment.endTime} (
                            {selectedCustomer.nextAppointment.duration} ชม.)
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-[#7A7265] block">ตำแหน่งและขนาด:</span>
                          <span className="text-[#ECE4D3]">
                            {selectedCustomer.nextAppointment.placement || 'ตามที่ตกลง'}
                          </span>
                        </div>
                      </div>

                      {/* Pricing Breakdown */}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#4A443A]/40 text-center">
                        <div className="p-2 bg-[#0E0D0C] rounded border border-[#4A443A]/40">
                          <span className="text-[9px] text-[#7A7265] block">ราคาค่าสัก:</span>
                          <strong className="text-xs font-mono text-[#ECE4D3]">
                            ฿{selectedCustomer.nextAppointment.price?.toLocaleString()}
                          </strong>
                        </div>
                        <div className="p-2 bg-[#0E0D0C] rounded border border-[#4A443A]/40">
                          <span className="text-[9px] text-[#7A7265] block">มัดจำแล้ว:</span>
                          <strong className="text-xs font-mono text-green-400">
                            ฿{selectedCustomer.nextAppointment.deposit?.toLocaleString()}
                          </strong>
                        </div>
                        <div className="p-2 bg-[#0E0D0C] rounded border border-[#4A443A]/40">
                          <span className="text-[9px] text-[#7A7265] block">คงเหลือ:</span>
                          <strong className="text-xs font-mono text-[#A89F91]">
                            ฿{(
                              (selectedCustomer.nextAppointment.price || 0) -
                              (selectedCustomer.nextAppointment.deposit || 0)
                            ).toLocaleString()}
                          </strong>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-[#0E0D0C] border border-[#4A443A] rounded-[6px] text-center text-xs text-[#7A7265]">
                      ไม่มีนัดหมายถัดไปในขณะนี้
                    </div>
                  )}

                  {/* Client Summary Specs */}
                  <div className="bg-[#0E0D0C] border border-[#4A443A] p-4 rounded-[6px] space-y-2.5">
                    <span className="text-[10px] uppercase font-bold text-[#7A7265] tracking-wider block">
                      ข้อมูลสรุปการใช้บริการ:
                    </span>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[#7A7265] text-[10px] block">ช่างที่เคยดูแล:</span>
                        <span className="text-[#ECE4D3] font-medium">
                          {selectedCustomer.lastArtistName}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#7A7265] text-[10px] block">งานล่าสุด:</span>
                        <span className="text-[#ECE4D3] font-medium truncate block">
                          {selectedCustomer.lastArtworkTitle}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#7A7265] text-[10px] block">
                          วันที่ใช้บริการล่าสุด:
                        </span>
                        <span className="text-[#ECE4D3] font-mono">
                          {formatThaiDate(selectedCustomer.lastDate)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#7A7265] text-[10px] block">ยอดใช้จ่ายรวม:</span>
                        <span className="text-green-400 font-mono font-semibold">
                          ฿{selectedCustomer.totalSpent.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Customer Note Section */}
                  <div className="bg-[#0E0D0C] border border-[#4A443A] p-4 rounded-[6px] space-y-1.5">
                    <span className="text-[10px] uppercase font-bold text-[#7A7265] tracking-wider block">
                      บันทึกเกี่ยวกับลูกค้า (Client Notes):
                    </span>
                    <p className="text-[#7A7265] text-xs italic">
                      ยังไม่มีบันทึกสำหรับลูกค้ารายนี้
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: BOOKING HISTORY */}
              {activeDetailTab === 'bookings' && (
                <div className="space-y-3">
                  {selectedCustomer.bookings.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[#7A7265]">
                      ยังไม่มีประวัติการจองคิว
                    </div>
                  ) : (
                    selectedCustomer.bookings.map((b) => {
                      const statusInfo = getBookingStatusBadge(b.status);

                      return (
                        <div
                          key={b.id}
                          className="p-3.5 bg-[#0E0D0C] border border-[#4A443A] rounded-[6px] space-y-2"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <strong className="text-[#ECE4D3] block text-xs">
                                {b.artworkTitle || 'Custom Tattoo'}
                              </strong>
                              <span className="text-[10px] text-[#A89F91] block">
                                ช่างสัก: {b.artistName}
                              </span>
                            </div>
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded font-semibold border ${statusInfo.badge}`}
                            >
                              {statusInfo.label}
                            </span>
                          </div>
                          <div className="flex justify-between items-center pt-1 border-t border-[#4A443A]/30 text-[11px] font-mono text-[#7A7265]">
                            <span>
                              {formatThaiDate(b.date)} {b.startTime} ({b.duration}h)
                            </span>
                            <span className="text-[#ECE4D3] font-semibold">
                              ฿{b.price?.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* TAB 3: ESTIMATE REQUESTS */}
              {activeDetailTab === 'estimates' && (
                <div className="space-y-3">
                  {selectedCustomer.estimates.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[#7A7265]">
                      ยังไม่มีประวัติการขอประเมินราคา
                    </div>
                  ) : (
                    selectedCustomer.estimates.map((e) => (
                      <div
                        key={e.id}
                        className="p-3.5 bg-[#0E0D0C] border border-[#4A443A] rounded-[6px] space-y-2.5"
                      >
                        <div className="flex items-center space-x-3">
                          {e.referenceImage ? (
                            <div className="w-12 h-12 rounded border border-[#4A443A] bg-[#171512] overflow-hidden shrink-0">
                              <CustomerReferenceImage
                                src={e.referenceImage}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded bg-[#171512] border border-[#4A443A] flex items-center justify-center text-[#7A7265] shrink-0">
                              <FileText size={18} />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <strong className="text-xs text-[#ECE4D3] block">
                              สไตล์ {e.style} • ขนาด {e.width}×{e.height} cm
                            </strong>
                            <span className="text-[10px] text-[#A89F91] block">
                              ตำแหน่ง: {e.placement} • ช่าง: {e.artistName || 'ช่างประจำร้าน'}
                            </span>
                          </div>
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded font-semibold border ${
                              e.status === 'QUOTED'
                                ? 'text-amber-300 bg-amber-950/60 border-amber-800'
                                : e.status === 'ACCEPTED'
                                ? 'text-green-300 bg-green-950/60 border-green-800'
                                : 'text-[#9C2F2F] bg-[#9C2F2F]/20 border-[#9C2F2F]'
                            }`}
                          >
                            {e.status === 'QUOTED' && 'เสนอราคาแล้ว'}
                            {e.status === 'ACCEPTED' && 'ตอบรับราคาแล้ว'}
                            {e.status === 'PENDING' && 'รอเสนอราคา'}
                            {e.status === 'REJECTED' && 'ปฏิเสธ'}
                          </span>
                        </div>

                        {e.quotedPrice && (
                          <div className="p-2 bg-[#171512] rounded border border-amber-800/40 text-[11px] flex justify-between items-center">
                            <span className="text-[#A89F91]">ราคาที่เสนอ:</span>
                            <span className="font-mono font-semibold text-[#ECE4D3]">
                              ฿{e.quotedPrice.toLocaleString()} (มัดจำ ฿
                              {e.quotedDeposit?.toLocaleString()})
                            </span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 4: TATTOO HISTORY ARCHIVE */}
              {activeDetailTab === 'tattoos' && (
                <div className="space-y-3">
                  {selectedCustomer.bookings.filter(
                    (b) => b.status === 'CONFIRMED' || b.status === 'COMPLETED' || b.status === 'IN_PROGRESS'
                  ).length === 0 ? (
                    <div className="p-8 text-center text-xs text-[#7A7265]">
                      ยังไม่มีประวัติงานสักที่ยืนยันแล้ว
                    </div>
                  ) : (
                    selectedCustomer.bookings
                      .filter(
                        (b) =>
                          b.status === 'CONFIRMED' ||
                          b.status === 'COMPLETED' ||
                          b.status === 'IN_PROGRESS'
                      )
                      .map((b) => (
                        <div
                          key={b.id}
                          className="p-3.5 bg-[#0E0D0C] border border-[#4A443A] rounded-[6px] space-y-2.5"
                        >
                          <div className="flex items-center space-x-3">
                            {b.artworkImage ? (
                              <img
                                src={b.artworkImage}
                                alt=""
                                className="w-14 h-14 object-cover rounded border border-[#4A443A] bg-[#171512] shrink-0"
                              />
                            ) : (
                              <div className="w-14 h-14 rounded bg-[#171512] border border-[#4A443A] flex items-center justify-center text-[#7A7265] shrink-0">
                                <ImageIcon size={20} />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <strong className="text-xs text-[#ECE4D3] block">
                                {b.artworkTitle || 'Custom Tattoo Piece'}
                              </strong>
                              <span className="text-[10px] text-[#A89F91] block">
                                ช่างสัก: {b.artistName} • {formatThaiDate(b.date)}
                              </span>
                              <span className="text-[10px] text-[#7A7265] block">
                                ตำแหน่ง: {b.placement || 'ตามกำหนด'} • {b.duration} ชม.
                              </span>
                            </div>
                            <span className="text-xs font-mono font-bold text-[#ECE4D3]">
                              ฿{b.price?.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              )}
            </div>

            {/* Footer Action */}
            <div className="pt-4 border-t border-[#4A443A]/60 flex gap-3">
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="w-full min-h-[44px] bg-transparent hover:bg-[#0E0D0C] border border-[#4A443A] text-[#A89F91] hover:text-[#ECE4D3] rounded-[4px] text-xs font-medium transition-colors"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
