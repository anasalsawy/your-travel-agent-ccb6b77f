import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const adminEmail = Deno.env.get("ADMIN_EMAIL");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type NotificationType = 
  | "new_order" 
  | "payment_proof_uploaded" 
  | "new_ticket_request"
  | "order_received"
  | "payment_under_review"
  | "order_delivered"
  | "ticket_issued";

interface NotificationRequest {
  type: NotificationType;
  data: Record<string, any>;
  customerEmail?: string;
}

function getEmailContent(type: NotificationType, data: Record<string, any>): { subject: string; html: string } {
  const formatCurrency = (amount: number) => `$${amount.toLocaleString()}`;
  
  switch (type) {
    // Admin notifications
    case "new_order":
      return {
        subject: `New Order Received - ${data.voucherTitle || 'Voucher Order'}`,
        html: `
          <h2>New Order Received</h2>
          <p>A new order has been placed.</p>
          <ul>
            <li><strong>Order ID:</strong> ${data.orderId}</li>
            <li><strong>Voucher:</strong> ${data.voucherTitle}</li>
            <li><strong>Amount:</strong> ${formatCurrency(data.amount)}</li>
            <li><strong>Payment Method:</strong> ${data.paymentMethod}</li>
            <li><strong>Customer Email:</strong> ${data.customerEmail}</li>
          </ul>
          <p>Please review this order in the admin dashboard.</p>
        `,
      };
    
    case "payment_proof_uploaded":
      return {
        subject: `Payment Proof Uploaded - Order ${data.orderId?.slice(0, 8)}`,
        html: `
          <h2>Payment Proof Uploaded</h2>
          <p>A customer has uploaded payment proof for their order.</p>
          <ul>
            <li><strong>Order ID:</strong> ${data.orderId}</li>
            <li><strong>Voucher:</strong> ${data.voucherTitle}</li>
            <li><strong>Amount:</strong> ${formatCurrency(data.amount)}</li>
            <li><strong>Payment Method:</strong> ${data.paymentMethod}</li>
          </ul>
          <p>Please verify the payment and update the order status.</p>
        `,
      };
    
    case "new_ticket_request":
      return {
        subject: `New Ticket Request - ${data.origin} to ${data.destination}`,
        html: `
          <h2>New Ticket Request</h2>
          <p>A new flight ticket request has been submitted.</p>
          <ul>
            <li><strong>Route:</strong> ${data.origin} → ${data.destination}</li>
            <li><strong>Travel Date:</strong> ${data.departureDate}${data.returnDate ? ` - ${data.returnDate}` : ''}</li>
            <li><strong>Passengers:</strong> ${data.passengers}</li>
            <li><strong>Class:</strong> ${data.cabinClass}</li>
            <li><strong>Budget:</strong> ${data.budget ? formatCurrency(data.budget) : 'Not specified'}</li>
            <li><strong>Customer:</strong> ${data.contactEmail}</li>
          </ul>
          <p>Please review and send a quote.</p>
        `,
      };

    // Customer notifications
    case "order_received":
      return {
        subject: `Order Confirmed - Thank you for your purchase!`,
        html: `
          <h2>Thank You for Your Order!</h2>
          <p>We have received your order and it is being processed.</p>
          <ul>
            <li><strong>Order ID:</strong> ${data.orderId}</li>
            <li><strong>Voucher:</strong> ${data.voucherTitle}</li>
            <li><strong>Amount Paid:</strong> ${formatCurrency(data.amount)}</li>
            <li><strong>Payment Method:</strong> ${data.paymentMethod}</li>
          </ul>
          <p>We will notify you once your payment is verified and your order is ready for delivery.</p>
          <p>If you have any questions, please contact our support team.</p>
        `,
      };
    
    case "payment_under_review":
      return {
        subject: `Payment Under Review - Order ${data.orderId?.slice(0, 8)}`,
        html: `
          <h2>Payment Under Review</h2>
          <p>Thank you for submitting your payment proof. Our team is reviewing it.</p>
          <ul>
            <li><strong>Order ID:</strong> ${data.orderId}</li>
            <li><strong>Voucher:</strong> ${data.voucherTitle}</li>
            <li><strong>Amount:</strong> ${formatCurrency(data.amount)}</li>
          </ul>
          <p>We typically process payments within 24 hours. You will receive another email once your payment is confirmed.</p>
        `,
      };
    
    case "order_delivered":
      return {
        subject: `Order Delivered - ${data.voucherTitle}`,
        html: `
          <h2>Your Order Has Been Delivered!</h2>
          <p>Great news! Your order has been processed and delivered.</p>
          <ul>
            <li><strong>Order ID:</strong> ${data.orderId}</li>
            <li><strong>Voucher:</strong> ${data.voucherTitle}</li>
          </ul>
          ${data.deliveryInfo ? `<p><strong>Delivery Details:</strong></p><p>${data.deliveryInfo}</p>` : ''}
          <p>Thank you for your business! If you have any issues, please contact our support team.</p>
        `,
      };
    
    case "ticket_issued":
      return {
        subject: `Your Ticket Has Been Issued!`,
        html: `
          <h2>Your Flight Ticket is Ready!</h2>
          <p>Great news! Your flight ticket has been issued.</p>
          <ul>
            <li><strong>Route:</strong> ${data.origin} → ${data.destination}</li>
            <li><strong>Travel Date:</strong> ${data.departureDate}</li>
          </ul>
          ${data.ticketInfo ? `<p><strong>Ticket Details:</strong></p><p>${data.ticketInfo}</p>` : ''}
          <p>Thank you for booking with us! Have a great trip!</p>
        `,
      };

    default:
      return {
        subject: "Notification",
        html: "<p>You have a new notification.</p>",
      };
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, data, customerEmail }: NotificationRequest = await req.json();
    
    console.log(`Sending notification: ${type}`, { data, customerEmail });

    const { subject, html } = getEmailContent(type, data);
    
    // Determine recipient based on notification type
    const isAdminNotification = ["new_order", "payment_proof_uploaded", "new_ticket_request"].includes(type);
    const recipient = isAdminNotification ? adminEmail : customerEmail;

    if (!recipient) {
      console.error("No recipient email provided");
      return new Response(
        JSON.stringify({ error: "No recipient email provided" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Send email using Resend API directly
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "FlyDealz <onboarding@resend.dev>",
        to: [recipient],
        subject,
        html,
      }),
    });

    const emailResponse = await res.json();

    if (!res.ok) {
      console.error("Resend API error:", emailResponse);
      return new Response(
        JSON.stringify({ error: emailResponse }),
        { status: res.status, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailResponse }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error sending notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
