import type { Tables } from "@/integrations/supabase/types";

type Voucher = Tables<"vouchers">;

export function generateFacebookPost(voucher: Voucher, baseUrl: string = window.location.origin): string {
  const formatCurrency = (amount: number, currency: string = "USD") => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const faceValue = formatCurrency(Number(voucher.face_value), voucher.currency || "USD");
  const salePrice = formatCurrency(Number(voucher.sale_price), voucher.currency || "USD");
  const savings = formatCurrency(Number(voucher.face_value) - Number(voucher.sale_price), voucher.currency || "USD");
  const discount = Number(voucher.discount_percent);
  const voucherUrl = `${baseUrl}/vouchers/${voucher.id}`;
  const expiryDate = formatDate(voucher.expiry_date);

  const typeLabel = voucher.type === "gift_card" ? "Gift Card" : 
                    voucher.type === "certificate" ? "Travel Certificate" : "Travel Voucher";

  const typeEmoji = voucher.type === "gift_card" ? "🎁" : 
                    voucher.type === "certificate" ? "📜" : "🎫";

  const divider = "━━━━━━━━━━━━━━━━━━━━";

  const post = `✈️ ${voucher.airline.toUpperCase()} ${typeLabel.toUpperCase()} ✈️
${typeEmoji} ${discount}% OFF - LIMITED TIME! ${typeEmoji}

${divider}

📋 𝗩𝗼𝘂𝗰𝗵𝗲𝗿 𝗗𝗲𝘁𝗮𝗶𝗹𝘀:

🏷️ Type: ${typeLabel}
✈️ Airline: ${voucher.airline}
💵 Face Value: ${faceValue}
💰 Sale Price: ${salePrice}
📉 Discount: ${discount}% OFF
💸 You Save: ${savings}
${expiryDate ? `📅 Expires: ${expiryDate}` : `✨ No Expiration Date!`}

${divider}

🔥 𝗪𝗵𝘆 𝗕𝘂𝘆 𝗙𝗿𝗼𝗺 𝗨𝘀?

✅ Verified & Guaranteed
✅ Instant Delivery
✅ Secure Payment
✅ 100% Legit Vouchers

${divider}

🛒 𝗚𝗲𝘁 𝗜𝘁 𝗡𝗼𝘄:
🔗 ${voucherUrl}

${divider}

📲 𝗖𝗼𝗻𝘁𝗮𝗰𝘁 𝗨𝘀:
💬 WhatsApp: wa.me/1234567890
📩 DM us for questions!

${divider}

⚡ Limited availability - First come, first served!
🔔 Turn on notifications for more deals!

#${voucher.airline.replace(/\s+/g, "")} #TravelVoucher #FlightDeals #TravelDeals #CheapFlights #AirlineVoucher #TravelSavings #Wanderlust #TravelHacks`;

  return post;
}
