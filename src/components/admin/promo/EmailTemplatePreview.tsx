import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye } from "lucide-react";

interface EmailTemplatePreviewProps {
  template: string;
  subject: string;
  customMessage: string;
}

const TEMPLATE_PREVIEWS: Record<string, { name: string; preview: string }> = {
  voucher_deals: {
    name: "Voucher Deals",
    preview: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0f; color: #fff; padding: 24px; border-radius: 12px; max-height: 500px; overflow-y: auto;">
        <div style="text-align: center; padding: 20px 0;">
          <div style="font-size: 28px; margin-bottom: 8px;">✈️</div>
          <h2 style="margin: 0 0 4px; color: #fff; font-size: 20px;">Your Travel Agent</h2>
          <p style="color: #f8b500; font-size: 12px; letter-spacing: 1px; margin: 0;">EXCLUSIVE VOUCHER DEALS</p>
        </div>
        <div style="text-align: center; padding: 16px 0;">
          <h3 style="color: #fff; margin: 0 0 8px; font-size: 18px;">Save Up to 60% on Flights! ✨</h3>
          <p style="color: #a0aec0; font-size: 13px;">{{customMessage}}</p>
        </div>
        <div style="background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 10px; padding: 16px; margin: 8px 0; border: 1px solid #2d3748;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <p style="color: #f8b500; font-weight: 600; margin: 0 0 4px; font-size: 14px;">Alaska Airlines</p>
              <p style="color: #a0aec0; font-size: 12px; margin: 0;">Sample $500 Voucher</p>
            </div>
            <span style="background: linear-gradient(135deg, #f8b500, #ffa500); color: #000; padding: 4px 10px; border-radius: 20px; font-weight: bold; font-size: 12px;">60% OFF</span>
          </div>
          <div style="margin-top: 10px;">
            <span style="color: #718096; text-decoration: line-through; font-size: 14px;">$500</span>
            <span style="color: #48bb78; font-size: 20px; font-weight: bold; margin-left: 8px;">$200</span>
          </div>
        </div>
        <div style="text-align: center; padding: 20px 0;">
          <span style="background: linear-gradient(135deg, #f8b500, #ffa500); color: #000; padding: 12px 32px; border-radius: 24px; font-weight: 600; font-size: 14px; display: inline-block;">Browse All Vouchers →</span>
        </div>
        <div style="background: linear-gradient(135deg, #2d1f4e, #1a1a2e); border-radius: 10px; padding: 16px; text-align: center; border: 1px solid #4c3a70;">
          <div style="font-size: 20px; font-weight: bold; color: #a855f7; margin-bottom: 8px;">M</div>
          <p style="color: #fff; font-size: 14px; font-weight: 600; margin: 0 0 4px;">Chat with Maya</p>
          <p style="color: #a0aec0; font-size: 12px; margin: 0;">Our AI travel agent</p>
        </div>
      </div>
    `,
  },
  flash_sale: {
    name: "Flash Sale",
    preview: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: linear-gradient(135deg, #1a0a2e, #0a0a1a); color: #fff; padding: 24px; border-radius: 12px; max-height: 500px; overflow-y: auto;">
        <div style="text-align: center; padding: 20px 0;">
          <div style="font-size: 36px; margin-bottom: 8px;">🔥</div>
          <h2 style="margin: 0; color: #ff6b6b; font-size: 24px; font-weight: 800; text-transform: uppercase;">Flash Sale</h2>
          <p style="color: #ffa500; font-size: 14px; margin: 4px 0 0;">LIMITED TIME ONLY</p>
        </div>
        <div style="background: rgba(255, 107, 107, 0.1); border: 2px dashed #ff6b6b; border-radius: 12px; padding: 20px; text-align: center; margin: 16px 0;">
          <p style="color: #ff6b6b; font-size: 28px; font-weight: 800; margin: 0;">HUGE SAVINGS</p>
          <p style="color: #a0aec0; font-size: 13px; margin: 8px 0 0;">{{customMessage}}</p>
        </div>
        <div style="background: #1a1a2e; border-radius: 10px; padding: 16px; margin: 8px 0; border-left: 4px solid #ff6b6b;">
          <p style="color: #f8b500; font-weight: 600; margin: 0 0 4px; font-size: 14px;">⚡ Alaska Airlines Voucher</p>
          <div style="margin-top: 8px;">
            <span style="color: #718096; text-decoration: line-through; font-size: 14px;">$500</span>
            <span style="color: #48bb78; font-size: 20px; font-weight: bold; margin-left: 8px;">$200</span>
          </div>
        </div>
        <div style="text-align: center; padding: 20px 0;">
          <span style="background: linear-gradient(135deg, #ff6b6b, #ff4757); color: #fff; padding: 14px 36px; border-radius: 24px; font-weight: 700; font-size: 15px; display: inline-block;">🔥 Grab the Deal →</span>
        </div>
      </div>
    `,
  },
  simple_clean: {
    name: "Simple & Clean",
    preview: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #ffffff; color: #333; padding: 24px; border-radius: 12px; max-height: 500px; overflow-y: auto;">
        <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #f0f0f0;">
          <h2 style="margin: 0; color: #1a1a2e; font-size: 22px;">Your Travel Agent</h2>
        </div>
        <div style="padding: 24px 0;">
          <h3 style="color: #1a1a2e; margin: 0 0 12px; font-size: 20px;">Great Deals on Airline Vouchers</h3>
          <p style="color: #666; font-size: 14px; line-height: 1.6;">{{customMessage}}</p>
        </div>
        <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 8px 0; border: 1px solid #e9ecef;">
          <div style="display: flex; justify-content: space-between;">
            <div>
              <p style="color: #1a1a2e; font-weight: 600; margin: 0 0 4px; font-size: 15px;">Alaska Airlines</p>
              <p style="color: #666; font-size: 13px; margin: 0;">$500 Voucher</p>
            </div>
            <span style="color: #28a745; font-weight: 700; font-size: 18px;">$200</span>
          </div>
        </div>
        <div style="text-align: center; padding: 24px 0;">
          <span style="background: #1a1a2e; color: #fff; padding: 12px 32px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">View All Deals →</span>
        </div>
        <div style="text-align: center; padding-top: 16px; border-top: 1px solid #e9ecef;">
          <p style="color: #999; font-size: 11px; margin: 0;">© Your Travel Agent</p>
        </div>
      </div>
    `,
  },
  maya_personal: {
    name: "Maya Personal",
    preview: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: linear-gradient(180deg, #13131a, #1a1028); color: #fff; padding: 24px; border-radius: 12px; max-height: 500px; overflow-y: auto;">
        <div style="text-align: center; padding: 20px 0;">
          <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #8b5cf6, #a855f7); border-radius: 50%; margin: 0 auto 12px; line-height: 60px;">
            <span style="font-size: 28px; font-weight: bold; color: #fff;">M</span>
          </div>
          <h2 style="margin: 0 0 4px; color: #fff; font-size: 20px;">A Note from Maya</h2>
          <p style="color: #a855f7; font-size: 12px; margin: 0;">YOUR AI TRAVEL ASSISTANT</p>
        </div>
        <div style="background: rgba(139, 92, 246, 0.1); border: 1px solid #4c3a70; border-radius: 12px; padding: 20px; margin: 16px 0;">
          <p style="color: #e2d9f3; font-size: 14px; line-height: 1.7; margin: 0; font-style: italic;">
            "Hey! 👋 I found some amazing deals I think you'd love. I can help you book the perfect flight!"
          </p>
          <p style="color: #a0aec0; font-size: 13px; margin: 12px 0 0;">{{customMessage}}</p>
        </div>
        <div style="text-align: center; padding: 20px 0;">
          <span style="background: linear-gradient(135deg, #8b5cf6, #a855f7); color: #fff; padding: 14px 36px; border-radius: 24px; font-weight: 600; font-size: 14px; display: inline-block;">Chat with Maya →</span>
        </div>
      </div>
    `,
  },
  lowest_price_ad: {
    name: "Lowest Price Ad",
    preview: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: linear-gradient(135deg, #0a0a14, #0f1628); color: #fff; padding: 24px; border-radius: 12px; max-height: 500px; overflow-y: auto;">
        <div style="text-align: center; padding: 20px 0;">
          <div style="font-size: 36px; margin-bottom: 8px;">✈️</div>
          <h2 style="margin: 0 0 4px; color: #fff; font-size: 22px; font-weight: 800;">Your Travel Agent</h2>
          <p style="color: #48bb78; font-size: 12px; letter-spacing: 1px; margin: 4px 0 0;">VERIFIED & TRUSTED SINCE 2020</p>
        </div>
        <div style="text-align: center; padding: 16px 0;">
          <h3 style="color: #fff; margin: 0 0 6px; font-size: 20px; font-weight: 800;">Lowest Flight Prices Guaranteed</h3>
          <p style="color: #ffa500; font-size: 14px; font-weight: 600; margin: 0;">Tell us the lowest offer you found — we will beat it.</p>
          <p style="color: #a0aec0; font-size: 13px; margin: 8px 0 0;">{{customMessage}}</p>
        </div>
        <p style="color: #a0aec0; font-size: 11px; text-align: center; margin: 8px 0 12px; letter-spacing: 1px;">POPULAR ROUTES</p>
        <div style="background: #1a1a2e; border-radius: 10px; padding: 12px 16px; margin: 6px 0; border: 1px solid #2d3748;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #fff; font-size: 13px; font-weight: 600;">Manila → LAX</span>
            <div><span style="color: #718096; text-decoration: line-through; font-size: 12px;">$1,200</span> <span style="color: #48bb78; font-size: 16px; font-weight: bold; margin-left: 6px;">$480</span></div>
          </div>
        </div>
        <div style="background: #1a1a2e; border-radius: 10px; padding: 12px 16px; margin: 6px 0; border: 1px solid #2d3748;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #fff; font-size: 13px; font-weight: 600;">SEA → PHX</span>
            <div><span style="color: #718096; text-decoration: line-through; font-size: 12px;">$380</span> <span style="color: #48bb78; font-size: 16px; font-weight: bold; margin-left: 6px;">$152</span></div>
          </div>
        </div>
        <div style="background: #1a1a2e; border-radius: 10px; padding: 12px 16px; margin: 6px 0; border: 1px solid #2d3748;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: #fff; font-size: 13px; font-weight: 600;">JFK → London</span>
            <div><span style="color: #718096; text-decoration: line-through; font-size: 12px;">$950</span> <span style="color: #48bb78; font-size: 16px; font-weight: bold; margin-left: 6px;">$380</span></div>
          </div>
        </div>
        <div style="text-align: center; padding: 20px 0 8px;">
          <span style="background: linear-gradient(135deg, #48bb78, #38a169); color: #fff; padding: 12px 32px; border-radius: 24px; font-weight: 700; font-size: 14px; display: inline-block;">Submit Travel Request →</span>
        </div>
        <div style="text-align: center; padding: 12px 0;">
          <p style="color: #a0aec0; font-size: 11px; margin: 0 0 8px;">ACCEPTED PAYMENT METHODS</p>
          <p style="color: #718096; font-size: 12px; margin: 0;">💳 Card &nbsp;·&nbsp; 🏦 Zelle &nbsp;·&nbsp; 🅿️ PayPal &nbsp;·&nbsp; ₿ Crypto</p>
        </div>
      </div>
    `,
  },
};

export function EmailTemplatePreview({ template, subject, customMessage }: EmailTemplatePreviewProps) {
  const templateData = TEMPLATE_PREVIEWS[template] || TEMPLATE_PREVIEWS.voucher_deals;
  const previewHtml = templateData.preview.replace(
    /\{\{customMessage\}\}/g,
    customMessage || "Don't miss these incredible deals — we guarantee to beat any price you find!"
  );

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Eye className="w-5 h-5 text-primary" />
          Email Preview
          <Badge variant="secondary" className="ml-2">{templateData.name}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-border overflow-hidden">
          {/* Subject preview bar */}
          <div className="bg-muted/50 p-3 border-b border-border">
            <p className="text-xs text-muted-foreground mb-1">Subject</p>
            <p className="text-sm font-medium">{subject || "✈️ Exclusive Travel Deals!"}</p>
          </div>
          {/* Email body preview */}
          <div className="p-4 bg-background">
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export const TEMPLATES = Object.entries(TEMPLATE_PREVIEWS).map(([key, val]) => ({
  id: key,
  name: val.name,
}));
