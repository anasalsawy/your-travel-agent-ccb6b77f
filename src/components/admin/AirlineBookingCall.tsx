import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plane, CreditCard, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * AIRLINE BOOKING CALL - SIMPLIFIED
 * 
 * Auto-generates everything from minimal input:
 * 1. Which airline to call
 * 2. What ticket to book (route, dates, passengers)
 * 3. Payment information
 * 
 * Maya handles: IVR navigation, hold times, agent interaction, booking confirmation
 */

export interface BookingDetails {
  // Route
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  
  // Passengers
  passengers: string;
  passengerNames: string;
  
  // Class & Preferences
  cabinClass: string;
  flexibleDates: boolean;
  
  // Payment - FULL DETAILS
  cardholderName: string;
  cardNumber: string;        // Full 16-digit card number
  cardExpMonth: string;      // 2-digit month
  cardExpYear: string;       // 2 or 4 digit year
  cardCvv: string;           // 3 or 4 digit CVV
  cardType: string;
  billingAddress: string;    // Full street address
  billingCity: string;
  billingState: string;
  billingZip: string;
  billingCountry: string;
  
  // Special requests
  seatPreference: string;
  specialRequests: string;

  // Customer contact (for confirmation emails from airline)
  customerEmail: string;
  customerPhone: string;
}

export interface BatchCallRowData {
  phone_number: string;
  language: string;
  first_message: string;
  prompt: string;
  other_dyn_variable: string;
}

export interface AirlineBookingCallProps {
  /** Pre-fill booking details from a ticket request */
  initialBooking?: Partial<BookingDetails>;
  /** Pre-select airline by value (e.g., "alaska", "delta") or by name */
  initialAirline?: string;
  /** Link to a ticket request ID for call logging */
  ticketRequestId?: string;
  /** Callback when call is initiated */
  onCallStarted?: (callResult: { success: boolean; message: string; callLogId?: string }) => void;
  /** Callback to add to batch file */
  onAddToBatch?: (row: BatchCallRowData) => void;
}

export const AIRLINES = [
  { value: "alaska", label: "Alaska Airlines", phone: "+1-800-252-7522", code: "AS" },
  { value: "american", label: "American Airlines", phone: "+1-800-433-7300", code: "AA" },
  { value: "delta", label: "Delta Airlines", phone: "+1-800-221-1212", code: "DL" },
  { value: "united", label: "United Airlines", phone: "+1-800-864-8331", code: "UA" },
  { value: "southwest", label: "Southwest Airlines", phone: "+1-800-435-9792", code: "WN" },
  { value: "jetblue", label: "JetBlue Airways", phone: "+1-800-538-2583", code: "B6" },
  { value: "spirit", label: "Spirit Airlines", phone: "+1-801-401-2222", code: "NK" },
  { value: "frontier", label: "Frontier Airlines", phone: "+1-801-401-9000", code: "F9" },
  { value: "hawaiian", label: "Hawaiian Airlines", phone: "+1-800-367-5320", code: "HA" },
  { value: "air_france", label: "Air France", phone: "+1-800-237-2747", code: "AF" },
  { value: "british_airways", label: "British Airways", phone: "+1-800-247-9297", code: "BA" },
  { value: "lufthansa", label: "Lufthansa", phone: "+1-800-645-3880", code: "LH" },
  { value: "emirates", label: "Emirates", phone: "+1-800-777-3999", code: "EK" },
  { value: "qatar", label: "Qatar Airways", phone: "+1-877-777-2827", code: "QR" },
  { value: "turkish", label: "Turkish Airlines", phone: "+1-800-874-8875", code: "TK" },
  { value: "other", label: "Other Airline", phone: "", code: "" },
];

const CABIN_CLASSES = [
  { value: "economy", label: "Economy" },
  { value: "premium_economy", label: "Premium Economy" },
  { value: "business", label: "Business Class" },
  { value: "first", label: "First Class" },
];

