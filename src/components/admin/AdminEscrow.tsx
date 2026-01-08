import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Copy, ExternalLink, Check, Clock, DollarSign, Plane, Send, Mail, History, RotateCcw, Eye } from "lucide-react";
import { format } from "date-fns";
import {
  notifyBuyerEscrowUpdate,
  notifySellerEscrowUpdate,
  notifyEscrowSpareFareListed,
  sendNotification,
} from "@/lib/notifications";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";

interface NotificationLogEntry {
  id: string;
  event_type: string;
  recipient: string | null;
  status: string;
  error: string | null;
  created_at: string;
  payload: any;
}

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
  const [sendNotifications, setSendNotifications] = useState(true);
  const [notifying, setNotifying] = useState(false);
  const [notificationHistory, setNotificationHistory] = useState<NotificationLogEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<{ buyer: string; seller: string; route: string; amount: number; departureDate: string; sparefareUrl: string } | null>(null);

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

  const fetchNotificationHistory = async (listingId: string) => {
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from("notification_log")
        .select("*")
        .eq("record_id", listingId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setNotificationHistory(data || []);
    } catch (error) {
      console.error("Error fetching notification history:", error);
      setNotificationHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const openEditDialog = (listing: EscrowListing) => {
    setSelectedListing(listing);
    setSparefareUrl(listing.sparefare_listing_url || "");
    setEscrowNotes(listing.escrow_notes || "");
    setNewStatus((listing.escrow_status || "none") as EscrowStatus);
    fetchNotificationHistory(listing.id);
  };

  const updateEscrowStatus = async () => {
    if (!selectedListing) return;
    setUpdating(true);

    try {
      const oldStatus = selectedListing.escrow_status;
      const updates: any = {
        escrow_status: newStatus,
        escrow_notes: escrowNotes,
        sparefare_listing_url: sparefareUrl || null,
      };

      // Track notification timestamps
      if (sendNotifications && newStatus !== oldStatus) {
        if (selectedListing.buyer_email) {
          updates.buyer_notified_at = new Date().toISOString();
        }
        if (selectedListing.winning_bid?.seller?.contact_email) {
          updates.seller_notified_at = new Date().toISOString();
        }
      }

      if (newStatus === "completed") {
        updates.completed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("marketplace_listings")
        .update(updates)
        .eq("id", selectedListing.id);

      if (error) throw error;

      // Send notifications if enabled and status changed
      if (sendNotifications && newStatus !== oldStatus) {
        const route = `${selectedListing.ticket_request?.origin} → ${selectedListing.ticket_request?.destination}`;
        const amount = selectedListing.winning_bid?.amount || 0;
        const departureDate = selectedListing.ticket_request?.departure_date
          ? format(new Date(selectedListing.ticket_request.departure_date), "MMM dd, yyyy")
          : "TBD";

        // Check if this is specifically the "on_sparefare" status with a URL
        const isSpareFareListing = newStatus === "on_sparefare" && sparefareUrl;

        // Notify buyer
        if (selectedListing.buyer_email) {
          if (isSpareFareListing) {
            await notifyEscrowSpareFareListed(selectedListing.buyer_email, {
              listingId: selectedListing.id,
              route,
              sparefareUrl: sparefareUrl!,
              amount,
              departureDate,
              isBuyer: true,
            });
          } else {
            await notifyBuyerEscrowUpdate(selectedListing.buyer_email, {
              listingId: selectedListing.id,
              route,
              escrowStatus: newStatus,
              sparefareUrl: sparefareUrl || undefined,
              amount,
              sellerName: selectedListing.winning_bid?.seller?.business_name || "Seller",
            });
          }
        }

        // Notify seller
        if (selectedListing.winning_bid?.seller?.contact_email) {
          if (isSpareFareListing) {
            await notifyEscrowSpareFareListed(selectedListing.winning_bid.seller.contact_email, {
              listingId: selectedListing.id,
              route,
              sparefareUrl: sparefareUrl!,
              amount,
              departureDate,
              isBuyer: false,
            });
          } else {
            await notifySellerEscrowUpdate(selectedListing.winning_bid.seller.contact_email, {
              listingId: selectedListing.id,
              route,
              escrowStatus: newStatus,
              sparefareUrl: sparefareUrl || undefined,
              amount,
              buyerEmail: selectedListing.buyer_email || "Buyer",
            });
          }
        }

        toast({
          title: "Updated & Notified",
          description: "Escrow status updated and notifications sent",
        });
      } else {
        toast({
          title: "Updated",
          description: "Escrow status updated successfully",
        });
      }

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

  const generateEmailPreviewHtml = (isBuyer: boolean, data: { route: string; amount: number; departureDate: string; sparefareUrl: string }) => {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #ea580c;">Transaction Listed on SpareFare! 🔒</h1>
        <p>Your ${isBuyer ? "ticket purchase" : "ticket sale"} is now protected by SpareFare's secure escrow service.</p>
        <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Route:</strong> ${data.route}</p>
          <p><strong>Amount:</strong> ${formatCurrency(data.amount)}</p>
          <p><strong>Departure:</strong> ${data.departureDate}</p>
        </div>
        <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #f59e0b;">
          <p style="font-weight: bold; margin: 0 0 10px 0;">🔗 Complete Your Transaction:</p>
          <a href="${data.sparefareUrl}" style="color: #2563eb; font-size: 18px; word-break: break-all;">${data.sparefareUrl}</a>
        </div>
        <h2 style="color: #1a365d;">${isBuyer ? "What Happens Next (Buyer)" : "What Happens Next (Seller)"}</h2>
        ${isBuyer ? `
          <ol>
            <li>Click the SpareFare link above</li>
            <li>Complete your payment through SpareFare's secure platform</li>
            <li>The seller will transfer the ticket to your name</li>
            <li>Once confirmed, funds are released to the seller</li>
          </ol>
        ` : `
          <ol>
            <li>Click the SpareFare link above</li>
            <li>Wait for the buyer to complete payment</li>
            <li>Transfer the ticket to the buyer's name</li>
            <li>Confirm the transfer on SpareFare</li>
            <li>Receive your payment securely</li>
          </ol>
        `}
        <p style="color: #6b7280; font-size: 14px;">If you have any questions, please contact our support team.</p>
      </div>
    `;
  };

  const openEmailPreview = () => {
    if (!selectedListing || !sparefareUrl) return;
    
    const route = `${selectedListing.ticket_request?.origin} → ${selectedListing.ticket_request?.destination}`;
    const amount = selectedListing.winning_bid?.amount || 0;
    const departureDate = selectedListing.ticket_request?.departure_date
      ? format(new Date(selectedListing.ticket_request.departure_date), "MMM dd, yyyy")
      : "TBD";
    
    setPreviewData({
      buyer: selectedListing.buyer_email || "",
      seller: selectedListing.winning_bid?.seller?.contact_email || "",
      route,
      amount,
      departureDate,
      sparefareUrl,
    });
    setShowPreview(true);
  };

  const sendNotificationsFromPreview = async () => {
    if (!selectedListing || !previewData) return;
    
    setNotifying(true);
    try {
      let notified = 0;
      
      if (previewData.buyer) {
        await notifyEscrowSpareFareListed(previewData.buyer, {
          listingId: selectedListing.id,
          route: previewData.route,
          sparefareUrl: previewData.sparefareUrl,
          amount: previewData.amount,
          departureDate: previewData.departureDate,
          isBuyer: true,
        });
        notified++;
      }
      
      if (previewData.seller) {
        await notifyEscrowSpareFareListed(previewData.seller, {
          listingId: selectedListing.id,
          route: previewData.route,
          sparefareUrl: previewData.sparefareUrl,
          amount: previewData.amount,
          departureDate: previewData.departureDate,
          isBuyer: false,
        });
        notified++;
      }
      
      // Update notification timestamps
      await supabase
        .from("marketplace_listings")
        .update({
          sparefare_listing_url: previewData.sparefareUrl,
          buyer_notified_at: previewData.buyer ? new Date().toISOString() : undefined,
          seller_notified_at: previewData.seller ? new Date().toISOString() : undefined,
        })
        .eq("id", selectedListing.id);
      
      toast({
        title: "Notifications Sent",
        description: `SpareFare link sent to ${notified} ${notified === 1 ? "party" : "parties"}`,
      });
      
      setShowPreview(false);
      fetchListings();
      fetchNotificationHistory(selectedListing.id);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to send notifications",
        variant: "destructive",
      });
    } finally {
      setNotifying(false);
    }
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

              <div className="flex items-center space-x-2 p-3 bg-blue-50 rounded-md">
                <Checkbox
                  id="send-notifications"
                  checked={sendNotifications}
                  onCheckedChange={(checked) => setSendNotifications(checked as boolean)}
                />
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-blue-600" />
                  <label htmlFor="send-notifications" className="text-sm font-medium text-blue-800 cursor-pointer">
                    Send email notifications to buyer & seller
                  </label>
                </div>
              </div>

              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm font-medium mb-2">Quick Actions:</p>
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
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!sparefareUrl}
                    onClick={openEmailPreview}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    Preview & Notify
                  </Button>
                </div>
              </div>

              {/* Notification History */}
              <div className="p-3 bg-muted rounded-md">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Notification History</p>
                  </div>
                  {notificationHistory.filter(n => n.status === "failed").length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      disabled={resendingId === "bulk"}
                      onClick={async () => {
                        const failedNotifications = notificationHistory.filter(n => n.status === "failed" && n.payload);
                        if (failedNotifications.length === 0) return;
                        
                        setResendingId("bulk");
                        let successCount = 0;
                        let failCount = 0;
                        
                        for (const log of failedNotifications) {
                          try {
                            const result = await sendNotification({
                              type: log.event_type as any,
                              data: log.payload,
                              customerEmail: log.recipient || undefined,
                            });
                            if (result.success) {
                              successCount++;
                            } else {
                              failCount++;
                            }
                          } catch {
                            failCount++;
                          }
                        }
                        
                        toast({
                          title: "Bulk Resend Complete",
                          description: `${successCount} sent, ${failCount} failed`,
                          variant: failCount > 0 ? "destructive" : "default",
                        });
                        
                        fetchNotificationHistory(selectedListing!.id);
                        setResendingId(null);
                      }}
                    >
                      <RotateCcw className={`h-3 w-3 mr-1 ${resendingId === "bulk" ? "animate-spin" : ""}`} />
                      Resend All Failed ({notificationHistory.filter(n => n.status === "failed").length})
                    </Button>
                  )}
                </div>
                {loadingHistory ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : notificationHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No notifications sent yet</p>
                ) : (
                  <ScrollArea className="h-[120px]">
                    <div className="space-y-2">
                      {notificationHistory.map((log) => (
                        <div key={log.id} className="flex items-start justify-between text-xs border-b border-border pb-2 last:border-0">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <Badge 
                                variant="outline" 
                                className={log.status === "sent" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}
                              >
                                {log.status}
                              </Badge>
                              <span className="text-muted-foreground">
                                {log.event_type.replace(/_/g, " ")}
                              </span>
                            </div>
                            <p className="text-muted-foreground truncate max-w-[200px]">
                              → {log.recipient || "Unknown"}
                            </p>
                            {log.error && (
                              <p className="text-red-500 truncate max-w-[200px]">{log.error}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {log.status === "failed" && log.payload && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                disabled={resendingId === log.id}
                                onClick={async () => {
                                  setResendingId(log.id);
                                  try {
                                    const result = await sendNotification({
                                      type: log.event_type as any,
                                      data: log.payload,
                                      customerEmail: log.recipient || undefined,
                                    });
                                    if (result.success) {
                                      toast({
                                        title: "Notification Resent",
                                        description: `Successfully resent to ${log.recipient}`,
                                      });
                                      fetchNotificationHistory(selectedListing!.id);
                                    } else {
                                      toast({
                                        title: "Resend Failed",
                                        description: result.error || "Unknown error",
                                        variant: "destructive",
                                      });
                                    }
                                  } catch (error: any) {
                                    toast({
                                      title: "Resend Failed",
                                      description: error.message,
                                      variant: "destructive",
                                    });
                                  } finally {
                                    setResendingId(null);
                                  }
                                }}
                              >
                                <RotateCcw className={`h-3 w-3 ${resendingId === log.id ? "animate-spin" : ""}`} />
                              </Button>
                            )}
                            <span className="text-muted-foreground whitespace-nowrap">
                              {format(new Date(log.created_at), "MMM d, h:mm a")}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
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

      {/* Email Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Email Preview
            </DialogTitle>
          </DialogHeader>

          {previewData && (
            <div className="flex-1 overflow-auto space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-muted-foreground mb-1">Buyer Email:</p>
                  <p className="font-medium">{previewData.buyer || "No buyer email"}</p>
                </div>
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-muted-foreground mb-1">Seller Email:</p>
                  <p className="font-medium">{previewData.seller || "No seller email"}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Buyer Preview */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-blue-50 px-4 py-2 border-b">
                    <p className="text-sm font-medium text-blue-800">Buyer Email Preview</p>
                    <p className="text-xs text-blue-600 truncate">To: {previewData.buyer || "N/A"}</p>
                  </div>
                  <ScrollArea className="h-[300px]">
                    <div 
                      className="p-4 bg-white"
                      dangerouslySetInnerHTML={{ 
                        __html: generateEmailPreviewHtml(true, previewData) 
                      }} 
                    />
                  </ScrollArea>
                </div>

                {/* Seller Preview */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-green-50 px-4 py-2 border-b">
                    <p className="text-sm font-medium text-green-800">Seller Email Preview</p>
                    <p className="text-xs text-green-600 truncate">To: {previewData.seller || "N/A"}</p>
                  </div>
                  <ScrollArea className="h-[300px]">
                    <div 
                      className="p-4 bg-white"
                      dangerouslySetInnerHTML={{ 
                        __html: generateEmailPreviewHtml(false, previewData) 
                      }} 
                    />
                  </ScrollArea>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Cancel
            </Button>
            <Button 
              onClick={sendNotificationsFromPreview} 
              disabled={notifying || (!previewData?.buyer && !previewData?.seller)}
            >
              <Send className="h-4 w-4 mr-2" />
              {notifying ? "Sending..." : "Send Notifications"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
