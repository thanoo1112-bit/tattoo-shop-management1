export interface BookingPayment {
  id: string;
  bookingId: string;
  customerUserId: string;
  paymentType: 'DEPOSIT' | 'BALANCE';
  amount: number;
  currency: string;
  paymentMethod?: string;
  paymentReference?: string;
  status: 'PENDING' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'CANCELLED';
  customerNote?: string;
  staffNote?: string;
  submittedAt?: string;
  verifiedAt?: string;
  rejectedAt?: string;
  verifiedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Booking {
  id: string;
  customerName: string;
  customerEmail: string;
  artistId: string;
  artistName: string;
  artworkTitle?: string;
  artworkImage?: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  price: number;
  deposit: number;
  bookingType: 'custom' | 'flash';
  status: 'PENDING' | 'APPROVED' | 'WAITING_DEPOSIT' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED' | 'CANCELLED';
  paymentStatus?: 'UNPAID' | 'DEPOSIT_PAID';
  estimateRequestId?: string;
  bookingSource?: 'FLASH' | 'ESTIMATE' | 'DIRECT';
  placement?: string;
  width?: number;
  height?: number;
  description?: string;
  customerNote?: string;
  staffNote?: string;
  rejectionReason?: string;
  paymentId?: string;
  depositStatus?: 'PENDING' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'CANCELLED';
  depositPaymentReference?: string;
  depositStaffNote?: string;
  remainingBalance?: number;
}
