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
  | "payment_approved"
  | "payment_rejected"
  | "order_delivered"
  | "ticket_issued"
  | "test_email";

interface NotificationRequest {
  type: NotificationType;
  data: Record<string, any>;
  customerEmail?: string;
}

function getEmailContent(type: NotificationType, data: Record<string, any>): { subject: string; html: string } {
  const formatCurrency = (amount: number) => `$${amount?.toLocaleString() || '0'}`;
  
  switch (type) {
    // Test email
    case "test_email":
      return {
        subject: `Test Email - FlyDealz Notifications`,
        html: `
          <h2>Test Email Successful!</h2>
          <p>If you're seeing this, your email notifications are working correctly.</p>
          <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          <p>You will receive notifications for:</p>
          <ul>
            <li>New orders</li>
            <li>Payment proof uploads</li>
            <li>New ticket requests</li>
          </ul>
          <p>This is a test email from FlyDealz.</p>
        `,
      };

    // Admin notifications
    case "new_order":
      return {
        subject: `New Order Received - ${data.voucherTitle || 'Voucher Order'}`,
        html: `
          <h2>New Order Received</h2>
          <p>A new order has been placed.</p>
          <ul>
            <li><strong>Order ID:</strong> ${data.orderId}</li>
            <li><strong>Voucher:</strong> ${data.voucherTitle || 'N/A'}</li>
            <li><strong>Amount:</strong> ${formatCurrency(data.amount)}</li>
            <li><strong>Payment Method:</strong> ${data.paymentMethod}</li>
            <li><strong>Customer Email:</strong> ${data.customerEmail || 'N/A'}</li>
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
            <li><strong>Voucher:</strong> ${data.voucherTitle || 'N/A'}</li>
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
            <li><strong>Voucher:</strong> ${data.voucherTitle || 'N/A'}</li>
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
            <li><strong>Voucher:</strong> ${data.voucherTitle || 'N/A'}</li>
            <li><strong>Amount:</strong> ${formatCurrency(data.amount)}</li>
          </ul>
          <p>We typically process payments within 24 hours. You will receive another email once your payment is confirmed.</p>
        `,
      };
    
    case "payment_approved":
      return {
        subject: `Payment Approved - Order ${data.orderId?.slice(0, 8)}`,
        html: `
          <h2>Payment Approved! 🎉</h2>
          <p>Great news! Your payment has been verified and approved.</p>
          <ul>
            <li><strong>Order ID:</strong> ${data.orderId}</li>
            <li><strong>Amount:</strong> ${formatCurrency(data.amount)}</li>
          </ul>
          <p>Your order is now being processed for delivery. You will receive another email once your voucher has been delivered.</p>
          <p>Thank you for your purchase!</p>
        `,
      };
    
    case "payment_rejected":
      return {
        subject: `Payment Issue - Order ${data.orderId?.slice(0, 8)}`,
        html: `
          <h2>Payment Issue</h2>
          <p>Unfortunately, we were unable to verify your payment for the following order:</p>
          <ul>
            <li><strong>Order ID:</strong> ${data.orderId}</li>
            <li><strong>Amount:</strong> ${formatCurrency(data.amount)}</li>
          </ul>
          ${data.rejectionReason ? `<p><strong>Reason:</strong> ${data.rejectionReason}</p>` : ''}
          <p>If you believe this is an error, please contact our support team with your payment proof and order details.</p>
          <p>We apologize for any inconvenience.</p>
        `,
      };
    
    case "order_delivered":
      return {
        subject: `Order Delivered - Your Voucher is Ready!`,
        html: `
          <h2>Your Order Has Been Delivered! 🎉</h2>
          <p>Great news! Your order has been processed and delivered.</p>
          <ul>
            <li><strong>Order ID:</strong> ${data.orderId}</li>
          </ul>
          ${data.deliveryInfo ? `<p><strong>Delivery Details:</strong></p><p>${data.deliveryInfo}</p>` : ''}
          <p>Thank you for your business! If you have any issues, please contact our support team.</p>
        `,
      };
    
    case "ticket_issued":
      return {
        subject: `Your Ticket Has Been Issued!`,
        html: `
          <h2>Your Flight Ticket is Ready! ✈️</h2>
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
  console.log("=== send-notification function called ===");
  console.log("Method:", req.method);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Log environment check
    console.log("RESEND_API_KEY exists:", !!RESEND_API_KEY);
    console.log("ADMIN_EMAIL:", adminEmail);

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY is not set");
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY is not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const body = await req.json();
    console.log("Request body:", JSON.stringify(body));
    
    const { type, data, customerEmail }: NotificationRequest = body;
    
    console.log(`Processing notification type: ${type}`);

    const { subject, html } = getEmailContent(type, data);
    console.log("Email subject:", subject);
    
    // Determine recipient based on notification type
    const adminNotificationTypes = ["new_order", "payment_proof_uploaded", "new_ticket_request", "test_email"];
    const isAdminNotification = adminNotificationTypes.includes(type);
    const recipient = isAdminNotification ? adminEmail : customerEmail;

    console.log("Is admin notification:", isAdminNotification);
    console.log("Recipient:", recipient);

    if (!recipient) {
      console.error("No recipient email provided for type:", type);
      return new Response(
        JSON.stringify({ error: "No recipient email provided", type }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Sending email via Resend API...");
    
    // Send email using Resend API directly
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Your Travel Agent <no-reply@your-travel-agent.net>",
        to: [recipient],
        subject,
        html,
      }),
    });

    const emailResponse = await res.json();
    console.log("Resend API response status:", res.status);
    console.log("Resend API response:", JSON.stringify(emailResponse));

    if (!res.ok) {
      console.error("Resend API error:", emailResponse);
      return new Response(
        JSON.stringify({ error: emailResponse }),
        { status: res.status, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Email sent successfully to:", recipient);

    return new Response(
      JSON.stringify({ success: true, emailResponse, recipient }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-notification function:", error);
    console.error("Error stack:", error.stack);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
