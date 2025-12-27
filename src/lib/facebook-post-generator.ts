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
    if (!dateString) return "No expiry";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const faceValue = formatCurrency(Number(voucher.face_value), voucher.currency || "USD");
  const salePrice = formatCurrency(Number(voucher.sale_price), voucher.currency || "USD");
  const discount = Number(voucher.discount_percent);
  const voucherUrl = `${baseUrl}/vouchers/${voucher.id}`;
  const expiryText = voucher.expiry_date ? `Expires: ${formatDate(voucher.expiry_date)}` : "No expiration date";

  const typeLabel = voucher.type === "gift_card" ? "Gift Card" : 
                    voucher.type === "certificate" ? "Certificate" : "Voucher";

  const post = `✈️ ${voucher.airline} ${typeLabel} - ${discount}% OFF! ✈️

💰 Face Value: ${faceValue}
🏷️ Sale Price: ${salePrice}
📉 You Save: ${discount}%

📅 ${expiryText}

🔗 Get it now: ${voucherUrl}

#AirlineVoucher #TravelDeals #${voucher.airline.replace(/\s+/g, "")} #SaveOnTravel #FlightDeals`;

  return post;
}
