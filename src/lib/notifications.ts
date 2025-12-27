import { supabase } from "@/integrations/supabase/client";

type NotificationType = 
  | "new_order" 
  | "payment_proof_uploaded" 
  | "new_ticket_request"
  | "order_received"
  | "payment_under_review"
  | "order_delivered"
  | "ticket_issued";

interface NotificationData {
  type: NotificationType;
  data: Record<string, any>;
  customerEmail?: string;
}

export async function sendNotification({ type, data, customerEmail }: NotificationData): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke("send-notification", {
      body: { type, data, customerEmail },
    });

    if (error) {
      console.error("Failed to send notification:", error);
      return false;
    }

    console.log(`Notification sent: ${type}`);
    return true;
  } catch (error) {
    console.error("Error sending notification:", error);
    return false;
  }
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
