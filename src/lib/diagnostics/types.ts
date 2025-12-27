export interface TestStep {
  name: string;
  status: "pending" | "running" | "pass" | "fail";
  expected?: string;
  actual?: string;
  error?: string;
}

export interface TestResult {
  name: string;
  status: "pending" | "running" | "pass" | "fail";
  steps: TestStep[];
  startTime?: number;
  endTime?: number;
}

export interface TestSuite {
  name: string;
  description: string;
  tests: TestConfig[];
}

export interface TestConfig {
  id: string;
  name: string;
  description: string;
  category: "voucher" | "ticket" | "email";
  paymentMethod?: "zelle" | "bitcoin" | "stripe";
  run: (helpers: TestHelpers) => Promise<void>;
}

export interface TestHelpers {
  addStep: (step: Omit<TestStep, "status"> & { status?: TestStep["status"] }) => number;
  updateStep: (index: number, updates: Partial<TestStep>) => void;
  getTestVoucher: () => Promise<any>;
  cleanupOrder: (orderId: string) => Promise<void>;
  cleanupTicketRequest: (requestId: string) => Promise<void>;
  waitForTrigger: (ms?: number) => Promise<void>;
}

export const TEST_EMAIL_PREFIX = "DIAG_TEST_";
export const TEST_PHONE = "+1555000TEST";
