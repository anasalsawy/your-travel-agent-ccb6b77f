import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Package, ShoppingCart, Plane, Settings } from "lucide-react";
import { AdminVouchers } from "@/components/admin/AdminVouchers";
import { AdminOrders } from "@/components/admin/AdminOrders";
import { AdminTicketRequests } from "@/components/admin/AdminTicketRequests";
import { AdminSettings } from "@/components/admin/AdminSettings";

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/auth?redirect=/admin");
        return;
      }

      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .single();

      if (!data) {
        navigate("/dashboard");
        return;
      }

      setIsAdmin(true);
      setLoading(false);
    };

    checkAdmin();
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

  if (!isAdmin) {
    return null;
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-dark py-8 md:py-12">
        <div className="container mx-auto px-4">
          <div className="mb-8">
            <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">
              Admin <span className="text-gradient">Dashboard</span>
            </h1>
            <p className="text-muted-foreground">
              Manage vouchers, orders, and ticket requests
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
              <TabsTrigger value="settings" className="gap-2">
                <Settings className="w-4 h-4" />
                Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="vouchers">
              <AdminVouchers />
            </TabsContent>

            <TabsContent value="orders">
              <AdminOrders />
            </TabsContent>

            <TabsContent value="requests">
              <AdminTicketRequests />
            </TabsContent>

            <TabsContent value="settings">
              <AdminSettings />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}
