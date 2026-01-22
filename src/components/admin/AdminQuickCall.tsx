import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, Loader2, CheckCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CallBrief {
  // Who we're calling
  company: string;
  department: string;
  
  // Why we're calling
  callType: string;
  primaryObjective: string;
  
  // Passenger/Customer details
  passengerName: string;
  confirmationNumber: string;
  ticketNumber: string;
  
  // Flight/Travel details
  flightDate: string;
  flightNumber: string;
  origin: string;
  destination: string;
  
  // Issue details
  issueDescription: string;
  
  // Desired outcomes
  desiredOutcome: string;
  fallbackOptions: string;
  
  // Authority & limits
  authorizedActions: string;
  budgetLimit: string;
  
  // Additional context
  additionalNotes: string;
  
  // Payment details
  cardNumber: string;
  cardExpiry: string;
  cardCvv: string;
  cardholderName: string;
  billingStreet: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  billingCountry: string;
}

const CALL_TYPES = [
  { value: "rebooking", label: "Rebooking / Reschedule" },
  { value: "refund", label: "Refund Request" },
  { value: "missed_flight", label: "Missed Flight Inquiry" },
  { value: "cancellation", label: "Cancellation" },
  { value: "status_check", label: "Booking Status Check" },
  { value: "name_change", label: "Name Change" },
  { value: "upgrade", label: "Upgrade Request" },
  { value: "complaint", label: "File Complaint" },
  { value: "special_request", label: "Special Request" },
  { value: "other", label: "Other Inquiry" },
];

const COMMON_AIRLINES = [
  { value: "air_france", label: "Air France", phone: "+1-800-237-2747" },
  { value: "delta", label: "Delta Airlines", phone: "+1-800-221-1212" },
  { value: "united", label: "United Airlines", phone: "+1-800-864-8331" },
  { value: "american", label: "American Airlines", phone: "+1-800-433-7300" },
  { value: "british_airways", label: "British Airways", phone: "+1-800-247-9297" },
  { value: "lufthansa", label: "Lufthansa", phone: "+1-800-645-3880" },
  { value: "emirates", label: "Emirates", phone: "+1-800-777-3999" },
  { value: "qatar", label: "Qatar Airways", phone: "+1-877-777-2827" },
  { value: "turkish", label: "Turkish Airlines", phone: "+1-800-874-8875" },
  { value: "other", label: "Other (Enter Number)", phone: "" },
];

