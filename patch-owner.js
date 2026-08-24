const fs = require('fs');
let code = fs.readFileSync('src/components/artist/booking-requests/ArtistBookingRequestsList.tsx', 'utf8');

const targetProps = `type ArtistBookingRequestsListProps = {
  initialRequests: BookingRequest[];
};`;

const replacementProps = `type ArtistBookingRequestsListProps = {
  initialRequests: BookingRequest[];
  isOwnerView?: boolean;
};`;
code = code.replace(targetProps, replacementProps);

const targetComp = `export default function ArtistBookingRequestsList({ initialRequests }: ArtistBookingRequestsListProps) {`;
const replacementComp = `export default function ArtistBookingRequestsList({ initialRequests, isOwnerView = false }: ArtistBookingRequestsListProps) {`;
code = code.replace(targetComp, replacementComp);

const targetType = `type BookingRequest = {
  id: string;
  requested_start_at: string;
  status: string;
  submitted_full_name: string;
  submitted_email: string | null;
  submitted_phone: string;
  health_note: string | null;
  created_at: string;
  project: TattooProject | null;
  confirmed_start_at?: string | null;
  confirmed_end_at?: string | null;
  payments?: Payment[] | null;
};`;

const replacementType = `type BookingRequest = {
  id: string;
  requested_start_at: string;
  status: string;
  submitted_full_name: string;
  submitted_email: string | null;
  submitted_phone: string;
  health_note: string | null;
  created_at: string;
  project: TattooProject | null;
  confirmed_start_at?: string | null;
  confirmed_end_at?: string | null;
  payments?: Payment[] | null;
  artist_id?: string;
  artist?: {
    full_name: string | null;
    email: string | null;
  } | null;
};`;
code = code.replace(targetType, replacementType);

const targetCardHeader = `<div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="font-semibold text-[#F5F5F5]">{request.submitted_full_name}</span>`;
                        
const replacementCardHeader = `<div className="flex-1">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="font-semibold text-[#F5F5F5]">{request.submitted_full_name}</span>
                        {isOwnerView && request.artist && (
                          <span className="text-xs bg-[#262626] text-[#A3A3A3] px-2 py-0.5 rounded-full border border-[#333]">
                            ช่าง: {request.artist.full_name || request.artist.email || 'ไม่ทราบชื่อ'}
                          </span>
                        )}`;
code = code.replace(targetCardHeader, replacementCardHeader);

fs.writeFileSync('src/components/artist/booking-requests/ArtistBookingRequestsList.tsx', code);
