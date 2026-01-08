import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Send message to Telegram
async function sendMessage(chatId: number, text: string, options: Record<string, unknown> = {}) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...options,
    }),
  });
  return response.json();
}

// Format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

// Format date
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Get cabin class label
function getCabinLabel(cabin: string | null): string {
  const labels: Record<string, string> = {
    economy: "Economy",
    premium_economy: "Premium Economy",
    business: "Business",
    first: "First Class",
  };
  return labels[cabin || "economy"] || "Economy";
}

// Handle /start command
async function handleStart(chatId: number) {
  const welcomeMessage = `
🛫 <b>Welcome to Your Travel Agent Bot!</b>

I can help you:
• Browse open travel requests in our marketplace
• Place bids on listings (for verified sellers)
• Check your submitted bids

<b>Available Commands:</b>
/listings - View open marketplace listings
/listing_[id] - View details of a specific listing
/bid_[id]_[amount] - Place a bid (sellers only)
/mybids - View your submitted bids (sellers only)
/link - Link your Telegram to your seller account
/vouchers - Browse available vouchers
/help - Show this help message

Ready to find great travel deals? Try /listings to get started!
  `;
  await sendMessage(chatId, welcomeMessage);
}

// Handle /listings command
async function handleListings(chatId: number) {
  console.log("Fetching open listings...");
  
  const { data: listings, error } = await supabase
    .from("marketplace_listings")
    .select(`
      id,
      title,
      deadline,
      status,
      min_bid,
      ticket_request_id
    `)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Error fetching listings:", error);
    await sendMessage(chatId, "❌ Error fetching listings. Please try again.");
    return;
  }

  if (!listings || listings.length === 0) {
    await sendMessage(chatId, "📭 No open listings at the moment. Check back later!");
    return;
  }

  // Get ticket requests for these listings
  const ticketRequestIds = listings.map((l) => l.ticket_request_id);
  const { data: ticketRequests } = await supabase
    .from("ticket_requests")
    .select("id, origin, destination, departure_date, return_date, cabin_class, budget, passengers")
    .in("id", ticketRequestIds);

  interface TicketRequest {
    id: string;
    origin: string;
    destination: string;
    departure_date: string | null;
    return_date: string | null;
    cabin_class: string | null;
    budget: number | null;
    passengers: number | null;
  }

  const trMap: Record<string, TicketRequest> = {};
  (ticketRequests as TicketRequest[] | null)?.forEach((tr) => {
    trMap[tr.id] = tr;
  });

  // Get bid counts for each listing
  const listingIds = listings.map((l) => l.id);
  const { data: bidsData } = await supabase
    .from("bids")
    .select("listing_id")
    .in("listing_id", listingIds)
    .eq("status", "pending");

  const bidCounts: Record<string, number> = {};
  bidsData?.forEach((bid) => {
    bidCounts[bid.listing_id] = (bidCounts[bid.listing_id] || 0) + 1;
  });

  let message = "🛫 <b>Open Travel Requests</b>\n\n";

  listings.forEach((listing, index) => {
    const tr = trMap[listing.ticket_request_id];
    const bidCount = bidCounts[listing.id] || 0;
    const deadline = formatDate(listing.deadline);
    
    message += `<b>${index + 1}. ${listing.title}</b>\n`;
    message += `✈️ ${tr?.origin || "N/A"} → ${tr?.destination || "N/A"}\n`;
    message += `📅 ${tr?.departure_date ? formatDate(tr.departure_date) : "Flexible"}`;
    if (tr?.return_date) message += ` - ${formatDate(tr.return_date)}`;
    message += `\n`;
    message += `💺 ${getCabinLabel(tr?.cabin_class || null)} • 👥 ${tr?.passengers || 1} pax\n`;
    message += `💰 Budget: ${tr?.budget ? formatCurrency(tr.budget) : "Open"}\n`;
    message += `📊 ${bidCount} bid${bidCount !== 1 ? "s" : ""} • ⏰ Due: ${deadline}\n`;
    message += `🔗 /listing_${listing.id.slice(0, 8)}\n\n`;
  });

  message += "Use /listing_[id] to view details and place a bid.";
  await sendMessage(chatId, message);
}

