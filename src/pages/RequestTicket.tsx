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
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { CalendarIcon, Plane, Users, Loader2, Check, HelpCircle, Gavel } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SupportButtons } from "@/components/SupportButtons";
import { notifyNewTicketRequest } from "@/lib/notifications";
import { Checkbox } from "@/components/ui/checkbox";

export default function RequestTicketPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Form state
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [departureDate, setDepartureDate] = useState<Date>();
  const [returnDate, setReturnDate] = useState<Date>();
  const [tripType, setTripType] = useState("round-trip");
  const [passengers, setPassengers] = useState("1");
  const [cabinClass, setCabinClass] = useState("economy");
  const [flexibility, setFlexibility] = useState("");
  const [preferredAirline, setPreferredAirline] = useState("");
  const [budget, setBudget] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [specialNotes, setSpecialNotes] = useState("");
  const [postToMarketplace, setPostToMarketplace] = useState(false);
  const [marketplaceDeadline, setMarketplaceDeadline] = useState<Date>();

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
      navigate("/auth?redirect=/request-ticket");
      return;
    }

    if (!departureDate) {
      toast({
        title: "Error",
        description: "Please select a departure date.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data: ticketRequest, error } = await supabase.from("ticket_requests").insert({
        user_id: user.id,
        origin,
        destination,
        departure_date: format(departureDate, "yyyy-MM-dd"),
        return_date: returnDate ? format(returnDate, "yyyy-MM-dd") : null,
        trip_type: tripType,
        passengers: parseInt(passengers),
        cabin_class: cabinClass,
        flexibility,
        preferred_airline: preferredAirline,
        budget: budget ? parseFloat(budget) : null,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        special_notes: specialNotes,
        is_public: postToMarketplace,
      }).select().single();

      if (error) throw error;

      // Create marketplace listing if opted in
      if (postToMarketplace && ticketRequest) {
        const deadline = marketplaceDeadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await supabase.from("marketplace_listings").insert({
          ticket_request_id: ticketRequest.id,
          user_id: user.id,
          title: `${origin} to ${destination} - ${format(departureDate, "MMM d")}`,
          deadline: deadline.toISOString(),
          min_bid: budget ? parseFloat(budget) : null,
        });
      }

      // Send admin notification
      notifyNewTicketRequest({
        origin,
        destination,
        departureDate: format(departureDate, "yyyy-MM-dd"),
        returnDate: returnDate ? format(returnDate, "yyyy-MM-dd") : undefined,
        passengers: parseInt(passengers),
        cabinClass,
        budget: budget ? parseFloat(budget) : undefined,
        contactEmail,
      });

      setSubmitted(true);
      toast({
        title: "Request Submitted!",
        description: "We'll review your request and send you a quote soon.",
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
                We've received your ticket request. Our team will review it and send you a personalized quote within 24-48 hours.
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

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-dark py-8 md:py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            {/* Header */}
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 mb-6">
                <Plane className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium text-accent">Custom Flight Booking</span>
              </div>
              <h1 className="font-display text-3xl md:text-4xl font-bold mb-4">
                Request a <span className="text-gradient">Flight Ticket</span>
              </h1>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Tell us your travel plans and we'll find you the best deal. Our agents will send you a personalized quote.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="glass-card p-6 md:p-10">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Origin */}
                <div className="space-y-2">
                  <Label htmlFor="origin">Origin City/Airport *</Label>
                  <Input
                    id="origin"
                    placeholder="e.g., New York (JFK)"
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    className="bg-card border-border"
                    required
                  />
                </div>

                {/* Destination */}
                <div className="space-y-2">
                  <Label htmlFor="destination">Destination City/Airport *</Label>
                  <Input
                    id="destination"
                    placeholder="e.g., London (LHR)"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="bg-card border-border"
                    required
                  />
                </div>

                {/* Trip Type */}
                <div className="space-y-2">
                  <Label>Trip Type</Label>
                  <Select value={tripType} onValueChange={setTripType}>
                    <SelectTrigger className="bg-card border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="round-trip">Round Trip</SelectItem>
                      <SelectItem value="one-way">One Way</SelectItem>
                      <SelectItem value="multi-city">Multi-City</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Passengers */}
                <div className="space-y-2">
                  <Label>Passengers</Label>
                  <Select value={passengers} onValueChange={setPassengers}>
                    <SelectTrigger className="bg-card border-border">
                      <Users className="w-4 h-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <SelectItem key={n} value={n.toString()}>
                          {n} {n === 1 ? "Passenger" : "Passengers"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Departure Date */}
                <div className="space-y-2">
                  <Label>Departure Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal bg-card border-border",
                          !departureDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {departureDate ? format(departureDate, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={departureDate}
                        onSelect={setDepartureDate}
                        disabled={(date) => date < new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Return Date */}
                <div className="space-y-2">
                  <Label>Return Date {tripType === "one-way" ? "(Optional)" : ""}</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal bg-card border-border",
                          !returnDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {returnDate ? format(returnDate, "PPP") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={returnDate}
                        onSelect={setReturnDate}
                        disabled={(date) => date < (departureDate || new Date())}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Cabin Class */}
                <div className="space-y-2">
                  <Label>Cabin Class</Label>
                  <Select value={cabinClass} onValueChange={setCabinClass}>
                    <SelectTrigger className="bg-card border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="economy">Economy</SelectItem>
                      <SelectItem value="premium-economy">Premium Economy</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                      <SelectItem value="first">First Class</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Flexibility */}
                <div className="space-y-2">
                  <Label>Date Flexibility</Label>
                  <Select value={flexibility} onValueChange={setFlexibility}>
                    <SelectTrigger className="bg-card border-border">
                      <SelectValue placeholder="Select flexibility" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exact">Exact dates only</SelectItem>
                      <SelectItem value="1-2 days">± 1-2 days</SelectItem>
                      <SelectItem value="3-5 days">± 3-5 days</SelectItem>
                      <SelectItem value="flexible">Very flexible</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Preferred Airline */}
                <div className="space-y-2">
                  <Label htmlFor="airline">Preferred Airline (Optional)</Label>
                  <Input
                    id="airline"
                    placeholder="e.g., Delta, United"
                    value={preferredAirline}
                    onChange={(e) => setPreferredAirline(e.target.value)}
                    className="bg-card border-border"
                  />
                </div>

                {/* Budget */}
                <div className="space-y-2">
                  <Label htmlFor="budget">Budget (USD)</Label>
                  <Input
                    id="budget"
                    type="number"
                    placeholder="e.g., 1500"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    className="bg-card border-border"
                  />
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
                    placeholder="Any specific requirements, preferences, or questions..."
                    value={specialNotes}
                    onChange={(e) => setSpecialNotes(e.target.value)}
                    className="bg-card border-border min-h-[100px]"
                  />
                </div>

                {/* Marketplace Opt-in */}
                <div className="md:col-span-2 p-4 rounded-xl bg-accent/5 border border-accent/20">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="marketplace"
                      checked={postToMarketplace}
                      onCheckedChange={(checked) => setPostToMarketplace(checked === true)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <Label htmlFor="marketplace" className="flex items-center gap-2 cursor-pointer">
                        <Gavel className="w-4 h-4 text-accent" />
                        <span className="font-medium">Post to Marketplace</span>
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Let verified travel agents compete to offer you the best price. 
                        Your request will be visible publicly (without your contact info).
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <Button variant="hero" size="lg" className="flex-1" disabled={loading}>
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Submit Request
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
                  <span className="font-medium">Questions about your request?</span>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Our team is here to help you find the best flight deals. Reach out anytime!
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
