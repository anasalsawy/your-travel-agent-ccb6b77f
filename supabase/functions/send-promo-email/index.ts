import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Voucher {
  airline: string;
  title: string;
  faceValue: number;
  salePrice: number;
  discount: number;
}

interface PromoEmailRequest {
  emails: string[];
  subject?: string;
  customMessage?: string;
  template?: string;
}

async function fetchVouchersFromDB(): Promise<Voucher[]> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase
    .from("vouchers")
    .select("airline, title, face_value, sale_price, discount_percent")
    .eq("status", "available")
    .order("face_value", { ascending: false })
    .limit(4);

  if (error || !data || data.length === 0) {
    console.error("Failed to fetch vouchers:", error);
    return [];
  }

  return data.map((v: any) => ({
    airline: v.airline,
    title: v.title,
    faceValue: Number(v.face_value),
    salePrice: Number(v.sale_price),
    discount: Math.round(Number(v.discount_percent)),
  }));
}

function generateVoucherHTML(voucher: Voucher): string {
  return `
    <tr>
      <td style="padding: 10px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 12px; border: 1px solid #2d3748;">
          <tr>
            <td style="padding: 20px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <h3 style="color: #f8b500; margin: 0 0 8px 0; font-size: 18px; font-weight: 600;">${voucher.airline}</h3>
                    <p style="color: #a0aec0; margin: 0; font-size: 14px;">${voucher.title}</p>
                  </td>
                  <td align="right">
                    <span style="background: linear-gradient(135deg, #f8b500, #ffa500); color: #000; padding: 6px 12px; border-radius: 20px; font-weight: bold; font-size: 14px; display: inline-block;">
                      ${voucher.discount}% OFF
                    </span>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top: 16px;">
                    <span style="color: #718096; text-decoration: line-through; font-size: 16px;">$${voucher.faceValue.toLocaleString()}</span>
                    <span style="color: #48bb78; font-size: 24px; font-weight: bold; margin-left: 12px;">$${voucher.salePrice.toLocaleString()}</span>
                    <span style="color: #48bb78; font-size: 14px; float: right; margin-top: 8px;">Save $${(voucher.faceValue - voucher.salePrice).toLocaleString()}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

function generateFlashVoucherHTML(voucher: Voucher): string {
  return `
    <tr>
      <td style="padding: 8px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background: #1a1a2e; border-radius: 10px; border-left: 4px solid #ff6b6b;">
          <tr>
            <td style="padding: 16px;">
              <h3 style="color: #f8b500; margin: 0 0 4px 0; font-size: 16px; font-weight: 600;">⚡ ${voucher.airline} — ${voucher.title}</h3>
              <span style="color: #718096; text-decoration: line-through; font-size: 14px;">$${voucher.faceValue.toLocaleString()}</span>
              <span style="color: #48bb78; font-size: 22px; font-weight: bold; margin-left: 10px;">$${voucher.salePrice.toLocaleString()}</span>
              <span style="color: #ff6b6b; font-size: 13px; margin-left: 10px;">${voucher.discount}% OFF</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

function generateCleanVoucherHTML(voucher: Voucher): string {
  return `
    <tr>
      <td style="padding: 6px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
          <tr>
            <td style="padding: 16px;">
              <h3 style="color: #1a1a2e; margin: 0 0 4px 0; font-size: 15px; font-weight: 600;">${voucher.airline}</h3>
              <p style="color: #666; margin: 0; font-size: 13px;">${voucher.title}</p>
            </td>
            <td align="right" style="padding: 16px;">
              <span style="color: #999; text-decoration: line-through; font-size: 14px;">$${voucher.faceValue.toLocaleString()}</span><br/>
              <span style="color: #28a745; font-size: 20px; font-weight: 700;">$${voucher.salePrice.toLocaleString()}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `;
}

// ——— Template: Voucher Deals (original) ———
function generateVoucherDealsTemplate(vouchers: Voucher[], customMessage?: string): string {
  const vouchersHTML = vouchers.map(generateVoucherHTML).join("");
  return `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#0a0a0f;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0f;padding:40px 20px;"><tr><td align="center">
<table width="100%" style="max-width:600px;background:linear-gradient(180deg,#13131a,#0d0d12);border-radius:16px;overflow:hidden;border:1px solid #1f2937;">
  <tr><td style="padding:40px 30px 20px;text-align:center;background:linear-gradient(135deg,#1a1a2e,#0f0f1a);">
    <div style="width:60px;height:60px;background:linear-gradient(135deg,#f8b500,#ffa500);border-radius:50%;margin:0 auto 16px;text-align:center;line-height:60px;"><span style="font-size:28px;">✈️</span></div>
    <h1 style="color:#fff;margin:0 0 8px;font-size:28px;font-weight:700;">Your Travel Agent</h1>
    <p style="color:#f8b500;margin:0;font-size:14px;letter-spacing:1px;">EXCLUSIVE VOUCHER DEALS</p>
  </td></tr>
  <tr><td style="padding:30px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="text-align:center;padding-bottom:30px;">
        <h2 style="color:#fff;margin:0 0 12px;font-size:24px;">Save Big on Flights! ✨</h2>
        <p style="color:#a0aec0;margin:0;font-size:16px;line-height:1.6;">${customMessage || "Don't miss these incredible deals on verified airline vouchers. Use them for any flight booking and save big on your next adventure!"}</p>
      </td></tr>
      ${vouchersHTML}
      <tr><td style="text-align:center;padding-top:32px;"><a href="https://your-travel-agent.lovable.app/vouchers" style="display:inline-block;background:linear-gradient(135deg,#f8b500,#ffa500);color:#000;padding:16px 40px;border-radius:30px;text-decoration:none;font-weight:600;font-size:16px;">Browse All Vouchers →</a></td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 30px 30px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#2d1f4e,#1a1a2e);border-radius:12px;border:1px solid #4c3a70;">
      <tr><td style="padding:24px;text-align:center;">
        <div style="width:50px;height:50px;background:linear-gradient(135deg,#8b5cf6,#a855f7);border-radius:50%;margin:0 auto 12px;text-align:center;line-height:50px;"><span style="font-size:24px;font-weight:bold;color:#fff;">M</span></div>
        <h3 style="color:#fff;margin:0 0 8px;font-size:18px;">Need Help? Chat with Maya</h3>
        <p style="color:#a0aec0;margin:0 0 16px;font-size:14px;">Our AI travel agent finds the best deals and books tickets for you</p>
        <a href="https://your-travel-agent.lovable.app" style="display:inline-block;background:rgba(139,92,246,0.2);color:#a855f7;padding:10px 24px;border-radius:20px;text-decoration:none;font-weight:500;font-size:14px;border:1px solid #8b5cf6;">Chat with Maya →</a>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:24px 30px;text-align:center;border-top:1px solid #1f2937;">
    <p style="color:#4a5568;margin:0 0 8px;font-size:12px;">© 2025 Your Travel Agent. All rights reserved.</p>
    <p style="color:#4a5568;margin:0;font-size:11px;"><a href="https://your-travel-agent.lovable.app/privacy" style="color:#718096;text-decoration:none;">Privacy Policy</a> · <a href="https://your-travel-agent.lovable.app/terms" style="color:#718096;text-decoration:none;">Terms of Service</a></p>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

// ——— Template: Flash Sale ———
function generateFlashSaleTemplate(vouchers: Voucher[], customMessage?: string): string {
  const vouchersHTML = vouchers.map(generateFlashVoucherHTML).join("");
  return `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#0a0a0f;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0f;padding:40px 20px;"><tr><td align="center">
<table width="100%" style="max-width:600px;background:linear-gradient(135deg,#1a0a2e,#0a0a1a);border-radius:16px;overflow:hidden;border:1px solid #2d1f4e;">
  <tr><td style="padding:40px 30px 20px;text-align:center;">
    <span style="font-size:48px;">🔥</span>
    <h1 style="color:#ff6b6b;margin:12px 0 4px;font-size:32px;font-weight:800;text-transform:uppercase;">Flash Sale</h1>
    <p style="color:#ffa500;margin:0;font-size:16px;font-weight:600;">LIMITED TIME ONLY</p>
  </td></tr>
  <tr><td style="padding:0 30px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,107,107,0.1);border:2px dashed #ff6b6b;border-radius:12px;">
      <tr><td style="padding:24px;text-align:center;">
        <p style="color:#ff6b6b;font-size:24px;font-weight:800;margin:0;">HUGE SAVINGS ON VOUCHERS</p>
        <p style="color:#a0aec0;font-size:14px;margin:10px 0 0;">${customMessage || "Grab these deals before they're gone! Verified airline vouchers at unbeatable prices."}</p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:20px 30px;">
    <table width="100%" cellpadding="0" cellspacing="0">${vouchersHTML}</table>
  </td></tr>
  <tr><td style="padding:0 30px 30px;text-align:center;">
    <a href="https://your-travel-agent.lovable.app/vouchers" style="display:inline-block;background:linear-gradient(135deg,#ff6b6b,#ff4757);color:#fff;padding:16px 40px;border-radius:30px;text-decoration:none;font-weight:700;font-size:16px;">🔥 Grab the Deal →</a>
  </td></tr>
  <tr><td style="padding:24px 30px;text-align:center;border-top:1px solid #2d1f4e;">
    <p style="color:#4a5568;margin:0;font-size:12px;">© 2025 Your Travel Agent</p>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

// ——— Template: Simple & Clean ———
function generateSimpleCleanTemplate(vouchers: Voucher[], customMessage?: string): string {
  const vouchersHTML = vouchers.map(generateCleanVoucherHTML).join("");
  return `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f5f5f5;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 20px;"><tr><td align="center">
<table width="100%" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <tr><td style="padding:32px 30px 16px;text-align:center;border-bottom:2px solid #f0f0f0;">
    <h1 style="color:#1a1a2e;margin:0;font-size:24px;font-weight:700;">Your Travel Agent</h1>
  </td></tr>
  <tr><td style="padding:30px;">
    <h2 style="color:#1a1a2e;margin:0 0 12px;font-size:20px;">Great Deals on Airline Vouchers</h2>
    <p style="color:#666;font-size:15px;line-height:1.6;">${customMessage || "We have some amazing verified airline vouchers available. Take a look at our latest deals below."}</p>
  </td></tr>
  <tr><td style="padding:0 30px;">
    <table width="100%" cellpadding="0" cellspacing="0">${vouchersHTML}</table>
  </td></tr>
  <tr><td style="padding:30px;text-align:center;">
    <a href="https://your-travel-agent.lovable.app/vouchers" style="display:inline-block;background:#1a1a2e;color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">View All Deals →</a>
  </td></tr>
  <tr><td style="padding:20px 30px;text-align:center;border-top:1px solid #e9ecef;">
    <p style="color:#999;margin:0;font-size:12px;">© 2025 Your Travel Agent · <a href="https://your-travel-agent.lovable.app/privacy" style="color:#999;text-decoration:none;">Privacy</a> · <a href="https://your-travel-agent.lovable.app/terms" style="color:#999;text-decoration:none;">Terms</a></p>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

// ——— Template: Maya Personal ———
function generateMayaPersonalTemplate(vouchers: Voucher[], customMessage?: string): string {
  const vouchersHTML = vouchers.map(generateVoucherHTML).join("");
  return `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#0a0a0f;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0f;padding:40px 20px;"><tr><td align="center">
<table width="100%" style="max-width:600px;background:linear-gradient(180deg,#13131a,#1a1028);border-radius:16px;overflow:hidden;border:1px solid #2d1f4e;">
  <tr><td style="padding:40px 30px 20px;text-align:center;">
    <div style="width:70px;height:70px;background:linear-gradient(135deg,#8b5cf6,#a855f7);border-radius:50%;margin:0 auto 16px;text-align:center;line-height:70px;"><span style="font-size:32px;font-weight:bold;color:#fff;">M</span></div>
    <h1 style="color:#fff;margin:0 0 4px;font-size:24px;">A Note from Maya</h1>
    <p style="color:#a855f7;margin:0;font-size:13px;letter-spacing:1px;">YOUR AI TRAVEL ASSISTANT</p>
  </td></tr>
  <tr><td style="padding:0 30px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(139,92,246,0.1);border:1px solid #4c3a70;border-radius:12px;">
      <tr><td style="padding:24px;">
        <p style="color:#e2d9f3;font-size:15px;line-height:1.7;margin:0;font-style:italic;">"Hey! 👋 I found some amazing deals I think you'd love. These vouchers are verified and ready to use — and I can help you book the perfect flight with them!"</p>
        ${customMessage ? `<p style="color:#a0aec0;font-size:14px;margin:12px 0 0;">${customMessage}</p>` : ""}
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 30px;">
    <table width="100%" cellpadding="0" cellspacing="0">${vouchersHTML}</table>
  </td></tr>
  <tr><td style="padding:30px;text-align:center;">
    <a href="https://your-travel-agent.lovable.app" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#a855f7);color:#fff;padding:16px 40px;border-radius:30px;text-decoration:none;font-weight:600;font-size:16px;">Chat with Maya →</a>
  </td></tr>
  <tr><td style="padding:24px 30px;text-align:center;border-top:1px solid #2d1f4e;">
    <p style="color:#4a5568;margin:0;font-size:12px;">© 2025 Your Travel Agent · <a href="https://your-travel-agent.lovable.app/privacy" style="color:#718096;text-decoration:none;">Privacy</a> · <a href="https://your-travel-agent.lovable.app/terms" style="color:#718096;text-decoration:none;">Terms</a></p>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

// ——— Template: Lowest Price Ad ———
function generateLowestPriceAdTemplate(_vouchers: Voucher[], customMessage?: string): string {
  const routes = [
    { route: "Manila → Los Angeles (MNL–LAX)", market: 1200, ours: 480 },
    { route: "Seattle → Phoenix (SEA–PHX)", market: 380, ours: 152 },
    { route: "New York → London (JFK–LHR)", market: 950, ours: 380 },
    { route: "Los Angeles → Tokyo (LAX–NRT)", market: 1400, ours: 560 },
    { route: "Chicago → Miami (ORD–MIA)", market: 320, ours: 128 },
    { route: "San Francisco → Honolulu (SFO–HNL)", market: 580, ours: 232 },
  ];

  const routesHTML = routes.map(r => `
    <tr>
      <td style="padding: 8px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #1a1a2e, #16213e); border-radius: 10px; border: 1px solid #2d3748;">
          <tr>
            <td style="padding: 16px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td><h3 style="color: #fff; margin: 0; font-size: 15px; font-weight: 600;">✈️ ${r.route}</h3></td>
                </tr>
                <tr>
                  <td style="padding-top: 10px;">
                    <span style="color: #718096; text-decoration: line-through; font-size: 16px;">$${r.market.toLocaleString()}</span>
                    <span style="color: #48bb78; font-size: 24px; font-weight: bold; margin-left: 12px;">$${r.ours.toLocaleString()}</span>
                    <span style="color: #48bb78; font-size: 13px; float: right; margin-top: 8px;">Save $${(r.market - r.ours).toLocaleString()}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join("");

  return `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#0a0a0f;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0f;padding:40px 20px;"><tr><td align="center">
<table width="100%" style="max-width:600px;background:linear-gradient(180deg,#0a0a14,#0f1628);border-radius:16px;overflow:hidden;border:1px solid #1f2937;">
  <tr><td style="padding:40px 30px 20px;text-align:center;background:linear-gradient(135deg,#0f1628,#0a0a14);">
    <div style="font-size:48px;margin-bottom:12px;">✈️</div>
    <h1 style="color:#fff;margin:0 0 8px;font-size:28px;font-weight:800;">Your Travel Agent</h1>
    <p style="color:#48bb78;margin:0;font-size:13px;letter-spacing:1px;font-weight:600;">VERIFIED & TRUSTED SINCE 2020</p>
  </td></tr>

  <tr><td style="padding:30px 30px 10px;text-align:center;">
    <h2 style="color:#fff;margin:0 0 8px;font-size:26px;font-weight:800;">Lowest Flight Prices Guaranteed</h2>
    <p style="color:#ffa500;font-size:18px;font-weight:600;margin:0 0 12px;">Tell us the lowest offer you found — we will beat it.</p>
    <p style="color:#a0aec0;margin:0;font-size:15px;line-height:1.6;">${customMessage || "We work directly with airlines and use exclusive deals to get you flights at prices you won't find anywhere else."}</p>
  </td></tr>

  <tr><td style="padding:20px 30px 10px;text-align:center;">
    <p style="color:#a0aec0;font-size:12px;letter-spacing:2px;margin:0;">POPULAR ROUTES — REAL SAVINGS</p>
  </td></tr>

  <tr><td style="padding:0 30px;">
    <table width="100%" cellpadding="0" cellspacing="0">${routesHTML}</table>
  </td></tr>

  <tr><td style="padding:10px 30px;text-align:center;">
    <p style="color:#a0aec0;margin:0;font-size:14px;">Don't see your route? We cover <span style="color:#fff;font-weight:600;">every airline and destination worldwide.</span></p>
  </td></tr>

  <tr><td style="text-align:center;padding:24px 30px;">
    <a href="https://your-travel-agent.lovable.app/request-ticket" style="display:inline-block;background:linear-gradient(135deg,#48bb78,#38a169);color:#fff;padding:16px 40px;border-radius:30px;text-decoration:none;font-weight:700;font-size:16px;">Submit Travel Request →</a>
  </td></tr>

  <tr><td style="padding:0 30px 20px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:12px;border:1px solid #2d3748;">
      <tr><td style="padding:20px;text-align:center;">
        <p style="color:#a0aec0;font-size:12px;letter-spacing:1px;margin:0 0 12px;">ACCEPTED PAYMENT METHODS</p>
        <p style="color:#fff;font-size:15px;margin:0;">💳 Card &nbsp;&nbsp;·&nbsp;&nbsp; 🏦 Zelle &nbsp;&nbsp;·&nbsp;&nbsp; 🅿️ PayPal &nbsp;&nbsp;·&nbsp;&nbsp; ₿ Crypto</p>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:0 30px 30px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#2d1f4e,#1a1a2e);border-radius:12px;border:1px solid #4c3a70;">
      <tr><td style="padding:20px;text-align:center;">
        <div style="width:50px;height:50px;background:linear-gradient(135deg,#8b5cf6,#a855f7);border-radius:50%;margin:0 auto 12px;text-align:center;line-height:50px;"><span style="font-size:24px;font-weight:bold;color:#fff;">M</span></div>
        <h3 style="color:#fff;margin:0 0 8px;font-size:16px;">Questions? Chat with Maya</h3>
        <p style="color:#a0aec0;margin:0 0 12px;font-size:13px;">Our AI travel agent finds the best deals for you</p>
        <a href="https://your-travel-agent.lovable.app" style="display:inline-block;background:rgba(139,92,246,0.2);color:#a855f7;padding:10px 24px;border-radius:20px;text-decoration:none;font-weight:500;font-size:13px;border:1px solid #8b5cf6;">Chat with Maya →</a>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:24px 30px;text-align:center;border-top:1px solid #1f2937;">
    <p style="color:#4a5568;margin:0 0 8px;font-size:12px;">© 2025 Your Travel Agent. All rights reserved.</p>
    <p style="color:#4a5568;margin:0;font-size:11px;"><a href="https://your-travel-agent.lovable.app/privacy" style="color:#718096;text-decoration:none;">Privacy Policy</a> · <a href="https://your-travel-agent.lovable.app/terms" style="color:#718096;text-decoration:none;">Terms of Service</a></p>
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

function generateEmailHTML(vouchers: Voucher[], template: string, customMessage?: string): string {
  switch (template) {
    case "flash_sale":
      return generateFlashSaleTemplate(vouchers, customMessage);
    case "simple_clean":
      return generateSimpleCleanTemplate(vouchers, customMessage);
    case "maya_personal":
      return generateMayaPersonalTemplate(vouchers, customMessage);
    case "lowest_price_ad":
      return generateLowestPriceAdTemplate(vouchers, customMessage);
    case "voucher_deals":
    default:
      return generateVoucherDealsTemplate(vouchers, customMessage);
  }
}

async function sendEmail(to: string, subject: string, html: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Maya at Your Travel Agent <maya@your-travel-agent.co>",
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { success: false, error: errorData.message || "Failed to send email" };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { emails, subject, customMessage, template }: PromoEmailRequest = await req.json();

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return new Response(
        JSON.stringify({ error: "emails array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const selectedTemplate = template || "voucher_deals";
    const voucherList = await fetchVouchersFromDB();

    // Only require vouchers for templates that use them
    if (voucherList.length === 0 && selectedTemplate !== "lowest_price_ad") {
      return new Response(
        JSON.stringify({ error: "No available vouchers found in database" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailSubject = subject || "✈️ Exclusive: Save Big on Airline Vouchers!";
    const htmlContent = generateEmailHTML(voucherList, selectedTemplate, customMessage);

    console.log(`📧 Starting promo campaign: template=${template || "voucher_deals"}, recipients=${emails.length}`);

    const results: { email: string; success: boolean; error?: string }[] = [];

    for (const email of emails) {
      const result = await sendEmail(email, emailSubject, htmlContent);
      results.push({ email, ...result });

      if (result.success) {
        console.log(`✅ Email sent to ${email}`);
      } else {
        console.error(`❌ Failed to send to ${email}:`, result.error);
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`📧 Promo email campaign complete: ${successCount} sent, ${failCount} failed`);

    return new Response(
      JSON.stringify({ success: true, sent: successCount, failed: failCount, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-promo-email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
