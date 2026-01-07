import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  Store, 
  Loader2, 
  Check, 
  Building2, 
  Mail, 
  Phone, 
  Globe, 
  FileText,
  Clock,
  Shield
} from "lucide-react";

export default function SellerRegisterPage() {
  const [user, setUser] = useState<any>(null);
  const [existingSeller, setExistingSeller] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Form state
  const [businessName, setBusinessName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      navigate("/auth?redirect=/seller/register");
      return;
    }
    
    setUser(session.user);
    setContactEmail(session.user.email || "");

    // Check if already a seller
    const { data: seller } = await supabase
      .from("sellers")
      .select("*")
      .eq("user_id", session.user.id)
      .single();

    if (seller) {
      setExistingSeller(seller);
    }

    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;

    setSubmitting(true);

    try {
      const { error } = await supabase.from("sellers").insert({
        user_id: user.id,
        business_name: businessName,
        contact_email: contactEmail,
        contact_phone: contactPhone || null,
        website: website || null,
        description: description || null,
      });

      if (error) throw error;

      setSubmitted(true);
      toast({
        title: "Application Submitted!",
        description: "We'll review your application and get back to you soon.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit application.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
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

  // Already submitted or has existing seller account
  if (submitted || existingSeller) {
    const status = existingSeller?.status || "pending";
    
    return (
      <Layout>
        <div className="min-h-screen bg-gradient-dark py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-lg mx-auto text-center">
              {status === "approved" ? (
                <>
                  <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-success/20 flex items-center justify-center">
                    <Check className="w-10 h-10 text-success" />
                  </div>
                  <h1 className="font-display text-3xl font-bold mb-4">You're Approved!</h1>
                  <p className="text-muted-foreground mb-8">
                    Your seller account is active. Start browsing listings and placing bids.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-4 justify-center">
                    <Button variant="hero" onClick={() => navigate("/marketplace")}>
                      Browse Listings
                    </Button>
                    <Button variant="outline" onClick={() => navigate("/seller/dashboard")}>
                      Seller Dashboard
                    </Button>
                  </div>
                </>
              ) : status === "rejected" ? (
                <>
                  <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-destructive/20 flex items-center justify-center">
                    <Store className="w-10 h-10 text-destructive" />
                  </div>
                  <h1 className="font-display text-3xl font-bold mb-4">Application Not Approved</h1>
                  <p className="text-muted-foreground mb-4">
                    Unfortunately, your seller application was not approved.
                  </p>
                  {existingSeller?.admin_notes && (
                    <div className="glass-card p-4 text-left mb-8">
                      <p className="text-sm font-medium mb-1">Reason:</p>
                      <p className="text-sm text-muted-foreground">{existingSeller.admin_notes}</p>
                    </div>
                  )}
                  <Button variant="outline" onClick={() => navigate("/")}>
                    Return Home
                  </Button>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-warning/20 flex items-center justify-center">
                    <Clock className="w-10 h-10 text-warning" />
                  </div>
                  <h1 className="font-display text-3xl font-bold mb-4">Application Pending</h1>
                  <p className="text-muted-foreground mb-8">
                    Your seller application is being reviewed. We typically process applications within 24-48 hours.
                  </p>
                  <Button variant="outline" onClick={() => navigate("/")}>
                    Return Home
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-dark py-8 md:py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            {/* Header */}
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 mb-6">
                <Store className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-accent">Seller Registration</span>
              </div>
              <h1 className="font-display text-3xl md:text-4xl font-bold mb-4">
                Become a <span className="text-gradient">Verified Seller</span>
              </h1>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Join our marketplace as a travel agent or agency. Bid on customer requests and grow your business.
              </p>
            </div>

            {/* Benefits */}
            <div className="grid md:grid-cols-3 gap-4 mb-10">
              <div className="glass-card p-4 text-center">
                <Shield className="w-8 h-8 mx-auto mb-2 text-primary" />
                <h3 className="font-medium mb-1">Verified Badge</h3>
                <p className="text-xs text-muted-foreground">Build trust with buyers</p>
              </div>
              <div className="glass-card p-4 text-center">
                <Store className="w-8 h-8 mx-auto mb-2 text-accent" />
                <h3 className="font-medium mb-1">Direct Access</h3>
                <p className="text-xs text-muted-foreground">Bid on travel requests</p>
              </div>
              <div className="glass-card p-4 text-center">
                <Check className="w-8 h-8 mx-auto mb-2 text-success" />
                <h3 className="font-medium mb-1">Win Bookings</h3>
                <p className="text-xs text-muted-foreground">Grow your business</p>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="glass-card p-6 md:p-10">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Business Name */}
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="businessName">Business Name *</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="businessName"
                      placeholder="Your travel agency name"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      className="pl-10 bg-card border-border"
                      required
                    />
                  </div>
                </div>

                {/* Contact Email */}
                <div className="space-y-2">
                  <Label htmlFor="contactEmail">Contact Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="contactEmail"
                      type="email"
                      placeholder="business@example.com"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="pl-10 bg-card border-border"
                      required
                    />
                  </div>
                </div>

                {/* Contact Phone */}
                <div className="space-y-2">
                  <Label htmlFor="contactPhone">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="contactPhone"
                      type="tel"
                      placeholder="+1 (555) 000-0000"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      className="pl-10 bg-card border-border"
                    />
                  </div>
                </div>

                {/* Website */}
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="website">Website (Optional)</Label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="website"
                      type="url"
                      placeholder="https://youragency.com"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      className="pl-10 bg-card border-border"
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="description">About Your Business</Label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                    <Textarea
                      id="description"
                      placeholder="Tell us about your travel agency, specializations, and experience..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="pl-10 bg-card border-border min-h-[120px]"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <Button variant="hero" size="lg" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Submit Application
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-4">
                  Applications are reviewed within 24-48 hours. You'll receive an email once approved.
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
}
