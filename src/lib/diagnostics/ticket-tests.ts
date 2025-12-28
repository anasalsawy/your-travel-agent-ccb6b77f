import { supabase } from "@/integrations/supabase/client";
import { TestConfig, TestHelpers } from "./types";
import { generateTestEmail, countNotifications, getNotificationsByRecord } from "./helpers";

// Helper to get current user ID
const getCurrentUserId = async (): Promise<string | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
};

// ============================================================================
// TICKET REQUEST FULL FLOW - Submit → Quote → Zelle Payment → Ticketed
// ============================================================================
export const ticketZelleFlowTest: TestConfig = {
  id: "ticket-zelle-flow",
  name: "Ticket Request - Zelle Payment",
  description: "Submit → Quote → Zelle payment → Under review → Approve → Issue ticket",
  category: "ticket",
  paymentMethod: "zelle",
  run: async (helpers: TestHelpers) => {
    const { addStep, updateStep, cleanupTicketRequest, waitForTrigger } = helpers;

    // Step 1: Create ticket request
    const step1 = addStep({ name: "Submit ticket request", status: "running" });
    const userId = await getCurrentUserId();
    if (!userId) {
      updateStep(step1, {
        status: "fail",
        expected: "User authenticated",
        actual: "No authenticated user",
      });
      throw new Error("Not authenticated");
    }
    
    const testEmail = generateTestEmail("ticket_zelle");
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const { data: request, error: createError } = await supabase
      .from("ticket_requests")
      .insert({
        user_id: userId,
        origin: "TEST_JFK",
        destination: "TEST_CDG",
        departure_date: futureDate,
        passengers: 2,
        cabin_class: "business",
        contact_email: testEmail,
        status: "submitted",
        trip_type: "round-trip",
      })
      .select()
      .single();

    if (createError || !request) {
      updateStep(step1, { status: "fail", error: createError?.message });
      throw new Error("Failed to create request");
    }
    updateStep(step1, {
      status: "pass",
      expected: "Request submitted",
      actual: `Request ${request.id.slice(0, 8)}`,
    });

    try {
      // Step 2: Verify request_received notification
      const step2 = addStep({
        name: "Verify ticket_request_received notification",
        status: "running",
      });
      await waitForTrigger();
      const receivedCount = await countNotifications(
        request.id,
        "ticket_request_received"
      );
      updateStep(step2, {
        status: receivedCount >= 1 ? "pass" : "fail",
        expected: "≥1 notification",
        actual: `Found ${receivedCount}`,
      });

      // Step 3: Admin sets quote
      const step3 = addStep({ name: "Admin sets quote", status: "running" });
      const { error: quoteError } = await supabase
        .from("ticket_requests")
        .update({
          quoted_price: 1850.0,
          status: "quoted",
        })
        .eq("id", request.id);

      if (quoteError) {
        updateStep(step3, { status: "fail", error: quoteError.message });
        throw new Error("Failed to set quote");
      }
      updateStep(step3, {
        status: "pass",
        expected: "Quote set",
        actual: "$1,850.00",
      });

      // Step 4: Verify quote_ready notification
      const step4 = addStep({
        name: "Verify ticket_quote_ready notification",
        status: "running",
      });
      await waitForTrigger();
      const quoteCount = await countNotifications(
        request.id,
        "ticket_quote_ready"
      );
      updateStep(step4, {
        status: quoteCount >= 1 ? "pass" : "fail",
        expected: "≥1 notification",
        actual: `Found ${quoteCount}`,
      });

      // Step 5: Customer selects Zelle and submits proof
      const step5 = addStep({
        name: "Customer submits Zelle payment proof",
        status: "running",
      });
      const { error: paymentError } = await supabase
        .from("ticket_requests")
        .update({
          payment_method: "zelle",
          payment_status: "under_review",
          proof_upload_url: `test-proof/ticket/${request.id}/zelle.png`,
        })
        .eq("id", request.id);

      if (paymentError) {
        updateStep(step5, { status: "fail", error: paymentError.message });
        throw new Error("Failed to submit payment");
      }
      updateStep(step5, {
        status: "pass",
        expected: "Payment status → under_review",
        actual: "Proof submitted",
      });

      // Step 6: Verify payment_under_review notification
      const step6 = addStep({
        name: "Verify ticket_payment_under_review notification",
        status: "running",
      });
      await waitForTrigger();
      const underReviewCount = await countNotifications(
        request.id,
        "ticket_payment_under_review"
      );
      updateStep(step6, {
        status: underReviewCount >= 1 ? "pass" : "fail",
        expected: "≥1 notification",
        actual: `Found ${underReviewCount}`,
      });

      // Step 7: Admin approves payment
      const step7 = addStep({
        name: "Admin approves payment",
        status: "running",
      });
      const { error: approveError } = await supabase
        .from("ticket_requests")
        .update({
          payment_status: "completed",
          status: "paid",
        })
        .eq("id", request.id);

      if (approveError) {
        updateStep(step7, { status: "fail", error: approveError.message });
        throw new Error("Failed to approve");
      }
      updateStep(step7, {
        status: "pass",
        expected: "Status → paid",
        actual: "Payment approved",
      });

      // Step 8: Verify payment_approved notification
      const step8 = addStep({
        name: "Verify ticket_payment_approved notification",
        status: "running",
      });
      await waitForTrigger();
      const approvedCount = await countNotifications(
        request.id,
        "ticket_payment_approved"
      );
      updateStep(step8, {
        status: approvedCount >= 1 ? "pass" : "fail",
        expected: "≥1 notification",
        actual: `Found ${approvedCount}`,
      });

      // Step 9: Admin issues ticket
      const step9 = addStep({ name: "Admin issues ticket", status: "running" });
      const { error: ticketError } = await supabase
        .from("ticket_requests")
        .update({
          status: "ticketed",
          issued_ticket_info: "E-ticket: ABC123XYZ",
        })
        .eq("id", request.id);

      if (ticketError) {
        updateStep(step9, { status: "fail", error: ticketError.message });
        throw new Error("Failed to issue ticket");
      }
      updateStep(step9, {
        status: "pass",
        expected: "Status → ticketed",
        actual: "Ticket issued",
      });

      // Step 10: Verify ticket_issued notification
      const step10 = addStep({
        name: "Verify ticket_issued notification",
        status: "running",
      });
      await waitForTrigger();
      const issuedCount = await countNotifications(request.id, "ticket_issued");
      updateStep(step10, {
        status: issuedCount >= 1 ? "pass" : "fail",
        expected: "≥1 notification",
        actual: `Found ${issuedCount}`,
      });

      // Step 11: Complete request
      const step11 = addStep({
        name: "Mark request completed",
        status: "running",
      });
      const { error: completeError } = await supabase
        .from("ticket_requests")
        .update({ status: "completed" })
        .eq("id", request.id);

      if (completeError) {
        updateStep(step11, { status: "fail", error: completeError.message });
        throw new Error("Failed to complete");
      }
      updateStep(step11, {
        status: "pass",
        expected: "Status → completed",
        actual: "Request completed",
      });

      // Cleanup
      await cleanupTicketRequest(request.id);
    } catch (e) {
      await cleanupTicketRequest(request.id);
      throw e;
    }
  },
};

