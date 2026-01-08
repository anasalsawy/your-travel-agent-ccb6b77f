import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Plane, 
  Calendar, 
  DollarSign, 
  ExternalLink, 
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Store,
  ShieldCheck
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";

interface MarketplaceOrder {
  id: string;
  title: string;
  escrow_status: string | null;
  sparefare_listing_url: string | null;
  created_at: string;
  ticket_request: {
    origin: string;
    destination: string;
    departure_date: string;
    return_date: string | null;
    passengers: number;
    cabin_class: string | null;
  } | null;
  winning_bid: {
    amount: number;
    seller: {
      business_name: string;
    } | null;
  } | null;
}

const escrowStatusConfig: Record<string, { label: string; color: string; icon: any; description: string }> = {
  none: {
    label: "Pending Setup",
    color: "bg-muted text-muted-foreground",
    icon: Clock,
    description: "Your transaction is being set up.",
  },
  pending_sparefare: {
    label: "Creating Secure Listing",
    color: "bg-yellow-100 text-yellow-800",
    icon: Clock,
    description: "We're creating a secure listing for your transaction. You'll receive a payment link soon.",
  },
  on_sparefare: {
    label: "Ready for Payment",
    color: "bg-blue-100 text-blue-800",
    icon: DollarSign,
    description: "Your secure payment link is ready! Click below to complete your purchase.",
  },
  awaiting_payment: {
    label: "Awaiting Payment",
    color: "bg-orange-100 text-orange-800",
    icon: Clock,
    description: "Waiting for payment confirmation.",
  },
  funds_held: {
    label: "Payment Secured",
    color: "bg-purple-100 text-purple-800",
    icon: ShieldCheck,
    description: "Your payment is held securely. The seller is preparing your ticket.",
  },
  completed: {
    label: "Completed",
    color: "bg-green-100 text-green-800",
    icon: CheckCircle,
    description: "Transaction complete! Your ticket has been delivered.",
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-red-100 text-red-800",
    icon: AlertCircle,
    description: "This transaction was cancelled.",
  },
};

export function MarketplaceOrders({ userId }: { userId: string }) {
  const [orders, setOrders] = useState<MarketplaceOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();
    
    // Set up real-time subscription
    const channel = supabase
      .channel('marketplace-orders')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'marketplace_listings',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const fetchOrders = async () => {
    try {
      // Fetch awarded listings where user is the buyer
      const { data: listings, error } = await supabase
        .from("marketplace_listings")
        .select(`
          id,
          title,
          escrow_status,
          sparefare_listing_url,
          created_at,
          winning_bid_id,
          ticket_requests!marketplace_listings_ticket_request_id_fkey (
            origin,
            destination,
            departure_date,
            return_date,
            passengers,
            cabin_class
          )
        `)
        .eq("user_id", userId)
        .eq("status", "awarded")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch winning bids for each listing
      const ordersWithBids = await Promise.all(
        (listings || []).map(async (listing: any) => {
          let winning_bid = null;
          
          if (listing.winning_bid_id) {
            const { data: bidData } = await supabase
              .from("bids")
              .select(`
                amount,
                sellers (business_name)
              `)
              .eq("id", listing.winning_bid_id)
              .single();
            
            if (bidData) {
              winning_bid = {
                amount: bidData.amount,
                seller: bidData.sellers as any,
              };
            }
          }

          return {
            ...listing,
            ticket_request: listing.ticket_requests,
            winning_bid,
          };
        })
      );

      setOrders(ordersWithBids);
    } catch (error) {
      console.error("Error fetching marketplace orders:", error);
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
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (orders.length === 0) {
    return null; // Don't show section if no marketplace orders
  }

  return (
    <div className="space-y-4">
      <h3 className="font-display text-xl font-semibold flex items-center gap-2">
        <Store className="w-5 h-5 text-primary" />
        Marketplace Transactions
      </h3>
      
      {orders.map((order) => {
        const status = escrowStatusConfig[order.escrow_status || "none"] || escrowStatusConfig.none;
        const StatusIcon = status.icon;
        const showPaymentLink = order.escrow_status === "on_sparefare" && order.sparefare_listing_url;

        return (
          <Card key={order.id} className={`glass-card overflow-hidden ${showPaymentLink ? "border-2 border-accent" : ""}`}>
            {showPaymentLink && (
              <div className="bg-accent/10 px-4 py-2 flex items-center gap-2 text-accent font-medium text-sm">
                <DollarSign className="w-4 h-4" />
                Action Required: Complete Your Payment
              </div>
            )}
            
            <CardContent className="p-6">
              {/* Route and Price */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Plane className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg">
                      {order.ticket_request?.origin} → {order.ticket_request?.destination}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {order.winning_bid?.seller?.business_name || "Seller"}
                    </p>
                  </div>
                </div>
                
                <div className="text-right">
                  <p className="text-2xl font-bold text-accent">
                    {order.winning_bid ? formatCurrency(order.winning_bid.amount) : "—"}
                  </p>
                  <Badge className={status.color}>
                    <StatusIcon className="w-3 h-3 mr-1" />
                    {status.label}
                  </Badge>
                </div>
              </div>

              {/* Travel Details */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-4">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {order.ticket_request?.departure_date 
                    ? format(new Date(order.ticket_request.departure_date), "MMM d, yyyy")
                    : "TBD"}
                  {order.ticket_request?.return_date && (
                    <> – {format(new Date(order.ticket_request.return_date), "MMM d, yyyy")}</>
                  )}
                </div>
                <span>•</span>
                <span>{order.ticket_request?.passengers} passenger(s)</span>
                <span>•</span>
                <span className="capitalize">{order.ticket_request?.cabin_class || "Economy"}</span>
              </div>

              {/* Status Description */}
              <div className="p-3 rounded-lg bg-muted/50 mb-4">
                <p className="text-sm">{status.description}</p>
              </div>

              {/* Payment Link */}
              {showPaymentLink && (
                <a
                  href={order.sparefare_listing_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                >
                  <Button variant="hero" className="w-full" size="lg">
                    <ShieldCheck className="w-5 h-5 mr-2" />
                    Complete Secure Payment
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </Button>
                </a>
              )}

              {/* View Details Link */}
              {!showPaymentLink && (
                <Link to={`/marketplace/${order.id}`}>
                  <Button variant="outline" className="w-full">
                    View Details
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
