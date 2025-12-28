import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Play,
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  ClipboardList,
  CreditCard,
  Plane,
  Mail,
  Bitcoin,
  DollarSign,
  ChevronDown,
  Copy,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  TestConfig,
  TestResult,
  TestStep,
  TestHelpers,
  voucherTests,
  ticketTests,
  emailTests,
  getTestVoucher,
  cleanupOrder,
  cleanupTicketRequest,
  waitForTrigger,
} from "@/lib/diagnostics";

type TestCategory = "all" | "voucher" | "ticket" | "email";

export default function AdminDiagnosticsPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<TestCategory>("all");
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [runningTests, setRunningTests] = useState<Set<string>>(new Set());
  const [runningAll, setRunningAll] = useState(false);
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());
  const navigate = useNavigate();
  const { toast } = useToast();

  const allTests = useMemo(
    () => [...voucherTests, ...ticketTests, ...emailTests],
    []
  );

  useEffect(() => {
    const checkAdmin = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth?redirect=/admin/diagnostics");
        return;
      }

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);

      const hasAdminRole = roles?.some((r) => r.role === "admin");
      if (!hasAdminRole) {
        navigate("/dashboard");
        return;
      }

      setIsAdmin(true);
      setLoading(false);

      // Initialize test results
      const initialResults: Record<string, TestResult> = {};
      allTests.forEach((test) => {
        initialResults[test.id] = {
          name: test.name,
          status: "pending",
          steps: [],
        };
      });
      setTestResults(initialResults);
    };

    checkAdmin();
  }, [navigate, allTests]);

  const toggleExpanded = useCallback((testId: string) => {
    setExpandedTests((prev) => {
      const next = new Set(prev);
      if (next.has(testId)) next.delete(testId);
      else next.add(testId);
      return next;
    });
  }, []);

  const copyResultToClipboard = useCallback(
    async (testId: string) => {
      const result = testResults[testId];
      if (!result) return;

      const payload = {
        testId,
        name: result.name,
        status: result.status,
        steps: result.steps,
      };

      try {
        await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
        toast({ title: "Copied", description: "Diagnostics details copied." });
      } catch (e: any) {
        toast({
          title: "Copy failed",
          description: e?.message || "Could not copy to clipboard.",
          variant: "destructive",
        });
      }
    },
    [testResults, toast]
  );

  const runTest = useCallback(
    async (test: TestConfig) => {
      const testId = test.id;

      setRunningTests((prev) => new Set(prev).add(testId));
      setTestResults((prev) => ({
        ...prev,
        [testId]: {
          name: test.name,
          status: "running",
          steps: [],
          startTime: Date.now(),
        },
      }));

      let stepCounter = 0;

      const helpers: TestHelpers = {
        addStep: (step) => {
          const stepIndex = stepCounter;
          stepCounter += 1;

          setTestResults((prev) => {
            const currentSteps = prev[testId]?.steps || [];
            return {
              ...prev,
              [testId]: {
                ...prev[testId],
                steps: [
                  ...currentSteps,
                  { ...step, status: step.status || "running" },
                ],
              },
            };
          });

          return stepIndex;
        },
        updateStep: (index, updates) => {
          setTestResults((prev) => ({
            ...prev,
            [testId]: {
              ...prev[testId],
              steps: prev[testId].steps.map((s, i) =>
                i === index ? { ...s, ...updates } : s
              ),
            },
          }));
        },
        getTestVoucher,
        cleanupOrder,
        cleanupTicketRequest,
        waitForTrigger,
      };

      try {
        await test.run(helpers);

        setTestResults((prev) => {
          const allPassed = prev[testId].steps.every((s) => s.status === "pass");

          if (!allPassed) {
            setExpandedTests((expandedPrev) => {
              const next = new Set(expandedPrev);
              next.add(testId);
              return next;
            });
          }

          return {
            ...prev,
            [testId]: {
              ...prev[testId],
              status: allPassed ? "pass" : "fail",
              endTime: Date.now(),
            },
          };
        });
      } catch (error: any) {
        setTestResults((prev) => ({
          ...prev,
          [testId]: {
            ...prev[testId],
            status: "fail",
            endTime: Date.now(),
            steps: [
              ...prev[testId].steps,
              {
                name: "Test error",
                status: "fail",
                error: error.message,
              },
            ],
          },
        }));

        setExpandedTests((prev) => {
          const next = new Set(prev);
          next.add(testId);
          return next;
        });
      } finally {
        setRunningTests((prev) => {
          const next = new Set(prev);
          next.delete(testId);
          return next;
        });
      }
    },
    []
  );

  const runTestsByCategory = useCallback(
    async (category: TestCategory) => {
      const testsToRun =
        category === "all"
          ? allTests
          : allTests.filter((t) => t.category === category);

      setRunningAll(true);

      for (const test of testsToRun) {
        await runTest(test);
      }

      setRunningAll(false);
      toast({
        title: "Tests completed",
        description: `${testsToRun.length} tests finished. Review results below.`,
      });
    },
    [allTests, runTest, toast]
  );

  const getFilteredTests = useCallback(
    (category: TestCategory) => {
      if (category === "all") return allTests;
      return allTests.filter((t) => t.category === category);
    },
    [allTests]
  );

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

  const getPaymentMethodIcon = (method?: string) => {
    switch (method) {
      case "zelle":
        return <DollarSign className="w-4 h-4" />;
      case "bitcoin":
        return <Bitcoin className="w-4 h-4" />;
      case "stripe":
        return <CreditCard className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "voucher":
        return <CreditCard className="w-4 h-4" />;
      case "ticket":
        return <Plane className="w-4 h-4" />;
      case "email":
        return <Mail className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getSummary = useCallback(() => {
    const results = Object.values(testResults);
    return {
      total: results.length,
      passed: results.filter((r) => r.status === "pass").length,
      failed: results.filter((r) => r.status === "fail").length,
      pending: results.filter((r) => r.status === "pending").length,
      running: results.filter((r) => r.status === "running").length,
    };
  }, [testResults]);

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

  const summary = getSummary();

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-dark py-8 md:py-12">
        <div className="container mx-auto px-4 max-w-5xl">
          <Button
            variant="ghost"
            onClick={() => navigate("/admin")}
            className="mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Admin
          </Button>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="font-display text-3xl font-bold mb-2">
                System <span className="text-gradient">Diagnostics</span>
              </h1>
              <p className="text-muted-foreground">
                Comprehensive workflow testing for all payment methods
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-success">{summary.passed} passed</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-destructive">{summary.failed} failed</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">
                  {summary.pending} pending
                </span>
              </div>
              <Button
                variant="hero"
                onClick={() => runTestsByCategory("all")}
                disabled={runningAll || runningTests.size > 0}
              >
                {runningAll ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                Run All Tests
              </Button>
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as TestCategory)}
          >
            <div className="flex items-center justify-between mb-6">
              <TabsList>
                <TabsTrigger value="all">All Tests</TabsTrigger>
                <TabsTrigger value="voucher" className="gap-2">
                  <CreditCard className="w-4 h-4" />
                  Voucher Orders
                </TabsTrigger>
                <TabsTrigger value="ticket" className="gap-2">
                  <Plane className="w-4 h-4" />
                  Ticket Requests
                </TabsTrigger>
                <TabsTrigger value="email" className="gap-2">
                  <Mail className="w-4 h-4" />
                  Email
                </TabsTrigger>
              </TabsList>

              {activeTab !== "all" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => runTestsByCategory(activeTab)}
                  disabled={runningAll || runningTests.size > 0}
                >
                  <Play className="w-4 h-4 mr-2" />
                  Run {activeTab} tests
                </Button>
              )}
            </div>

            {(["all", "voucher", "ticket", "email"] as TestCategory[]).map(
              (category) => (
                <TabsContent key={category} value={category}>
                  <div className="space-y-4">
                    {getFilteredTests(category).map((test) => {
                      const result = testResults[test.id];
                      const isRunning = runningTests.has(test.id);

                      return (
                        <Card
                          key={test.id}
                          className="glass-card overflow-hidden"
                        >
                          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {getStatusIcon(result?.status || "pending")}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <CardTitle className="text-base">
                                    {test.name}
                                  </CardTitle>
                                  {test.paymentMethod && (
                                    <Badge
                                      variant="outline"
                                      className="gap-1 text-xs"
                                    >
                                      {getPaymentMethodIcon(test.paymentMethod)}
                                      {test.paymentMethod}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                  {test.description}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {getStatusBadge(result?.status || "pending")}
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => toggleExpanded(test.id)}
                                aria-label="Toggle test details"
                              >
                                <ChevronDown
                                  className={
                                    expandedTests.has(test.id)
                                      ? "w-4 h-4 rotate-180 transition-transform"
                                      : "w-4 h-4 transition-transform"
                                  }
                                />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => copyResultToClipboard(test.id)}
                                aria-label="Copy test details"
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => runTest(test)}
                                disabled={isRunning || runningAll}
                                aria-label="Run test"
                              >
                                {isRunning ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-4 h-4" />
                                )}
                              </Button>
                            </div>
                          </CardHeader>

                          {(expandedTests.has(test.id) || result?.status === "fail") && (
                            <CardContent className="border-t border-border pt-4">
                              {result?.steps.length ? (
                                <div className="space-y-2">
                                  {result.steps.map((step, stepIndex) => (
                                    <div
                                      key={stepIndex}
                                      className={`p-3 rounded-lg border text-sm ${
                                        step.status === "pass"
                                          ? "border-success/30 bg-success/5"
                                          : step.status === "fail"
                                          ? "border-destructive/30 bg-destructive/5"
                                          : step.status === "running"
                                          ? "border-primary/30 bg-primary/5"
                                          : "border-border bg-muted/20"
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 mb-1">
                                        {step.status === "pass" && (
                                          <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                                        )}
                                        {step.status === "fail" && (
                                          <XCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                                        )}
                                        {step.status === "running" && (
                                          <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
                                        )}
                                        {step.status === "pending" && (
                                          <ClipboardList className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                        )}
                                        <span className="font-medium">{step.name}</span>
                                      </div>
                                      {(step.expected || step.actual) && (
                                        <div className="ml-6 text-xs space-y-0.5">
                                          {step.expected && (
                                            <p className="text-muted-foreground">
                                              <span className="text-foreground">Expected:</span>{" "}
                                              {step.expected}
                                            </p>
                                          )}
                                          {step.actual && (
                                            <p className="text-muted-foreground">
                                              <span className="text-foreground">Actual:</span>{" "}
                                              {step.actual}
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
                              ) : (
                                <div className="text-sm text-muted-foreground">
                                  No step details were captured for this run.
                                </div>
                              )}

                              {result?.endTime && result.startTime && (
                                <p className="text-xs text-muted-foreground mt-3">
                                  Completed in{" "}
                                  {(
                                    (result.endTime - result.startTime) /
                                    1000
                                  ).toFixed(2)}
                                  s
                                </p>
                              )}
                            </CardContent>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </TabsContent>
              )
            )}
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}
