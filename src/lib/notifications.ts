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
  | "ticket_payment_approved"
  | "ticket_payment_rejected"
  | "test_email"
  // Split payment notification types
  | "deposit_under_review"
  | "deposit_approved"
  | "deposit_rejected"
  | "ticket_issued_balance_due"
  | "balance_under_review"
  | "balance_approved"
  | "balance_rejected"
  | "balance_past_due"
  // Escrow/SpareFare notification types
  | "escrow_status_update"
  | "escrow_sparefare_listed";

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

export async function notifyCustomerTicketPaymentApproved(
  customerEmail: string,
  requestData: {
    requestId: string;
    origin: string;
    destination: string;
    amount: number;
  }
) {
  return sendNotification({
    type: "ticket_payment_approved" as NotificationType,
    data: requestData,
    customerEmail,
  });
}

export async function notifyCustomerTicketPaymentRejected(
  customerEmail: string,
  requestData: {
    requestId: string;
    origin: string;
    destination: string;
    amount: number;
    rejectionReason: string;
  }
) {
  return sendNotification({
    type: "ticket_payment_rejected" as NotificationType,
    data: requestData,
    customerEmail,
  });
}

// ========== SPLIT PAYMENT NOTIFICATIONS ==========

// Deposit under review (admin)
export async function notifyDepositProofUploaded(requestData: {
  requestId: string;
  origin: string;
  destination: string;
  depositAmount: number;
  paymentMethod: string;
}) {
  return sendNotification({
    type: "deposit_under_review" as NotificationType,
    data: requestData,
  });
}

// Deposit under review (customer)
export async function notifyCustomerDepositUnderReview(
  customerEmail: string,
  requestData: {
    requestId: string;
    origin: string;
    destination: string;
    depositAmount: number;
  }
) {
  return sendNotification({
    type: "deposit_under_review" as NotificationType,
    data: requestData,
    customerEmail,
  });
}

// Deposit approved (customer)
export async function notifyCustomerDepositApproved(
  customerEmail: string,
  requestData: {
    requestId: string;
    origin: string;
    destination: string;
    depositAmount: number;
  }
) {
  return sendNotification({
    type: "deposit_approved" as NotificationType,
    data: requestData,
    customerEmail,
  });
}

// Deposit rejected (customer)
export async function notifyCustomerDepositRejected(
  customerEmail: string,
  requestData: {
    requestId: string;
    origin: string;
    destination: string;
    depositAmount: number;
    rejectionReason: string;
  }
) {
  return sendNotification({
    type: "deposit_rejected" as NotificationType,
    data: requestData,
    customerEmail,
  });
}

// Ticket issued with balance due (customer)
export async function notifyCustomerTicketIssuedBalanceDue(
  customerEmail: string,
  requestData: {
    requestId: string;
    origin: string;
    destination: string;
    departureDate: string;
    balanceAmount: number;
    balanceDueDate: string;
    ticketInfo?: string;
  }
) {
  return sendNotification({
    type: "ticket_issued_balance_due" as NotificationType,
    data: requestData,
    customerEmail,
  });
}

// Balance under review (admin)
export async function notifyBalanceProofUploaded(requestData: {
  requestId: string;
  origin: string;
  destination: string;
  balanceAmount: number;
  paymentMethod: string;
}) {
  return sendNotification({
    type: "balance_under_review" as NotificationType,
    data: requestData,
  });
}

// Balance under review (customer)
export async function notifyCustomerBalanceUnderReview(
  customerEmail: string,
  requestData: {
    requestId: string;
    origin: string;
    destination: string;
    balanceAmount: number;
  }
) {
  return sendNotification({
    type: "balance_under_review" as NotificationType,
    data: requestData,
    customerEmail,
  });
}

// Balance approved (customer)
export async function notifyCustomerBalanceApproved(
  customerEmail: string,
  requestData: {
    requestId: string;
    origin: string;
    destination: string;
    balanceAmount: number;
  }
) {
  return sendNotification({
    type: "balance_approved" as NotificationType,
    data: requestData,
    customerEmail,
  });
}

// Balance rejected (customer)
export async function notifyCustomerBalanceRejected(
  customerEmail: string,
  requestData: {
    requestId: string;
    origin: string;
    destination: string;
    balanceAmount: number;
    rejectionReason: string;
  }
) {
  return sendNotification({
    type: "balance_rejected" as NotificationType,
    data: requestData,
    customerEmail,
  });
}

// Balance past due (admin + customer)
export async function notifyBalancePastDue(
  customerEmail: string,
  requestData: {
    requestId: string;
    origin: string;
    destination: string;
    balanceAmount: number;
    balanceDueDate: string;
  }
) {
  // Send to both admin and customer
  await sendNotification({
    type: "balance_past_due" as NotificationType,
    data: requestData,
  });
  return sendNotification({
    type: "balance_past_due" as NotificationType,
    data: requestData,
    customerEmail,
  });
}

// ========== ESCROW/SPAREFARE NOTIFICATIONS ==========

// Notify buyer about escrow status change
export async function notifyBuyerEscrowUpdate(
  buyerEmail: string,
  data: {
    listingId: string;
    route: string;
    escrowStatus: string;
    sparefareUrl?: string;
    amount: number;
    sellerName: string;
  }
) {
  return sendNotification({
    type: "escrow_status_update" as NotificationType,
    data,
    customerEmail: buyerEmail,
  });
}

// Notify seller about escrow status change
export async function notifySellerEscrowUpdate(
  sellerEmail: string,
  data: {
    listingId: string;
    route: string;
    escrowStatus: string;
    sparefareUrl?: string;
    amount: number;
    buyerEmail: string;
  }
) {
  return sendNotification({
    type: "escrow_status_update" as NotificationType,
    data,
    customerEmail: sellerEmail,
  });
}

// Notify both parties when SpareFare listing is created
export async function notifyEscrowSpareFareListed(
  recipientEmail: string,
  data: {
    listingId: string;
    route: string;
    sparefareUrl: string;
    amount: number;
    departureDate: string;
    isBuyer: boolean;
  }
) {
  return sendNotification({
    type: "escrow_sparefare_listed" as NotificationType,
    data,
    customerEmail: recipientEmail,
  });
}
