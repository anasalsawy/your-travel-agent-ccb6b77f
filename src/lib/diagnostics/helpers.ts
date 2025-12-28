import { supabase } from "@/integrations/supabase/client";
import { TEST_EMAIL_PREFIX } from "./types";

export const getTestVoucher = async () => {
  const { data } = await supabase
    .from("vouchers")
    .select("*")
    .eq("status", "available")
    .limit(1)
    .single();
  return data;
};

export const cleanupOrder = async (orderId: string) => {
  // Delete payment_proofs first (FK constraint)
  await supabase.from("payment_proofs").delete().eq("order_id", orderId);
  await supabase.from("notification_log").delete().eq("record_id", orderId);
  await supabase.from("orders").delete().eq("id", orderId);
};

export const cleanupTicketRequest = async (requestId: string) => {
  await supabase.from("notification_log").delete().eq("record_id", requestId);
  await supabase.from("ticket_requests").delete().eq("id", requestId);
};

export const cleanupAllTestData = async () => {
  // Get test order IDs first to clean up payment_proofs
  const { data: testOrders } = await supabase
    .from("orders")
    .select("id")
    .like("customer_email", `%${TEST_EMAIL_PREFIX}%`);
  
  if (testOrders && testOrders.length > 0) {
    const orderIds = testOrders.map(o => o.id);
    await supabase
      .from("payment_proofs")
      .delete()
      .in("order_id", orderIds);
  }

  // Delete test orders
  await supabase
    .from("orders")
    .delete()
    .like("customer_email", `%${TEST_EMAIL_PREFIX}%`);

  // Delete test ticket requests
  await supabase
    .from("ticket_requests")
    .delete()
    .like("contact_email", `%${TEST_EMAIL_PREFIX}%`);

  // Delete test notification logs
  await supabase
    .from("notification_log")
    .delete()
    .like("recipient", `%${TEST_EMAIL_PREFIX}%`);
};

export const waitForTrigger = async (ms = 1500) => {
  await new Promise((r) => setTimeout(r, ms));
};

export const generateTestEmail = (prefix: string) =>
  `${TEST_EMAIL_PREFIX}${prefix}_${Date.now()}@example.com`;

export const countNotifications = async (
  recordId: string,
  eventType: string
): Promise<number> => {
  const { data } = await supabase
    .from("notification_log")
    .select("id")
    .eq("record_id", recordId)
    .eq("event_type", eventType);
  return data?.length || 0;
};

export const getNotificationsByRecord = async (recordId: string) => {
  const { data } = await supabase
    .from("notification_log")
    .select("*")
    .eq("record_id", recordId)
    .order("created_at", { ascending: true });
  return data || [];
};

export const getStorageSignedUrl = async (
  bucket: string,
  path: string
): Promise<string | null> => {
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60);
  return data?.signedUrl || null;
};
