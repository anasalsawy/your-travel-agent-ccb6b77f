import { supabase } from "@/integrations/supabase/client";
import { TestConfig, TestHelpers, TEST_EMAIL_PREFIX } from "./types";
import {
  generateTestEmail,
  countNotifications,
  getNotificationsByRecord,
} from "./helpers";

// Helper to get current user ID
const getCurrentUserId = async (): Promise<string | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
};

// ============================================================================
// ZELLE FLOW TEST - Full workflow including reject and resubmit
// ============================================================================
export const zelleFlowTest: TestConfig = {
  id: "voucher-zelle-flow",
  name: "Zelle Payment Flow",
  description:
    "Order → Proof upload → Under review → Reject → Resubmit → Approve → Deliver",
  category: "voucher",
  paymentMethod: "zelle",
  run: async (helpers: TestHelpers) => {
    const { addStep, updateStep, getTestVoucher, cleanupOrder, waitForTrigger } =
      helpers;

    // Step 1: Get voucher
    const step1 = addStep({ name: "Get available voucher", status: "running" });
    const userId = await getCurrentUserId();
    if (!userId) {
      updateStep(step1, {
        status: "fail",
        expected: "User authenticated",
        actual: "No authenticated user",
        error: "Must be logged in as admin to run tests",
      });
      throw new Error("Not authenticated");
    }
    
    const voucher = await getTestVoucher();
    if (!voucher) {
      updateStep(step1, {
        status: "fail",
        expected: "Available voucher exists",
        actual: "No vouchers found",
        error: "Create at least one available voucher",
      });
      throw new Error("No voucher available");
    }
    updateStep(step1, {
      status: "pass",
      expected: "Voucher available",
      actual: voucher.title,
    });

    // Step 2: Create order
    const step2 = addStep({ name: "Create Zelle order", status: "running" });
    const testEmail = generateTestEmail("zelle");
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: userId,
        voucher_id: voucher.id,
        amount_paid: Number(voucher.sale_price),
        payment_method: "zelle",
        payment_status: "pending",
        order_status: "pending",
        customer_email: testEmail,
      })
      .select()
      .single();

    if (orderError || !order) {
      updateStep(step2, {
        status: "fail",
        error: orderError?.message || "No order returned",
      });
      throw new Error("Failed to create order");
    }
    updateStep(step2, {
      status: "pass",
      expected: "Order created",
      actual: `Order ${order.id.slice(0, 8)}`,
    });

    try {
      // Step 3: Verify order_received notification
      const step3 = addStep({
        name: "Verify order_received notification",
        status: "running",
      });
      await waitForTrigger();
      const receivedCount = await countNotifications(order.id, "order_received");
      updateStep(step3, {
        status: receivedCount >= 1 ? "pass" : "fail",
        expected: "≥1 order_received notification",
        actual: `Found ${receivedCount}`,
      });

      // Step 4: Upload proof using atomic RPC function
      const step4 = addStep({
        name: "Submit payment proof (atomic RPC)",
        status: "running",
      });
      
      const { data: updatedOrder, error: proofError } = await supabase.rpc(
        "submit_order_payment_proof",
        {
          p_order_id: order.id,
          p_proof_upload_url: `test-proof/${order.id}/zelle-1.png`,
        }
      );

      if (proofError) {
        updateStep(step4, { status: "fail", error: proofError.message });
        throw new Error("Failed to submit proof");
      }
      
      // Verify order status was updated
      const { data: orderAfterProof } = await supabase
        .from("orders")
        .select("payment_status, order_status, payment_submitted_at, proof_upload_url")
        .eq("id", order.id)
        .single();
      
      const statusCorrect = 
        orderAfterProof?.payment_status === "under_review" &&
        orderAfterProof?.order_status === "payment_under_review" &&
        orderAfterProof?.payment_submitted_at !== null;
        
      updateStep(step4, {
        status: statusCorrect ? "pass" : "fail",
        expected: "payment_status=under_review, order_status=payment_under_review",
        actual: `payment_status=${orderAfterProof?.payment_status}, order_status=${orderAfterProof?.order_status}`,
      });

      // Step 5: Verify under_review notification
      const step5 = addStep({
        name: "Verify payment_under_review notification",
        status: "running",
      });
      await waitForTrigger();
      const underReviewCount = await countNotifications(
        order.id,
        "payment_under_review"
      );
      updateStep(step5, {
        status: underReviewCount === 1 ? "pass" : "fail",
        expected: "Exactly 1 notification",
        actual: `Found ${underReviewCount}`,
      });

      // Step 6: Admin rejects payment (triggers notification)
      const step6 = addStep({
        name: "Admin rejects payment",
        status: "running",
      });
      const { error: rejectError } = await supabase
        .from("orders")
        .update({
          payment_status: "failed", // This triggers the rejection notification
          order_status: "cancelled",
          admin_notes: "Test rejection reason",
        })
        .eq("id", order.id);

      if (rejectError) {
        updateStep(step6, { status: "fail", error: rejectError.message });
        throw new Error("Failed to reject");
      }
      updateStep(step6, {
        status: "pass",
        expected: "Status → failed",
        actual: "Payment rejected",
      });

      // Step 7: Verify payment_rejected notification
      const step7 = addStep({
        name: "Verify payment_rejected notification",
        status: "running",
      });
      await waitForTrigger();
      const rejectedCount = await countNotifications(
        order.id,
        "payment_rejected"
      );
      updateStep(step7, {
        status: rejectedCount >= 1 ? "pass" : "fail",
        expected: "≥1 payment_rejected notification",
        actual: `Found ${rejectedCount}`,
      });

      // Step 7b: Admin resets to pending for resubmission
      const step7b = addStep({
        name: "Admin resets order for resubmission",
        status: "running",
      });
      const newAttemptId = crypto.randomUUID();
      const { error: resetError } = await supabase
        .from("orders")
        .update({
          payment_status: "pending",
          order_status: "pending",
          payment_attempt_id: newAttemptId,
          proof_upload_url: null,
        })
        .eq("id", order.id);

      if (resetError) {
        updateStep(step7b, { status: "fail", error: resetError.message });
        throw new Error("Failed to reset");
      }
      updateStep(step7b, {
        status: "pass",
        expected: "Status reset to pending",
        actual: "Can resubmit via RPC",
      });

      // Step 8: Customer resubmits proof (using atomic RPC after admin reset)
      const step8 = addStep({
        name: "Customer resubmits proof",
        status: "running",
      });
      const { error: resubmitError } = await supabase.rpc(
        "submit_order_payment_proof",
        {
          p_order_id: order.id,
          p_proof_upload_url: `test-proof/${order.id}/zelle-2.png`,
        }
      );

      if (resubmitError) {
        updateStep(step8, { status: "fail", error: resubmitError.message });
        throw new Error("Failed to resubmit");
      }
      updateStep(step8, {
        status: "pass",
        expected: "New proof submitted",
        actual: "Status back to under_review",
      });

      // Step 9: Admin approves payment
      const step9 = addStep({
        name: "Admin approves payment",
        status: "running",
      });
      await waitForTrigger();
      const { error: approveError } = await supabase
        .from("orders")
        .update({
          payment_status: "completed",
          order_status: "paid",
        })
        .eq("id", order.id);

      if (approveError) {
        updateStep(step9, { status: "fail", error: approveError.message });
        throw new Error("Failed to approve");
      }
      updateStep(step9, {
        status: "pass",
        expected: "Status → completed/paid",
        actual: "Payment approved",
      });

      // Step 10: Verify payment_approved notification
      const step10 = addStep({
        name: "Verify payment_approved notification",
        status: "running",
      });
      await waitForTrigger();
      const approvedCount = await countNotifications(
        order.id,
        "payment_approved"
      );
      updateStep(step10, {
        status: approvedCount >= 1 ? "pass" : "fail",
        expected: "≥1 payment_approved notification",
        actual: `Found ${approvedCount}`,
      });

      // Step 11: Admin delivers order
      const step11 = addStep({
        name: "Admin delivers order",
        status: "running",
      });
      const { error: deliverError } = await supabase
        .from("orders")
        .update({
          order_status: "delivered",
          delivery_info: "Test delivery info",
        })
        .eq("id", order.id);

      if (deliverError) {
        updateStep(step11, { status: "fail", error: deliverError.message });
        throw new Error("Failed to deliver");
      }
      updateStep(step11, {
        status: "pass",
        expected: "Status → delivered",
        actual: "Order delivered",
      });

      // Step 12: Verify order_delivered notification
      const step12 = addStep({
        name: "Verify order_delivered notification",
        status: "running",
      });
      await waitForTrigger();
      const deliveredCount = await countNotifications(
        order.id,
        "order_delivered"
      );
      updateStep(step12, {
        status: deliveredCount >= 1 ? "pass" : "fail",
        expected: "≥1 order_delivered notification",
        actual: `Found ${deliveredCount}`,
      });

      // Step 13: Verify no duplicate notifications per event
      const step13 = addStep({
        name: "Check notification deduplication",
        status: "running",
      });
      const allNotifs = await getNotificationsByRecord(order.id);
      const eventCounts = allNotifs.reduce(
        (acc: Record<string, number>, n) => {
          acc[n.event_type] = (acc[n.event_type] || 0) + 1;
          return acc;
        },
        {}
      );
      const unexpectedDupes = Object.entries(eventCounts).filter(
        ([event, count]) => {
          // Some events may legitimately fire more than once (e.g., resubmit flow)
          // - customer sees 2 "under review" emails across 2 proofs
          // - admin sees 2 "proof uploaded" emails across 2 proofs
          // - customer may see 2 "proof received" emails across 2 proofs
          if (
            event === "payment_under_review" ||
            event === "admin_proof_uploaded" ||
            event === "payment_proof_received"
          ) {
            return count > 2;
          }
          return count > 1;
        }
      );
      updateStep(step13, {
        status: unexpectedDupes.length === 0 ? "pass" : "fail",
        expected: "No unexpected duplicates",
        actual:
          unexpectedDupes.length === 0
            ? `Events: ${Object.keys(eventCounts).join(", ")}`
            : `Duplicates: ${unexpectedDupes.map(([e, c]) => `${e}(${c})`).join(", ")}`,
      });

      // Cleanup
      await cleanupOrder(order.id);
    } catch (e) {
      await cleanupOrder(order.id);
      throw e;
    }
  },
};

