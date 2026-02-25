import { useState } from "react";
import { MobileAdminLayout } from "@/components/mobile-admin/MobileAdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Send, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function MobileSendQuote() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("Your Flight Quote from Your Travel Agent");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);

    try {
      // Convert plain text body to HTML paragraphs
      const htmlBody = body
        .split("\n")
        .map((line) => (line.trim() ? `<p style="margin:0 0 8px 0;">${line}</p>` : "<br/>"))
        .join("");

      const { error } = await supabase.functions.invoke("send-notification", {
        body: {
          type: "test_email",
          to,
          customSubject: subject,
          customHtml: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0a1628; color: #e2e8f0; border-radius: 12px;">
              <div style="border-bottom: 2px solid #1e3a5f; padding-bottom: 16px; margin-bottom: 20px;">
                <h2 style="color: #60a5fa; margin: 0;">✈️ Your Travel Agent</h2>
              </div>
              ${htmlBody}
              <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #1e3a5f; font-size: 12px; color: #64748b;">
                <p>Your Travel Agent Team</p>
              </div>
            </div>
          `,
        },
      });

      if (error) throw error;
      setSent(true);
      toast.success("Quote sent!");
    } catch (err: any) {
      toast.error(err.message || "Failed to send");
    }
    setSending(false);
  };

  if (sent) {
    return (
      <MobileAdminLayout title="Send Quote">
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4 px-6">
          <CheckCircle className="w-16 h-16 text-success" />
          <p className="text-lg font-semibold">Quote Sent!</p>
          <p className="text-sm text-muted-foreground text-center">Delivered to {to}</p>
          <Button onClick={() => { setSent(false); setTo(""); setBody(""); }} variant="outline" className="rounded-xl mt-4">
            Send Another
          </Button>
        </div>
      </MobileAdminLayout>
    );
  }

  return (
    <MobileAdminLayout title="Send Quote">
      <form onSubmit={handleSend} className="px-4 pt-4 space-y-4">
        <div>
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input
            type="email"
            placeholder="customer@email.com"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
            className="bg-secondary/50 border-border/30 rounded-xl"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Subject</Label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            className="bg-secondary/50 border-border/30 rounded-xl"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Quote Body</Label>
          <Textarea
            placeholder="Type your quote details here... Each line becomes a paragraph."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={12}
            className="bg-secondary/50 border-border/30 rounded-xl resize-none"
          />
        </div>
        <Button type="submit" disabled={sending} className="w-full h-12 rounded-xl text-base gap-2">
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          Send Quote
        </Button>
      </form>
    </MobileAdminLayout>
  );
}
