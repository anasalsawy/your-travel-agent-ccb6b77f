import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Copy, ExternalLink, Check, Clock, DollarSign, Plane, Send } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EscrowListing {
  id: string;
  title: string;
  deadline: string;
  escrow_status: string;
  sparefare_listing_url: string | null;
  travel_date: string | null;
  escrow_notes: string | null;
  winning_bid_id: string | null;
  created_at: string;
  ticket_request: {
    origin: string;
    destination: string;
    departure_date: string;
    return_date: string | null;
    passengers: number;
    cabin_class: string | null;
    contact_email: string;
  } | null;
  winning_bid: {
    id: string;
    amount: number;
    seller: {
      business_name: string;
      contact_email: string;
    } | null;
  } | null;
  buyer_email: string | null;
}

type EscrowStatus = 'none' | 'awaiting_payment' | 'funds_held' | 'pending_sparefare' | 'on_sparefare' | 'completed' | 'cancelled';

const escrowStatusLabels: Record<EscrowStatus, string> = {
  none: 'No Escrow',
  awaiting_payment: 'Awaiting Payment',
  funds_held: 'Funds Held',
  pending_sparefare: 'Ready for SpareFare',
  on_sparefare: 'Listed on SpareFare',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const escrowStatusColors: Record<EscrowStatus, string> = {
  none: 'bg-muted text-muted-foreground',
  awaiting_payment: 'bg-yellow-100 text-yellow-800',
  funds_held: 'bg-blue-100 text-blue-800',
  pending_sparefare: 'bg-purple-100 text-purple-800',
  on_sparefare: 'bg-orange-100 text-orange-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export default function AdminEscrow() {
  const [listings, setListings] = useState<EscrowListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedListing, setSelectedListing] = useState<EscrowListing | null>(null);
  const [sparefareUrl, setSparefareUrl] = useState("");
  const [escrowNotes, setEscrowNotes] = useState("");
  const [newStatus, setNewStatus] = useState<EscrowStatus>("none");
  const [updating, setUpdating] = useState(false);
  const [filter, setFilter] = useState<string>("active");

  useEffect(() => {
    fetchListings();
  }, [filter]);

  const fetchListings = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("marketplace_listings")
        .select(`
          id,
          title,
          deadline,
          escrow_status,
          sparefare_listing_url,
          travel_date,
          escrow_notes,
          winning_bid_id,
          created_at,
          ticket_requests!marketplace_listings_ticket_request_id_fkey (
            origin,
            destination,
            departure_date,
            return_date,
            passengers,
            cabin_class,
            contact_email
          )
        `)
        .order("created_at", { ascending: false });

      if (filter === "active") {
        query = query.in("escrow_status", ["awaiting_payment", "funds_held", "pending_sparefare", "on_sparefare"]);
      } else if (filter === "completed") {
        query = query.eq("escrow_status", "completed");
      } else if (filter === "awarded") {
        query = query.not("winning_bid_id", "is", null);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Fetch winning bids with seller info
      const listingsWithBids = await Promise.all(
        (data || []).map(async (listing: any) => {
          let winning_bid = null;
          let buyer_email = listing.ticket_requests?.contact_email || null;

          if (listing.winning_bid_id) {
            const { data: bidData } = await supabase
              .from("bids")
              .select(`
                id,
                amount,
                sellers!bids_seller_id_fkey (
                  business_name,
                  contact_email
                )
              `)
              .eq("id", listing.winning_bid_id)
              .single();

            if (bidData) {
              winning_bid = {
                id: bidData.id,
                amount: bidData.amount,
                seller: bidData.sellers as any,
              };
            }
          }

          return {
            ...listing,
            ticket_request: listing.ticket_requests,
            winning_bid,
            buyer_email,
          };
        })
      );

      setListings(listingsWithBids);
    } catch (error: any) {
      console.error("Error fetching escrow listings:", error);
      toast({
        title: "Error",
        description: "Failed to load escrow listings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (listing: EscrowListing) => {
    setSelectedListing(listing);
    setSparefareUrl(listing.sparefare_listing_url || "");
    setEscrowNotes(listing.escrow_notes || "");
    setNewStatus((listing.escrow_status || "none") as EscrowStatus);
  };

  const updateEscrowStatus = async () => {
    if (!selectedListing) return;
    setUpdating(true);

    try {
      const updates: any = {
        escrow_status: newStatus,
        escrow_notes: escrowNotes,
        sparefare_listing_url: sparefareUrl || null,
      };

      if (newStatus === "completed") {
        updates.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("marketplace_listings")
        .update(updates)
        .eq("id", selectedListing.id);

      if (error) throw error;

      toast({
        title: "Updated",
        description: "Escrow status updated successfully",
      });

      setSelectedListing(null);
      fetchListings();
    } catch (error: any) {
      console.error("Error updating escrow:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update escrow status",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const generateSpareFareSummary = (listing: EscrowListing) => {
    const tr = listing.ticket_request;
    if (!tr) return "";

    const lines = [
      `✈️ LISTING FOR SPAREFARE`,
      ``,
      `Route: ${tr.origin} → ${tr.destination}`,
      `Departure: ${format(new Date(tr.departure_date), "MMM dd, yyyy")}`,
      tr.return_date ? `Return: ${format(new Date(tr.return_date), "MMM dd, yyyy")}` : `One-way flight`,
      `Passengers: ${tr.passengers}`,
      `Class: ${tr.cabin_class || "Economy"}`,
      ``,
      `💰 Price: $${listing.winning_bid?.amount?.toFixed(2) || "TBD"}`,
      ``,
      `Seller: ${listing.winning_bid?.seller?.business_name || "N/A"}`,
      `Seller Email: ${listing.winning_bid?.seller?.contact_email || "N/A"}`,
      ``,
      `Buyer Email: ${listing.buyer_email || "N/A"}`,
    ];

    return lines.join("\n");
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Summary copied to clipboard",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Escrow & SpareFare Handoffs</h2>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active Escrows</SelectItem>
            <SelectItem value="awarded">All Awarded</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="all">All Listings</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {listings.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No listings found for this filter.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {listings.map((listing) => (
            <Card key={listing.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Plane className="h-4 w-4" />
                      {listing.ticket_request?.origin} → {listing.ticket_request?.destination}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {listing.title}
                    </p>
                  </div>
                  <Badge className={escrowStatusColors[(listing.escrow_status || "none") as EscrowStatus]}>
                    {escrowStatusLabels[(listing.escrow_status || "none") as EscrowStatus]}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Departure:</span>
                    <p className="font-medium">
                      {listing.ticket_request?.departure_date
                        ? format(new Date(listing.ticket_request.departure_date), "MMM dd, yyyy")
                        : "N/A"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Winning Bid:</span>
                    <p className="font-medium text-green-600">
                      {listing.winning_bid
                        ? formatCurrency(listing.winning_bid.amount)
                        : "No winner yet"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Seller:</span>
                    <p className="font-medium">
                      {listing.winning_bid?.seller?.business_name || "N/A"}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Buyer:</span>
                    <p className="font-medium truncate">
                      {listing.buyer_email || "N/A"}
                    </p>
                  </div>
                </div>

                {listing.sparefare_listing_url && (
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    <a
                      href={listing.sparefare_listing_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline truncate"
                    >
                      {listing.sparefare_listing_url}
                    </a>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(generateSpareFareSummary(listing))}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy SpareFare Summary
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => openEditDialog(listing)}
                  >
                    Manage Escrow
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!selectedListing} onOpenChange={() => setSelectedListing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Escrow</DialogTitle>
          </DialogHeader>

          {selectedListing && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-md">
                <p className="font-medium">
                  {selectedListing.ticket_request?.origin} → {selectedListing.ticket_request?.destination}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedListing.winning_bid
                    ? `${formatCurrency(selectedListing.winning_bid.amount)} - ${selectedListing.winning_bid.seller?.business_name}`
                    : "No winning bid"}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Escrow Status</label>
                <Select value={newStatus} onValueChange={(v) => setNewStatus(v as EscrowStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Escrow</SelectItem>
                    <SelectItem value="awaiting_payment">Awaiting Payment</SelectItem>
                    <SelectItem value="funds_held">Funds Held</SelectItem>
                    <SelectItem value="pending_sparefare">Ready for SpareFare</SelectItem>
                    <SelectItem value="on_sparefare">Listed on SpareFare</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">SpareFare Listing URL</label>
                <Input
                  placeholder="https://sparefare.net/listing/..."
                  value={sparefareUrl}
                  onChange={(e) => setSparefareUrl(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Notes</label>
                <Textarea
                  placeholder="Internal notes about this escrow..."
                  value={escrowNotes}
                  onChange={(e) => setEscrowNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="p-3 bg-blue-50 rounded-md">
                <p className="text-sm font-medium text-blue-800 mb-2">Quick Actions:</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(generateSpareFareSummary(selectedListing))}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy Summary
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(selectedListing.buyer_email || "")}
                  >
                    Copy Buyer Email
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(selectedListing.winning_bid?.seller?.contact_email || "")}
                  >
                    Copy Seller Email
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedListing(null)}>
              Cancel
            </Button>
            <Button onClick={updateEscrowStatus} disabled={updating}>
              {updating ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
