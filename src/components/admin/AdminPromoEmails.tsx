import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Mail, Send, CheckCircle, XCircle } from "lucide-react";
import { EmailListUploader } from "./promo/EmailListUploader";
import { TemplateSelector } from "./promo/TemplateSelector";
import { EmailTemplatePreview } from "./promo/EmailTemplatePreview";

export function AdminPromoEmails() {
  const [emails, setEmails] = useState<string[]>([]);
  const [subject, setSubject] = useState("✈️ Exclusive: Save Big on Airline Vouchers!");
  const [customMessage, setCustomMessage] = useState("");
  const [template, setTemplate] = useState("voucher_deals");
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
      const emailList = text
        .split(/[;,\n\r\s]+/)
        .map((e) => e.trim())
        .filter((e) => e && e.includes("@"));
      setEmails(emailList);
    } catch (error) {
      console.error("Failed to load emails:", error);
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
          template,
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
      {/* Header card */}
      <Card className="glass-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            Promotional Email Campaign
          </CardTitle>
          <CardDescription>
            Send promotional emails featuring your discounted airline vouchers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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
            Emails will be sent from Maya via Resend API
          </p>
        </CardContent>
      </Card>

      {/* Template + Upload + Preview in grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <TemplateSelector selected={template} onSelect={setTemplate} />
          <EmailListUploader emails={emails} onEmailsChange={setEmails} />
        </div>
        <EmailTemplatePreview
          template={template}
          subject={subject}
          customMessage={customMessage}
        />
      </div>
    </div>
  );
}