// ============================================================================
// TICKET REQUEST BITCOIN FLOW
// ============================================================================
export const ticketBitcoinFlowTest: TestConfig = {
  id: "ticket-bitcoin-flow",
  name: "Ticket Request - Bitcoin Payment",
  description: "Submit → Quote → BTC payment → Approve → Issue ticket",
  category: "ticket",
  paymentMethod: "bitcoin",
  run: async (helpers: TestHelpers) => {
    const { addStep, updateStep, cleanupTicketRequest, waitForTrigger } = helpers;

// Step 1: Create request
    const step1 = addStep({ name: "Submit ticket request", status: "running" });
    const userId = await getCurrentUserId();
    if (!userId) {
      updateStep(step1, {
        status: "fail",
        expected: "User authenticated",
        actual: "No authenticated user",
      });
      throw new Error("Not authenticated");
    }
    
    const testEmail = generateTestEmail("ticket_btc");
    const futureDate = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const { data: request, error } = await supabase
      .from("ticket_requests")
      .insert({
        user_id: userId,
        origin: "TEST_LAX",
        destination: "TEST_NRT",
        departure_date: futureDate,
        passengers: 1,
        cabin_class: "first",
        contact_email: testEmail,
        status: "submitted",
      })
      .select()
      .single();

    if (error || !request) {
      updateStep(step1, { status: "fail", error: error?.message });
      throw new Error("Failed to create request");
    }
    updateStep(step1, {
      status: "pass",
      expected: "Request submitted",
      actual: `Request ${request.id.slice(0, 8)}`,
    });

    try {
      // Step 2: Set quote
      const step2 = addStep({ name: "Admin sets quote", status: "running" });
      const { error: quoteError } = await supabase
        .from("ticket_requests")
        .update({
          quoted_price: 8500.0,
          status: "quoted",
        })
        .eq("id", request.id);

      if (quoteError) {
        updateStep(step2, { status: "fail", error: quoteError.message });
        throw new Error("Failed to set quote");
      }
      updateStep(step2, { status: "pass", actual: "$8,500.00" });

      // Step 3: Customer pays with Bitcoin
      const step3 = addStep({
        name: "Customer submits BTC payment",
        status: "running",
      });
      await waitForTrigger();
      const { error: payError } = await supabase
        .from("ticket_requests")
        .update({
          payment_method: "bitcoin",
          payment_status: "under_review",
          btc_address: "bc1qticket123",
          btc_amount: "0.25",
          proof_upload_url: `test-proof/ticket/${request.id}/btc.png`,
        })
        .eq("id", request.id);

      if (payError) {
        updateStep(step3, { status: "fail", error: payError.message });
        throw new Error("Failed to submit payment");
      }
      updateStep(step3, {
        status: "pass",
        expected: "BTC payment submitted",
        actual: "0.25 BTC",
      });

      // Step 4: Approve and issue ticket
      const step4 = addStep({
        name: "Approve payment and issue ticket",
        status: "running",
      });
      await waitForTrigger();
      const { error: approveError } = await supabase
        .from("ticket_requests")
        .update({
          payment_status: "completed",
          status: "ticketed",
          issued_ticket_info: "First Class e-Ticket: FC789",
        })
        .eq("id", request.id);

      if (approveError) {
        updateStep(step4, { status: "fail", error: approveError.message });
        throw new Error("Failed to approve");
      }
      updateStep(step4, { status: "pass", actual: "Ticket issued" });

      // Step 5: Verify notifications
      const step5 = addStep({
        name: "Verify all notifications logged",
        status: "running",
      });
      await waitForTrigger();
      const allNotifs = await getNotificationsByRecord(request.id);
      const eventTypes = [...new Set(allNotifs.map((n) => n.event_type))];

      updateStep(step5, {
        status: allNotifs.length >= 3 ? "pass" : "fail",
        expected: "Multiple notification types",
        actual: eventTypes.join(", "),
      });

      // Cleanup
      await cleanupTicketRequest(request.id);
    } catch (e) {
      await cleanupTicketRequest(request.id);
      throw e;
    }
  },
};

