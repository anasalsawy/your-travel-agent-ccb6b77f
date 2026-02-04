import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Mail, Send, Users, CheckCircle, XCircle, Upload } from "lucide-react";

export function AdminPromoEmails() {
  const [emails, setEmails] = useState<string[]>([]);
  const [subject, setSubject] = useState("✈️ Exclusive: Save 50%+ on Alaska Airlines Vouchers!");
  const [customMessage, setCustomMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<{ sent: number; failed: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEmails();
  }, []);

  const loadEmails = async () => {
    try {
      const response = await fetch("/data/promo-emails.txt");
      const text = await response.text();
      const emailList = text.split(";").map(e => e.trim()).filter(e => e && e.includes("@"));
      setEmails(emailList);
    } catch (error) {
      console.error("Failed to load emails:", error);
      toast.error("Failed to load email list");
    } finally {
      setLoading(false);
    }
  };

  const sendPromoEmails = async () => {
    if (emails.length === 0) {
      toast.error("No emails to send to");
      return;
    }

    setSending(true);
    setResults(null);

    try {
      const { data, error } = await supabase.functions.invoke("send-promo-email", {
        body: {
          emails,
          subject,
          customMessage: customMessage || undefined,
        },
      });

      if (error) throw error;

      setResults({ sent: data.sent, failed: data.failed });
      
      if (data.sent > 0) {
        toast.success(`Successfully sent ${data.sent} promotional emails!`);
      }
      if (data.failed > 0) {
        toast.warning(`${data.failed} emails failed to send`);
      }
    } catch (error: any) {
      console.error("Error sending promo emails:", error);
      toast.error(error.message || "Failed to send promotional emails");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            Promotional Email Campaign
          </CardTitle>
          <CardDescription>
            Send promotional emails featuring your discounted Alaska Airlines vouchers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Email Stats */}
          <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 border border-border">
            <Users className="w-8 h-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{emails.length.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Email addresses loaded</p>
            </div>
          </div>

          {/* Subject Line */}
          <div className="space-y-2">
            <Label htmlFor="subject">Email Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Enter email subject..."
            />
          </div>

          {/* Custom Message */}
          <div className="space-y-2">
            <Label htmlFor="message">Custom Message (optional)</Label>
            <Textarea
              id="message"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Add a custom message to include in the email..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to use the default promotional message
            </p>
          </div>

          {/* Preview Info */}
          <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/10">
            <h4 className="font-semibold text-amber-600 mb-2">Email Preview</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Features top 4 available Alaska Airlines vouchers from your inventory</li>
              <li>• Shows 50%+ discount off market prices</li>
              <li>• Includes "Lowest Price Guaranteed" messaging</li>
              <li>• Links to your vouchers page and Chat with Maya</li>
            </ul>
          </div>

          {/* Results */}
          {results && (
            <div className="flex gap-4">
              <Badge variant="default" className="flex items-center gap-1 py-2 px-3">
                <CheckCircle className="w-4 h-4" />
                {results.sent} Sent
              </Badge>
              {results.failed > 0 && (
                <Badge variant="destructive" className="flex items-center gap-1 py-2 px-3">
                  <XCircle className="w-4 h-4" />
                  {results.failed} Failed
                </Badge>
              )}
            </div>
          )}

          {/* Send Button */}
          <Button 
            onClick={sendPromoEmails} 
            disabled={sending || emails.length === 0}
            className="w-full"
            size="lg"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending to {emails.length.toLocaleString()} recipients...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send Promotional Emails ({emails.length.toLocaleString()} recipients)
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Emails will be sent from deals@yourtravelagent.net via Resend API
          </p>
        </CardContent>
      </Card>

      {/* Email Preview List */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="text-lg">Recipient List Preview</CardTitle>
          <CardDescription>First 20 email addresses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {emails.slice(0, 20).map((email, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {email}
              </Badge>
            ))}
            {emails.length > 20 && (
              <Badge variant="outline" className="text-xs">
                +{emails.length - 20} more
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