export function AdminQuickCall() {
  const [phoneNumber, setPhoneNumber] = useState("+1-800-237-2747");
  const [pin, setPin] = useState("");
  const [calling, setCalling] = useState(false);
  const [callResult, setCallResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { toast } = useToast();

  const [brief, setBrief] = useState<CallBrief>({
    company: "Air France",
    department: "Customer Service",
    callType: "missed_flight",
    primaryObjective: "",
    passengerName: "",
    confirmationNumber: "",
    ticketNumber: "",
    flightDate: "",
    flightNumber: "",
    origin: "",
    destination: "",
    issueDescription: "",
    desiredOutcome: "",
    fallbackOptions: "",
    authorizedActions: "Rebook on any available flight, accept travel voucher, request refund",
    budgetLimit: "",
    additionalNotes: "",
    cardNumber: "",
    cardExpiry: "",
    cardCvv: "",
    cardholderName: "",
    billingStreet: "",
    billingCity: "",
    billingState: "",
    billingZip: "",
    billingCountry: "USA",
  });

  const updateBrief = (field: keyof CallBrief, value: string) => {
    setBrief((prev) => ({ ...prev, [field]: value }));
  };

  const handleAirlineChange = (value: string) => {
    const airline = COMMON_AIRLINES.find((a) => a.value === value);
    if (airline) {
      updateBrief("company", airline.label);
      if (airline.phone) {
        setPhoneNumber(airline.phone);
      }
    }
  };

  const buildFullContext = (): string => {
    const sections: string[] = [];

    // Identity & Authority
    sections.push(`
=== MAYA'S IDENTITY & AUTHORITY ===
You are Maya, a senior travel agent calling on behalf of "Your Travel Agent" agency.
You have FULL AUTHORITY to act on behalf of the customer.
You are professional, confident, and persistent. You do NOT give up easily.
You take detailed mental notes of everything said during the call.`);

    // Mission
    sections.push(`
=== PRIMARY MISSION ===
Company: ${brief.company}
Department: ${brief.department}
Call Type: ${CALL_TYPES.find((t) => t.value === brief.callType)?.label || brief.callType}
Primary Objective: ${brief.primaryObjective || "Resolve the customer's travel issue"}`);

    // Passenger Details
    if (brief.passengerName || brief.confirmationNumber || brief.ticketNumber) {
      sections.push(`
=== PASSENGER/BOOKING DETAILS ===
${brief.passengerName ? `Passenger Name: ${brief.passengerName}` : ""}
${brief.confirmationNumber ? `Confirmation/PNR: ${brief.confirmationNumber}` : ""}
${brief.ticketNumber ? `Ticket Number: ${brief.ticketNumber}` : ""}`);
    }

    // Flight Details
    if (brief.flightDate || brief.flightNumber || brief.origin || brief.destination) {
      sections.push(`
=== FLIGHT/TRAVEL DETAILS ===
${brief.flightDate ? `Date: ${brief.flightDate}` : ""}
${brief.flightNumber ? `Flight Number: ${brief.flightNumber}` : ""}
${brief.origin ? `Origin: ${brief.origin}` : ""}
${brief.destination ? `Destination: ${brief.destination}` : ""}`);
    }

    // Issue Description
    if (brief.issueDescription) {
      sections.push(`
=== ISSUE DESCRIPTION ===
${brief.issueDescription}`);
    }

    // Desired Outcomes
    sections.push(`
=== DESIRED OUTCOMES (in priority order) ===
Primary: ${brief.desiredOutcome || "Get the best available resolution"}
${brief.fallbackOptions ? `Fallback Options: ${brief.fallbackOptions}` : "Fallback: Accept reasonable alternatives offered by the airline"}`);

    // Authority & Limits
    sections.push(`
=== AUTHORIZED ACTIONS ===
${brief.authorizedActions || "Full authority to negotiate and accept reasonable solutions"}
${brief.budgetLimit ? `Budget Limit: ${brief.budgetLimit}` : "No specific budget limit - use judgment"}`);

    // Payment Details
    if (brief.cardNumber) {
      sections.push(`
=== PAYMENT DETAILS (FOR BOOKING) ===
You have authorization to use the following payment method to complete the booking:
Cardholder Name: ${brief.cardholderName || brief.passengerName}
Card Number: ${brief.cardNumber} (read in 4-digit groups, use NATO phonetics for confirmation)
Expiry: ${brief.cardExpiry}
CVV: ${brief.cardCvv}
Billing Address: ${brief.billingStreet}, ${brief.billingCity}, ${brief.billingState} ${brief.billingZip}, ${brief.billingCountry}

IMPORTANT: When providing card details:
- Read card number in groups of 4 digits, pausing between each group
- Spell out the cardholder name using NATO phonetic alphabet
- Confirm each detail after the agent reads it back
- Ask for a confirmation number once payment is processed`);
    }

    // Behavior Instructions
    sections.push(`
=== CRITICAL BEHAVIOR RULES ===
1. PERSISTENCE: If put on hold, WAIT PATIENTLY. Do NOT hang up. Wait up to 30 minutes if needed.
2. TRANSFERS: When transferred, always re-explain the situation from the beginning.
3. ESCALATION: If the first agent can't help, politely ask to speak with a supervisor.
4. NOTES: Keep track of agent names, reference numbers, and everything promised.
5. DOCUMENTATION: Request confirmation emails or reference numbers for any changes.
6. POLITENESS: Always be polite but firm. Thank agents for their help.
7. CLARITY: Speak clearly and confirm important details by repeating them back.
8. PATIENCE: If dealing with automated systems, navigate carefully. Press 0 for human if stuck.
9. VERIFICATION: Confirm spelling of names, dates, and flight numbers.
10. SUMMARY: At the end, summarize what was agreed upon and next steps.`);

    // Additional Notes
    if (brief.additionalNotes) {
      sections.push(`
=== ADDITIONAL NOTES FROM ADMIN ===
${brief.additionalNotes}`);
    }

    // Closing Instructions
    sections.push(`
=== AFTER THE CALL ===
After the call ends, be prepared to provide a complete summary of:
- Who you spoke with (name, department)
- What was discussed
- What actions were taken or promised
- Reference/confirmation numbers obtained
- Next steps required
- Any follow-up needed`);

    return sections.join("\n").trim();
  };

  const buildFirstMessage = (): string => {
    let message = `Hello, this is Maya calling on behalf of Your Travel Agent. `;
    
    if (brief.callType === "missed_flight") {
      message += `I'm calling regarding a missed flight for one of our customers. `;
    } else if (brief.callType === "rebooking") {
      message += `I'm calling to request a rebooking for one of our customers. `;
    } else if (brief.callType === "refund") {
      message += `I'm calling to inquire about a refund for one of our customers. `;
    } else if (brief.callType === "cancellation") {
      message += `I'm calling to process a cancellation for one of our customers. `;
    } else {
      message += `I'm calling regarding a booking matter for one of our customers. `;
    }

    if (brief.passengerName) {
      message += `The passenger name is ${brief.passengerName}. `;
    }

    if (brief.confirmationNumber) {
      message += `The confirmation number is ${brief.confirmationNumber}. `;
    }

    message += `Could you please help me with this?`;

    return message;
  };

  const handleCall = async () => {
    if (!phoneNumber || !pin) {
      toast({
        title: "Missing Information",
        description: "Please fill in phone number and PIN",
        variant: "destructive",
      });
      return;
    }

    setCalling(true);
    setCallResult(null);

    try {
      const correctPin = "1234";
      if (pin !== correctPin) {
        setCallResult({
          success: false,
          message: "Invalid PIN. Access denied.",
        });
        setCalling(false);
        return;
      }

      const fullContext = buildFullContext();
      const firstMessage = buildFirstMessage();

      console.log("=== CALL CONTEXT ===");
      console.log(fullContext);
      console.log("=== FIRST MESSAGE ===");
      console.log(firstMessage);

      const { data, error } = await supabase.functions.invoke("make-outbound-call", {
        body: {
          phone_number: phoneNumber.replace(/[^\d+]/g, ""),
          first_message: firstMessage,
          context: fullContext,
          use_maya_brain: true,
        },
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        setCallResult({
          success: true,
          message: `Call initiated! Call SID: ${data.call_sid}`,
        });
        toast({
          title: "Call Started!",
          description: "Maya is now calling. She has full context and authority.",
        });
      } else {
        setCallResult({
          success: false,
          message: data?.error || "Failed to initiate call",
        });
      }
    } catch (error: any) {
      console.error("Call error:", error);
      setCallResult({
        success: false,
        message: error.message || "Failed to initiate call",
      });
      toast({
        title: "Call Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCalling(false);
    }
  };

  return (
    <div className="glass-card p-6 md:p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
          <Phone className="w-5 h-5 text-green-500" />
        </div>
        <div>
          <h2 className="font-display text-xl font-semibold">Maya Outbound Call</h2>
          <p className="text-sm text-muted-foreground">
            Full-context calls with complete authority
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Quick Setup Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Airline / Company</Label>
            <Select onValueChange={handleAirlineChange} defaultValue="air_france">
              <SelectTrigger>
                <SelectValue placeholder="Select airline" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_AIRLINES.map((airline) => (
                  <SelectItem key={airline.value} value={airline.value}>
                    {airline.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Call Type</Label>
            <Select
              value={brief.callType}
              onValueChange={(v) => updateBrief("callType", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select call type" />
              </SelectTrigger>
              <SelectContent>
                {CALL_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Phone Number */}
        <div className="space-y-2">
          <Label>Phone Number</Label>
          <Input
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+1-800-237-2747"
          />
        </div>

        {/* Essential Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Passenger Name *</Label>
            <Input
              value={brief.passengerName}
              onChange={(e) => updateBrief("passengerName", e.target.value)}
              placeholder="Full name as on ticket"
            />
          </div>

          <div className="space-y-2">
            <Label>Confirmation / PNR</Label>
            <Input
              value={brief.confirmationNumber}
              onChange={(e) => updateBrief("confirmationNumber", e.target.value)}
              placeholder="e.g., ABC123"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Flight Date</Label>
            <Input
              type="date"
              value={brief.flightDate}
              onChange={(e) => updateBrief("flightDate", e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Origin</Label>
            <Input
              value={brief.origin}
              onChange={(e) => updateBrief("origin", e.target.value)}
              placeholder="e.g., JFK, New York"
            />
          </div>

          <div className="space-y-2">
            <Label>Destination</Label>
            <Input
              value={brief.destination}
              onChange={(e) => updateBrief("destination", e.target.value)}
              placeholder="e.g., CDG, Paris"
            />
          </div>
        </div>

        {/* Issue & Objective */}
        <div className="space-y-2">
          <Label>Issue Description *</Label>
          <Textarea
            value={brief.issueDescription}
            onChange={(e) => updateBrief("issueDescription", e.target.value)}
            placeholder="Describe the issue in detail. E.g., 'Passenger missed the Dec 31, 2026 flight due to a connecting delay. Need to know rebooking options, potential fees, and if any vouchers or refunds are available.'"
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label>Desired Outcome</Label>
          <Textarea
            value={brief.desiredOutcome}
            onChange={(e) => updateBrief("desiredOutcome", e.target.value)}
            placeholder="What's the ideal resolution? E.g., 'Get rebooked on the next available flight at no additional cost, or obtain a full refund if rebooking isn't possible.'"
            rows={2}
          />
        </div>

        {/* Advanced Options */}
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-between"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          Advanced Options
          {showAdvanced ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </Button>

        {showAdvanced && (
          <div className="space-y-4 border-t pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ticket Number</Label>
                <Input
                  value={brief.ticketNumber}
                  onChange={(e) => updateBrief("ticketNumber", e.target.value)}
                  placeholder="13-digit ticket number"
                />
              </div>

              <div className="space-y-2">
                <Label>Flight Number</Label>
                <Input
                  value={brief.flightNumber}
                  onChange={(e) => updateBrief("flightNumber", e.target.value)}
                  placeholder="e.g., AF123"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Fallback Options</Label>
              <Input
                value={brief.fallbackOptions}
                onChange={(e) => updateBrief("fallbackOptions", e.target.value)}
                placeholder="Acceptable alternatives if primary goal can't be achieved"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Authorized Actions</Label>
                <Input
                  value={brief.authorizedActions}
                  onChange={(e) => updateBrief("authorizedActions", e.target.value)}
                  placeholder="What Maya can agree to"
                />
              </div>

              <div className="space-y-2">
                <Label>Budget Limit</Label>
                <Input
                  value={brief.budgetLimit}
                  onChange={(e) => updateBrief("budgetLimit", e.target.value)}
                  placeholder="Max fee Maya can accept"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Additional Notes for Maya</Label>
              <Textarea
                value={brief.additionalNotes}
                onChange={(e) => updateBrief("additionalNotes", e.target.value)}
                placeholder="Any special instructions, context, or things Maya should know..."
                rows={2}
              />
            </div>

            {/* Payment Details Section */}
            <div className="border-t pt-4 mt-4">
              <h3 className="font-semibold mb-3 text-sm">Payment Details (for booking)</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cardholder Name</Label>
                  <Input
                    value={brief.cardholderName}
                    onChange={(e) => updateBrief("cardholderName", e.target.value)}
                    placeholder="Name on card"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Card Number</Label>
                  <Input
                    value={brief.cardNumber}
                    onChange={(e) => updateBrief("cardNumber", e.target.value.replace(/\D/g, "").slice(0, 16))}
                    placeholder="1234 5678 9012 3456"
                    maxLength={16}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                <div className="space-y-2">
                  <Label>Expiry (MM/YY)</Label>
                  <Input
                    value={brief.cardExpiry}
                    onChange={(e) => updateBrief("cardExpiry", e.target.value)}
                    placeholder="12/26"
                    maxLength={5}
                  />
                </div>

                <div className="space-y-2">
                  <Label>CVV</Label>
                  <Input
                    type="password"
                    value={brief.cardCvv}
                    onChange={(e) => updateBrief("cardCvv", e.target.value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="123"
                    maxLength={4}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                <div className="space-y-2">
                  <Label>Billing Street</Label>
                  <Input
                    value={brief.billingStreet}
                    onChange={(e) => updateBrief("billingStreet", e.target.value)}
                    placeholder="123 Main St"
                  />
                </div>

                <div className="space-y-2">
                  <Label>City</Label>
                  <Input
                    value={brief.billingCity}
                    onChange={(e) => updateBrief("billingCity", e.target.value)}
                    placeholder="New York"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-3">
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input
                    value={brief.billingState}
                    onChange={(e) => updateBrief("billingState", e.target.value)}
                    placeholder="NY"
                  />
                </div>

                <div className="space-y-2">
                  <Label>ZIP</Label>
                  <Input
                    value={brief.billingZip}
                    onChange={(e) => updateBrief("billingZip", e.target.value)}
                    placeholder="10001"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Country</Label>
                  <Input
                    value={brief.billingCountry}
                    onChange={(e) => updateBrief("billingCountry", e.target.value)}
                    placeholder="USA"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PIN & Call Button */}
        <div className="border-t pt-4 space-y-4">
          <div className="space-y-2">
            <Label>Owner PIN</Label>
            <Input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter your PIN"
              maxLength={4}
            />
          </div>

          {callResult && (
            <div
              className={`p-4 rounded-lg flex items-start gap-3 ${
                callResult.success
                  ? "bg-green-500/10 border border-green-500/30"
                  : "bg-destructive/10 border border-destructive/30"
              }`}
            >
              {callResult.success ? (
                <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              )}
              <p className="text-sm">{callResult.message}</p>
            </div>
          )}

          <Button
            onClick={handleCall}
            disabled={calling || !brief.passengerName}
            className="w-full gap-2"
            variant="hero"
          >
            {calling ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Initiating Call...
              </>
            ) : (
              <>
                <Phone className="w-4 h-4" />
                Call {brief.company} as Maya
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Maya will call with full context, authority, and persistence.
            She'll navigate holds, transfers, and get results.
          </p>
        </div>
      </div>
    </div>
  );
}
