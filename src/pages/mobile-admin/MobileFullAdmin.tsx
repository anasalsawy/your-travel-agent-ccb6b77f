import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MobileAdminLayout } from "@/components/mobile-admin/MobileAdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Package, ShoppingCart, Plane, Car, Settings, Users, Building2, Shield, MessageSquare, Phone, Zap, FileSpreadsheet, PhoneCall, CreditCard, TrendingUp, Play, MessagesSquare, Mail, Mic } from "lucide-react";
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

const adminTabs = [
  { value: "requests", label: "Flights", icon: Plane },
  { value: "car-rentals", label: "Cars", icon: Car },
  { value: "orders", label: "Orders", icon: ShoppingCart },
  { value: "vouchers", label: "Vouchers", icon: Package },
  { value: "conversations", label: "Maya", icon: MessagesSquare },
  { value: "inventory", label: "Inventory", icon: CreditCard },
  { value: "quote-logs", label: "Quotes", icon: TrendingUp },
  { value: "booking-queue", label: "Booking Q", icon: Play },
  { value: "book-call", label: "Book Call", icon: Phone },
  { value: "universal-call", label: "Call", icon: Zap },
  { value: "batch-calls", label: "Batch", icon: FileSpreadsheet },
  { value: "call-logs", label: "Call Logs", icon: PhoneCall },
  { value: "quotes", label: "WA Quotes", icon: MessageSquare },
  { value: "sellers", label: "Sellers", icon: Building2 },
  { value: "escrow", label: "Escrow", icon: Shield },
  { value: "users", label: "Users", icon: Users },
  { value: "promo-emails", label: "Promos", icon: Mail },
  { value: "voice-proxy", label: "Voice", icon: Mic },
  { value: "settings", label: "Settings", icon: Settings },
];

export default function MobileFullAdmin() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [batchRows, setBatchRows] = useState<BatchCallRow[]>([]);
  const navigate = useNavigate();

  const activeTab = searchParams.get("tab") || "requests";
  const setActiveTab = (tab: string) => setSearchParams({ tab });

  const handleAddToBatch = (row: Omit<BatchCallRow, "id">) => {
    const newRow: BatchCallRow = { ...row, id: crypto.randomUUID() };
    setBatchRows(prev => [...prev, newRow]);
    setActiveTab("batch-calls");
  };

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/m/login"); return; }

      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .in("role", ["admin", "staff"])
        .limit(1)
        .maybeSingle();

      if (!adminRole) { navigate("/m"); return; }
      setIsAdmin(adminRole.role === "admin");
      setLoading(false);
    };
    checkAccess();
  }, [navigate]);

  if (loading) {
    return (
      <MobileAdminLayout title="Admin Panel">
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MobileAdminLayout>
    );
  }

  return (
    <MobileAdminLayout title="Full Admin Panel">
      <div className="px-2 pt-2">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
          {/* Scrollable tab bar */}
          <div className="overflow-x-auto -mx-2 px-2 pb-1">
            <TabsList className="bg-card border border-border/50 inline-flex h-auto p-1 gap-0.5 min-w-max">
              {adminTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="gap-1 text-xs px-2.5 py-1.5 whitespace-nowrap"
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Tab content — identical to desktop admin */}
          <TabsContent value="requests">
            <AdminTicketRequests isAdmin={isAdmin} />
          </TabsContent>
          <TabsContent value="car-rentals">
            <AdminCarRentals />
          </TabsContent>
          <TabsContent value="orders">
            <AdminOrders isAdmin={isAdmin} />
          </TabsContent>
          <TabsContent value="vouchers">
            <AdminVouchers />
          </TabsContent>
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
        </Tabs>
      </div>
    </MobileAdminLayout>
  );
}