// ============================================================================
// BITCOIN FLOW TEST
// ============================================================================
export const bitcoinFlowTest: TestConfig = {
  id: "voucher-bitcoin-flow",
  name: "Bitcoin Payment Flow",
  description:
    "Order → Proof upload → Under review → Reject → Resubmit → Approve → Deliver",
  category: "voucher",
  paymentMethod: "bitcoin",
  run: async (helpers: TestHelpers) => {
    const { addStep, updateStep, getTestVoucher, cleanupOrder, waitForTrigger } =
      helpers;

// Step 1: Get voucher
    const step1 = addStep({ name: "Get available voucher", status: "running" });
    const userId = await getCurrentUserId();
    if (!userId) {
      updateStep(step1, {
        status: "fail",
        expected: "User authenticated",
        actual: "No authenticated user",
      });
      throw new Error("Not authenticated");
    }
    
    const voucher = await getTestVoucher();
    if (!voucher) {
      updateStep(step1, {
        status: "fail",
        expected: "Available voucher exists",
        actual: "No vouchers found",
      });
      throw new Error("No voucher available");
    }
    updateStep(step1, {
      status: "pass",
      expected: "Voucher available",
      actual: voucher.title,
    });

    // Step 2: Create Bitcoin order
    const step2 = addStep({ name: "Create Bitcoin order", status: "running" });
    const testEmail = generateTestEmail("btc");
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: userId,
        voucher_id: voucher.id,
        amount_paid: Number(voucher.sale_price),
        payment_method: "bitcoin",
        payment_status: "pending",
        order_status: "pending",
        customer_email: testEmail,
        btc_address: "bc1qtest123456789",
        btc_amount: "0.005",
      })
      .select()
      .single();

    if (orderError || !order) {
      updateStep(step2, { status: "fail", error: orderError?.message });
      throw new Error("Failed to create order");
    }
    updateStep(step2, {
      status: "pass",
      expected: "Order with BTC details created",
      actual: `Order ${order.id.slice(0, 8)}`,
    });

    try {
      // Step 3: Submit proof using atomic RPC
      const step3 = addStep({ name: "Submit BTC payment proof (atomic RPC)", status: "running" });
      const { error: proofError } = await supabase.rpc(
        "submit_order_payment_proof",
        {
          p_order_id: order.id,
          p_proof_upload_url: `test-proof/${order.id}/btc-tx.png`,
        }
      );

      if (proofError) {
        updateStep(step3, { status: "fail", error: proofError.message });
        throw new Error("Failed to submit proof");
      }
      
      // Verify order status was updated
      const { data: orderAfterProof } = await supabase
        .from("orders")
        .select("payment_status, order_status")
        .eq("id", order.id)
        .single();
      
      updateStep(step3, {
        status: orderAfterProof?.payment_status === "under_review" ? "pass" : "fail",
        expected: "payment_status=under_review",
        actual: `payment_status=${orderAfterProof?.payment_status}`,
      });

      // Step 4: Verify under_review notification
      const step4 = addStep({
        name: "Verify payment_under_review notification",
        status: "running",
      });
      await waitForTrigger();
      const underReviewCount = await countNotifications(
        order.id,
        "payment_under_review"
      );
      updateStep(step4, {
        status: underReviewCount >= 1 ? "pass" : "fail",
        expected: "≥1 notification",
        actual: `Found ${underReviewCount}`,
      });

      // Step 5: Admin approves
      const step5 = addStep({ name: "Admin approves payment", status: "running" });
      const { error: approveError } = await supabase
        .from("orders")
        .update({
          payment_status: "completed",
          order_status: "paid",
        })
        .eq("id", order.id);

      if (approveError) {
        updateStep(step5, { status: "fail", error: approveError.message });
        throw new Error("Failed to approve");
      }
      updateStep(step5, {
        status: "pass",
        expected: "Status → completed",
        actual: "Approved",
      });

      // Step 6: Admin delivers
      const step6 = addStep({ name: "Admin delivers order", status: "running" });
      const { error: deliverError } = await supabase
        .from("orders")
        .update({
          order_status: "delivered",
          delivery_info: "BTC test delivery",
        })
        .eq("id", order.id);

      if (deliverError) {
        updateStep(step6, { status: "fail", error: deliverError.message });
        throw new Error("Failed to deliver");
      }
      updateStep(step6, {
        status: "pass",
        expected: "Status → delivered",
        actual: "Delivered",
      });

      // Step 7: Verify delivered notification
      const step7 = addStep({
        name: "Verify order_delivered notification",
        status: "running",
      });
      await waitForTrigger();
      const deliveredCount = await countNotifications(order.id, "order_delivered");
      updateStep(step7, {
        status: deliveredCount >= 1 ? "pass" : "fail",
        expected: "≥1 notification",
        actual: `Found ${deliveredCount}`,
      });

      // Cleanup
      await cleanupOrder(order.id);
    } catch (e) {
      await cleanupOrder(order.id);
      throw e;
    }
  },
};

