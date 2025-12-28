import { useState, useEffect, useMemo } from "react";
import { Layout } from "@/components/layout/Layout";
import { VoucherCard } from "@/components/vouchers/VoucherCard";
import { VoucherFilters } from "@/components/vouchers/VoucherFilters";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { SlidersHorizontal } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

// Public voucher type excludes sensitive redemption_notes field
type Voucher = Omit<Tables<"vouchers">, "redemption_notes">;

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedAirline, setSelectedAirline] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [discountRange, setDiscountRange] = useState([0]);

  // Define safe columns that can be publicly displayed (excludes redemption_notes for security)
  const SAFE_VOUCHER_COLUMNS = "id,airline,title,type,face_value,sale_price,discount_percent,currency,expiry_date,verified_balance,is_refundable,is_transferable,redemption_method,delivery_method,verification_method,terms,status,image_url,created_at,updated_at";

  useEffect(() => {
    const fetchVouchers = async () => {
      const { data, error } = await supabase
        .from("vouchers")
        .select(SAFE_VOUCHER_COLUMNS)
        .eq("status", "available")
        .order("discount_percent", { ascending: false });
      
      if (!error && data) {
        setVouchers(data);
      }
      setLoading(false);
    };
    
    fetchVouchers();
  }, []);

  const airlines = useMemo(() => {
    return [...new Set(vouchers.map((v) => v.airline))].sort();
  }, [vouchers]);

  const filteredVouchers = useMemo(() => {
    return vouchers.filter((voucher) => {
      const matchesSearch = 
        voucher.title.toLowerCase().includes(search.toLowerCase()) ||
        voucher.airline.toLowerCase().includes(search.toLowerCase());
      const matchesAirline = selectedAirline === "all" || voucher.airline === selectedAirline;
      const matchesType = selectedType === "all" || voucher.type === selectedType;
      const matchesDiscount = Number(voucher.discount_percent) >= discountRange[0];
      
      return matchesSearch && matchesAirline && matchesType && matchesDiscount;
    });
  }, [vouchers, search, selectedAirline, selectedType, discountRange]);

  const resetFilters = () => {
    setSelectedAirline("all");
    setSelectedType("all");
    setDiscountRange([0]);
    setSearch("");
  };

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-dark py-8 md:py-12">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
              Available <span className="text-gradient">Vouchers</span>
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Browse verified airline vouchers at discounted prices
            </p>
          </div>

          {/* Search and mobile filter */}
          <div className="flex gap-3 mb-8">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Search vouchers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-12 h-12 bg-card border-border"
              />
            </div>
            <Sheet>
              <SheetTrigger asChild className="lg:hidden">
                <Button variant="outline" size="icon" className="h-12 w-12">
                  <SlidersHorizontal className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] bg-background">
                <div className="mt-6">
                  <VoucherFilters
                    airlines={airlines}
                    selectedAirline={selectedAirline}
                    onAirlineChange={setSelectedAirline}
                    selectedType={selectedType}
                    onTypeChange={setSelectedType}
                    discountRange={discountRange}
                    onDiscountChange={setDiscountRange}
                    onReset={resetFilters}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <div className="flex gap-8">
            {/* Desktop filters */}
            <aside className="hidden lg:block w-72 flex-shrink-0">
              <div className="sticky top-24">
                <VoucherFilters
                  airlines={airlines}
                  selectedAirline={selectedAirline}
                  onAirlineChange={setSelectedAirline}
                  selectedType={selectedType}
                  onTypeChange={setSelectedType}
                  discountRange={discountRange}
                  onDiscountChange={setDiscountRange}
                  onReset={resetFilters}
                />
              </div>
            </aside>

            {/* Voucher grid */}
            <div className="flex-1">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : filteredVouchers.length === 0 ? (
                <div className="glass-card p-12 text-center">
                  <p className="text-muted-foreground">No vouchers found matching your criteria.</p>
                  <Button variant="outline" onClick={resetFilters} className="mt-4">
                    Reset Filters
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-6">
                    {filteredVouchers.length} voucher{filteredVouchers.length !== 1 ? 's' : ''} available
                  </p>
                  <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredVouchers.map((voucher) => (
                      <VoucherCard key={voucher.id} voucher={voucher} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
