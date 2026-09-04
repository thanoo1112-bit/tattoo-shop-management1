export interface Artist {
  id: string;
  name: string;
  nickname?: string;
  slug?: string;
  specialty: string;
  specialties?: string[];
  bio: string;
  avatar: string;
  avatar_url?: string;
  portfolio: string[];
  availability: string[];
  working_days?: string[];
  status: 'Available' | 'Tattooing' | 'Break' | 'Off Duty' | 'AVAILABLE' | 'TATTOOING' | 'BREAK' | 'OFF_DUTY';
  is_active?: boolean;
  is_visible?: boolean;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}
