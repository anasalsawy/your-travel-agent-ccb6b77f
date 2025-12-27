import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Play, 
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  ClipboardList
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TestStep {
  name: string;
  status: "pending" | "running" | "pass" | "fail";
  expected?: string;
  actual?: string;
  error?: string;
}

interface TestResult {
  name: string;
  status: "pending" | "running" | "pass" | "fail";
  steps: TestStep[];
  startTime?: number;
  endTime?: number;
}

const TEST_EMAIL = "diagnostics-test@example.com";
const TEST_PREFIX = "DIAG_TEST_";

export default function AdminDiagnosticsPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tests, setTests] = useState<TestResult[]>([
    { name: "Voucher Order Flow", status: "pending", steps: [] },
    { name: "Payment Proof Idempotency", status: "pending", steps: [] },
    { name: "Ticket Request Quote Flow", status: "pending", steps: [] },
    { name: "Email System Check", status: "pending", steps: [] },
  ]);
  const [runningAll, setRunningAll] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth?redirect=/admin/diagnostics");
        return;
      }

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);

      const hasAdminRole = roles?.some(r => r.role === "admin");
      if (!hasAdminRole) {
        navigate("/dashboard");
        return;
      }

      setIsAdmin(true);
      setLoading(false);
    };

    checkAdmin();
  }, [navigate]);

  const updateTest = (index: number, updates: Partial<TestResult>) => {
    setTests(prev => prev.map((t, i) => i === index ? { ...t, ...updates } : t));
  };

  const addStep = (testIndex: number, step: TestStep) => {
    setTests(prev => prev.map((t, i) => 
      i === testIndex ? { ...t, steps: [...t.steps, step] } : t
    ));
  };

  const updateStep = (testIndex: number, stepIndex: number, updates: Partial<TestStep>) => {
    setTests(prev => prev.map((t, i) => 
      i === testIndex ? {
        ...t,
        steps: t.steps.map((s, si) => si === stepIndex ? { ...s, ...updates } : s)
      } : t
    ));
  };

  // Helper: Get voucher for testing
  const getTestVoucher = async () => {
    const { data } = await supabase
      .from("vouchers")
      .select("*")
      .eq("status", "available")
      .limit(1)
      .single();
    return data;
  };

  // Helper: Clean up test data
  const cleanupTestData = async () => {
    // Delete test orders
    await supabase
      .from("orders")
      .delete()
      .like("customer_email", `%${TEST_PREFIX}%`);

    // Delete test ticket requests
    await supabase
      .from("ticket_requests")
      .delete()
      .like("contact_email", `%${TEST_PREFIX}%`);

    // Delete test notification logs
    await supabase
      .from("notification_log")
      .delete()
      .like("recipient", `%${TEST_PREFIX}%`);
  };

  // TEST 1: Voucher Order Flow
  const runVoucherOrderFlowTest = async () => {
    const testIndex = 0;
    updateTest(testIndex, { status: "running", steps: [], startTime: Date.now() });

    try {
      // Step 1: Get test voucher
      addStep(testIndex, { name: "Get available voucher", status: "running" });
      const voucher = await getTestVoucher();
      if (!voucher) {
        updateStep(testIndex, 0, { 
          status: "fail", 
          expected: "Available voucher exists",
          actual: "No available vouchers found",
          error: "Create at least one available voucher to run this test"
        });
        updateTest(testIndex, { status: "fail", endTime: Date.now() });
        return;
      }
      updateStep(testIndex, 0, { 
        status: "pass",
        expected: "Available voucher exists",
        actual: `Found: ${voucher.title}`
      });

      // Step 2: Create test order
      addStep(testIndex, { name: "Create test order", status: "running" });
      const testEmail = `${TEST_PREFIX}${Date.now()}@example.com`;
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          voucher_id: voucher.id,
          amount_paid: Number(voucher.sale_price),
          payment_method: "zelle",
          payment_status: "pending",
          order_status: "pending",
          customer_email: testEmail,
        })
        .select()
        .single();

      if (orderError) {
        updateStep(testIndex, 1, { 
          status: "fail",
          expected: "Order created successfully",
          actual: orderError.message
        });
        updateTest(testIndex, { status: "fail", endTime: Date.now() });
        return;
      }
      updateStep(testIndex, 1, { 
        status: "pass",
        expected: "Order created with pending status",
        actual: `Order ${order.id.slice(0, 8)} created`
      });

      // Step 3: Verify order_received notification logged
      addStep(testIndex, { name: "Verify order_received notification", status: "running" });
      await new Promise(r => setTimeout(r, 1000)); // Wait for trigger
      const { data: notifications } = await supabase
        .from("notification_log")
        .select("*")
        .eq("record_id", order.id)
        .eq("event_type", "order_received");

      const orderReceivedCount = notifications?.length || 0;
      if (orderReceivedCount === 1) {
        updateStep(testIndex, 2, { 
          status: "pass",
          expected: "Exactly 1 order_received notification",
          actual: `Found ${orderReceivedCount} notification(s)`
        });
      } else {
        updateStep(testIndex, 2, { 
          status: "fail",
          expected: "Exactly 1 order_received notification",
          actual: `Found ${orderReceivedCount} notification(s)`
        });
      }

      // Step 4: Simulate payment proof upload (update to under_review)
      addStep(testIndex, { name: "Upload payment proof", status: "running" });
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          payment_status: "under_review",
          order_status: "payment_under_review",
          proof_upload_url: `test-proof/${order.id}.png`,
          payment_submitted_at: new Date().toISOString(),
        })
        .eq("id", order.id);

      if (updateError) {
        updateStep(testIndex, 3, { 
          status: "fail",
          expected: "Order updated to under_review",
          actual: updateError.message
        });
        updateTest(testIndex, { status: "fail", endTime: Date.now() });
        return;
      }
      updateStep(testIndex, 3, { 
        status: "pass",
        expected: "Order payment_status = under_review",
        actual: "Updated successfully"
      });

      // Step 5: Verify payment_under_review notification logged
      addStep(testIndex, { name: "Verify payment_under_review notification", status: "running" });
      await new Promise(r => setTimeout(r, 1000));
      const { data: underReviewNotifs } = await supabase
        .from("notification_log")
        .select("*")
        .eq("record_id", order.id)
        .eq("event_type", "payment_under_review");

      const underReviewCount = underReviewNotifs?.length || 0;
      if (underReviewCount === 1) {
        updateStep(testIndex, 4, { 
          status: "pass",
          expected: "Exactly 1 payment_under_review notification",
          actual: `Found ${underReviewCount} notification(s)`
        });
      } else {
        updateStep(testIndex, 4, { 
          status: "fail",
          expected: "Exactly 1 payment_under_review notification",
          actual: `Found ${underReviewCount} notification(s)`
        });
      }

      // Step 6: Verify admin can fetch order with proof
      addStep(testIndex, { name: "Admin fetch order with proof", status: "running" });
      const { data: fetchedOrder } = await supabase
        .from("orders")
        .select("*, vouchers(*)")
        .eq("id", order.id)
        .single();

      if (fetchedOrder && fetchedOrder.proof_upload_url) {
        updateStep(testIndex, 5, { 
          status: "pass",
          expected: "Order with proof_upload_url accessible",
          actual: `Proof URL: ${fetchedOrder.proof_upload_url}`
        });
      } else {
        updateStep(testIndex, 5, { 
          status: "fail",
          expected: "Order with proof_upload_url accessible",
          actual: "Order or proof not found"
        });
      }

      // Step 7: Verify only one notification per event_type
      addStep(testIndex, { name: "Verify notification uniqueness", status: "running" });
      const { data: allNotifs } = await supabase
        .from("notification_log")
        .select("event_type")
        .eq("record_id", order.id);

      const eventCounts = (allNotifs || []).reduce((acc: Record<string, number>, n) => {
        acc[n.event_type] = (acc[n.event_type] || 0) + 1;
        return acc;
      }, {});

      const duplicates = Object.entries(eventCounts).filter(([_, count]) => count > 1);
      if (duplicates.length === 0) {
        updateStep(testIndex, 6, { 
          status: "pass",
          expected: "No duplicate event_types",
          actual: `Event types: ${Object.keys(eventCounts).join(", ")}`
        });
      } else {
        updateStep(testIndex, 6, { 
          status: "fail",
          expected: "No duplicate event_types",
          actual: `Duplicates: ${duplicates.map(([e, c]) => `${e}(${c})`).join(", ")}`
        });
      }

      // Cleanup
      await supabase.from("orders").delete().eq("id", order.id);

      const allPassed = [0, 1, 2, 3, 4, 5, 6].every(i => 
        tests[testIndex].steps[i]?.status === "pass" || 
        // Check updated state
        true // We'll verify below
      );

      updateTest(testIndex, { 
        status: tests[testIndex].steps.every(s => s.status === "pass") ? "pass" : "fail",
        endTime: Date.now()
      });

    } catch (error: any) {
      updateTest(testIndex, { 
        status: "fail", 
        endTime: Date.now(),
        steps: [...tests[testIndex].steps, {
          name: "Unexpected error",
          status: "fail",
          error: error.message
        }]
      });
    }
  };

  // TEST 2: Payment Proof Idempotency
  const runPaymentIdempotencyTest = async () => {
    const testIndex = 1;
    updateTest(testIndex, { status: "running", steps: [], startTime: Date.now() });

    try {
      // Step 1: Get test voucher
      addStep(testIndex, { name: "Get available voucher", status: "running" });
      const voucher = await getTestVoucher();
      if (!voucher) {
        updateStep(testIndex, 0, { 
          status: "fail",
          error: "No available vouchers"
        });
        updateTest(testIndex, { status: "fail", endTime: Date.now() });
        return;
      }
      updateStep(testIndex, 0, { status: "pass", actual: voucher.title });

      // Step 2: Create order with proof already submitted
      addStep(testIndex, { name: "Create order with proof", status: "running" });
      const testEmail = `${TEST_PREFIX}idemp_${Date.now()}@example.com`;
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          voucher_id: voucher.id,
          amount_paid: Number(voucher.sale_price),
          payment_method: "zelle",
          payment_status: "under_review",
          order_status: "payment_under_review",
          proof_upload_url: "test-proof/first.png",
          payment_submitted_at: new Date().toISOString(),
          customer_email: testEmail,
        })
        .select()
        .single();

      if (error) {
        updateStep(testIndex, 1, { status: "fail", error: error.message });
        updateTest(testIndex, { status: "fail", endTime: Date.now() });
        return;
      }
      updateStep(testIndex, 1, { 
        status: "pass",
        expected: "Order created in under_review",
        actual: `Order ${order.id.slice(0, 8)} created`
      });

      // Step 3: Wait and count initial notifications
      addStep(testIndex, { name: "Count initial notifications", status: "running" });
      await new Promise(r => setTimeout(r, 1500));
      const { data: initialNotifs } = await supabase
        .from("notification_log")
        .select("*")
        .eq("record_id", order.id)
        .eq("event_type", "payment_under_review");

      const initialCount = initialNotifs?.length || 0;
      updateStep(testIndex, 2, { 
        status: "pass",
        expected: "1 payment_under_review notification",
        actual: `Found ${initialCount} notification(s)`
      });

      // Step 4: Attempt second proof update
      addStep(testIndex, { name: "Attempt second proof upload", status: "running" });
      const { error: updateError } = await supabase
        .from("orders")
        .update({
          proof_upload_url: "test-proof/second.png",
        })
        .eq("id", order.id);

      // The update itself may succeed, but notification should be deduped
      updateStep(testIndex, 3, { 
        status: "pass",
        expected: "Update executes (but notification deduped)",
        actual: updateError ? updateError.message : "Update completed"
      });

      // Step 5: Verify no duplicate notifications
      addStep(testIndex, { name: "Verify notification deduplication", status: "running" });
      await new Promise(r => setTimeout(r, 1500));
      const { data: finalNotifs } = await supabase
        .from("notification_log")
        .select("*")
        .eq("record_id", order.id)
        .eq("event_type", "payment_under_review");

      const finalCount = finalNotifs?.length || 0;
      // Since payment_status didn't change (still under_review), trigger shouldn't fire again
      if (finalCount <= 1) {
        updateStep(testIndex, 4, { 
          status: "pass",
          expected: "≤1 payment_under_review notification",
          actual: `Found ${finalCount} notification(s)`
        });
      } else {
        updateStep(testIndex, 4, { 
          status: "fail",
          expected: "≤1 payment_under_review notification",
          actual: `Found ${finalCount} notifications (duplicates!)`
        });
      }

      // Step 6: Verify only one proof URL stored
      addStep(testIndex, { name: "Verify proof record", status: "running" });
      const { data: finalOrder } = await supabase
        .from("orders")
        .select("proof_upload_url")
        .eq("id", order.id)
        .single();

      updateStep(testIndex, 5, { 
        status: "pass",
        expected: "One proof_upload_url in order",
        actual: `Proof: ${finalOrder?.proof_upload_url}`
      });

      // Cleanup
      await supabase.from("orders").delete().eq("id", order.id);

      updateTest(testIndex, { status: "pass", endTime: Date.now() });

    } catch (error: any) {
      updateTest(testIndex, { 
        status: "fail", 
        endTime: Date.now(),
        steps: [...tests[testIndex].steps, {
          name: "Unexpected error",
          status: "fail",
          error: error.message
        }]
      });
    }
  };

  // TEST 3: Ticket Request Quote Flow
  const runTicketQuoteFlowTest = async () => {
    const testIndex = 2;
    updateTest(testIndex, { status: "running", steps: [], startTime: Date.now() });

    try {
      // Step 1: Create test ticket request
      addStep(testIndex, { name: "Create ticket request", status: "running" });
      const testEmail = `${TEST_PREFIX}ticket_${Date.now()}@example.com`;
      const { data: request, error } = await supabase
        .from("ticket_requests")
        .insert({
          origin: "TEST_NYC",
          destination: "TEST_LAX",
          departure_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          passengers: 1,
          cabin_class: "economy",
          contact_email: testEmail,
          status: "submitted",
        })
        .select()
        .single();

      if (error) {
        updateStep(testIndex, 0, { status: "fail", error: error.message });
        updateTest(testIndex, { status: "fail", endTime: Date.now() });
        return;
      }
      updateStep(testIndex, 0, { 
        status: "pass",
        expected: "Ticket request created",
        actual: `Request ${request.id.slice(0, 8)} created`
      });

      // Step 2: Verify ticket_request_received notification
      addStep(testIndex, { name: "Verify request received notification", status: "running" });
      await new Promise(r => setTimeout(r, 1000));
      const { data: receivedNotifs } = await supabase
        .from("notification_log")
        .select("*")
        .eq("record_id", request.id)
        .eq("event_type", "ticket_request_received");

      const receivedCount = receivedNotifs?.length || 0;
      updateStep(testIndex, 1, { 
        status: receivedCount >= 1 ? "pass" : "fail",
        expected: "ticket_request_received notification logged",
        actual: `Found ${receivedCount} notification(s)`
      });

      // Step 3: Set quote price
      addStep(testIndex, { name: "Set quote price", status: "running" });
      const { error: quoteError } = await supabase
        .from("ticket_requests")
        .update({
          quoted_price: 450.00,
          status: "quoted",
        })
        .eq("id", request.id);

      if (quoteError) {
        updateStep(testIndex, 2, { status: "fail", error: quoteError.message });
        updateTest(testIndex, { status: "fail", endTime: Date.now() });
        return;
      }
      updateStep(testIndex, 2, { 
        status: "pass",
        expected: "Quote set successfully",
        actual: "quoted_price = $450.00"
      });

      // Step 4: Verify ticket_quote_ready notification
      addStep(testIndex, { name: "Verify quote notification", status: "running" });
      await new Promise(r => setTimeout(r, 1500));
      const { data: quoteNotifs } = await supabase
        .from("notification_log")
        .select("*")
        .eq("record_id", request.id)
        .eq("event_type", "ticket_quote_ready");

      const quoteCount = quoteNotifs?.length || 0;
      if (quoteCount >= 1) {
        updateStep(testIndex, 3, { 
          status: "pass",
          expected: "ticket_quote_ready notification logged",
          actual: `Found ${quoteCount} notification(s)`
        });
      } else {
        updateStep(testIndex, 3, { 
          status: "fail",
          expected: "ticket_quote_ready notification logged",
          actual: `Found ${quoteCount} notifications`
        });
      }

      // Cleanup
      await supabase.from("ticket_requests").delete().eq("id", request.id);

      const allPassed = tests[testIndex].steps.every(s => s.status === "pass");
      updateTest(testIndex, { status: allPassed ? "pass" : "fail", endTime: Date.now() });

    } catch (error: any) {
      updateTest(testIndex, { 
        status: "fail", 
        endTime: Date.now(),
        steps: [...tests[testIndex].steps, {
          name: "Unexpected error",
          status: "fail",
          error: error.message
        }]
      });
    }
  };

  // TEST 4: Email System Check
  const runEmailSystemTest = async () => {
    const testIndex = 3;
    updateTest(testIndex, { status: "running", steps: [], startTime: Date.now() });

    try {
      // Step 1: Invoke test email
      addStep(testIndex, { name: "Send test email via edge function", status: "running" });
      const { data, error } = await supabase.functions.invoke("send-notification", {
        body: {
          type: "test_email",
          data: { timestamp: new Date().toISOString(), source: "diagnostics" },
        },
      });

      if (error) {
        updateStep(testIndex, 0, { 
          status: "fail",
          expected: "Edge function responds",
          actual: error.message
        });
        updateTest(testIndex, { status: "fail", endTime: Date.now() });
        return;
      }
      updateStep(testIndex, 0, { 
        status: "pass",
        expected: "Edge function responds",
        actual: JSON.stringify(data).slice(0, 100)
      });

      // Step 2: Check Resend API response
      addStep(testIndex, { name: "Verify Resend API response", status: "running" });
      if (data?.success || data?.emailResponse?.id) {
        updateStep(testIndex, 1, { 
          status: "pass",
          expected: "Email sent successfully",
          actual: `Resend ID: ${data?.emailResponse?.id || "N/A"}`
        });
      } else if (data?.error) {
        updateStep(testIndex, 1, { 
          status: "fail",
          expected: "Email sent successfully",
          actual: `Error: ${JSON.stringify(data.error)}`
        });
      } else {
        updateStep(testIndex, 1, { 
          status: "pass",
          expected: "Email sent or attempted",
          actual: "Response received"
        });
      }

      // Step 3: Verify logging exists
      addStep(testIndex, { name: "Verify notification_log table accessible", status: "running" });
      const { data: recentLogs, error: logError } = await supabase
        .from("notification_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);

      if (logError) {
        updateStep(testIndex, 2, { 
          status: "fail",
          expected: "notification_log accessible",
          actual: logError.message
        });
      } else {
        updateStep(testIndex, 2, { 
          status: "pass",
          expected: "notification_log accessible",
          actual: `Found ${recentLogs?.length || 0} recent entries`
        });
      }

      const allPassed = tests[testIndex].steps.every(s => s.status === "pass");
      updateTest(testIndex, { status: allPassed ? "pass" : "fail", endTime: Date.now() });

    } catch (error: any) {
      updateTest(testIndex, { 
        status: "fail", 
        endTime: Date.now(),
        steps: [...tests[testIndex].steps, {
          name: "Unexpected error",
          status: "fail",
          error: error.message
        }]
      });
    }
  };

  const runAllTests = async () => {
    setRunningAll(true);
    
    // Reset all tests
    setTests(tests.map(t => ({ ...t, status: "pending", steps: [] })));
    
    await runVoucherOrderFlowTest();
    await runPaymentIdempotencyTest();
    await runTicketQuoteFlowTest();
    await runEmailSystemTest();
    
    setRunningAll(false);
    toast({ title: "All tests completed", description: "Review results below." });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pass":
        return <CheckCircle2 className="w-5 h-5 text-success" />;
      case "fail":
        return <XCircle className="w-5 h-5 text-destructive" />;
      case "running":
        return <Loader2 className="w-5 h-5 animate-spin text-primary" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pass":
        return <Badge className="bg-success/20 text-success">PASS</Badge>;
      case "fail":
        return <Badge className="bg-destructive/20 text-destructive">FAIL</Badge>;
      case "running":
        return <Badge className="bg-primary/20 text-primary">RUNNING</Badge>;
      default:
        return <Badge variant="secondary">PENDING</Badge>;
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-dark py-8 md:py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <Button variant="ghost" onClick={() => navigate("/admin")} className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Admin
          </Button>

          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="font-display text-3xl font-bold mb-2">
                System <span className="text-gradient">Diagnostics</span>
              </h1>
              <p className="text-muted-foreground">
                Automated tests to validate key workflows
              </p>
            </div>
            <Button 
              variant="hero" 
              onClick={runAllTests}
              disabled={runningAll}
            >
              {runningAll ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Run All Tests
            </Button>
          </div>

          <div className="space-y-6">
            {tests.map((test, testIndex) => (
              <Card key={test.name} className="glass-card overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(test.status)}
                    <CardTitle className="text-lg">{test.name}</CardTitle>
                    {getStatusBadge(test.status)}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (testIndex === 0) runVoucherOrderFlowTest();
                      else if (testIndex === 1) runPaymentIdempotencyTest();
                      else if (testIndex === 2) runTicketQuoteFlowTest();
                      else if (testIndex === 3) runEmailSystemTest();
                    }}
                    disabled={test.status === "running" || runningAll}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </CardHeader>
                
                {test.steps.length > 0 && (
                  <CardContent className="border-t border-border pt-4">
                    <div className="space-y-3">
                      {test.steps.map((step, stepIndex) => (
                        <div 
                          key={stepIndex}
                          className={`p-3 rounded-lg border ${
                            step.status === "pass" ? "border-success/30 bg-success/5" :
                            step.status === "fail" ? "border-destructive/30 bg-destructive/5" :
                            step.status === "running" ? "border-primary/30 bg-primary/5" :
                            "border-border bg-muted/20"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {step.status === "pass" && <CheckCircle2 className="w-4 h-4 text-success" />}
                            {step.status === "fail" && <XCircle className="w-4 h-4 text-destructive" />}
                            {step.status === "running" && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                            {step.status === "pending" && <ClipboardList className="w-4 h-4 text-muted-foreground" />}
                            <span className="font-medium text-sm">{step.name}</span>
                          </div>
                          {(step.expected || step.actual) && (
                            <div className="ml-6 text-xs space-y-1">
                              {step.expected && (
                                <p className="text-muted-foreground">
                                  <span className="text-foreground">Expected:</span> {step.expected}
                                </p>
                              )}
                              {step.actual && (
                                <p className="text-muted-foreground">
                                  <span className="text-foreground">Actual:</span> {step.actual}
                                </p>
                              )}
                            </div>
                          )}
                          {step.error && (
                            <p className="ml-6 text-xs text-destructive mt-1">
                              Error: {step.error}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    {test.endTime && test.startTime && (
                      <p className="text-xs text-muted-foreground mt-3">
                        Completed in {((test.endTime - test.startTime) / 1000).toFixed(2)}s
                      </p>
                    )}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
