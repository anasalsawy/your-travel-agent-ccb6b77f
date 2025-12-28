import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const adminEmail = Deno.env.get("ADMIN_EMAIL");
const FROM_EMAIL = "Your Travel Agent <no-reply@your-travel-agent.net>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// All notification types
type NotificationType = 
  // Order customer notifications
  | "order_received"
  | "payment_instructions"
  | "payment_proof_received"
  | "payment_approved"
  | "payment_rejected"
  | "order_delivered"
  | "order_cancelled"
  // Order admin notifications
  | "new_order"
  | "admin_new_order"
  | "payment_proof_uploaded"
  | "admin_proof_uploaded"
  | "admin_order_delivered"
  | "admin_order_cancelled"
  // Ticket request customer notifications
  | "ticket_request_received"
  | "ticket_quote_ready"
  | "ticket_quote_updated"
  | "ticket_payment_under_review"
  | "ticket_payment_approved"
  | "ticket_payment_rejected"
  | "ticket_issued"
  | "ticket_request_rejected"
  | "ticket_request_cancelled"
  // Ticket request admin notifications
  | "new_ticket_request"
  | "admin_new_ticket_request"
  | "admin_ticket_proof_uploaded"
  | "ticket_payment_proof_uploaded"
  | "admin_ticket_completed"
  | "admin_ticket_rejected"
  // Split payment notifications
  | "deposit_under_review"
  | "deposit_approved"
  | "deposit_rejected"
  | "ticket_issued_balance_due"
  | "balance_under_review"
  | "balance_approved"
  | "balance_rejected"
  | "balance_past_due"
  // Legacy/misc
  | "payment_under_review"
  | "test_email";

interface NotificationRequest {
  type: NotificationType;
  data: Record<string, any>;
  customerEmail?: string;
  entityType?: string;
  entityId?: string;
}