// ============================================================================
// TICKET REQUEST STRIPE FLOW (Mock)
// ============================================================================
export const ticketStripeFlowTest: TestConfig = {
  id: "ticket-stripe-flow",
  name: "Ticket Request - Stripe Payment (Mock)",
  description: "Submit → Quote → Mock Stripe payment → Issue ticket",
  category: "ticket",
  paymentMethod: "stripe",
  run: async (helpers: TestHelpers) => {
    const { addStep, updateStep, cleanupTicketRequest, waitForTrigger } = helpers;

// Step 1: Create request
    const step1 = addStep({ name: "Submit ticket request", status: "running" });
    const userId = await getCurrentUserId();
    if (!userId) {
      updateStep(step1, {
        status: "fail",
        expected: "User authenticated",
        actual: "No authenticated user",
      });
      throw new Error("Not authenticated");
    }
    
    const testEmail = generateTestEmail("ticket_stripe");
    const futureDate = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const { data: request, error } = await supabase
      .from("ticket_requests")
      .insert({
        user_id: userId,
        origin: "TEST_ORD",
        destination: "TEST_LHR",
        departure_date: futureDate,
        passengers: 1,
        cabin_class: "economy",
        contact_email: testEmail,
        status: "submitted",
      })
      .select()
      .single();

    if (error || !request) {
      updateStep(step1, { status: "fail", error: error?.message });
      throw new Error("Failed to create request");
    }
    updateStep(step1, { status: "pass", actual: `Request ${request.id.slice(0, 8)}` });

    try {
      // Step 2: Set quote
      const step2 = addStep({ name: "Admin sets quote", status: "running" });
      const { error: quoteError } = await supabase
        .from("ticket_requests")
        .update({
          quoted_price: 650.0,
          status: "quoted",
        })
        .eq("id", request.id);

      if (quoteError) {
        updateStep(step2, { status: "fail", error: quoteError.message });
        throw new Error("Quote failed");
      }
      updateStep(step2, { status: "pass", actual: "$650.00" });

      // Step 3: Mock Stripe payment
      const step3 = addStep({
        name: "Mock Stripe payment succeeded",
        status: "running",
      });
      await waitForTrigger();
      const mockSessionId = `cs_ticket_${Date.now()}`;
      const { error: payError } = await supabase
        .from("ticket_requests")
        .update({
          payment_method: "stripe",
          payment_status: "completed",
          status: "paid",
          stripe_session_id: mockSessionId,
        })
        .eq("id", request.id);

      if (payError) {
        updateStep(step3, { status: "fail", error: payError.message });
        throw new Error("Payment failed");
      }
      updateStep(step3, { status: "pass", actual: "Payment completed" });

      // Step 4: Issue ticket
      const step4 = addStep({ name: "Issue ticket", status: "running" });
      const { error: issueError } = await supabase
        .from("ticket_requests")
        .update({
          status: "ticketed",
          issued_ticket_info: "Economy e-Ticket: EC456",
        })
        .eq("id", request.id);

      if (issueError) {
        updateStep(step4, { status: "fail", error: issueError.message });
        throw new Error("Issue failed");
      }
      updateStep(step4, { status: "pass", actual: "Ticket issued" });

      // Step 5: Verify final state
      const step5 = addStep({ name: "Verify final state", status: "running" });
      const { data: finalReq } = await supabase
        .from("ticket_requests")
        .select("*")
        .eq("id", request.id)
        .single();

      if (finalReq?.status === "ticketed" && finalReq?.payment_status === "completed") {
        updateStep(step5, {
          status: "pass",
          expected: "ticketed + completed",
          actual: `${finalReq.status} + ${finalReq.payment_status}`,
        });
      } else {
        updateStep(step5, {
          status: "fail",
          expected: "ticketed + completed",
          actual: `${finalReq?.status} + ${finalReq?.payment_status}`,
        });
      }

      // Cleanup
      await cleanupTicketRequest(request.id);
    } catch (e) {
      await cleanupTicketRequest(request.id);
      throw e;
    }
  },
};

export const ticketTests: TestConfig[] = [
  ticketZelleFlowTest,
  ticketBitcoinFlowTest,
  ticketStripeFlowTest,
];
