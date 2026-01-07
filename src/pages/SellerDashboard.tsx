import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Loader2, 
  Store, 
  Gavel, 
  DollarSign, 
  Clock, 
  Check, 
  X, 
  ArrowRight,
  TrendingUp,
  AlertCircle,
  Plane
} from "lucide-react";
import { format, parseISO } from "date-fns";
import type { Seller, Bid } from "@/types/marketplace";

interface BidWithListing extends Bid {
  listing?: {
    id: string;
    title: string;
    status: string;
    deadline: string;
    ticket_request?: {
      origin: string;
      destination: string;
      departure_date: string;
    };
  };
}

export default function SellerDashboardPage() {
  const [seller, setSeller] = useState<Seller | null>(null);
  const [bids, setBids] = useState<BidWithListing[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    checkSellerStatus();
  }, []);

  const checkSellerStatus = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      navigate("/auth?redirect=/seller/dashboard");
      return;
    }

    // Get seller profile
    const { data: sellerData } = await supabase
      .from("sellers")
      .select("*")
      .eq("user_id", session.user.id)
      .single();

    if (!sellerData) {
      navigate("/seller/register");
      return;
    }

    setSeller(sellerData);

    if (sellerData.status === "approved") {
      await fetchBids(sellerData.id);
    }

    setLoading(false);
  };

  const fetchBids = async (sellerId: string) => {
    const { data: bidsData } = await supabase
      .from("bids")
      .select(`
        *,
        marketplace_listings!inner (
          id,
          title,
          status,
          deadline,
          ticket_requests (
            origin,
            destination,
            departure_date
          )
        )
      `)
      .eq("seller_id", sellerId)
      .order("created_at", { ascending: false });

    if (bidsData) {
      const formattedBids = bidsData.map((bid: any) => ({
        ...bid,
        listing: {
          ...bid.marketplace_listings,
          ticket_request: bid.marketplace_listings.ticket_requests,
        },
      }));
      setBids(formattedBids);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getBidStatusBadge = (bid: BidWithListing) => {
    if (bid.status === "accepted") {
      return <Badge className="bg-success/20 text-success border-success/30">Won</Badge>;
    }
    if (bid.status === "rejected") {
      return <Badge variant="destructive">Not Selected</Badge>;
    }
    if (bid.listing?.status !== "open") {
      return <Badge variant="secondary">Closed</Badge>;
    }
    return <Badge variant="outline">Pending</Badge>;
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

  // Not approved seller
  if (seller?.status !== "approved") {
    return (
      <Layout>
        <div className="min-h-screen bg-gradient-dark py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-lg mx-auto text-center">
              {seller?.status === "pending" ? (
                <>
                  <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-warning/20 flex items-center justify-center">
                    <Clock className="w-10 h-10 text-warning" />
                  </div>
                  <h1 className="font-display text-3xl font-bold mb-4">Application Pending</h1>
                  <p className="text-muted-foreground mb-8">
                    Your seller application is still being reviewed. You'll be able to access your dashboard once approved.
                  </p>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-destructive/20 flex items-center justify-center">
                    <AlertCircle className="w-10 h-10 text-destructive" />
                  </div>
                  <h1 className="font-display text-3xl font-bold mb-4">Account Suspended</h1>
                  <p className="text-muted-foreground mb-8">
                    Your seller account has been suspended. Please contact support for assistance.
                  </p>
                </>
              )}
              <Button variant="outline" onClick={() => navigate("/")}>
                Return Home
              </Button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const activeBids = bids.filter(b => b.status === "pending" && b.listing?.status === "open");
  const wonBids = bids.filter(b => b.status === "accepted");
  const pastBids = bids.filter(b => b.status !== "pending" || b.listing?.status !== "open");

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-dark py-8 md:py-12">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Store className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h1 className="font-display text-2xl font-bold">{seller.business_name}</h1>
                  <p className="text-sm text-muted-foreground">Seller Dashboard</p>
                </div>
              </div>
            </div>
            <Button asChild variant="hero">
              <Link to="/marketplace">
                <Gavel className="w-4 h-4 mr-2" />
                Browse Listings
              </Link>
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card className="glass-card">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Gavel className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{activeBids.length}</p>
                    <p className="text-xs text-muted-foreground">Active Bids</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                    <Check className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{wonBids.length}</p>
                    <p className="text-xs text-muted-foreground">Won</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">
                      {formatCurrency(wonBids.reduce((sum, b) => sum + Number(b.amount), 0))}
                    </p>
                    <p className="text-xs text-muted-foreground">Won Value</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-card">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{bids.length}</p>
                    <p className="text-xs text-muted-foreground">Total Bids</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bids Tabs */}
          <Tabs defaultValue="active" className="space-y-6">
            <TabsList className="bg-card border border-border">
              <TabsTrigger value="active">
                Active Bids ({activeBids.length})
              </TabsTrigger>
              <TabsTrigger value="won">
                Won ({wonBids.length})
              </TabsTrigger>
              <TabsTrigger value="past">
                Past ({pastBids.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active" className="space-y-4">
              {activeBids.length === 0 ? (
                <Card className="glass-card">
                  <CardContent className="py-12 text-center">
                    <Gavel className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <h3 className="font-display font-bold mb-2">No Active Bids</h3>
                    <p className="text-muted-foreground mb-4">
                      Browse the marketplace to find travel requests and place bids.
                    </p>
                    <Button asChild>
                      <Link to="/marketplace">Browse Listings</Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                activeBids.map((bid) => (
                  <BidCard key={bid.id} bid={bid} getBadge={getBidStatusBadge} formatCurrency={formatCurrency} />
                ))
              )}
            </TabsContent>

            <TabsContent value="won" className="space-y-4">
              {wonBids.length === 0 ? (
                <Card className="glass-card">
                  <CardContent className="py-12 text-center">
                    <Check className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <h3 className="font-display font-bold mb-2">No Won Bids Yet</h3>
                    <p className="text-muted-foreground">
                      Keep bidding! Your first win is just around the corner.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                wonBids.map((bid) => (
                  <BidCard key={bid.id} bid={bid} getBadge={getBidStatusBadge} formatCurrency={formatCurrency} />
                ))
              )}
            </TabsContent>

            <TabsContent value="past" className="space-y-4">
              {pastBids.length === 0 ? (
                <Card className="glass-card">
                  <CardContent className="py-12 text-center">
                    <Clock className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <h3 className="font-display font-bold mb-2">No Past Bids</h3>
                    <p className="text-muted-foreground">
                      Your completed and closed bids will appear here.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                pastBids.map((bid) => (
                  <BidCard key={bid.id} bid={bid} getBadge={getBidStatusBadge} formatCurrency={formatCurrency} />
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}

function BidCard({ 
  bid, 
  getBadge, 
  formatCurrency 
}: { 
  bid: BidWithListing; 
  getBadge: (bid: BidWithListing) => React.ReactNode;
  formatCurrency: (amount: number) => string;
}) {
  return (
    <Card className="glass-card">
      <CardContent className="p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Plane className="w-5 h-5 text-primary" />
              <h3 className="font-display font-bold">{bid.listing?.title}</h3>
              {getBadge(bid)}
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              {bid.listing?.ticket_request?.origin} → {bid.listing?.ticket_request?.destination}
              {bid.listing?.ticket_request?.departure_date && (
                <> • {format(parseISO(bid.listing.ticket_request.departure_date), "MMM d, yyyy")}</>
              )}
            </p>
            <div className="flex items-center gap-4 text-sm">
              <span className="font-medium text-accent">{formatCurrency(bid.amount)}</span>
              <span className="text-muted-foreground">
                Bid placed {format(parseISO(bid.created_at), "MMM d, yyyy")}
              </span>
            </div>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={`/marketplace/${bid.listing_id}`}>
              View Listing
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