function getEmailContent(type: NotificationType, data: Record<string, any>): { subject: string; html: string } {
  const formatCurrency = (amount: number) => `$${amount?.toLocaleString() || '0'}`;
  const orderId = data.orderId ? String(data.orderId).substring(0, 8) : "";
  const requestId = data.requestId ? String(data.requestId).substring(0, 8) : "";
  
  switch (type) {
    // ========== TEST EMAIL ==========
    case "test_email":
      return {
        subject: `Test Email - Your Travel Agent`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Test Email Successful!</h2>
            <p>If you're seeing this, your email notifications are working correctly.</p>
            <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          </div>
        `,
      };

    // ========== ORDER CUSTOMER EMAILS ==========
    case "order_received":
      return {
        subject: `Order Confirmed - #${orderId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1a365d;">Thank You for Your Order!</h1>
            <p>Your order <strong>#${orderId}</strong> has been received and is being processed.</p>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Voucher:</strong> ${data.voucherTitle || 'N/A'}</p>
              <p><strong>Amount:</strong> ${formatCurrency(data.amount)}</p>
              <p><strong>Payment Method:</strong> ${data.paymentMethod}</p>
            </div>
            <p>We'll notify you once your payment is confirmed.</p>
            <p style="color: #718096; font-size: 14px;">If you have any questions, please reply to this email.</p>
          </div>
        `,
      };

    case "payment_instructions":
      const instructions = data.paymentMethod === "bitcoin" 
        ? `<p><strong>Bitcoin Address:</strong> ${data.btcAddress || "Will be provided shortly"}</p><p><strong>Amount:</strong> ${data.btcAmount || "TBD"} BTC</p>`
        : `<p>Please send your Zelle payment to our registered account.</p><p><strong>Amount:</strong> ${formatCurrency(data.amount)}</p>`;
      return {
        subject: `Payment Instructions - Order #${orderId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1a365d;">Payment Instructions</h1>
            <p>Here are the payment details for your order <strong>#${orderId}</strong>:</p>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              ${instructions}
            </div>
            <p>After completing payment, please upload your proof of payment in your dashboard.</p>
          </div>
        `,
      };

    case "payment_proof_received":
    case "payment_under_review":
      return {
        subject: `Payment Under Review - Order #${orderId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1a365d;">Payment Proof Received</h1>
            <p>We've received your payment proof for order <strong>#${orderId}</strong>.</p>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Voucher:</strong> ${data.voucherTitle || 'N/A'}</p>
              <p><strong>Amount:</strong> ${formatCurrency(data.amount)}</p>
            </div>
            <p>Our team is reviewing your payment. This typically takes 1-2 business hours.</p>
          </div>
        `,
      };

    case "payment_approved":
      return {
        subject: `Payment Confirmed - Order #${orderId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #38a169;">Payment Confirmed! 🎉</h1>
            <p>Great news! Your payment for order <strong>#${orderId}</strong> has been confirmed.</p>
            <p>We're now processing your order and will deliver your voucher shortly.</p>
          </div>
        `,
      };

    case "payment_rejected":
      return {
        subject: `Payment Issue - Order #${orderId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #e53e3e;">Payment Issue</h1>
            <p>Unfortunately, we couldn't verify your payment for order <strong>#${orderId}</strong>.</p>
            ${data.rejectionReason ? `<div style="background: #fed7d7; padding: 15px; border-radius: 8px; margin: 20px 0;"><strong>Reason:</strong> ${data.rejectionReason}</div>` : ""}
            <p>Please submit a new payment proof or contact us for assistance.</p>
          </div>
        `,
      };

    case "order_delivered":
      return {
        subject: `Order Delivered - #${orderId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #38a169;">Your Order Has Been Delivered! 🎉</h1>
            <p>Your voucher for order <strong>#${orderId}</strong> is ready.</p>
            ${data.deliveryInfo ? `<div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;"><strong>Delivery Details:</strong><br>${data.deliveryInfo}</div>` : ""}
            <p>Thank you for choosing Your Travel Agent!</p>
          </div>
        `,
      };

    case "order_cancelled":
      return {
        subject: `Order Cancelled - #${orderId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #718096;">Order Cancelled</h1>
            <p>Your order <strong>#${orderId}</strong> has been cancelled.</p>
            ${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ""}
            <p>If you have any questions, please contact us.</p>
          </div>
        `,
      };

    // ========== ORDER ADMIN EMAILS ==========
    case "new_order":
    case "admin_new_order":
      return {
        subject: `New Order Received - #${orderId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1a365d;">New Order Received</h1>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px;">
              <p><strong>Order ID:</strong> ${data.orderId}</p>
              <p><strong>Voucher:</strong> ${data.voucherTitle || 'N/A'}</p>
              <p><strong>Amount:</strong> ${formatCurrency(data.amount)}</p>
              <p><strong>Payment Method:</strong> ${data.paymentMethod}</p>
              <p><strong>Customer:</strong> ${data.customerEmail || "N/A"}</p>
            </div>
            <p>Please review this order in the admin dashboard.</p>
          </div>
        `,
      };

    case "payment_proof_uploaded":
    case "admin_proof_uploaded":
      return {
        subject: `Payment Proof Uploaded - Order #${orderId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #dd6b20;">Payment Proof Uploaded</h1>
            <p>A customer has uploaded payment proof for order <strong>#${orderId}</strong>.</p>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px;">
              <p><strong>Amount:</strong> ${formatCurrency(data.amount)}</p>
              <p><strong>Method:</strong> ${data.paymentMethod}</p>
              ${data.proofUrl ? `<p><strong>Proof:</strong> <a href="${data.proofUrl}">View</a></p>` : ""}
            </div>
            <p>Please review and approve/reject the payment.</p>
          </div>
        `,
      };

    case "admin_order_delivered":
      return {
        subject: `Order Delivered - #${orderId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #38a169;">Order Delivered</h1>
            <p>Order <strong>#${orderId}</strong> has been marked as delivered.</p>
          </div>
        `,
      };

    case "admin_order_cancelled":
      return {
        subject: `Order Cancelled - #${orderId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #e53e3e;">Order Cancelled</h1>
            <p>Order <strong>#${orderId}</strong> has been cancelled.</p>
            ${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ""}
          </div>
        `,
      };

    // ========== TICKET REQUEST CUSTOMER EMAILS ==========
    case "ticket_request_received":
      return {
        subject: `Ticket Request Received - #${requestId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1a365d;">Ticket Request Received!</h1>
            <p>Thank you for your ticket request <strong>#${requestId}</strong>.</p>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Route:</strong> ${data.origin} → ${data.destination}</p>
              <p><strong>Departure:</strong> ${data.departureDate}</p>
              ${data.returnDate ? `<p><strong>Return:</strong> ${data.returnDate}</p>` : ""}
              <p><strong>Passengers:</strong> ${data.passengers || 1}</p>
              <p><strong>Class:</strong> ${data.cabinClass || "Economy"}</p>
            </div>
            <p>Our team will review your request and send you a quote shortly.</p>
          </div>
        `,
      };

    case "ticket_quote_ready":
      return {
        subject: `Your Ticket Quote is Ready - #${requestId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #38a169;">Your Quote is Ready!</h1>
            <p>Great news! We have a quote for your ticket request <strong>#${requestId}</strong>.</p>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Route:</strong> ${data.origin} → ${data.destination}</p>
              <p style="font-size: 24px; color: #1a365d;"><strong>Price: ${formatCurrency(data.quotedPrice)}</strong></p>
            </div>
            <p>Log in to your dashboard to review and proceed with payment.</p>
          </div>
        `,
      };

    case "ticket_quote_updated":
      return {
        subject: `Quote Updated - Ticket #${requestId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #dd6b20;">Quote Updated</h1>
            <p>The quote for your ticket request <strong>#${requestId}</strong> has been updated.</p>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="font-size: 24px; color: #1a365d;"><strong>New Price: ${formatCurrency(data.quotedPrice)}</strong></p>
            </div>
            <p>Please review the updated quote in your dashboard.</p>
          </div>
        `,
      };

    case "ticket_payment_under_review":
      return {
        subject: `Payment Under Review - Ticket #${requestId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1a365d;">Payment Under Review</h1>
            <p>We've received your payment proof for ticket request <strong>#${requestId}</strong>.</p>
            <p>Our team is reviewing your payment and will process your ticket shortly.</p>
          </div>
        `,
      };

    case "ticket_payment_approved":
      return {
        subject: `Payment Confirmed - Ticket #${requestId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #38a169;">Payment Confirmed!</h1>
            <p>Your payment for ticket request <strong>#${requestId}</strong> has been confirmed.</p>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Route:</strong> ${data.origin} → ${data.destination}</p>
              <p><strong>Amount:</strong> ${formatCurrency(data.amount)}</p>
            </div>
            <p>We're now booking your ticket and will send you the details soon.</p>
          </div>
        `,
      };

    case "ticket_payment_rejected":
      return {
        subject: `Payment Issue - Ticket #${requestId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #e53e3e;">Payment Could Not Be Verified</h1>
            <p>Unfortunately, we couldn't verify your payment for ticket request <strong>#${requestId}</strong>.</p>
            <div style="background: #fed7d7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <strong>Reason:</strong> ${data.rejectionReason || "Payment verification failed"}
            </div>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Route:</strong> ${data.origin} → ${data.destination}</p>
              <p><strong>Amount:</strong> ${formatCurrency(data.amount)}</p>
            </div>
            <p><strong>Next Step:</strong> Please log in to your dashboard and re-upload your payment proof.</p>
            <p>If you believe this is an error, please contact our support team.</p>
          </div>
        `,
      };

    case "ticket_issued":
      return {
        subject: `Your Ticket is Ready! - #${requestId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #38a169;">Your Ticket Has Been Issued! ✈️</h1>
            <p>Your ticket for request <strong>#${requestId}</strong> is ready.</p>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Route:</strong> ${data.origin} → ${data.destination}</p>
              <p><strong>Departure:</strong> ${data.departureDate}</p>
            </div>
            ${data.issuedTicketInfo ? `<div style="background: #e6fffa; padding: 20px; border-radius: 8px; margin: 20px 0;"><strong>Ticket Details:</strong><br>${data.issuedTicketInfo}</div>` : ""}
            <p>Check your dashboard for full details. Have a great trip!</p>
          </div>
        `,
      };

    case "ticket_request_rejected":
    case "ticket_request_cancelled":
      return {
        subject: `Ticket Request Cancelled - #${requestId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #e53e3e;">Request Cancelled</h1>
            <p>Unfortunately, your ticket request <strong>#${requestId}</strong> has been cancelled.</p>
            ${data.reason ? `<div style="background: #fed7d7; padding: 15px; border-radius: 8px; margin: 20px 0;"><strong>Reason:</strong> ${data.reason}</div>` : ""}
            <p>If you have questions, please contact us.</p>
          </div>
        `,
      };

    // ========== TICKET REQUEST ADMIN EMAILS ==========
    case "new_ticket_request":
    case "admin_new_ticket_request":
      return {
        subject: `New Ticket Request - ${data.origin} to ${data.destination}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1a365d;">New Ticket Request</h1>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px;">
              <p><strong>Request ID:</strong> ${data.requestId || 'N/A'}</p>
              <p><strong>Route:</strong> ${data.origin} → ${data.destination}</p>
              <p><strong>Departure:</strong> ${data.departureDate}</p>
              ${data.returnDate ? `<p><strong>Return:</strong> ${data.returnDate}</p>` : ""}
              <p><strong>Passengers:</strong> ${data.passengers || 1}</p>
              <p><strong>Class:</strong> ${data.cabinClass || "Economy"}</p>
              <p><strong>Budget:</strong> ${data.budget ? formatCurrency(data.budget) : "Not specified"}</p>
              <p><strong>Customer:</strong> ${data.contactEmail}</p>
            </div>
            <p>Please review and send a quote.</p>
          </div>
        `,
      };

    case "admin_ticket_proof_uploaded":
    case "ticket_payment_proof_uploaded":
      return {
        subject: `Payment Proof - Ticket Request #${requestId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #dd6b20;">Ticket Payment Proof Uploaded</h1>
            <p>Customer uploaded payment proof for ticket request <strong>#${requestId}</strong>.</p>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Route:</strong> ${data.origin} → ${data.destination}</p>
              <p><strong>Amount:</strong> ${formatCurrency(data.amount)}</p>
              <p><strong>Method:</strong> ${data.paymentMethod}</p>
            </div>
            ${data.proofUrl ? `<p><a href="${data.proofUrl}">View Proof</a></p>` : ""}
            <p>Please review and approve the payment.</p>
          </div>
        `,
      };

    case "admin_ticket_completed":
      return {
        subject: `Ticket Completed - #${requestId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #38a169;">Ticket Request Completed</h1>
            <p>Ticket request <strong>#${requestId}</strong> has been marked as completed.</p>
          </div>
        `,
      };

    case "admin_ticket_rejected":
      return {
        subject: `Ticket Request Cancelled - #${requestId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #e53e3e;">Ticket Request Cancelled</h1>
            <p>Ticket request <strong>#${requestId}</strong> has been cancelled.</p>
            ${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ""}
          </div>
        `,
      };

    // ========== SPLIT PAYMENT EMAILS ==========
    case "deposit_under_review":
      return {
        subject: `Deposit Payment Under Review - Ticket #${requestId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1a365d;">Deposit Payment Under Review</h1>
            <p>We've received your deposit payment for ticket request <strong>#${requestId}</strong>.</p>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Route:</strong> ${data.origin} → ${data.destination}</p>
              <p><strong>Deposit Amount:</strong> ${formatCurrency(data.depositAmount)}</p>
            </div>
            <p>Our team is reviewing your deposit. We'll notify you once it's approved.</p>
          </div>
        `,
      };

    case "deposit_approved":
      return {
        subject: `Deposit Approved - Ticket #${requestId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #38a169;">Deposit Approved! ✅</h1>
            <p>Great news! Your deposit for ticket request <strong>#${requestId}</strong> has been approved.</p>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Route:</strong> ${data.origin} → ${data.destination}</p>
              <p><strong>Deposit Paid:</strong> ${formatCurrency(data.depositAmount)}</p>
            </div>
            <p>We're now processing your ticket. You'll receive your ticket details and balance payment instructions soon.</p>
          </div>
        `,
      };

    case "deposit_rejected":
      return {
        subject: `Deposit Issue - Ticket #${requestId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #e53e3e;">Deposit Could Not Be Verified</h1>
            <p>Unfortunately, we couldn't verify your deposit for ticket request <strong>#${requestId}</strong>.</p>
            <div style="background: #fed7d7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <strong>Reason:</strong> ${data.rejectionReason || "Deposit verification failed"}
            </div>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Route:</strong> ${data.origin} → ${data.destination}</p>
              <p><strong>Deposit Amount:</strong> ${formatCurrency(data.depositAmount)}</p>
            </div>
            <p><strong>Next Step:</strong> Please log in to your dashboard and re-upload your deposit proof.</p>
          </div>
        `,
      };

    case "ticket_issued_balance_due":
      return {
        subject: `Ticket Issued - Balance Due ${data.balanceDueDate} - #${requestId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #38a169;">Your Ticket Has Been Issued! ✈️</h1>
            <p>Your ticket for request <strong>#${requestId}</strong> is ready.</p>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Route:</strong> ${data.origin} → ${data.destination}</p>
              <p><strong>Departure:</strong> ${data.departureDate}</p>
            </div>
            ${data.ticketInfo ? `<div style="background: #e6fffa; padding: 20px; border-radius: 8px; margin: 20px 0;"><strong>Ticket Details:</strong><br>${data.ticketInfo}</div>` : ""}
            <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #f59e0b;">
              <h2 style="color: #92400e; margin-top: 0;">⚠️ Balance Payment Required</h2>
              <p style="font-size: 24px; color: #92400e; margin: 10px 0;"><strong>${formatCurrency(data.balanceAmount)}</strong></p>
              <p style="color: #92400e;"><strong>Due Date: ${data.balanceDueDate}</strong></p>
              <p style="font-size: 14px; color: #78350f;">Please log in to your dashboard and complete the balance payment before your departure.</p>
            </div>
          </div>
        `,
      };

    case "balance_under_review":
      return {
        subject: `Balance Payment Under Review - Ticket #${requestId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #1a365d;">Balance Payment Under Review</h1>
            <p>We've received your balance payment for ticket request <strong>#${requestId}</strong>.</p>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Route:</strong> ${data.origin} → ${data.destination}</p>
              <p><strong>Balance Amount:</strong> ${formatCurrency(data.balanceAmount)}</p>
            </div>
            <p>Our team is reviewing your payment. We'll notify you once it's confirmed.</p>
          </div>
        `,
      };

    case "balance_approved":
      return {
        subject: `Balance Confirmed - Ticket #${requestId} Fully Paid!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #38a169;">Balance Payment Confirmed! 🎉</h1>
            <p>Your balance payment for ticket request <strong>#${requestId}</strong> has been confirmed.</p>
            <div style="background: #d1fae5; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #10b981;">
              <p style="font-size: 18px; color: #065f46; margin: 0;"><strong>✅ Your ticket is now fully paid!</strong></p>
            </div>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Route:</strong> ${data.origin} → ${data.destination}</p>
              <p><strong>Balance Paid:</strong> ${formatCurrency(data.balanceAmount)}</p>
            </div>
            <p>Thank you for your payment. Have a great trip!</p>
          </div>
        `,
      };

    case "balance_rejected":
      return {
        subject: `Balance Payment Issue - Ticket #${requestId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #e53e3e;">Balance Payment Could Not Be Verified</h1>
            <p>Unfortunately, we couldn't verify your balance payment for ticket request <strong>#${requestId}</strong>.</p>
            <div style="background: #fed7d7; padding: 15px; border-radius: 8px; margin: 20px 0;">
              <strong>Reason:</strong> ${data.rejectionReason || "Balance verification failed"}
            </div>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Route:</strong> ${data.origin} → ${data.destination}</p>
              <p><strong>Balance Amount:</strong> ${formatCurrency(data.balanceAmount)}</p>
            </div>
            <p><strong>Next Step:</strong> Please log in to your dashboard and re-upload your balance payment proof.</p>
          </div>
        `,
      };

    case "balance_past_due":
      return {
        subject: `⚠️ URGENT: Balance Payment Overdue - Ticket #${requestId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #dc2626;">⚠️ Balance Payment Overdue</h1>
            <p>The balance payment for ticket request <strong>#${requestId}</strong> is now past due.</p>
            <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border: 2px solid #dc2626;">
              <p><strong>Route:</strong> ${data.origin} → ${data.destination}</p>
              <p style="font-size: 24px; color: #dc2626;"><strong>Amount Due: ${formatCurrency(data.balanceAmount)}</strong></p>
              <p style="color: #dc2626;"><strong>Original Due Date: ${data.balanceDueDate}</strong></p>
            </div>
            <p style="color: #dc2626; font-weight: bold;">Please complete your payment immediately to avoid ticket cancellation.</p>
            <p>Log in to your dashboard to submit payment proof.</p>
          </div>
        `,
      };

    default:
      return {
        subject: "Notification - Your Travel Agent",
        html: `<p>You have a new notification from Your Travel Agent.</p>`,
      };
  }
}

// Admin notification types
const ADMIN_NOTIFICATION_TYPES = [
  "new_order", 
  "admin_new_order",
  "payment_proof_uploaded", 
  "admin_proof_uploaded",
  "admin_order_delivered",
  "admin_order_cancelled",
  "new_ticket_request",
  "admin_new_ticket_request",
  "admin_ticket_proof_uploaded",
  "ticket_payment_proof_uploaded",
  "admin_ticket_completed",
  "admin_ticket_rejected",
  "test_email"
];

// Split payment admin notifications (when no customerEmail provided)
const SPLIT_PAYMENT_ADMIN_TYPES = [
  "deposit_under_review",
  "balance_under_review",
  "balance_past_due"
];

function isAdminNotification(type: NotificationType, hasCustomerEmail: boolean): boolean {
  if (ADMIN_NOTIFICATION_TYPES.includes(type)) return true;
  // Split payment types go to admin if no customer email provided
  if (SPLIT_PAYMENT_ADMIN_TYPES.includes(type) && !hasCustomerEmail) return true;
  return false;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("=== send-notification function called ===");
  console.log("Method:", req.method);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
    
    const { type, data, customerEmail, entityType, entityId }: NotificationRequest = body;
    
    console.log(`Processing notification type: ${type}`);

    const { subject, html } = getEmailContent(type, data);
    console.log("Email subject:", subject);
    
    // Determine recipient
    const isAdmin = isAdminNotification(type, !!customerEmail);
    const recipient = isAdmin ? adminEmail : customerEmail;

    // Derive record_id for logging
    const recordId = entityId || data?.orderId || data?.requestId || data?.ticketRequestId || null;
    const derivedEntityType = entityType || (data?.orderId ? "order" : "ticket_request");

    console.log("Is admin notification:", isAdmin);
    console.log("Recipient:", recipient);
    console.log("Entity type:", derivedEntityType);
    console.log("Entity ID:", recordId);

    if (!recipient) {
      console.error("No recipient email provided for type:", type);
      console.log("NOTIFICATION_SKIP", JSON.stringify({
        event_type: type,
        entity_type: derivedEntityType,
        entity_id: recordId,
        reason: "no_recipient"
      }));
      return new Response(
        JSON.stringify({ error: "No recipient email provided", type }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Log every notification attempt
    console.log("NOTIFICATION_ATTEMPT", JSON.stringify({
      event_type: type,
      entity_type: derivedEntityType,
      entity_id: recordId,
      recipient: recipient,
      is_admin: isAdmin
    }));

    console.log("Sending email via Resend API...");
    
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
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
      console.log("NOTIFICATION_FAILED", JSON.stringify({
        event_type: type,
        entity_type: derivedEntityType,
        entity_id: recordId,
        recipient: recipient,
        error: JSON.stringify(emailResponse)
      }));
      return new Response(
        JSON.stringify({ error: emailResponse }),
        { status: res.status, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Email sent successfully to:", recipient);
    console.log("NOTIFICATION_SUCCESS", JSON.stringify({
      event_type: type,
      entity_type: derivedEntityType,
      entity_id: recordId,
      recipient: recipient,
      resend_id: emailResponse.id
    }));

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
