// Marketplace types for the reverse auction system

export type SellerStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type BidStatus = 'pending' | 'accepted' | 'rejected' | 'expired';
export type ListingStatus = 'open' | 'closed' | 'awarded' | 'expired';

export interface Seller {
  id: string;
  user_id: string;
  business_name: string;
  contact_email: string;
  contact_phone?: string;
  description?: string;
  website?: string;
  logo_url?: string;
  status: SellerStatus;
  admin_notes?: string;
  approved_at?: string;
  approved_by?: string;
  created_at: string;
  updated_at: string;
}

export interface MarketplaceListing {
  id: string;
  ticket_request_id: string;
  user_id: string;
  title: string;
  deadline: string;
  status: ListingStatus;
  min_bid?: number;
  winning_bid_id?: string;
  created_at: string;
  updated_at: string;
  // Joined from ticket_requests
  ticket_request?: {
    origin: string;
    destination: string;
    departure_date: string;
    return_date?: string;
    trip_type?: string;
    passengers: number;
    cabin_class?: string;
    flexibility?: string;
    preferred_airline?: string;
    budget?: number;
    special_notes?: string;
    contact_email?: string;
  };
  // Aggregated data
  bid_count?: number;
  lowest_bid?: number;
}

export interface Bid {
  id: string;
  listing_id: string;
  seller_id: string;
  amount: number;
  message?: string;
  estimated_delivery?: string;
  conditions?: string;
  status: BidStatus;
  created_at: string;
  updated_at: string;
  // Joined from sellers
  seller?: {
    id: string;
    business_name: string;
    logo_url?: string;
    description?: string;
    contact_email?: string;
  };
}

export interface ListingWithBids extends MarketplaceListing {
  bids: Bid[];
}
