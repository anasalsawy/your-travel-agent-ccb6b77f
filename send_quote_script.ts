
import { sendCustomQuote } from "./src/lib/notifications";

async function run() {
  const email = "leemai2000@gmail.com";
  const quoteHtml = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #1a365d; color: #ffffff; padding: 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">Flight Quote</h1>
      </div>
      <div style="padding: 20px;">
        <p>Hi Lee Mai,</p>
        <p>For the originally requested route departing from Chattanooga (CHA), we were unable to find suitable Premium Economy options within the required travel time. However, we identified excellent availability from Atlanta (ATL), approximately a 2-hour drive from Chattanooga, with significantly better international connections.</p>
        <p>Below are the Premium Economy options available within your April 16 – May 1 (±2 days) window, all under 30 hours total travel time:</p>
        
        <div style="border-top: 2px solid #1a365d; margin: 20px 0; padding-top: 10px;">
          <h3 style="color: #1a365d; margin-bottom: 5px;">✈️ Option 1 – Qatar Airways</h3>
          <p style="margin: 5px 0;">ATL → DOH → SGN</p>
          <p style="margin: 5px 0;">Approx. 26 hours total travel time</p>
          <p style="font-size: 18px; font-weight: bold; color: #2c5282;">💰 $677.25 per person roundtrip</p>
          <p style="margin: 5px 0;">Total for 4 Adults: $2,709</p>
        </div>

        <div style="border-top: 1px solid #e0e0e0; margin: 20px 0; padding-top: 10px;">
          <h3 style="color: #1a365d; margin-bottom: 5px;">✈️ Option 2 – Korean Air</h3>
          <p style="margin: 5px 0;">ATL → ICN → SGN</p>
          <p style="margin: 5px 0;">Approx. 24–27 hours total travel time</p>
          <p style="font-size: 18px; font-weight: bold; color: #2c5282;">💰 $713.25 per person roundtrip</p>
          <p style="margin: 5px 0;">Total for 4 Adults: $2,853</p>
        </div>

        <div style="border-top: 1px solid #e0e0e0; margin: 20px 0; padding-top: 10px;">
          <h3 style="color: #1a365d; margin-bottom: 5px;">✈️ Option 3 – Japan Airlines</h3>
          <p style="margin: 5px 0;">ATL → NRT → SGN</p>
          <p style="margin: 5px 0;">Approx. 27 hours total travel time</p>
          <p style="font-size: 18px; font-weight: bold; color: #2c5282;">💰 $970.65 per person roundtrip</p>
          <p style="margin: 5px 0;">Total for 4 Adults: $3,882.60</p>
        </div>

        <div style="border-top: 1px solid #e0e0e0; margin: 20px 0; padding-top: 10px;">
          <h3 style="color: #1a365d; margin-bottom: 5px;">✈️ Option 4 – Alternate Premium Routing</h3>
          <p style="margin: 5px 0;">ATL → Asia Hub → SGN</p>
          <p style="font-size: 18px; font-weight: bold; color: #2c5282;">💰 $1,003.95 per person roundtrip</p>
          <p style="margin: 5px 0;">Total for 4 Adults: $4,015.80</p>
        </div>

        <p style="margin-top: 20px;">All options include Premium Economy seating on the long-haul international segments.</p>
        <p>Please let us know which routing you prefer and we will secure the seats immediately, as availability is limited.</p>
        
        <p style="margin-top: 30px;">Thank you,<br><strong>Your Travel Agent Team</strong></p>
      </div>
      <div style="background-color: #f7fafc; padding: 15px; text-align: center; font-size: 12px; color: #718096; border-top: 1px solid #e0e0e0;">
        <p>You received this email as part of your ticket request with Your Travel Agent.</p>
      </div>
    </div>
  `;

  console.log("Sending custom quote email...");
  const result = await sendCustomQuote(email, {
    subject: "Flight Quote: ATL to SGN (Ho Chi Minh City)",
    html: quoteHtml
  });

  if (result.success) {
    console.log("Email sent successfully!");
  } else {
    console.error("Failed to send email:", result.error);
  }
}

run();