// Handle /listing_[id] command
async function handleListingDetail(chatId: number, listingId: string) {
  console.log("Fetching listing detail for:", listingId);

  // Find listing by partial ID match
  const { data: listings, error } = await supabase
    .from("marketplace_listings")
    .select("*")
    .like("id", `${listingId}%`)
    .limit(1);

  if (error || !listings || listings.length === 0) {
    await sendMessage(chatId, "❌ Listing not found. Use /listings to see available requests.");
    return;
  }

  const listing = listings[0];

  // Get ticket request details
  const { data: ticketRequest } = await supabase
    .from("ticket_requests")
    .select("*")
    .eq("id", listing.ticket_request_id)
    .single();

  const tr = ticketRequest;

  // Get bids for this listing
  const { data: bids } = await supabase
    .from("bids")
    .select("amount, status")
    .eq("listing_id", listing.id)
    .eq("status", "pending")
    .order("amount", { ascending: true });

  const lowestBid = bids && bids.length > 0 ? bids[0].amount : null;

  let message = `🎫 <b>${listing.title}</b>\n\n`;
  message += `<b>Route:</b> ${tr?.origin || "N/A"} → ${tr?.destination || "N/A"}\n`;
  message += `<b>Departure:</b> ${tr?.departure_date ? formatDate(tr.departure_date) : "Flexible"}\n`;
  if (tr?.return_date) message += `<b>Return:</b> ${formatDate(tr.return_date)}\n`;
  message += `<b>Cabin:</b> ${getCabinLabel(tr?.cabin_class || null)}\n`;
  message += `<b>Passengers:</b> ${tr?.passengers || 1}\n`;
  message += `<b>Budget:</b> ${tr?.budget ? formatCurrency(tr.budget) : "Open to offers"}\n`;
  if (tr?.preferred_airline) message += `<b>Preferred Airline:</b> ${tr.preferred_airline}\n`;
  if (tr?.flexibility) message += `<b>Flexibility:</b> ${tr.flexibility}\n`;
  if (tr?.special_notes) message += `<b>Notes:</b> ${tr.special_notes}\n`;
  message += `\n<b>Deadline:</b> ${formatDate(listing.deadline)}\n`;
  message += `<b>Status:</b> ${listing.status}\n`;
  message += `<b>Bids:</b> ${bids?.length || 0}`;
  if (lowestBid) message += ` (lowest: ${formatCurrency(lowestBid)})`;
  message += `\n\n`;

  if (listing.status === "open") {
    message += `💡 <b>To place a bid:</b>\n`;
    message += `/bid_${listing.id.slice(0, 8)}_[amount]\n`;
    message += `Example: /bid_${listing.id.slice(0, 8)}_1500`;
  }

  await sendMessage(chatId, message);
}

// Handle /bid_[listingId]_[amount] command
async function handleBid(chatId: number, listingId: string, amount: number) {
  console.log(`Processing bid: listing=${listingId}, amount=${amount}`);

  if (isNaN(amount) || amount <= 0) {
    await sendMessage(chatId, "❌ Invalid bid amount. Please provide a valid number.");
    return;
  }

  // For now, inform users they need to register as a seller on the website
  await sendMessage(
    chatId,
    `💼 <b>Bid Request Received</b>\n\n` +
      `Amount: ${formatCurrency(amount)}\n\n` +
      `To place bids, you need to be a verified seller. ` +
      `Please register at our website first, then link your Telegram account.\n\n` +
      `🔗 Register at: yourtravelagent.com/seller/register`
  );
}

