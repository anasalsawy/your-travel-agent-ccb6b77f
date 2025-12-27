import { supabase } from "@/integrations/supabase/client";

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
  | "ticket_payment_proof_uploaded"
  | "ticket_payment_under_review"
  | "test_email";

interface NotificationData {
  type: NotificationType;
  data: Record<string, any>;
  customerEmail?: string;
}

export async function sendNotification({ type, data, customerEmail }: NotificationData): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Notifications] Sending ${type} notification...`);
    
    const { data: responseData, error } = await supabase.functions.invoke("send-notification", {
      body: { type, data, customerEmail },
    });

    if (error) {
      console.error("[Notifications] Edge function error:", error);
      return { success: false, error: error.message };
    }

    console.log(`[Notifications] ${type} notification sent successfully:`, responseData);
    return { success: true };
  } catch (error: any) {
    console.error("[Notifications] Exception sending notification:", error);
    return { success: false, error: error.message };
  }
}

// Test email
export async function sendTestEmail() {
  return sendNotification({
    type: "test_email",
    data: { timestamp: new Date().toISOString() },
  });
}

// Admin notifications
export async function notifyNewOrder(orderData: {
  orderId: string;
  voucherTitle: string;
  amount: number;
  paymentMethod: string;
  customerEmail: string;
}) {
  return sendNotification({
    type: "new_order",
    data: orderData,
  });
}

export async function notifyPaymentProofUploaded(orderData: {
  orderId: string;
  voucherTitle: string;
  amount: number;
  paymentMethod: string;
}) {
  return sendNotification({
    type: "payment_proof_uploaded",
    data: orderData,
  });
}

export async function notifyNewTicketRequest(requestData: {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  passengers: number;
  cabinClass: string;
  budget?: number;
  contactEmail: string;
}) {
  return sendNotification({
    type: "new_ticket_request",
    data: requestData,
  });
}

// Customer notifications
export async function notifyCustomerOrderReceived(
  customerEmail: string,
  orderData: {
    orderId: string;
    voucherTitle: string;
    amount: number;
    paymentMethod: string;
  }
) {
  return sendNotification({
    type: "order_received",
    data: orderData,
    customerEmail,
  });
}

export async function notifyCustomerPaymentUnderReview(
  customerEmail: string,
  orderData: {
    orderId: string;
    voucherTitle: string;
    amount: number;
  }
) {
  return sendNotification({
    type: "payment_under_review",
    data: orderData,
    customerEmail,
  });
}

export async function notifyCustomerPaymentApproved(
  customerEmail: string,
  orderData: {
    orderId: string;
    amount: number;
  }
) {
  return sendNotification({
    type: "payment_approved",
    data: orderData,
    customerEmail,
  });
}

export async function notifyCustomerPaymentRejected(
  customerEmail: string,
  orderData: {
    orderId: string;
    amount: number;
    rejectionReason: string;
  }
) {
  return sendNotification({
    type: "payment_rejected",
    data: orderData,
    customerEmail,
  });
}

export async function notifyCustomerOrderDelivered(
  customerEmail: string,
  orderData: {
    orderId: string;
    voucherTitle: string;
    deliveryInfo?: string;
  }
) {
  return sendNotification({
    type: "order_delivered",
    data: orderData,
    customerEmail,
  });
}

export async function notifyCustomerTicketIssued(
  customerEmail: string,
  requestData: {
    origin: string;
    destination: string;
    departureDate: string;
    ticketInfo?: string;
  }
) {
  return sendNotification({
    type: "ticket_issued",
    data: requestData,
    customerEmail,
  });
}

// Ticket Request Payment Notifications
export async function notifyTicketPaymentProofUploaded(requestData: {
  requestId: string;
  origin: string;
  destination: string;
  amount: number;
  paymentMethod: string;
}) {
  return sendNotification({
    type: "ticket_payment_proof_uploaded" as NotificationType,
    data: requestData,
  });
}

export async function notifyCustomerTicketPaymentUnderReview(
  customerEmail: string,
  requestData: {
    requestId: string;
    origin: string;
    destination: string;
    amount: number;
  }
) {
  return sendNotification({
    type: "ticket_payment_under_review" as NotificationType,
    data: requestData,
    customerEmail,
  });
}
