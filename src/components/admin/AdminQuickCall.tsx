import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Phone, Loader2, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function AdminQuickCall() {
  const [phoneNumber, setPhoneNumber] = useState("+1-800-237-2747"); // Air France default
  const [purpose, setPurpose] = useState("");
  const [pin, setPin] = useState("");
  const [calling, setCalling] = useState(false);
  const [callResult, setCallResult] = useState<{ success: boolean; message: string } | null>(null);
  const { toast } = useToast();

  const handleCall = async () => {
    if (!phoneNumber || !purpose || !pin) {
      toast({
        title: "Missing Information",
        description: "Please fill in all fields including your PIN",
        variant: "destructive",
      });
      return;
    }

    setCalling(true);
    setCallResult(null);

    try {
      // Verify PIN first
      const correctPin = "1234"; // Same as in ai-chat
      if (pin !== correctPin) {
        setCallResult({
          success: false,
          message: "Invalid PIN. Access denied.",
        });
        setCalling(false);
        return;
      }

      // Call the make-outbound-call function directly
      // Pass purpose as first_message so Maya speaks it immediately
      // and as context so she remembers her mission throughout the call
      const { data, error } = await supabase.functions.invoke("make-outbound-call", {
        body: {
          phone_number: phoneNumber.replace(/[^\d+]/g, ""), // Clean number
          first_message: `Hi, this is Maya calling on behalf of Your Travel Agent. I'm calling to ${purpose}`,
          context: `MISSION: ${purpose}. You are Maya, calling on behalf of the travel agency. Be professional, persistent, and get the information needed. Take notes mentally and be ready to report back. Do NOT give up easily - if put on hold, wait patiently. If transferred, re-explain the situation.`,
          use_maya_brain: true, // Ensure full Maya intelligence is used
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
          description: "Maya is now calling the number. Check your phone for the conference.",
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
          <h2 className="font-display text-xl font-semibold">Quick Call (Maya)</h2>
          <p className="text-sm text-muted-foreground">
            Make outbound calls via Maya - bypasses WhatsApp
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone Number</Label>
          <Input
            id="phone"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+1-800-237-2747"
          />
          <p className="text-xs text-muted-foreground">
            Default: Air France Customer Service
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="purpose">Call Purpose</Label>
          <Textarea
            id="purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="e.g., Inquire about missed flight on Dec 31, 2026 for passenger Anas Alsawy. What are the rebooking options?"
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="pin">Owner PIN</Label>
          <Input
            id="pin"
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
          disabled={calling}
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
              Make Call via Maya
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
