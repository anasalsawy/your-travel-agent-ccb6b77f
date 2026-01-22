import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Package, ShoppingCart, Plane, Settings, Users, Building2, Shield, MessageSquare, Phone, Zap } from "lucide-react";
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

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const navigate = useNavigate();

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

          <Tabs defaultValue="vouchers" className="space-y-6">
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
              {isAdmin && (
                <>
                  <TabsTrigger value="book-call" className="gap-2">
                    <Phone className="w-4 h-4" />
                    Book by Phone
                  </TabsTrigger>
                  <TabsTrigger value="universal-call" className="gap-2">
                    <Zap className="w-4 h-4" />
                    Universal Call
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

            {isAdmin && (
              <>
                <TabsContent value="book-call">
                  <AirlineBookingCall />
                </TabsContent>

                <TabsContent value="universal-call">
                  <AdminUniversalCall />
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