const DEFAULT_BOOKING: BookingDetails = {
  origin: "",
  destination: "",
  departureDate: "",
  returnDate: "",
  passengers: "1",
  passengerNames: "",
  cabinClass: "economy",
  flexibleDates: false,
  cardholderName: "",
  cardNumber: "",
  cardExpMonth: "",
  cardExpYear: "",
  cardCvv: "",
  cardType: "visa",
  billingAddress: "",
  billingCity: "",
  billingState: "",
  billingZip: "",
  billingCountry: "USA",
  seatPreference: "",
  specialRequests: "",
  customerEmail: "",
  customerPhone: "",
};

export function AirlineBookingCall({ initialBooking, initialAirline, ticketRequestId, onCallStarted, onAddToBatch }: AirlineBookingCallProps = {}) {
  const [selectedAirline, setSelectedAirline] = useState<string>("");
  const [customPhone, setCustomPhone] = useState<string>("");
  const { toast } = useToast();

  const [booking, setBooking] = useState<BookingDetails>({ ...DEFAULT_BOOKING, ...initialBooking });

  // Update when initial values change (e.g., when opened with different ticket request)
  useEffect(() => {
    if (initialBooking) {
      setBooking({ ...DEFAULT_BOOKING, ...initialBooking });
    }
    if (initialAirline) {
      // Try to match by value first, then by label
      const matchedAirline = AIRLINES.find(
        a => a.value === initialAirline.toLowerCase() || 
             a.label.toLowerCase().includes(initialAirline.toLowerCase())
      );
      if (matchedAirline) {
        setSelectedAirline(matchedAirline.value);
      }
    }
  }, [initialBooking, initialAirline]);

  const updateBooking = (field: keyof BookingDetails, value: string | boolean) => {
    setBooking((prev) => ({ ...prev, [field]: value }));
  };

  const getAirline = () => AIRLINES.find((a) => a.value === selectedAirline);
  const getPhoneNumber = () => getAirline()?.phone || customPhone;

  // Build dynamic variables for ElevenLabs (no system prompt needed - it's in the agent dashboard)
  const buildDynamicVariables = () => {
    const airline = getAirline();
    const isRoundTrip = !!booking.returnDate;
    
    // Format card number into 4-digit groups
    const cardDigits = booking.cardNumber.replace(/\D/g, "");
    const cardGroup1 = cardDigits.slice(0, 4) || "____";
    const cardGroup2 = cardDigits.slice(4, 8) || "____";
    const cardGroup3 = cardDigits.slice(8, 12) || "____";
    const cardGroup4 = cardDigits.slice(12, 16) || "____";
    
    // Format expiration
    const expMonth = booking.cardExpMonth.padStart(2, "0");
    const expYear = booking.cardExpYear.length === 2 ? booking.cardExpYear : booking.cardExpYear.slice(-2);

    return {
      airline: airline?.label || "the airline",
      origin: booking.origin,
      destination: booking.destination,
      trip_type: isRoundTrip ? "Round-trip" : "One-way",
      departure_date: booking.departureDate,
      return_date: booking.returnDate || "",
      passengers: booking.passengers,
      passenger_names: booking.passengerNames || "(will provide when asked)",
      cabin_class: CABIN_CLASSES.find(c => c.value === booking.cabinClass)?.label || "Economy",
      seat_preference: booking.seatPreference || "",
      special_requests: booking.specialRequests || "",
      customer_email: booking.customerEmail || "",
      customer_phone: booking.customerPhone || "",
      card_type: booking.cardType.toUpperCase(),
      cardholder_name: booking.cardholderName,
      card_group_1: cardGroup1,
      card_group_2: cardGroup2,
      card_group_3: cardGroup3,
      card_group_4: cardGroup4,
      card_exp_month: expMonth,
      card_exp_year: expYear,
      card_cvv: booking.cardCvv || "",
      billing_address: booking.billingAddress || "",
      billing_city: booking.billingCity || "",
      billing_state: booking.billingState || "",
      billing_zip: booking.billingZip || "",
      billing_country: booking.billingCountry || "USA",
    };
  };

  const handleAddToBatch = () => {
    if (!selectedAirline) {
      toast({ title: "Select an airline first", variant: "destructive" });
      return;
    }
    if (!booking.origin || !booking.destination || !booking.departureDate) {
      toast({ title: "Fill in route and date first", variant: "destructive" });
      return;
    }

    const phoneNumber = getPhoneNumber();
    const dynamicVars = buildDynamicVariables();

    // Pass dynamic variables only - system prompt is in the ElevenLabs agent dashboard
    onAddToBatch?.({
      phone_number: phoneNumber?.replace(/[^\d+]/g, "") || "",
      language: "",
      first_message: "Hi there! This is Maya calling from Your Travel Agent. I'm looking to book a flight for one of my customers. Do you have a moment to help me with that?",
      prompt: "", // Empty - prompt is in ElevenLabs dashboard
      other_dyn_variable: JSON.stringify(dynamicVars),
    });

    toast({
      title: "Added to Batch!",
      description: `${getAirline()?.label} booking added with all variables`,
    });
  };

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
            <Plane className="w-6 h-6 text-white" />
          </div>
          <div>
            <CardTitle>Book Ticket by Phone</CardTitle>
            <CardDescription>
              Just enter airline, route, and payment - Maya handles everything else
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Step 1: Select Airline */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">1</div>
            Which airline?
          </div>
          
          <Select value={selectedAirline} onValueChange={setSelectedAirline}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="Select airline to call..." />
            </SelectTrigger>
            <SelectContent>
              {AIRLINES.map((airline) => (
                <SelectItem key={airline.value} value={airline.value}>
                  <span className="font-medium">{airline.label}</span>
                  {airline.phone && <span className="text-muted-foreground ml-2">{airline.phone}</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedAirline === "other" && (
            <Input
              value={customPhone}
              onChange={(e) => setCustomPhone(e.target.value)}
              placeholder="Enter airline phone number"
            />
          )}
        </div>

        {/* Step 2: Flight Details */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">2</div>
            What ticket?
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input
                value={booking.origin}
                onChange={(e) => updateBooking("origin", e.target.value.toUpperCase())}
                placeholder="JFK, LAX, ORD..."
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input
                value={booking.destination}
                onChange={(e) => updateBooking("destination", e.target.value.toUpperCase())}
                placeholder="MIA, SFO, LHR..."
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Departure Date</Label>
              <Input
                type="date"
                value={booking.departureDate}
                onChange={(e) => updateBooking("departureDate", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Return Date (optional)</Label>
              <Input
                type="date"
                value={booking.returnDate}
                onChange={(e) => updateBooking("returnDate", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Passengers</Label>
              <Select value={booking.passengers} onValueChange={(v) => updateBooking("passengers", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} passenger{n > 1 ? "s" : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cabin Class</Label>
              <Select value={booking.cabinClass} onValueChange={(v) => updateBooking("cabinClass", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CABIN_CLASSES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Passenger Name(s)</Label>
            <Input
              value={booking.passengerNames}
              onChange={(e) => updateBooking("passengerNames", e.target.value)}
              placeholder="John Smith, Jane Smith (as on ID)"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Customer Email (for confirmation)</Label>
              <Input
                type="email"
                value={booking.customerEmail}
                onChange={(e) => updateBooking("customerEmail", e.target.value)}
                placeholder="customer@email.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Customer Phone</Label>
              <Input
                type="tel"
                value={booking.customerPhone}
                onChange={(e) => updateBooking("customerPhone", e.target.value)}
                placeholder="+1 555-123-4567"
              />
            </div>
          </div>
        </div>

        {/* Step 3: Payment Info - FULL DETAILS */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">3</div>
            <CreditCard className="w-4 h-4" />
            Payment details (FULL - Maya will read these to the agent)
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Cardholder Name (as on card)</Label>
              <Input
                value={booking.cardholderName}
                onChange={(e) => updateBooking("cardholderName", e.target.value)}
                placeholder="JOHN A SMITH"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Card Type</Label>
              <Select value={booking.cardType} onValueChange={(v) => updateBooking("cardType", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="visa">Visa</SelectItem>
                  <SelectItem value="mastercard">Mastercard</SelectItem>
                  <SelectItem value="amex">American Express</SelectItem>
                  <SelectItem value="discover">Discover</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Full Card Number (16 digits)</Label>
            <Input
              value={booking.cardNumber}
              onChange={(e) => updateBooking("cardNumber", e.target.value.replace(/\D/g, "").slice(0, 16))}
              placeholder="4147 8923 0012 3456"
              maxLength={19}
              className="font-mono text-lg tracking-wider"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Exp Month</Label>
              <Select value={booking.cardExpMonth} onValueChange={(v) => updateBooking("cardExpMonth", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="MM" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => {
                    const month = String(i + 1).padStart(2, "0");
                    return <SelectItem key={month} value={month}>{month}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Exp Year</Label>
              <Select value={booking.cardExpYear} onValueChange={(v) => updateBooking("cardExpYear", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="YY" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => {
                    const year = String(new Date().getFullYear() + i).slice(-2);
                    return <SelectItem key={year} value={year}>{year}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CVV</Label>
              <Input
                value={booking.cardCvv}
                onChange={(e) => updateBooking("cardCvv", e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="123"
                maxLength={4}
                className="font-mono"
                type="password"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Billing Street Address</Label>
            <Input
              value={booking.billingAddress}
              onChange={(e) => updateBooking("billingAddress", e.target.value)}
              placeholder="123 Main Street, Apt 4B"
            />
          </div>

          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">City</Label>
              <Input
                value={booking.billingCity}
                onChange={(e) => updateBooking("billingCity", e.target.value)}
                placeholder="New York"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">State</Label>
              <Input
                value={booking.billingState}
                onChange={(e) => updateBooking("billingState", e.target.value.toUpperCase())}
                placeholder="NY"
                maxLength={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">ZIP</Label>
              <Input
                value={booking.billingZip}
                onChange={(e) => updateBooking("billingZip", e.target.value)}
                placeholder="10001"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Country</Label>
              <Input
                value={booking.billingCountry}
                onChange={(e) => updateBooking("billingCountry", e.target.value)}
                placeholder="USA"
              />
            </div>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <p className="text-xs text-amber-700 dark:text-amber-300">
              ⚠️ <strong>SECURE:</strong> Full card details are included in the batch file prompt so Maya can read them to the airline agent. Keep the exported file secure!
            </p>
          </div>
        </div>

        {/* Optional: Special Requests */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Special Requests (optional)</Label>
          <Textarea
            value={booking.specialRequests}
            onChange={(e) => updateBooking("specialRequests", e.target.value)}
            placeholder="Window seat, wheelchair assistance, dietary needs..."
            rows={2}
          />
        </div>

        {/* Add to Batch Button */}
        <div className="border-t pt-4 space-y-4">
          <Button
            onClick={handleAddToBatch}
            disabled={!selectedAirline || !booking.origin || !booking.destination}
            size="lg"
            className="w-full h-12"
            variant="hero"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Add to Batch File
          </Button>
        </div>

        {/* What this generates */}
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 space-y-1">
          <p className="font-medium">This generates a batch call entry with:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Full system prompt with booking details</li>
            <li>Airline phone number</li>
            <li>First message introducing the booking request</li>
            <li>IVR navigation and hold instructions</li>
            <li>Payment and confirmation handling</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
