import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Plane, 
  Users, 
  Calendar, 
  Clock, 
  DollarSign, 
  Search, 
  ArrowRight, 
  TrendingDown,
  Loader2,
  Store,
  Gavel
} from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import type { MarketplaceListing } from "@/types/marketplace";

export default function MarketplacePage() {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [cabinFilter, setCabinFilter] = useState("all");
  const [sortBy, setSortBy] = useState("deadline");

  useEffect(() => {
    fetchListings();
  }, []);

  const fetchListings = async () => {
    setLoading(true);
    try {
      // Fetch listings with ticket request details
      const { data: listingsData, error: listingsError } = await supabase
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
            special_notes
          )
        `)
        .eq("status", "open")
        .gte("deadline", new Date().toISOString())
        .order("created_at", { ascending: false });

      if (listingsError) throw listingsError;

      // Fetch bid counts and lowest bids
      const listingsWithBids = await Promise.all(
        (listingsData || []).map(async (listing: any) => {
          const { data: bids } = await supabase
            .from("bids")
            .select("amount")
            .eq("listing_id", listing.id)
            .eq("status", "pending");

          const bidAmounts = bids?.map(b => b.amount) || [];
          
          return {
            ...listing,
            ticket_request: listing.ticket_requests,
            bid_count: bidAmounts.length,
            lowest_bid: bidAmounts.length > 0 ? Math.min(...bidAmounts) : null,
          };
        })
      );

      setListings(listingsWithBids);
    } catch (error) {
      console.error("Error fetching listings:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredListings = listings.filter(listing => {
    const matchesSearch = 
      listing.title.toLowerCase().includes(search.toLowerCase()) ||
      listing.ticket_request?.origin.toLowerCase().includes(search.toLowerCase()) ||
      listing.ticket_request?.destination.toLowerCase().includes(search.toLowerCase());
    
    const matchesCabin = cabinFilter === "all" || listing.ticket_request?.cabin_class === cabinFilter;
    
    return matchesSearch && matchesCabin;
  });

  const sortedListings = [...filteredListings].sort((a, b) => {
    switch (sortBy) {
      case "deadline":
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      case "newest":
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case "bids":
        return (b.bid_count || 0) - (a.bid_count || 0);
      case "budget":
        return (b.ticket_request?.budget || 0) - (a.ticket_request?.budget || 0);
      default:
        return 0;
    }
  });

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

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-dark py-8 md:py-12">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 mb-6">
              <Gavel className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-accent">Reverse Auction Marketplace</span>
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Travel <span className="text-gradient">Requests</span>
            </h1>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-6">
              Browse travel requests from buyers looking for the best deals. 
              Compete with other sellers to offer the lowest price and win the booking.
            </p>
            
            {/* CTA for sellers */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild variant="hero">
                <Link to="/seller/register">
                  <Store className="w-4 h-4 mr-2" />
                  Become a Seller
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/seller/dashboard">
                  View Your Bids
                </Link>
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="glass-card p-4 md:p-6 mb-8">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by route or destination..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 bg-card border-border"
                />
              </div>
              <Select value={cabinFilter} onValueChange={setCabinFilter}>
                <SelectTrigger className="w-full md:w-48 bg-card border-border">
                  <SelectValue placeholder="Cabin Class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  <SelectItem value="economy">Economy</SelectItem>
                  <SelectItem value="premium-economy">Premium Economy</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="first">First Class</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-full md:w-48 bg-card border-border">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deadline">Ending Soonest</SelectItem>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="bids">Most Bids</SelectItem>
                  <SelectItem value="budget">Highest Budget</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Listings */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : sortedListings.length === 0 ? (
            <div className="text-center py-20">
              <Plane className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-display text-xl font-bold mb-2">No Open Requests</h3>
              <p className="text-muted-foreground">
                {search || cabinFilter !== "all" 
                  ? "No requests match your filters. Try adjusting your search."
                  : "There are no travel requests available for bidding right now."}
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {sortedListings.map((listing) => (
                <Card key={listing.id} className="glass-card hover-lift">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-lg font-display line-clamp-1">
                          {listing.title}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                          {listing.ticket_request?.origin} → {listing.ticket_request?.destination}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        {getCabinLabel(listing.ticket_request?.cabin_class)}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Trip Details */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        <span>
                          {listing.ticket_request?.departure_date 
                            ? format(parseISO(listing.ticket_request.departure_date), "MMM d")
                            : "TBD"}
                          {listing.ticket_request?.return_date && (
                            <> - {format(parseISO(listing.ticket_request.return_date), "MMM d")}</>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Users className="w-4 h-4" />
                        <span>{listing.ticket_request?.passengers} passenger{listing.ticket_request?.passengers !== 1 ? "s" : ""}</span>
                      </div>
                    </div>

                    {/* Budget & Bids */}
                    <div className="flex items-center justify-between pt-3 border-t border-border">
                      <div>
                        {listing.ticket_request?.budget && (
                          <div className="flex items-center gap-1 text-sm">
                            <DollarSign className="w-4 h-4 text-accent" />
                            <span className="font-medium">Budget: {formatCurrency(listing.ticket_request.budget)}</span>
                          </div>
                        )}
                        {listing.lowest_bid && (
                          <div className="flex items-center gap-1 text-sm text-success mt-1">
                            <TrendingDown className="w-4 h-4" />
                            <span>Lowest: {formatCurrency(listing.lowest_bid)}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{listing.bid_count || 0} bid{listing.bid_count !== 1 ? "s" : ""}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(parseISO(listing.deadline), { addSuffix: true })}
                        </p>
                      </div>
                    </div>

                    {/* Action */}
                    <Button asChild className="w-full" variant="outline">
                      <Link to={`/marketplace/${listing.id}`}>
                        View Details & Bid
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Info Section */}
          <div className="mt-16 glass-card p-8 md:p-12">
            <div className="text-center mb-8">
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-3">
                How the <span className="text-gradient">Marketplace</span> Works
              </h2>
              <p className="text-muted-foreground">
                A reverse auction where buyers win and sellers compete
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                  <Plane className="w-8 h-8 text-primary" />
                </div>
                <h3 className="font-display font-bold mb-2">Buyers Post Requests</h3>
                <p className="text-sm text-muted-foreground">
                  Travelers post their exact travel needs with budget and preferences
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent/10 flex items-center justify-center">
                  <Gavel className="w-8 h-8 text-accent" />
                </div>
                <h3 className="font-display font-bold mb-2">Sellers Compete</h3>
                <p className="text-sm text-muted-foreground">
                  Verified travel agents bid against each other, driving prices down
                </p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-success/10 flex items-center justify-center">
                  <DollarSign className="w-8 h-8 text-success" />
                </div>
                <h3 className="font-display font-bold mb-2">Buyers Choose</h3>
                <p className="text-sm text-muted-foreground">
                  Buyers review bids and pick the best offer for their trip
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