// Handle /vouchers command
async function handleVouchers(chatId: number) {
  console.log("Fetching available vouchers...");

  const { data: vouchers, error } = await supabase
    .from("vouchers")
    .select("*")
    .eq("status", "available")
    .order("discount_percent", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Error fetching vouchers:", error);
    await sendMessage(chatId, "❌ Error fetching vouchers. Please try again.");
    return;
  }

  if (!vouchers || vouchers.length === 0) {
    await sendMessage(chatId, "📭 No vouchers available at the moment. Check back later!");
    return;
  }

  let message = "🎟️ <b>Available Travel Vouchers</b>\n\n";

  vouchers.forEach((voucher, index) => {
    message += `<b>${index + 1}. ${voucher.title}</b>\n`;
    message += `✈️ ${voucher.airline}\n`;
    message += `💵 Face Value: ${formatCurrency(voucher.face_value)}\n`;
    message += `🏷️ Sale Price: ${formatCurrency(voucher.sale_price)} `;
    message += `<b>(${voucher.discount_percent}% OFF)</b>\n`;
    if (voucher.expiry_date) message += `📅 Expires: ${formatDate(voucher.expiry_date)}\n`;
    if (voucher.verified_balance) message += `✅ Verified Balance\n`;
    message += `\n`;
  });

  message += "🔗 Visit yourtravelagent.com/vouchers for details";
  await sendMessage(chatId, message);
}

// Handle /help command
async function handleHelp(chatId: number) {
  await handleStart(chatId);
}

// Handle /link command - link Telegram account to seller
async function handleLink(chatId: number) {
  console.log(`Link request from chat ${chatId}`);

  // Check if already linked
  const { data: existingSeller } = await supabase
    .from("sellers")
    .select("id, business_name, status")
    .eq("telegram_chat_id", chatId)
    .single();

  if (existingSeller) {
    await sendMessage(
      chatId,
      `✅ <b>Already Linked!</b>\n\n` +
        `Your Telegram is linked to: <b>${existingSeller.business_name}</b>\n` +
        `Status: ${existingSeller.status}\n\n` +
        `Use /mybids to see your bids.`
    );
    return;
  }

  // Generate a link code (using chat_id as temporary code)
  await sendMessage(
    chatId,
    `🔗 <b>Link Your Seller Account</b>\n\n` +
      `To link your Telegram account:\n\n` +
      `1. Log in to your seller account on the website\n` +
      `2. Go to your Seller Dashboard\n` +
      `3. Enter this code: <code>${chatId}</code>\n\n` +
      `Or an admin can link your account using your Chat ID: <code>${chatId}</code>`
  );
}

