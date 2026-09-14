export interface EstimateRequest {
  id: string;
  customerName: string;
  customerEmail: string;
  artistId: string;
  artistName: string;
  referenceImage: string;
  referenceImages?: string[];
  width: number;
  height: number;
  placement: string;
  style: string;
  description: string;
  preferredDate?: string;
  submittedDate: string;
  status: 'PENDING' | 'QUOTED' | 'ACCEPTED' | 'REJECTED';
  request_type?: 'ESTIMATE' | 'DIRECT_BOOKING';
  work_type?: 'NEW_TATTOO' | 'REWORK' | 'COVER_UP' | 'SCAR_COVER' | null;
  quotedPrice?: number;
  quotedDeposit?: number;
  estimatedDuration?: number;
  quoteNote?: string;
  hasMedicalCondition?: boolean;
  medicalConditionNote?: string | null;
  hasAllergy?: boolean;
  allergyNote?: string | null;
}

