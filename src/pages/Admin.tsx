import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Package, ShoppingCart, Plane, Settings, Users, Building2, Shield, MessageSquare, Phone, Zap, FileSpreadsheet, PhoneCall, CreditCard, TrendingUp, Play, MessagesSquare, Mail, Mic, Car } from "lucide-react";
import { AdminVouchers } from "@/components/admin/AdminVouchers";
import { AdminOrders } from "@/components/admin/AdminOrders";
import { AdminTicketRequests } from "@/components/admin/AdminTicketRequests";
import { AdminSettings } from "@/components/admin/AdminSettings";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { AdminSellers } from "@/components/admin/AdminSellers";
import AdminEscrow from "@/components/admin/AdminEscrow";
import { AdminQuoteRequests } from "@/components/admin/AdminQuoteRequests";
import { AirlineBookingCall } from "@/components/admin/AirlineBookingCall";
import { AdminUniversalCall } from "@/components/admin/AdminUniversalCall";
import { BatchCallGenerator, BatchCallRow } from "@/components/admin/BatchCallGenerator";
import { AdminCallLogs } from "@/components/admin/AdminCallLogs";
import { AdminInventory } from "@/components/admin/AdminInventory";
import { AdminQuoteLogs } from "@/components/admin/AdminQuoteLogs";
import { AdminBookingQueue } from "@/components/admin/AdminBookingQueue";
import { AdminConversations } from "@/components/admin/AdminConversations";
import { AdminPromoEmails } from "@/components/admin/AdminPromoEmails";
import { AdminCarRentals } from "@/components/admin/AdminCarRentals";
import { lazy, Suspense } from "react";
const VoiceProxyContent = lazy(() => import("@/components/admin/AdminVoiceProxy"));

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [activeTab, setActiveTab] = useState("vouchers");
  const [batchRows, setBatchRows] = useState<BatchCallRow[]>([]);
  const navigate = useNavigate();

  const handleAddToBatch = (row: Omit<BatchCallRow, "id">) => {
    const newRow: BatchCallRow = { ...row, id: crypto.randomUUID() };
    setBatchRows(prev => [...prev, newRow]);
    setActiveTab("batch-calls");
  };

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth?redirect=/admin");
        return;
      }

      // Check for admin role
      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .maybeSingle();

      // Check for staff role
      const { data: staffRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "staff")
        .maybeSingle();

      if (!adminRole && !staffRole) {
        navigate("/dashboard");
        return;
      }

      setIsAdmin(!!adminRole);
      setIsStaff(!!staffRole);
      setLoading(false);
    };

    checkAccess();
  }, [navigate]);

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!isAdmin && !isStaff) {
    return null;
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-dark py-8 md:py-12">
        <div className="container mx-auto px-4">
          <div className="mb-8">
            <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">
              {isAdmin ? "Admin" : "Staff"} <span className="text-gradient">Dashboard</span>
            </h1>
            <p className="text-muted-foreground">
              {isAdmin 
                ? "Manage vouchers, orders, ticket requests, and settings" 
                : "Manage vouchers, orders, and ticket requests"}
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="bg-card border border-border flex-wrap h-auto p-1">
              <TabsTrigger value="vouchers" className="gap-2">
                <Package className="w-4 h-4" />
                Vouchers
              </TabsTrigger>
              <TabsTrigger value="orders" className="gap-2">
                <ShoppingCart className="w-4 h-4" />
                Orders
              </TabsTrigger>
              <TabsTrigger value="requests" className="gap-2">
                <Plane className="w-4 h-4" />
                Ticket Requests
              </TabsTrigger>
              <TabsTrigger value="car-rentals" className="gap-2">
                <Car className="w-4 h-4" />
                Car Rentals
              </TabsTrigger>
              {isAdmin && (
                <>
                  <TabsTrigger value="conversations" className="gap-2">
                    <MessagesSquare className="w-4 h-4" />
                    Maya Logs
                  </TabsTrigger>
                  <TabsTrigger value="inventory" className="gap-2">
                    <CreditCard className="w-4 h-4" />
                    Inventory
                  </TabsTrigger>
                  <TabsTrigger value="quote-logs" className="gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Quote Logs
                  </TabsTrigger>
                  <TabsTrigger value="booking-queue" className="gap-2">
                    <Play className="w-4 h-4" />
                    Booking Queue
                  </TabsTrigger>
                  <TabsTrigger value="book-call" className="gap-2">
                    <Phone className="w-4 h-4" />
                    Book by Phone
                  </TabsTrigger>
                  <TabsTrigger value="universal-call" className="gap-2">
                    <Zap className="w-4 h-4" />
                    Universal Call
                  </TabsTrigger>
                  <TabsTrigger value="batch-calls" className="gap-2">
                    <FileSpreadsheet className="w-4 h-4" />
                    Batch Calls
                  </TabsTrigger>
                  <TabsTrigger value="call-logs" className="gap-2">
                    <PhoneCall className="w-4 h-4" />
                    Call Logs
                  </TabsTrigger>
                  <TabsTrigger value="quotes" className="gap-2">
                    <MessageSquare className="w-4 h-4" />
                    WhatsApp Quotes
                  </TabsTrigger>
                  <TabsTrigger value="sellers" className="gap-2">
                    <Building2 className="w-4 h-4" />
                    Sellers
                  </TabsTrigger>
                  <TabsTrigger value="escrow" className="gap-2">
                    <Shield className="w-4 h-4" />
                    Escrow
                  </TabsTrigger>
                  <TabsTrigger value="users" className="gap-2">
                    <Users className="w-4 h-4" />
                    Users
                  </TabsTrigger>
                  <TabsTrigger value="promo-emails" className="gap-2">
                    <Mail className="w-4 h-4" />
                    Promo Emails
                  </TabsTrigger>
                  <TabsTrigger value="voice-proxy" className="gap-2">
                    <Mic className="w-4 h-4" />
                    Voice Proxy
                  </TabsTrigger>
                  <TabsTrigger value="settings" className="gap-2">
                    <Settings className="w-4 h-4" />
                    Settings
                  </TabsTrigger>
                </>
              )}
            </TabsList>

            <TabsContent value="vouchers">
              <AdminVouchers />
            </TabsContent>

            <TabsContent value="orders">
              <AdminOrders isAdmin={isAdmin} />
            </TabsContent>

            <TabsContent value="requests">
              <AdminTicketRequests isAdmin={isAdmin} />
            </TabsContent>

            <TabsContent value="car-rentals">
              <AdminCarRentals />
            </TabsContent>

            {isAdmin && (
              <>
                <TabsContent value="conversations">
                  <AdminConversations />
                </TabsContent>

                <TabsContent value="inventory">
                  <AdminInventory />
                </TabsContent>

                <TabsContent value="quote-logs">
                  <AdminQuoteLogs />
                </TabsContent>

                <TabsContent value="booking-queue">
                  <AdminBookingQueue />
                </TabsContent>

                <TabsContent value="book-call">
                  <AirlineBookingCall onAddToBatch={handleAddToBatch} />
                </TabsContent>

                <TabsContent value="universal-call">
                  <AdminUniversalCall onAddToBatch={handleAddToBatch} />
                </TabsContent>

                <TabsContent value="batch-calls">
                  <BatchCallGenerator initialRows={batchRows} onRowsChange={setBatchRows} />
                </TabsContent>

                <TabsContent value="call-logs">
                  <AdminCallLogs />
                </TabsContent>

                <TabsContent value="quotes">
                  <AdminQuoteRequests />
                </TabsContent>

                <TabsContent value="sellers">
                  <AdminSellers />
                </TabsContent>

                <TabsContent value="escrow">
                  <AdminEscrow />
                </TabsContent>

                <TabsContent value="users">
                  <AdminUsers />
                </TabsContent>

                <TabsContent value="promo-emails">
                  <AdminPromoEmails />
                </TabsContent>

                <TabsContent value="voice-proxy">
                  <Suspense fallback={<Loader2 className="w-6 h-6 animate-spin mx-auto mt-8" />}>
                    <VoiceProxyContent />
                  </Suspense>
                </TabsContent>

                <TabsContent value="settings">
                  <AdminSettings />
                </TabsContent>
              </>
            )}
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}