// ============================================================================
// STRIPE FLOW TEST (Mock)
// ============================================================================
export const stripeFlowTest: TestConfig = {
  id: "voucher-stripe-flow",
  name: "Stripe Payment Flow (Mock)",
  description: "Mock Stripe payment_succeeded → Paid → Deliver",
  category: "voucher",
  paymentMethod: "stripe",
  run: async (helpers: TestHelpers) => {
    const { addStep, updateStep, getTestVoucher, cleanupOrder, waitForTrigger } =
      helpers;

// Step 1: Get voucher
    const step1 = addStep({ name: "Get available voucher", status: "running" });
    const userId = await getCurrentUserId();
    if (!userId) {
      updateStep(step1, {
        status: "fail",
        expected: "User authenticated",
        actual: "No authenticated user",
      });
      throw new Error("Not authenticated");
    }
    
    const voucher = await getTestVoucher();
    if (!voucher) {
      updateStep(step1, {
        status: "fail",
        expected: "Voucher available",
        actual: "None found",
      });
      throw new Error("No voucher available");
    }
    updateStep(step1, {
      status: "pass",
      expected: "Voucher available",
      actual: voucher.title,
    });

    // Step 2: Create Stripe order (simulating checkout session created)
    const step2 = addStep({
      name: "Create Stripe order (pre-payment)",
      status: "running",
    });
    const testEmail = generateTestEmail("stripe");
    const mockSessionId = `cs_test_${Date.now()}`;
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: userId,
        voucher_id: voucher.id,
        amount_paid: Number(voucher.sale_price),
        payment_method: "stripe",
        payment_status: "processing",
        order_status: "pending",
        customer_email: testEmail,
        stripe_session_id: mockSessionId,
      })
      .select()
      .single();

    if (orderError || !order) {
      updateStep(step2, { status: "fail", error: orderError?.message });
      throw new Error("Failed to create order");
    }
    updateStep(step2, {
      status: "pass",
      expected: "Order with stripe_session_id",
      actual: `Order ${order.id.slice(0, 8)}`,
    });

    try {
      // Step 3: Mock Stripe webhook → payment_succeeded
      const step3 = addStep({
        name: "Mock Stripe payment_succeeded",
        status: "running",
      });
      const { error: paymentError } = await supabase
        .from("orders")
        .update({
          payment_status: "completed",
          order_status: "paid",
          payment_submitted_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      if (paymentError) {
        updateStep(step3, { status: "fail", error: paymentError.message });
        throw new Error("Failed to update payment");
      }
      updateStep(step3, {
        status: "pass",
        expected: "Status → completed/paid",
        actual: "Payment succeeded",
      });

      // Step 4: Verify payment_approved notification
      const step4 = addStep({
        name: "Verify payment_approved notification",
        status: "running",
      });
      await waitForTrigger();
      const approvedCount = await countNotifications(
        order.id,
        "payment_approved"
      );
      updateStep(step4, {
        status: approvedCount >= 1 ? "pass" : "fail",
        expected: "≥1 notification",
        actual: `Found ${approvedCount}`,
      });

      // Step 5: Admin delivers
      const step5 = addStep({ name: "Admin delivers order", status: "running" });
      const { error: deliverError } = await supabase
        .from("orders")
        .update({
          order_status: "delivered",
          delivery_info: "Stripe test delivery",
        })
        .eq("id", order.id);

      if (deliverError) {
        updateStep(step5, { status: "fail", error: deliverError.message });
        throw new Error("Failed to deliver");
      }
      updateStep(step5, {
        status: "pass",
        expected: "Status → delivered",
        actual: "Delivered",
      });

      // Step 6: Verify order status
      const step6 = addStep({ name: "Verify final order state", status: "running" });
      const { data: finalOrder } = await supabase
        .from("orders")
        .select("*")
        .eq("id", order.id)
        .single();

      if (
        finalOrder?.order_status === "delivered" &&
        finalOrder?.payment_status === "completed"
      ) {
        updateStep(step6, {
          status: "pass",
          expected: "delivered + completed",
          actual: `${finalOrder.order_status} + ${finalOrder.payment_status}`,
        });
      } else {
        updateStep(step6, {
          status: "fail",
          expected: "delivered + completed",
          actual: `${finalOrder?.order_status} + ${finalOrder?.payment_status}`,
        });
      }

      // Cleanup
      await cleanupOrder(order.id);
    } catch (e) {
      await cleanupOrder(order.id);
      throw e;
    }
  },
};

