import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, 
  Plane, 
  Calendar, 
  Users, 
  DollarSign, 
  Clock, 
  Check, 
  X,
  ArrowLeft,
  Gavel,
  Store,
  TrendingDown,
  AlertCircle,
  MessageSquare
} from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import type { ListingWithBids, Seller } from "@/types/marketplace";

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [listing, setListing] = useState<ListingWithBids | null>(null);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Bid form state
  const [bidDialogOpen, setBidDialogOpen] = useState(false);
  const [bidAmount, setBidAmount] = useState("");
  const [bidMessage, setBidMessage] = useState("");
  const [bidConditions, setBidConditions] = useState("");
  const [submittingBid, setSubmittingBid] = useState(false);

  useEffect(() => {
    if (id) {
      fetchListing();
      checkUser();
    }
  }, [id]);

  // Real-time bid updates
  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`listing-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bids",
          filter: `listing_id=eq.${id}`,
        },
        () => {
          fetchListing();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setUser(session?.user);

    if (session?.user) {
      // Check if user is an approved seller
      const { data: sellerData } = await supabase
        .from("sellers")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("status", "approved")
        .single();

      setSeller(sellerData);
    }
  };

  const fetchListing = async () => {
    if (!id) return;

    try {
      // Fetch listing with ticket request
      const { data: listingData, error: listingError } = await supabase
        .from("marketplace_listings")
        .select(`
          *,
          ticket_requests!inner (
            origin,
            destination,
            departure_date,
            return_date,
            trip_type,
            passengers,
            cabin_class,
            flexibility,
            preferred_airline,
            budget,
            special_notes,
            contact_email
          )
        `)
        .eq("id", id)
        .single();

      if (listingError) throw listingError;

      // Fetch bids with seller info including contact_email
      const { data: bidsData } = await supabase
        .from("bids")
        .select(`
          *,
          sellers (
            id,
            business_name,
            logo_url,
            description,
            contact_email
          )
        `)
        .eq("listing_id", id)
        .order("amount", { ascending: true });

      const formattedListing = {
        ...listingData,
        ticket_request: listingData.ticket_requests,
        bids: (bidsData || []).map((bid: any) => ({
          ...bid,
          seller: bid.sellers,
        })),
      };

      setListing(formattedListing);

      // Check ownership
      const { data: { session } } = await supabase.auth.getSession();
      setIsOwner(session?.user?.id === listingData.user_id);
    } catch (error) {
      console.error("Error fetching listing:", error);
      navigate("/marketplace");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitBid = async () => {
    if (!seller || !listing || !bidAmount) return;

    setSubmittingBid(true);

    try {
      const { error } = await supabase.from("bids").insert({
        listing_id: listing.id,
        seller_id: seller.id,
        amount: parseFloat(bidAmount),
        message: bidMessage || null,
        conditions: bidConditions || null,
      });

      if (error) throw error;

      // Send notification to listing owner
      try {
        await supabase.functions.invoke("send-notification", {
          body: {
            type: "new_bid_received",
            customerEmail: listing.ticket_request?.contact_email,
            data: {
              listingId: listing.id,
              listingTitle: listing.title,
              origin: listing.ticket_request?.origin,
              destination: listing.ticket_request?.destination,
              bidAmount: parseFloat(bidAmount),
              sellerName: seller.business_name,
              bidMessage: bidMessage || null,
            },
          },
        });
      } catch (notifError) {
        console.error("Failed to send notification:", notifError);
      }

      toast({
        title: "Bid Submitted!",
        description: "Your bid has been placed successfully.",
      });

      setBidDialogOpen(false);
      setBidAmount("");
      setBidMessage("");
      setBidConditions("");
      fetchListing();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit bid.",
        variant: "destructive",
      });
    } finally {
      setSubmittingBid(false);
    }
  };

  const handleAcceptBid = async (bidId: string) => {
    if (!listing) return;

    try {
      const acceptedBid = listing.bids.find(b => b.id === bidId);
      
      // Update bid status
      await supabase
        .from("bids")
        .update({ status: "accepted" })
        .eq("id", bidId);

      // Reject other bids
      await supabase
        .from("bids")
        .update({ status: "rejected" })
        .eq("listing_id", listing.id)
        .neq("id", bidId);

      // Update listing with escrow status for SpareFare flow
      await supabase
        .from("marketplace_listings")
        .update({ 
          status: "awarded",
          winning_bid_id: bidId,
          escrow_status: "pending_sparefare", // Ready for admin to create SpareFare listing
        })
        .eq("id", listing.id);

      // Send notification to winning seller
      if (acceptedBid?.seller) {
        try {
          await supabase.functions.invoke("send-notification", {
            body: {
              type: "bid_accepted",
              customerEmail: acceptedBid.seller.contact_email,
              data: {
                listingId: listing.id,
                listingTitle: listing.title,
                origin: listing.ticket_request?.origin,
                destination: listing.ticket_request?.destination,
                bidAmount: acceptedBid.amount,
                buyerEmail: listing.ticket_request?.contact_email,
              },
            },
          });
        } catch (notifError) {
          console.error("Failed to send notification:", notifError);
        }
      }

      // Send notifications to rejected sellers
      const rejectedBids = listing.bids.filter(b => b.id !== bidId);
      for (const bid of rejectedBids) {
        if (bid.seller) {
          try {
            await supabase.functions.invoke("send-notification", {
              body: {
                type: "bid_rejected",
                customerEmail: bid.seller.contact_email,
                data: {
                  listingId: listing.id,
                  listingTitle: listing.title,
                  origin: listing.ticket_request?.origin,
                  destination: listing.ticket_request?.destination,
                  bidAmount: bid.amount,
                },
              },
            });
          } catch (notifError) {
            console.error("Failed to send rejection notification:", notifError);
          }
        }
      }

      // Notify admin about new SpareFare listing needed
      try {
        await supabase.functions.invoke("send-notification", {
          body: {
            type: "escrow_action_needed",
            data: {
              listingId: listing.id,
              route: `${listing.ticket_request?.origin} → ${listing.ticket_request?.destination}`,
              amount: acceptedBid?.amount,
              sellerName: acceptedBid?.seller?.business_name,
              buyerEmail: listing.ticket_request?.contact_email,
              action: "Create SpareFare listing",
            },
          },
        });
      } catch (notifError) {
        console.error("Failed to notify admin:", notifError);
      }

      toast({
        title: "Bid Accepted! 🎉",
        description: "We're setting up your secure transaction. You'll receive a payment link shortly.",
      });

      fetchListing();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to accept bid.",
        variant: "destructive",
      });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getCabinLabel = (cabin?: string) => {
    switch (cabin) {
      case "economy": return "Economy";
      case "premium-economy": return "Premium Economy";
      case "business": return "Business";
      case "first": return "First Class";
      default: return cabin || "Any";
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!listing) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="font-display text-xl font-bold mb-2">Listing Not Found</h2>
            <Button asChild>
              <Link to="/marketplace">Back to Marketplace</Link>
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  const lowestBid = listing.bids.length > 0 
    ? Math.min(...listing.bids.map(b => Number(b.amount))) 
    : null;

  const myBid = seller 
    ? listing.bids.find(b => b.seller_id === seller.id)
    : null;

  const isOpen = listing.status === "open" && new Date(listing.deadline) > new Date();
  const isAwarded = listing.status === "awarded";

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-dark py-8 md:py-12">
        <div className="container mx-auto px-4">
          {/* Back Button */}
          <Button asChild variant="ghost" className="mb-6">
            <Link to="/marketplace">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Marketplace
            </Link>
          </Button>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Header */}
              <Card className="glass-card">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        {isAwarded ? (
                          <Badge className="bg-success/20 text-success border-success/30">Awarded</Badge>
                        ) : isOpen ? (
                          <Badge variant="outline" className="border-accent text-accent">Open for Bids</Badge>
                        ) : (
                          <Badge variant="secondary">Closed</Badge>
                        )}
                      </div>
                      <CardTitle className="text-2xl md:text-3xl font-display">
                        {listing.title}
                      </CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Route */}
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Plane className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-xl font-bold">
                        {listing.ticket_request?.origin} → {listing.ticket_request?.destination}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {listing.ticket_request?.trip_type === "one-way" ? "One Way" : "Round Trip"}
                      </p>
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="glass-card p-4">
                      <Calendar className="w-5 h-5 text-primary mb-2" />
                      <p className="text-sm text-muted-foreground">Departure</p>
                      <p className="font-medium">
                        {listing.ticket_request?.departure_date 
                          ? format(parseISO(listing.ticket_request.departure_date), "MMM d, yyyy")
                          : "TBD"}
                      </p>
                    </div>
                    {listing.ticket_request?.return_date && (
                      <div className="glass-card p-4">
                        <Calendar className="w-5 h-5 text-accent mb-2" />
                        <p className="text-sm text-muted-foreground">Return</p>
                        <p className="font-medium">
                          {format(parseISO(listing.ticket_request.return_date), "MMM d, yyyy")}
                        </p>
                      </div>
                    )}
                    <div className="glass-card p-4">
                      <Users className="w-5 h-5 text-primary mb-2" />
                      <p className="text-sm text-muted-foreground">Passengers</p>
                      <p className="font-medium">{listing.ticket_request?.passengers}</p>
                    </div>
                    <div className="glass-card p-4">
                      <Plane className="w-5 h-5 text-accent mb-2" />
                      <p className="text-sm text-muted-foreground">Class</p>
                      <p className="font-medium">{getCabinLabel(listing.ticket_request?.cabin_class)}</p>
                    </div>
                  </div>

                  {/* Additional Info */}
                  {(listing.ticket_request?.flexibility || listing.ticket_request?.preferred_airline || listing.ticket_request?.special_notes) && (
                    <div className="space-y-3 pt-4 border-t border-border">
                      {listing.ticket_request?.flexibility && (
                        <div>
                          <p className="text-sm text-muted-foreground">Flexibility</p>
                          <p>{listing.ticket_request.flexibility}</p>
                        </div>
                      )}
                      {listing.ticket_request?.preferred_airline && (
                        <div>
                          <p className="text-sm text-muted-foreground">Preferred Airline</p>
                          <p>{listing.ticket_request.preferred_airline}</p>
                        </div>
                      )}
                      {listing.ticket_request?.special_notes && (
                        <div>
                          <p className="text-sm text-muted-foreground">Special Notes</p>
                          <p className="text-sm">{listing.ticket_request.special_notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Bids Section */}
              <Card className="glass-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gavel className="w-5 h-5" />
                    Bids ({listing.bids.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {listing.bids.length === 0 ? (
                    <div className="text-center py-8">
                      <Gavel className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <p className="text-muted-foreground">No bids yet. Be the first to bid!</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {listing.bids.map((bid, index) => (
                        <div 
                          key={bid.id} 
                          className={`p-4 rounded-lg border ${
                            bid.status === "accepted" 
                              ? "border-success/30 bg-success/5" 
                              : "border-border bg-card/50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <Link 
                                to={`/seller/${bid.seller_id}`}
                                className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center hover:bg-primary/20 transition-colors"
                              >
                                <Store className="w-5 h-5 text-primary" />
                              </Link>
                              <div>
                                <div className="flex items-center gap-2">
                                  <Link 
                                    to={`/seller/${bid.seller_id}`}
                                    className="font-medium hover:text-primary transition-colors"
                                  >
                                    {bid.seller?.business_name}
                                  </Link>
                                  {index === 0 && bid.status === "pending" && (
                                    <Badge variant="outline" className="text-xs">Lowest</Badge>
                                  )}
                                  {bid.status === "accepted" && (
                                    <Badge className="bg-success/20 text-success border-success/30 text-xs">
                                      <Check className="w-3 h-3 mr-1" />
                                      Accepted
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  Bid placed {format(parseISO(bid.created_at), "MMM d 'at' h:mm a")}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xl font-bold text-accent">{formatCurrency(bid.amount)}</p>
                            </div>
                          </div>
                          
                          {bid.message && (
                            <div className="mt-3 pt-3 border-t border-border">
                              <div className="flex items-start gap-2">
                                <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5" />
                                <p className="text-sm">{bid.message}</p>
                              </div>
                            </div>
                          )}

                          {bid.conditions && (
                            <div className="mt-2">
                              <p className="text-xs text-muted-foreground">Conditions: {bid.conditions}</p>
                            </div>
                          )}

                          {/* Accept button for listing owner */}
                          {isOwner && isOpen && bid.status === "pending" && (
                            <div className="mt-4">
                              <Button 
                                onClick={() => handleAcceptBid(bid.id)}
                                className="w-full"
                                variant="hero"
                              >
                                <Check className="w-4 h-4 mr-2" />
                                Accept This Bid
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Quick Stats */}
              <Card className="glass-card">
                <CardContent className="pt-6 space-y-4">
                  {listing.ticket_request?.budget && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Budget</span>
                      <span className="font-bold text-lg">{formatCurrency(listing.ticket_request.budget)}</span>
                    </div>
                  )}
                  {lowestBid && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Lowest Bid</span>
                      <span className="font-bold text-lg text-success flex items-center gap-1">
                        <TrendingDown className="w-4 h-4" />
                        {formatCurrency(lowestBid)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total Bids</span>
                    <span className="font-bold">{listing.bids.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Deadline</span>
                    <span className="font-medium flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {formatDistanceToNow(parseISO(listing.deadline), { addSuffix: true })}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Action Card */}
              {!isOwner && isOpen && (
                <Card className="glass-card">
                  <CardContent className="pt-6">
                    {seller ? (
                      myBid ? (
                        <div className="text-center">
                          <Check className="w-10 h-10 mx-auto mb-3 text-success" />
                          <p className="font-medium mb-1">You've Already Bid</p>
                          <p className="text-2xl font-bold text-accent mb-4">
                            {formatCurrency(myBid.amount)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Your bid is currently {
                              listing.bids.findIndex(b => b.id === myBid.id) === 0 
                                ? "the lowest!" 
                                : `#${listing.bids.findIndex(b => b.id === myBid.id) + 1} of ${listing.bids.length}`
                            }
                          </p>
                        </div>
                      ) : (
                        <Dialog open={bidDialogOpen} onOpenChange={setBidDialogOpen}>
                          <DialogTrigger asChild>
                            <Button variant="hero" className="w-full" size="lg">
                              <Gavel className="w-4 h-4 mr-2" />
                              Place a Bid
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Place Your Bid</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 pt-4">
                              <div className="space-y-2">
                                <Label htmlFor="bidAmount">Your Bid Amount (USD) *</Label>
                                <div className="relative">
                                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                  <Input
                                    id="bidAmount"
                                    type="number"
                                    placeholder="0.00"
                                    value={bidAmount}
                                    onChange={(e) => setBidAmount(e.target.value)}
                                    className="pl-10"
                                    required
                                  />
                                </div>
                                {lowestBid && (
                                  <p className="text-xs text-muted-foreground">
                                    Current lowest: {formatCurrency(lowestBid)}
                                  </p>
                                )}
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="bidMessage">Message to Buyer</Label>
                                <Textarea
                                  id="bidMessage"
                                  placeholder="Why should they choose you? Any special offers?"
                                  value={bidMessage}
                                  onChange={(e) => setBidMessage(e.target.value)}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="bidConditions">Conditions (optional)</Label>
                                <Input
                                  id="bidConditions"
                                  placeholder="e.g., Price valid for 48 hours"
                                  value={bidConditions}
                                  onChange={(e) => setBidConditions(e.target.value)}
                                />
                              </div>
                              <Button 
                                onClick={handleSubmitBid} 
                                className="w-full" 
                                variant="hero"
                                disabled={submittingBid || !bidAmount}
                              >
                                {submittingBid && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Submit Bid
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      )
                    ) : user ? (
                      <div className="text-center">
                        <Store className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                        <p className="font-medium mb-2">Become a Seller to Bid</p>
                        <p className="text-sm text-muted-foreground mb-4">
                          Register as a verified seller to place bids on travel requests.
                        </p>
                        <Button asChild className="w-full">
                          <Link to="/seller/register">Register as Seller</Link>
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center">
                        <Store className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                        <p className="font-medium mb-2">Sign In to Bid</p>
                        <p className="text-sm text-muted-foreground mb-4">
                          You need to be signed in as a verified seller to place bids.
                        </p>
                        <Button asChild className="w-full">
                          <Link to="/auth?redirect=/marketplace">Sign In</Link>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Owner View */}
              {isOwner && (
                <Card className="glass-card">
                  <CardContent className="pt-6 text-center">
                    <p className="font-medium mb-2">This is Your Listing</p>
                    <p className="text-sm text-muted-foreground">
                      {isOpen 
                        ? "Review bids and accept the best offer when ready."
                        : isAwarded
                        ? "You've accepted a bid! The seller will contact you."
                        : "This listing is closed."}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
