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

function generateEmailHTML(vouchers: Voucher[], customMessage?: string): string {
  const vouchersHTML = vouchers.map(generateVoucherHTML).join("");
  
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Exclusive Travel Deals</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0a0a0f;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0a0a0f; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width: 600px; background: linear-gradient(180deg, #13131a 0%, #0d0d12 100%); border-radius: 16px; overflow: hidden; border: 1px solid #1f2937;">
          
          <!-- Header -->
          <tr>
            <td style="padding: 40px 30px 20px; text-align: center; background: linear-gradient(135deg, #1a1a2e 0%, #0f0f1a 100%);">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #f8b500, #ffa500); border-radius: 50%; margin: 0 auto 16px; text-align: center; line-height: 60px;">
                      <span style="font-size: 28px;">✈️</span>
                    </div>
                    <h1 style="color: #ffffff; margin: 0 0 8px 0; font-size: 28px; font-weight: 700;">Your Travel Agent</h1>
                    <p style="color: #f8b500; margin: 0; font-size: 14px; letter-spacing: 1px;">EXCLUSIVE VOUCHER DEALS</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero Section -->
          <tr>
            <td style="padding: 30px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align: center; padding-bottom: 30px;">
                    <h2 style="color: #ffffff; margin: 0 0 12px 0; font-size: 24px;">Save Up to 60% on Flights! ✨</h2>
                    <p style="color: #a0aec0; margin: 0; font-size: 16px; line-height: 1.6;">
                      ${customMessage || "Don't miss these incredible deals on verified airline vouchers. Use them for any flight booking and save big on your next adventure!"}
                    </p>
                  </td>
                </tr>

                <!-- Vouchers Grid -->
                ${vouchersHTML}

                <!-- CTA Section -->
                <tr>
                  <td style="text-align: center; padding-top: 32px;">
                    <a href="https://your-travel-agent.lovable.app/vouchers" style="display: inline-block; background: linear-gradient(135deg, #f8b500, #ffa500); color: #000; padding: 16px 40px; border-radius: 30px; text-decoration: none; font-weight: 600; font-size: 16px;">
                      Browse All Vouchers →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Maya CTA -->
          <tr>
            <td style="padding: 0 30px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #2d1f4e 0%, #1a1a2e 100%); border-radius: 12px; border: 1px solid #4c3a70;">
                <tr>
                  <td style="padding: 24px; text-align: center;">
                    <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #8b5cf6, #a855f7); border-radius: 50%; margin: 0 auto 12px; text-align: center; line-height: 50px;">
                      <span style="font-size: 24px; font-weight: bold; color: #fff;">M</span>
                    </div>
                    <h3 style="color: #ffffff; margin: 0 0 8px 0; font-size: 18px;">Need Help? Chat with Maya</h3>
                    <p style="color: #a0aec0; margin: 0 0 16px 0; font-size: 14px;">Our AI travel agent finds the best deals and books tickets for you</p>
                    <a href="https://your-travel-agent.lovable.app" style="display: inline-block; background: rgba(139, 92, 246, 0.2); color: #a855f7; padding: 10px 24px; border-radius: 20px; text-decoration: none; font-weight: 500; font-size: 14px; border: 1px solid #8b5cf6;">
                      Chat with Maya →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 30px; text-align: center; border-top: 1px solid #1f2937;">
              <p style="color: #4a5568; margin: 0 0 8px 0; font-size: 12px;">
                © 2024 Your Travel Agent. All rights reserved.
              </p>
              <p style="color: #4a5568; margin: 0; font-size: 11px;">
                <a href="https://your-travel-agent.lovable.app/privacy" style="color: #718096; text-decoration: none;">Privacy Policy</a> · 
                <a href="https://your-travel-agent.lovable.app/terms" style="color: #718096; text-decoration: none;">Terms of Service</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
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
        from: "Maya <maya@your-travel-agent.net>",
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

    const { emails, subject, customMessage }: PromoEmailRequest = await req.json();

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return new Response(
        JSON.stringify({ error: "emails array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch real vouchers from database
    const voucherList = await fetchVouchersFromDB();
    
    if (voucherList.length === 0) {
      return new Response(
        JSON.stringify({ error: "No available vouchers found in database" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailSubject = subject || "✈️ Exclusive: Save Big on Alaska Airlines Vouchers!";
    const htmlContent = generateEmailHTML(voucherList, customMessage);

    const results: { email: string; success: boolean; error?: string }[] = [];

    // Send emails with small delay to avoid rate limits
    for (const email of emails) {
      const result = await sendEmail(email, emailSubject, htmlContent);
      results.push({ email, ...result });
      
      if (result.success) {
        console.log(`✅ Email sent to ${email}`);
      } else {
        console.error(`❌ Failed to send to ${email}:`, result.error);
      }
      
      // Small delay between emails to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`📧 Promo email campaign complete: ${successCount} sent, ${failCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        failed: failCount,
        results,
      }),
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
