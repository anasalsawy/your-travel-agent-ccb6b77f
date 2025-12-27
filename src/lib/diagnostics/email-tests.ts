import { supabase } from "@/integrations/supabase/client";
import { TestConfig, TestHelpers } from "./types";

export const emailSystemTest: TestConfig = {
  id: "email-system",
  name: "Email System Check",
  description: "Test email delivery via edge function and verify logging",
  category: "email",
  run: async (helpers: TestHelpers) => {
    const { addStep, updateStep, waitForTrigger } = helpers;

    // Step 1: Invoke test email
    const step1 = addStep({
      name: "Send test email via edge function",
      status: "running",
    });
    const { data, error } = await supabase.functions.invoke("send-notification", {
      body: {
        type: "test_email",
        data: { timestamp: new Date().toISOString(), source: "diagnostics" },
      },
    });

    if (error) {
      updateStep(step1, {
        status: "fail",
        expected: "Edge function responds",
        actual: error.message,
      });
      throw new Error("Edge function failed");
    }
    updateStep(step1, {
      status: "pass",
      expected: "Edge function responds",
      actual: JSON.stringify(data).slice(0, 100),
    });

    // Step 2: Check Resend API response
    const step2 = addStep({
      name: "Verify Resend API response",
      status: "running",
    });
    if (data?.success || data?.emailResponse?.id) {
      updateStep(step2, {
        status: "pass",
        expected: "Email sent successfully",
        actual: `Resend ID: ${data?.emailResponse?.id || "N/A"}`,
      });
    } else if (data?.error) {
      updateStep(step2, {
        status: "fail",
        expected: "Email sent successfully",
        actual: `Error: ${JSON.stringify(data.error)}`,
      });
    } else {
      updateStep(step2, {
        status: "pass",
        expected: "Email attempted",
        actual: "Response received",
      });
    }

    // Step 3: Verify notification_log accessible
    const step3 = addStep({
      name: "Verify notification_log table accessible",
      status: "running",
    });
    const { data: recentLogs, error: logError } = await supabase
      .from("notification_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);

    if (logError) {
      updateStep(step3, {
        status: "fail",
        expected: "notification_log accessible",
        actual: logError.message,
      });
    } else {
      updateStep(step3, {
        status: "pass",
        expected: "notification_log accessible",
        actual: `Found ${recentLogs?.length || 0} recent entries`,
      });
    }

    // Step 4: Show recent notification types
    const step4 = addStep({
      name: "List recent notification types",
      status: "running",
    });
    const eventTypes = [...new Set(recentLogs?.map((l) => l.event_type) || [])];
    updateStep(step4, {
      status: "pass",
      expected: "Show variety of event types",
      actual: eventTypes.length > 0 ? eventTypes.join(", ") : "No recent logs",
    });
  },
};

export const emailTests: TestConfig[] = [emailSystemTest];
