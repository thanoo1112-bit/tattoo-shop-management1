export interface EstimateRequest {
  id: string;
  customerName: string;
  customerEmail: string;
  artistId: string;
  artistName: string;
  referenceImage: string;
  width: number;
  height: number;
  placement: string;
  style: string;
  description: string;
  preferredDate?: string;
  submittedDate: string;
  status: 'PENDING' | 'QUOTED' | 'ACCEPTED' | 'REJECTED';
  quotedPrice?: number;
  quotedDeposit?: number;
  estimatedDuration?: number;
  quoteNote?: string;
}