// Handle /mybids command - show seller's bids
async function handleMyBids(chatId: number) {
  console.log(`Fetching bids for chat ${chatId}`);

  // Find seller by telegram_chat_id
  const { data: seller, error: sellerError } = await supabase
    .from("sellers")
    .select("id, business_name, status")
    .eq("telegram_chat_id", chatId)
    .single();

  if (sellerError || !seller) {
    await sendMessage(
      chatId,
      `❌ <b>Account Not Linked</b>\n\n` +
        `Your Telegram is not linked to a seller account.\n\n` +
        `Use /link to connect your account.`
    );
    return;
  }

  if (seller.status !== "approved") {
    await sendMessage(
      chatId,
      `⏳ <b>Account Pending</b>\n\n` +
        `Your seller account is not yet approved.\n` +
        `Status: ${seller.status}\n\n` +
        `Please wait for admin approval.`
    );
    return;
  }

  // Get seller's bids
  const { data: bids, error: bidsError } = await supabase
    .from("bids")
    .select(`
      id,
      amount,
      status,
      created_at,
      listing_id
    `)
    .eq("seller_id", seller.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (bidsError) {
    console.error("Error fetching bids:", bidsError);
    await sendMessage(chatId, "❌ Error fetching your bids. Please try again.");
    return;
  }

  if (!bids || bids.length === 0) {
    await sendMessage(
      chatId,
      `📭 <b>No Bids Yet</b>\n\n` +
        `You haven't placed any bids yet.\n\n` +
        `Use /listings to see open requests and place bids!`
    );
    return;
  }

  // Get listing details for these bids
  const listingIds = bids.map((b) => b.listing_id);
  const { data: listings } = await supabase
    .from("marketplace_listings")
    .select("id, title, status, ticket_request_id")
    .in("id", listingIds);

  interface Listing {
    id: string;
    title: string;
    status: string;
    ticket_request_id: string;
  }

  const listingMap: Record<string, Listing> = {};
  (listings as Listing[] | null)?.forEach((l) => {
    listingMap[l.id] = l;
  });

  let message = `📋 <b>Your Bids</b> (${seller.business_name})\n\n`;

  const statusEmoji: Record<string, string> = {
    pending: "⏳",
    accepted: "✅",
    rejected: "❌",
    expired: "⌛",
  };

  bids.forEach((bid, index) => {
    const listing = listingMap[bid.listing_id];
    const emoji = statusEmoji[bid.status] || "❓";

    message += `<b>${index + 1}. ${listing?.title || "Unknown Listing"}</b>\n`;
    message += `💰 ${formatCurrency(bid.amount)} ${emoji} ${bid.status}\n`;
    message += `📅 ${formatDate(bid.created_at)}\n`;
    if (listing) {
      message += `🔗 /listing_${listing.id.slice(0, 8)}\n`;
    }
    message += `\n`;
  });

  message += `Showing last ${bids.length} bids.`;
  await sendMessage(chatId, message);
}

// Main webhook handler
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Received update:", JSON.stringify(body, null, 2));

    // Handle callback queries (inline button clicks)
    if (body.callback_query) {
      const query = body.callback_query;
      const chatId = query.message.chat.id;
      const data = query.data;

      // Acknowledge the callback
      await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ callback_query_id: query.id }),
        }
      );

      // Handle different callback actions
      if (data.startsWith("listing_")) {
        const lid = data.replace("listing_", "");
        await handleListingDetail(chatId, lid);
      }

      return new Response("OK", { headers: corsHeaders });
    }

    // Handle messages
    if (body.message) {
      const message = body.message;
      const chatId = message.chat.id;
      const text = message.text || "";

      console.log(`Message from chat ${chatId}: ${text}`);

      // Parse commands
      if (text.startsWith("/start")) {
        await handleStart(chatId);
      } else if (text.startsWith("/listings") || text === "/l") {
        await handleListings(chatId);
      } else if (text.startsWith("/listing_")) {
        const lid = text.replace("/listing_", "").trim();
        await handleListingDetail(chatId, lid);
      } else if (text.startsWith("/bid_")) {
        const parts = text.replace("/bid_", "").split("_");
        if (parts.length >= 2) {
          const lid = parts[0];
          const amount = parseFloat(parts[1]);
          await handleBid(chatId, lid, amount);
        } else {
          await sendMessage(
            chatId,
            "❌ Invalid bid format. Use: /bid_[listingId]_[amount]\nExample: /bid_abc12345_1500"
          );
        }
      } else if (text.startsWith("/vouchers") || text === "/v") {
        await handleVouchers(chatId);
      } else if (text.startsWith("/mybids") || text === "/mb") {
        await handleMyBids(chatId);
      } else if (text.startsWith("/link")) {
        await handleLink(chatId);
      } else if (text.startsWith("/help") || text === "/h") {
        await handleHelp(chatId);
      } else {
        // Unknown command or regular message
        await sendMessage(
          chatId,
          "👋 I didn't understand that command.\n\nTry:\n/listings - View marketplace\n/mybids - Your bids\n/vouchers - Browse vouchers\n/help - All commands"
        );
      }
    }

    return new Response("OK", { headers: corsHeaders });
  } catch (err) {
    const error = err as Error;
    console.error("Error processing update:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
