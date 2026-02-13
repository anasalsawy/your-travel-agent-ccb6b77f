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
import { CalendarIcon, Car, Loader2, Check, HelpCircle, MapPin, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SupportButtons } from "@/components/SupportButtons";

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
  const [carType, setCarType] = useState("economy");
  const [transmission, setTransmission] = useState("automatic");
  const [rentalCompany, setRentalCompany] = useState("");
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
      toast({
        title: "Error",
        description: "Please select both pickup and drop-off dates.",
        variant: "destructive",
      });
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
        car_type: carType,
        transmission,
        rental_company: rentalCompany || null,
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
      toast({
        title: "Request Submitted!",
        description: "We'll review your car rental request and send you a quote soon.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit request.",
        variant: "destructive",
      });
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
                <Button variant="hero" onClick={() => navigate("/dashboard")}>
                  Go to Dashboard
                </Button>
                <Button variant="outline" onClick={() => setSubmitted(false)}>
                  Submit Another Request
                </Button>
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
    const label = `${hours.toString().padStart(2, "0")}:${minutes}`;
    return label;
  });

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-dark py-8 md:py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            {/* Header */}
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 mb-6">
                <Car className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-accent">Car Rental Service</span>
              </div>
              <h1 className="font-display text-3xl md:text-4xl font-bold mb-4">
                Request a <span className="text-gradient">Car Rental</span>
              </h1>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Tell us your rental needs and we'll find you the best deal. Our agents will send you a personalized quote.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="glass-card p-6 md:p-10">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Pickup Location */}
                <div className="space-y-2">
                  <Label htmlFor="pickup">Pickup Location *</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="pickup"
                      placeholder="e.g., LAX Airport, Downtown Miami"
                      value={pickupLocation}
                      onChange={(e) => setPickupLocation(e.target.value)}
                      className="bg-card border-border pl-10"
                      required
                    />
                  </div>
                </div>

                {/* Dropoff Location */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="dropoff">Drop-off Location</Label>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={sameDropoff}
                        onCheckedChange={(checked) => setSameDropoff(checked === true)}
                      />
                      Same as pickup
                    </label>
                  </div>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="dropoff"
                      placeholder="e.g., JFK Airport"
                      value={sameDropoff ? pickupLocation : dropoffLocation}
                      onChange={(e) => setDropoffLocation(e.target.value)}
                      className="bg-card border-border pl-10"
                      disabled={sameDropoff}
                    />
                  </div>
                </div>

                {/* Pickup Date */}
                <div className="space-y-2">
                  <Label>Pickup Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal bg-card border-border",
                          !pickupDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {pickupDate ? format(pickupDate, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={pickupDate}
                        onSelect={setPickupDate}
                        disabled={(date) => date < new Date()}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Pickup Time */}
                <div className="space-y-2">
                  <Label>Pickup Time</Label>
                  <Select value={pickupTime} onValueChange={setPickupTime}>
                    <SelectTrigger className="bg-card border-border">
                      <Clock className="w-4 h-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {timeSlots.map((t) => (
                        <SelectItem key={`pickup-${t}`} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Dropoff Date */}
                <div className="space-y-2">
                  <Label>Drop-off Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal bg-card border-border",
                          !dropoffDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dropoffDate ? format(dropoffDate, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dropoffDate}
                        onSelect={setDropoffDate}
                        disabled={(date) => date < (pickupDate || new Date())}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Dropoff Time */}
                <div className="space-y-2">
                  <Label>Drop-off Time</Label>
                  <Select value={dropoffTime} onValueChange={setDropoffTime}>
                    <SelectTrigger className="bg-card border-border">
                      <Clock className="w-4 h-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {timeSlots.map((t) => (
                        <SelectItem key={`dropoff-${t}`} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Car Type */}
                <div className="space-y-2">
                  <Label>Car Type</Label>
                  <Select value={carType} onValueChange={setCarType}>
                    <SelectTrigger className="bg-card border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="economy">Economy</SelectItem>
                      <SelectItem value="compact">Compact</SelectItem>
                      <SelectItem value="midsize">Midsize</SelectItem>
                      <SelectItem value="full-size">Full Size</SelectItem>
                      <SelectItem value="suv">SUV</SelectItem>
                      <SelectItem value="minivan">Minivan</SelectItem>
                      <SelectItem value="luxury">Luxury</SelectItem>
                      <SelectItem value="convertible">Convertible</SelectItem>
                      <SelectItem value="pickup-truck">Pickup Truck</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Transmission */}
                <div className="space-y-2">
                  <Label>Transmission</Label>
                  <Select value={transmission} onValueChange={setTransmission}>
                    <SelectTrigger className="bg-card border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="automatic">Automatic</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="no-preference">No Preference</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Preferred Rental Company */}
                <div className="space-y-2">
                  <Label htmlFor="company">Preferred Rental Company (Optional)</Label>
                  <Select value={rentalCompany} onValueChange={setRentalCompany}>
                    <SelectTrigger className="bg-card border-border">
                      <SelectValue placeholder="Any company" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any Company</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                      <SelectItem value="hertz">Hertz</SelectItem>
                      <SelectItem value="avis">Avis</SelectItem>
                      <SelectItem value="budget">Budget</SelectItem>
                      <SelectItem value="national">National</SelectItem>
                      <SelectItem value="alamo">Alamo</SelectItem>
                      <SelectItem value="dollar">Dollar</SelectItem>
                      <SelectItem value="thrifty">Thrifty</SelectItem>
                      <SelectItem value="sixt">Sixt</SelectItem>
                      <SelectItem value="turo">Turo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Driver's Age */}
                <div className="space-y-2">
                  <Label htmlFor="age">Driver's Age</Label>
                  <Input
                    id="age"
                    type="number"
                    min="18"
                    max="99"
                    value={driversAge}
                    onChange={(e) => setDriversAge(e.target.value)}
                    className="bg-card border-border"
                  />
                  {parseInt(driversAge) < 25 && (
                    <p className="text-xs text-amber-400">Young driver surcharge may apply for drivers under 25</p>
                  )}
                </div>

                {/* Number of Drivers */}
                <div className="space-y-2">
                  <Label>Number of Drivers</Label>
                  <Select value={numDrivers} onValueChange={setNumDrivers}>
                    <SelectTrigger className="bg-card border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Driver</SelectItem>
                      <SelectItem value="2">2 Drivers</SelectItem>
                      <SelectItem value="3">3 Drivers</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Budget */}
                <div className="space-y-2">
                  <Label htmlFor="budget">Budget per Day (USD)</Label>
                  <Input
                    id="budget"
                    type="number"
                    placeholder="e.g., 50"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="bg-card border-border"
                  />
                </div>

                {/* Add-ons */}
                <div className="md:col-span-2 space-y-4">
                  <Label>Add-ons</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <label className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border cursor-pointer hover:border-accent/40 transition-colors">
                      <Checkbox checked={needsInsurance} onCheckedChange={(c) => setNeedsInsurance(c === true)} />
                      <div>
                        <span className="text-sm font-medium">Insurance</span>
                        <p className="text-xs text-muted-foreground">Full coverage protection</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border cursor-pointer hover:border-accent/40 transition-colors">
                      <Checkbox checked={needsGps} onCheckedChange={(c) => setNeedsGps(c === true)} />
                      <div>
                        <span className="text-sm font-medium">GPS Navigation</span>
                        <p className="text-xs text-muted-foreground">Built-in nav system</p>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border cursor-pointer hover:border-accent/40 transition-colors">
                      <Checkbox checked={needsChildSeat} onCheckedChange={(c) => setNeedsChildSeat(c === true)} />
                      <div>
                        <span className="text-sm font-medium">Child Seat</span>
                        <p className="text-xs text-muted-foreground">Infant or booster seat</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Contact Email */}
                <div className="space-y-2">
                  <Label htmlFor="contactEmail">Contact Email *</Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    placeholder="you@example.com"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="bg-card border-border"
                    required
                  />
                </div>

                {/* Contact Phone */}
                <div className="space-y-2">
                  <Label htmlFor="contactPhone">Phone Number (Optional)</Label>
                  <Input
                    id="contactPhone"
                    type="tel"
                    placeholder="+1 (555) 000-0000"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="bg-card border-border"
                  />
                </div>

                {/* Special Notes */}
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="notes">Special Requests or Notes</Label>
                  <Textarea
                    id="notes"
                    placeholder="Airport terminal, loyalty program number, specific car model preferences..."
                    value={specialNotes}
                    onChange={(e) => setSpecialNotes(e.target.value)}
                    className="bg-card border-border min-h-[100px]"
                  />
                </div>
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <Button variant="hero" size="lg" className="flex-1" disabled={loading}>
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Submit Car Rental Request
                </Button>
                {!user && (
                  <p className="text-sm text-muted-foreground text-center sm:text-left self-center">
                    You'll need to sign in to submit
                  </p>
                )}
              </div>

              {/* Support section */}
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
          </div>
        </div>
      </div>
    </Layout>
  );
}
