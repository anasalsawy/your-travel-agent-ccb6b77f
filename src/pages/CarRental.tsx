import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  CalendarIcon, Car, Loader2, Check, HelpCircle, MapPin, Clock,
  Shield, DollarSign, Zap, Search, FileText, CreditCard,
  Baby, Navigation, ShieldCheck, Users
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SupportButtons } from "@/components/SupportButtons";
import heroImg from "@/assets/car-rental-hero.jpg";

export default function CarRentalPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Form state
  const [pickupLocation, setPickupLocation] = useState("");
  const [dropoffLocation, setDropoffLocation] = useState("");
  const [sameDropoff, setSameDropoff] = useState(true);
  const [pickupDate, setPickupDate] = useState<Date>();
  const [dropoffDate, setDropoffDate] = useState<Date>();
  const [pickupTime, setPickupTime] = useState("10:00");
  const [dropoffTime, setDropoffTime] = useState("10:00");
  const [carClass, setCarClass] = useState("economy");
  const [carSize, setCarSize] = useState("midsize");
  const [driversAge, setDriversAge] = useState("25");
  const [numDrivers, setNumDrivers] = useState("1");
  const [needsInsurance, setNeedsInsurance] = useState(false);
  const [needsGps, setNeedsGps] = useState(false);
  const [needsChildSeat, setNeedsChildSeat] = useState(false);
  const [budget, setBudget] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [specialNotes, setSpecialNotes] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        setContactEmail(session.user.email || "");
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      navigate("/auth?redirect=/car-rental");
      return;
    }

    if (!pickupDate || !dropoffDate) {
      toast({ title: "Error", description: "Please select both pickup and drop-off dates.", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.from("car_rental_requests").insert({
        user_id: user.id,
        pickup_location: pickupLocation,
        dropoff_location: sameDropoff ? pickupLocation : dropoffLocation,
        pickup_date: format(pickupDate, "yyyy-MM-dd"),
        dropoff_date: format(dropoffDate, "yyyy-MM-dd"),
        pickup_time: pickupTime,
        dropoff_time: dropoffTime,
        car_type: `${carClass} / ${carSize}`,
        drivers_age: parseInt(driversAge),
        num_drivers: parseInt(numDrivers),
        needs_insurance: needsInsurance,
        needs_gps: needsGps,
        needs_child_seat: needsChildSeat,
        budget: budget ? parseFloat(budget) : null,
        contact_email: contactEmail,
        contact_phone: contactPhone || null,
        special_notes: specialNotes || null,
      });

      if (error) throw error;

      setSubmitted(true);
      toast({ title: "Request Submitted!", description: "We'll review your car rental request and send you a quote soon." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to submit request.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <Layout>
        <div className="min-h-screen bg-gradient-dark py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-lg mx-auto text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-success/20 flex items-center justify-center">
                <Check className="w-10 h-10 text-success" />
              </div>
              <h1 className="font-display text-3xl font-bold mb-4">Request Submitted!</h1>
              <p className="text-muted-foreground mb-8">
                We've received your car rental request. Our team will review it and send you a personalized quote within 24-48 hours.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button variant="hero" onClick={() => navigate("/dashboard")}>Go to Dashboard</Button>
                <Button variant="outline" onClick={() => setSubmitted(false)}>Submit Another Request</Button>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  const timeSlots = Array.from({ length: 48 }, (_, i) => {
    const hours = Math.floor(i / 2);
    const minutes = i % 2 === 0 ? "00" : "30";
    return `${hours.toString().padStart(2, "0")}:${minutes}`;
  });

  return (
    <Layout>
      {/* Hero Banner */}
      <div className="relative h-[280px] md:h-[340px] overflow-hidden">
        <img src={heroImg} alt="Premium car rental" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center px-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/20 border border-accent/30 backdrop-blur-sm mb-4">
              <Car className="w-4 h-4 text-accent" />
              <span className="text-sm font-medium text-accent">Car Rental Service</span>
            </div>
            <h1 className="font-display text-3xl md:text-5xl font-bold mb-3">
              Request a <span className="text-gradient">Car Rental</span>
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm md:text-base">
              Tell us your rental needs and we'll negotiate the best deal for you. Save time and money.
            </p>
          </div>
        </div>
      </div>

      {/* Trust Badges */}
      <div className="bg-muted/30 border-b border-border/50 py-4">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-center justify-center gap-3 md:gap-6">
            <div className="flex items-center gap-2 text-sm">
              <Shield className="w-4 h-4 text-success" />
              <span className="text-muted-foreground font-medium">Best Price Guarantee</span>
            </div>
            <div className="hidden md:block w-px h-5 bg-border" />
            <div className="flex items-center gap-2 text-sm">
              <Zap className="w-4 h-4 text-accent" />
              <span className="text-muted-foreground font-medium">Quote in 24 Hours</span>
            </div>
            <div className="hidden md:block w-px h-5 bg-border" />
            <div className="flex items-center gap-2 text-sm">
              <DollarSign className="w-4 h-4 text-primary" />
              <span className="text-muted-foreground font-medium">No Hidden Fees</span>
            </div>
            <div className="hidden md:block w-px h-5 bg-border" />
            <div className="flex items-center gap-2 text-sm">
              <ShieldCheck className="w-4 h-4 text-success" />
              <span className="text-muted-foreground font-medium">Free Cancellation</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gradient-dark py-8 md:py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            {/* Form */}
            <form onSubmit={handleSubmit} className="glass-card p-6 md:p-10">
              {/* Section: Location */}
              <div className="mb-8">
                <h2 className="text-lg font-display font-semibold mb-1 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-accent" />
                  Location Details
                </h2>
                <p className="text-sm text-muted-foreground mb-4">Where do you need the car?</p>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="pickup">Pickup Location *</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="pickup" placeholder="e.g., LAX Airport, Downtown Miami" value={pickupLocation} onChange={(e) => setPickupLocation(e.target.value)} className="bg-card border-border pl-10" required />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="dropoff">Drop-off Location</Label>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                        <Checkbox checked={sameDropoff} onCheckedChange={(checked) => setSameDropoff(checked === true)} />
                        Same as pickup
                      </label>
                    </div>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="dropoff" placeholder="e.g., JFK Airport" value={sameDropoff ? pickupLocation : dropoffLocation} onChange={(e) => setDropoffLocation(e.target.value)} className="bg-card border-border pl-10" disabled={sameDropoff} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section: Dates & Times */}
              <div className="mb-8">
                <h2 className="text-lg font-display font-semibold mb-1 flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-accent" />
                  Dates & Times
                </h2>
                <p className="text-sm text-muted-foreground mb-4">When do you need the rental?</p>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Pickup Date *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal bg-card border-border", !pickupDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {pickupDate ? format(pickupDate, "PPP") : "Select date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={pickupDate} onSelect={setPickupDate} disabled={(date) => date < new Date()} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label>Pickup Time</Label>
                    <Select value={pickupTime} onValueChange={setPickupTime}>
                      <SelectTrigger className="bg-card border-border">
                        <Clock className="w-4 h-4 mr-2" /><SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {timeSlots.map((t) => (<SelectItem key={`p-${t}`} value={t}>{t}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Drop-off Date *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal bg-card border-border", !dropoffDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dropoffDate ? format(dropoffDate, "PPP") : "Select date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={dropoffDate} onSelect={setDropoffDate} disabled={(date) => date < (pickupDate || new Date())} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label>Drop-off Time</Label>
                    <Select value={dropoffTime} onValueChange={setDropoffTime}>
                      <SelectTrigger className="bg-card border-border">
                        <Clock className="w-4 h-4 mr-2" /><SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {timeSlots.map((t) => (<SelectItem key={`d-${t}`} value={t}>{t}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  {pickupDate && dropoffDate && (
                    <div className="md:col-span-2 p-3 rounded-lg bg-accent/10 border border-accent/20 text-sm">
                      <span className="font-medium text-accent">
                        📅 {Math.ceil((dropoffDate.getTime() - pickupDate.getTime()) / (1000 * 60 * 60 * 24))} day rental
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Section: Vehicle Preferences */}
              <div className="mb-8">
                <h2 className="text-lg font-display font-semibold mb-1 flex items-center gap-2">
                  <Car className="w-5 h-5 text-accent" />
                  Vehicle Preferences
                </h2>
                <p className="text-sm text-muted-foreground mb-4">What kind of car are you looking for?</p>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Car Class</Label>
                    <Select value={carClass} onValueChange={setCarClass}>
                      <SelectTrigger className="bg-card border-border"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="economy">🚗 Economy</SelectItem>
                        <SelectItem value="standard">🚘 Standard</SelectItem>
                        <SelectItem value="premium">✨ Premium</SelectItem>
                        <SelectItem value="luxury">👑 Luxury</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Car Size</Label>
                    <Select value={carSize} onValueChange={setCarSize}>
                      <SelectTrigger className="bg-card border-border"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="compact">🚗 Compact</SelectItem>
                        <SelectItem value="midsize">🚙 Midsize</SelectItem>
                        <SelectItem value="full-size">🚘 Full Size</SelectItem>
                        <SelectItem value="suv">🛻 SUV</SelectItem>
                        <SelectItem value="minivan">🚐 Minivan</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Section: Driver Info */}
              <div className="mb-8">
                <h2 className="text-lg font-display font-semibold mb-1 flex items-center gap-2">
                  <Users className="w-5 h-5 text-accent" />
                  Driver Information
                </h2>
                <p className="text-sm text-muted-foreground mb-4">Who will be driving?</p>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="age">Driver's Age</Label>
                    <Input id="age" type="number" min="18" max="99" value={driversAge} onChange={(e) => setDriversAge(e.target.value)} className="bg-card border-border" />
                    {parseInt(driversAge) < 25 && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <span>⚠️</span> Young driver surcharge may apply for drivers under 25
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Number of Drivers</Label>
                    <Select value={numDrivers} onValueChange={setNumDrivers}>
                      <SelectTrigger className="bg-card border-border"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 Driver</SelectItem>
                        <SelectItem value="2">2 Drivers (+additional driver fee)</SelectItem>
                        <SelectItem value="3">3 Drivers (+additional driver fee)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="budget">Budget per Day (USD)</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input id="budget" type="number" placeholder="e.g., 50" value={budget} onChange={(e) => setBudget(e.target.value)} className="bg-card border-border pl-10" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section: Add-ons */}
              <div className="mb-8">
                <h2 className="text-lg font-display font-semibold mb-1 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-accent" />
                  Add-ons & Extras
                </h2>
                <p className="text-sm text-muted-foreground mb-4">Optional extras for your rental</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <label className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border cursor-pointer hover:border-accent/40 transition-colors group">
                    <Checkbox checked={needsInsurance} onCheckedChange={(c) => setNeedsInsurance(c === true)} />
                    <div>
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-success" />
                        Insurance
                      </span>
                      <p className="text-xs text-muted-foreground">Full coverage protection</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border cursor-pointer hover:border-accent/40 transition-colors group">
                    <Checkbox checked={needsGps} onCheckedChange={(c) => setNeedsGps(c === true)} />
                    <div>
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <Navigation className="w-4 h-4 text-primary" />
                        GPS Navigation
                      </span>
                      <p className="text-xs text-muted-foreground">Built-in nav system</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border cursor-pointer hover:border-accent/40 transition-colors group">
                    <Checkbox checked={needsChildSeat} onCheckedChange={(c) => setNeedsChildSeat(c === true)} />
                    <div>
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <Baby className="w-4 h-4 text-accent" />
                        Child Seat
                      </span>
                      <p className="text-xs text-muted-foreground">Infant or booster seat</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Section: Contact */}
              <div className="mb-8">
                <h2 className="text-lg font-display font-semibold mb-1 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-accent" />
                  Contact Information
                </h2>
                <p className="text-sm text-muted-foreground mb-4">How should we reach you with the quote?</p>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="contactEmail">Contact Email *</Label>
                    <Input id="contactEmail" type="email" placeholder="you@example.com" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className="bg-card border-border" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactPhone">Phone Number (Optional)</Label>
                    <Input id="contactPhone" type="tel" placeholder="+1 (555) 000-0000" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="bg-card border-border" />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="notes">Special Requests or Notes</Label>
                    <Textarea id="notes" placeholder="Airport terminal, flight arrival time, specific car model, loyalty program details..." value={specialNotes} onChange={(e) => setSpecialNotes(e.target.value)} className="bg-card border-border min-h-[100px]" />
                  </div>
                </div>
              </div>

              {/* Submit */}
              <div className="flex flex-col sm:flex-row gap-4">
                <Button variant="hero" size="lg" className="flex-1" disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Car className="w-4 h-4 mr-2" />}
                  Submit Car Rental Request
                </Button>
                {!user && (
                  <p className="text-sm text-muted-foreground text-center sm:text-left self-center">
                    You'll need to sign in to submit
                  </p>
                )}
              </div>

              {/* Support */}
              <div className="mt-8 p-4 rounded-xl bg-primary/5 border border-primary/20">
                <div className="flex items-center gap-2 mb-3">
                  <HelpCircle className="w-5 h-5 text-primary" />
                  <span className="font-medium">Questions about your rental?</span>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Our team is here to help you find the best car rental deals. Reach out anytime!
                </p>
                <SupportButtons variant="inline" showLabels />
              </div>
            </form>

            {/* How It Works */}
            <div className="mt-12 mb-8">
              <h2 className="font-display text-2xl font-bold text-center mb-8">
                How It Works
              </h2>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="text-center glass-card p-6">
                  <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-4">
                    <Search className="w-7 h-7 text-accent" />
                  </div>
                  <h3 className="font-display font-semibold mb-2">1. Tell Us What You Need</h3>
                  <p className="text-sm text-muted-foreground">
                    Fill out the form with your rental details — location, dates, car type, and preferences.
                  </p>
                </div>
                <div className="text-center glass-card p-6">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <FileText className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="font-display font-semibold mb-2">2. Get a Personalized Quote</h3>
                  <p className="text-sm text-muted-foreground">
                    Our agents compare rates across all major rental companies and send you the best deal within 24 hours.
                  </p>
                </div>
                <div className="text-center glass-card p-6">
                  <div className="w-14 h-14 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-4">
                    <Check className="w-7 h-7 text-success" />
                  </div>
                  <h3 className="font-display font-semibold mb-2">3. Confirm & Drive</h3>
                  <p className="text-sm text-muted-foreground">
                    Accept the quote, we handle the booking, and you just show up to pick up your car. It's that simple.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
