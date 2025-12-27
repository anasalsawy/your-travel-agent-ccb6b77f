import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { 
  Loader2, 
  Package, 
  Plane, 
  User,
  Calendar,
  Clock,
  ArrowRight,
  Eye
} from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { TicketRequestDetail } from "@/components/dashboard/TicketRequestDetail";

type Order = Tables<"orders"> & { vouchers: Tables<"vouchers"> | null };
type TicketRequest = Tables<"ticket_requests">;

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [requests, setRequests] = useState<TicketRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<TicketRequest | null>(null);
  const navigate = useNavigate();

  const fetchData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      navigate("/auth?redirect=/dashboard");
      return;
    }

    setUser(session.user);

    // Fetch profile
    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();
    
    if (profileData) setProfile(profileData);

    // Fetch orders
    const { data: ordersData } = await supabase
      .from("orders")
      .select("*, vouchers(*)")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    
    if (ordersData) setOrders(ordersData as Order[]);

    // Fetch ticket requests
    const { data: requestsData } = await supabase
      .from("ticket_requests")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    
    if (requestsData) setRequests(requestsData);

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [navigate]);

  const refreshRequests = async () => {
    const { data: requestsData } = await supabase
      .from("ticket_requests")
      .select("*")
      .eq("user_id", user?.id)
      .order("created_at", { ascending: false });
    
    if (requestsData) {
      setRequests(requestsData);
      // Update selected request if it exists
      if (selectedRequest) {
        const updated = requestsData.find(r => r.id === selectedRequest.id);
        if (updated) setSelectedRequest(updated);
      }
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case "stripe": return "Card";
      case "bitcoin": return "Bitcoin";
      case "zelle": return "Zelle";
      default: return method;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
      case "delivered":
      case "paid":
      case "ticketed":
        return "bg-success/20 text-success";
      case "pending":
      case "processing":
      case "submitted":
      case "quoted":
        return "bg-warning/20 text-warning";
      case "cancelled":
      case "failed":
        return "bg-destructive/20 text-destructive";
      default:
        return "bg-muted text-muted-foreground";
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

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-dark py-8 md:py-12">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="mb-8">
            <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">
              Welcome back, <span className="text-gradient">{profile?.full_name || "Traveler"}</span>
            </h1>
            <p className="text-muted-foreground">
              Manage your voucher orders and ticket requests
            </p>
          </div>

          {/* Quick Actions */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
            <div className="glass-card p-6 hover-lift cursor-pointer" onClick={() => navigate("/vouchers")}>
              <Package className="w-8 h-8 text-primary mb-3" />
              <h3 className="font-semibold mb-1">Browse Vouchers</h3>
              <p className="text-sm text-muted-foreground">Find discounted airline credits</p>
            </div>
            <div className="glass-card p-6 hover-lift cursor-pointer" onClick={() => navigate("/request-ticket")}>
              <Plane className="w-8 h-8 text-accent mb-3" />
              <h3 className="font-semibold mb-1">Request Ticket</h3>
              <p className="text-sm text-muted-foreground">Get a personalized quote</p>
            </div>
            <div className="glass-card p-6 hover-lift cursor-pointer" onClick={() => navigate("/faq")}>
              <User className="w-8 h-8 text-warning mb-3" />
              <h3 className="font-semibold mb-1">Need Help?</h3>
              <p className="text-sm text-muted-foreground">Check our FAQ section</p>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="orders" className="space-y-6">
            <TabsList className="bg-card border border-border">
              <TabsTrigger value="orders">Voucher Orders ({orders.length})</TabsTrigger>
              <TabsTrigger value="requests">Ticket Requests ({requests.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="orders">
              {orders.length === 0 ? (
                <div className="glass-card p-12 text-center">
                  <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="font-semibold text-lg mb-2">No orders yet</h3>
                  <p className="text-muted-foreground mb-6">Browse our vouchers and save on your next flight!</p>
                  <Button variant="hero" onClick={() => navigate("/vouchers")}>
                    Browse Vouchers
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div key={order.id} className="glass-card p-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-lg font-bold text-primary">
                            {order.vouchers?.airline?.substring(0, 2).toUpperCase() || "??"}
                          </div>
                          <div>
                            <h3 className="font-semibold">{order.vouchers?.title || "Voucher"}</h3>
                            <p className="text-sm text-muted-foreground">{order.vouchers?.airline}</p>
                          </div>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="text-right">
                            <div className="font-bold">{formatCurrency(Number(order.amount_paid))}</div>
                            <div className="text-xs text-muted-foreground">{getPaymentMethodLabel(order.payment_method)}</div>
                          </div>
                          <Badge className={getStatusColor(order.payment_status || "pending")}>
                            {order.payment_status}
                          </Badge>
                          <Badge className={getStatusColor(order.order_status || "pending")}>
                            {order.order_status}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(order.created_at)}
                        </div>
                      </div>

                      {order.admin_notes && (
                        <div className="mt-4 p-4 rounded-lg bg-primary/10 border border-primary/20">
                          <p className="text-sm font-medium text-primary">Note from Admin:</p>
                          <p className="text-sm text-muted-foreground">{order.admin_notes}</p>
                        </div>
                      )}

                      {order.delivery_info && (
                        <div className="mt-4 p-4 rounded-lg bg-success/10 border border-success/20">
                          <p className="text-sm font-medium text-success">Delivery Info:</p>
                          <p className="text-sm text-muted-foreground">{order.delivery_info}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="requests">
              {selectedRequest ? (
                <TicketRequestDetail 
                  request={selectedRequest} 
                  onBack={() => setSelectedRequest(null)}
                  onUpdate={refreshRequests}
                />
              ) : requests.length === 0 ? (
                <div className="glass-card p-12 text-center">
                  <Plane className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="font-semibold text-lg mb-2">No ticket requests</h3>
                  <p className="text-muted-foreground mb-6">Submit a request and we'll find you the best deal!</p>
                  <Button variant="hero" onClick={() => navigate("/request-ticket")}>
                    Request a Ticket
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {requests.map((request) => {
                    const hasQuote = request.status === "quoted" || !!request.quoted_price;
                    
                    return (
                      <div 
                        key={request.id} 
                        className={`glass-card p-6 cursor-pointer transition-all hover:border-primary/50 ${
                          hasQuote ? "border-2 border-accent/30" : ""
                        }`}
                        onClick={() => setSelectedRequest(request)}
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-lg">
                                {request.origin} → {request.destination}
                              </h3>
                              <Badge className={getStatusColor(request.status || "submitted")}>
                                {request.status}
                              </Badge>
                              {hasQuote && request.payment_status !== "completed" && (
                                <Badge className="bg-accent/20 text-accent animate-pulse">
                                  Action Required
                                </Badge>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {formatDate(request.departure_date)}
                                {request.return_date && ` - ${formatDate(request.return_date)}`}
                              </div>
                              <span>{request.passengers} pax • {request.cabin_class}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            {request.quoted_price ? (
                              <div className="text-right">
                                <div className="text-sm text-muted-foreground">Quote</div>
                                <div className="font-bold text-xl text-gradient">
                                  {formatCurrency(Number(request.quoted_price))}
                                </div>
                              </div>
                            ) : request.budget ? (
                              <div className="text-right">
                                <div className="text-sm text-muted-foreground">Budget</div>
                                <div className="font-semibold">{formatCurrency(Number(request.budget))}</div>
                              </div>
                            ) : null}
                            <Button variant="ghost" size="icon">
                              <Eye className="w-5 h-5" />
                            </Button>
                          </div>
                        </div>

                        <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            Submitted {formatDate(request.created_at)}
                          </div>
                          {request.payment_status === "processing" && (
                            <Badge variant="outline" className="text-warning">
                              Payment Under Review
                            </Badge>
                          )}
                        </div>

                        {request.issued_ticket_info && (
                          <div className="mt-4 p-4 rounded-lg bg-success/10 border border-success/20">
                            <p className="text-sm font-medium text-success">Ticket Info:</p>
                            <p className="text-sm text-muted-foreground whitespace-pre-line">{request.issued_ticket_info}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}
