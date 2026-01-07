import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, 
  Store, 
  Mail, 
  Globe, 
  ArrowLeft,
  Trophy,
  Gavel,
  CheckCircle,
  Clock,
  TrendingDown
} from "lucide-react";
import { format, parseISO } from "date-fns";

interface SellerProfile {
  id: string;
  business_name: string;
  description: string | null;
  website: string | null;
  logo_url: string | null;
  created_at: string;
}

interface SellerBid {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  listing: {
    id: string;
    title: string;
    status: string;
    ticket_request: {
      origin: string;
      destination: string;
    };
  };
}

interface SellerStats {
  totalBids: number;
  acceptedBids: number;
  successRate: number;
  avgBidAmount: number;
}

export default function SellerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [seller, setSeller] = useState<SellerProfile | null>(null);
  const [bids, setBids] = useState<SellerBid[]>([]);
  const [stats, setStats] = useState<SellerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchSellerProfile();
    }
  }, [id]);

  const fetchSellerProfile = async () => {
    try {
      // Fetch seller info (only approved sellers are publicly visible via RLS)
      const { data: sellerData, error: sellerError } = await supabase
        .from("sellers")
        .select("id, business_name, description, website, logo_url, created_at")
        .eq("id", id)
        .single();

      if (sellerError) throw sellerError;
      setSeller(sellerData);

      // Fetch seller's bids with listing info
      const { data: bidsData } = await supabase
        .from("bids")
        .select(`
          id,
          amount,
          status,
          created_at,
          marketplace_listings (
            id,
            title,
            status,
            ticket_requests (
              origin,
              destination
            )
          )
        `)
        .eq("seller_id", id)
        .order("created_at", { ascending: false })
        .limit(10);

      const formattedBids = (bidsData || []).map((bid: any) => ({
        ...bid,
        listing: {
          id: bid.marketplace_listings?.id,
          title: bid.marketplace_listings?.title,
          status: bid.marketplace_listings?.status,
          ticket_request: bid.marketplace_listings?.ticket_requests,
        },
      }));
      setBids(formattedBids);

      // Calculate stats
      const { data: allBids } = await supabase
        .from("bids")
        .select("amount, status")
        .eq("seller_id", id);

      if (allBids) {
        const totalBids = allBids.length;
        const acceptedBids = allBids.filter(b => b.status === "accepted").length;
        const avgBidAmount = totalBids > 0 
          ? allBids.reduce((sum, b) => sum + Number(b.amount), 0) / totalBids 
          : 0;

        setStats({
          totalBids,
          acceptedBids,
          successRate: totalBids > 0 ? (acceptedBids / totalBids) * 100 : 0,
          avgBidAmount,
        });
      }
    } catch (error) {
      console.error("Error fetching seller:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(amount);
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

  if (!seller) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <Store className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
            <h2 className="font-display text-xl font-bold mb-2">Seller Not Found</h2>
            <Button asChild>
              <Link to="/marketplace">Back to Marketplace</Link>
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-dark py-8 md:py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          {/* Back Button */}
          <Button asChild variant="ghost" className="mb-6">
            <Link to="/marketplace">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Marketplace
            </Link>
          </Button>

          {/* Seller Header */}
          <Card className="glass-card mb-8">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row items-start gap-6">
                <div className="w-20 h-20 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  {seller.logo_url ? (
                    <img 
                      src={seller.logo_url} 
                      alt={seller.business_name} 
                      className="w-full h-full object-cover rounded-xl"
                    />
                  ) : (
                    <Store className="w-10 h-10 text-primary" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="font-display text-2xl md:text-3xl font-bold">
                      {seller.business_name}
                    </h1>
                    <Badge variant="outline" className="border-success text-success">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Verified
                    </Badge>
                  </div>
                  {seller.description && (
                    <p className="text-muted-foreground mb-4">{seller.description}</p>
                  )}
                  <div className="flex flex-wrap gap-4 text-sm">
                    {seller.website && (
                      <a 
                        href={seller.website} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        <Globe className="w-4 h-4" />
                        Website
                      </a>
                    )}
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="w-4 h-4" />
                      Member since {format(parseISO(seller.created_at), "MMMM yyyy")}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Stats Grid */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <Card className="glass-card">
                <CardContent className="pt-6 text-center">
                  <Gavel className="w-8 h-8 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-bold">{stats.totalBids}</p>
                  <p className="text-sm text-muted-foreground">Total Bids</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="pt-6 text-center">
                  <Trophy className="w-8 h-8 mx-auto mb-2 text-success" />
                  <p className="text-2xl font-bold">{stats.acceptedBids}</p>
                  <p className="text-sm text-muted-foreground">Won Bids</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="pt-6 text-center">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-accent" />
                  <p className="text-2xl font-bold">{stats.successRate.toFixed(0)}%</p>
                  <p className="text-sm text-muted-foreground">Success Rate</p>
                </CardContent>
              </Card>
              <Card className="glass-card">
                <CardContent className="pt-6 text-center">
                  <TrendingDown className="w-8 h-8 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-bold">{formatCurrency(stats.avgBidAmount)}</p>
                  <p className="text-sm text-muted-foreground">Avg. Bid</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Recent Activity */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gavel className="w-5 h-5" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {bids.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No bidding activity yet
                </p>
              ) : (
                <div className="space-y-4">
                  {bids.map((bid) => (
                    <div 
                      key={bid.id}
                      className={`p-4 rounded-lg border ${
                        bid.status === "accepted" 
                          ? "border-success/30 bg-success/5" 
                          : "border-border bg-card/50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            {bid.listing?.ticket_request && (
                              <p className="font-medium">
                                {bid.listing.ticket_request.origin} → {bid.listing.ticket_request.destination}
                              </p>
                            )}
                            {bid.status === "accepted" && (
                              <Badge className="bg-success/20 text-success border-success/30 text-xs">
                                Won
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {format(parseISO(bid.created_at), "MMM d, yyyy")}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg">{formatCurrency(bid.amount)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