// ============================================================================
// PAYMENT IDEMPOTENCY TEST
// ============================================================================
export const paymentIdempotencyTest: TestConfig = {
  id: "voucher-idempotency",
  name: "Payment Proof Idempotency",
  description: "Duplicate submissions via RPC are blocked, only 1 notification logged",
  category: "voucher",
  run: async (helpers: TestHelpers) => {
    const { addStep, updateStep, getTestVoucher, cleanupOrder, waitForTrigger } =
      helpers;

// Step 1: Get voucher
    const step1 = addStep({ name: "Get available voucher", status: "running" });
    const userId = await getCurrentUserId();
    if (!userId) {
      updateStep(step1, { status: "fail", error: "Not authenticated" });
      throw new Error("Not authenticated");
    }
    
    const voucher = await getTestVoucher();
    if (!voucher) {
      updateStep(step1, { status: "fail", error: "No vouchers" });
      throw new Error("No voucher");
    }
    updateStep(step1, { status: "pass", actual: voucher.title });

    // Step 2: Create order in pending (awaiting payment)
    const step2 = addStep({
      name: "Create order in pending status",
      status: "running",
    });
    const testEmail = generateTestEmail("idemp");
    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        user_id: userId,
        voucher_id: voucher.id,
        amount_paid: Number(voucher.sale_price),
        payment_method: "zelle",
        payment_status: "pending",
        order_status: "pending",
        customer_email: testEmail,
      })
      .select()
      .single();

    if (error || !order) {
      updateStep(step2, { status: "fail", error: error?.message });
      throw new Error("Failed to create order");
    }
    updateStep(step2, {
      status: "pass",
      expected: "Order in pending",
      actual: `Order ${order.id.slice(0, 8)}`,
    });

    try {
      // Step 3: Submit first proof via RPC
      const step3 = addStep({
        name: "Submit first proof via RPC",
        status: "running",
      });
      const { error: firstSubmitError } = await supabase.rpc(
        "submit_order_payment_proof",
        {
          p_order_id: order.id,
          p_proof_upload_url: "test-proof/first.png",
        }
      );
      
      if (firstSubmitError) {
        updateStep(step3, { status: "fail", error: firstSubmitError.message });
        throw new Error("Failed to submit first proof");
      }
      updateStep(step3, {
        status: "pass",
        expected: "First submission succeeds",
        actual: "Proof submitted, status = under_review",
      });

      // Step 4: Wait and count notifications
      const step4 = addStep({
        name: "Count payment_under_review notifications",
        status: "running",
      });
      await waitForTrigger();
      const initialCount = await countNotifications(
        order.id,
        "payment_under_review"
      );
      updateStep(step4, {
        status: initialCount >= 1 ? "pass" : "fail",
        expected: "≥1 notification",
        actual: `Found ${initialCount}`,
      });

      // Step 5: Attempt duplicate submission via RPC (should fail)
      const step5 = addStep({
        name: "Attempt duplicate proof submission (should be blocked)",
        status: "running",
      });
      const { error: duplicateError } = await supabase.rpc(
        "submit_order_payment_proof",
        {
          p_order_id: order.id,
          p_proof_upload_url: "test-proof/second.png",
        }
      );

      if (duplicateError) {
        updateStep(step5, {
          status: "pass",
          expected: "RPC rejects duplicate submission",
          actual: `Blocked: ${duplicateError.message.slice(0, 50)}`,
        });
      } else {
        updateStep(step5, {
          status: "fail",
          expected: "RPC should reject duplicate",
          actual: "Duplicate was allowed (bug!)",
        });
      }

      // Step 6: Verify no duplicate notifications
      const step6 = addStep({
        name: "Verify no duplicate notifications",
        status: "running",
      });
      await waitForTrigger();
      const finalCount = await countNotifications(
        order.id,
        "payment_under_review"
      );

      if (finalCount === initialCount) {
        updateStep(step6, {
          status: "pass",
          expected: "No new notification",
          actual: `Count: ${initialCount} → ${finalCount}`,
        });
      } else {
        updateStep(step6, {
          status: "fail",
          expected: "No new notification",
          actual: `Count changed: ${initialCount} → ${finalCount}`,
        });
      }

      // Cleanup
      await cleanupOrder(order.id);
    } catch (e) {
      await cleanupOrder(order.id);
      throw e;
    }
  },
};

export const voucherTests: TestConfig[] = [
  zelleFlowTest,
  bitcoinFlowTest,
  stripeFlowTest,
  paymentIdempotencyTest,
];
