import { Layout } from "@/components/layout/Layout";
import { AlertTriangle } from "lucide-react";

export default function RefundPolicy() {
  return (
    <Layout>
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-8">Refund Policy</h1>
          <p className="text-muted-foreground mb-8">Last updated: January 23, 2026</p>

          <div className="glass-card p-6 mb-8 border-warning/50">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">Important:</strong> Due to the nature of travel vouchers and flight tickets, refund eligibility varies by product type. Please read this policy carefully before making a purchase.
              </p>
            </div>
          </div>

          <div className="prose prose-lg dark:prose-invert max-w-none space-y-8">
            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">1. General Refund Policy</h2>
              <p className="text-muted-foreground leading-relaxed">
                At Your Travel Agent, we strive to ensure customer satisfaction with every transaction. However, due to the unique nature of travel vouchers and airline tickets, our refund policy differs based on the type of purchase. We are committed to treating each refund request fairly and transparently.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">2. Travel Voucher Purchases</h2>
              
              <h3 className="font-display text-xl font-medium mb-3">Eligibility for Refund</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                You may be eligible for a refund on voucher purchases in the following circumstances:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li><strong>Invalid Voucher:</strong> If the voucher balance is less than stated at time of purchase</li>
                <li><strong>Non-Delivery:</strong> If the voucher is not delivered within the stated timeframe</li>
                <li><strong>Expired Voucher:</strong> If the voucher was expired at the time of sale (not after purchase)</li>
                <li><strong>Fraudulent Listing:</strong> If the voucher was obtained fraudulently or is unusable</li>
              </ul>

              <h3 className="font-display text-xl font-medium mb-3 mt-6">Non-Refundable Situations</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Refunds are generally NOT available when:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>You change your mind after purchase</li>
                <li>The voucher expires after your purchase date</li>
                <li>The airline changes their terms or policies</li>
                <li>You are unable to use the voucher for personal reasons</li>
                <li>The voucher has already been partially or fully redeemed</li>
              </ul>

              <h3 className="font-display text-xl font-medium mb-3 mt-6">Refund Amount</h3>
              <p className="text-muted-foreground leading-relaxed">
                Approved refunds will be processed for the full purchase amount minus any applicable processing fees (typically 3-5% for credit card transactions). Refunds are issued to the original payment method.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">3. Flight Ticket Requests</h2>
              
              <h3 className="font-display text-xl font-medium mb-3">Before Ticketing</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                If you cancel your ticket request before we issue the ticket:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li><strong>Full Refund:</strong> Available if cancelled before we begin the booking process</li>
                <li><strong>Partial Refund:</strong> If we have already begun processing, a service fee may be retained</li>
                <li><strong>Deposit Refund:</strong> Deposits are refundable minus a $25 processing fee if cancelled before quote acceptance</li>
              </ul>

              <h3 className="font-display text-xl font-medium mb-3 mt-6">After Ticketing</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Once a ticket has been issued:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Refunds are subject to airline policies and fare rules</li>
                <li>Non-refundable tickets cannot be refunded regardless of circumstances</li>
                <li>Refundable tickets will incur airline cancellation fees plus our service fee</li>
                <li>Travel insurance claims are handled separately through the insurance provider</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">4. Escrow Transactions</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                For marketplace transactions using our escrow service:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Funds are held until buyer confirms receipt and satisfaction</li>
                <li>Disputes must be raised within 48 hours of delivery confirmation</li>
                <li>Our dispute resolution team will review evidence from both parties</li>
                <li>If the buyer's claim is validated, a full refund will be issued</li>
                <li>Fraudulent claims will result in account suspension</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">5. PayPal Buyer Protection</h2>
              <p className="text-muted-foreground leading-relaxed">
                Purchases made via PayPal are covered under PayPal's Buyer Protection program. If you do not receive your voucher or it is significantly not as described, you may file a claim directly with PayPal within 180 days of payment.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">6. How to Request a Refund</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                To request a refund:
              </p>
              <ol className="list-decimal list-inside text-muted-foreground space-y-2 ml-4">
                <li>Contact our support team via WhatsApp, Telegram, or the contact form within 7 days of purchase</li>
                <li>Provide your order number and reason for the refund request</li>
                <li>Include any supporting documentation (screenshots, emails, etc.)</li>
                <li>Our team will review your request within 2-3 business days</li>
                <li>If approved, refunds are processed within 5-10 business days</li>
              </ol>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">7. Refund Processing Time</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Once a refund is approved:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li><strong>Credit/Debit Card:</strong> 5-10 business days</li>
                <li><strong>PayPal:</strong> 3-5 business days</li>
                <li><strong>Bank Transfer:</strong> 5-7 business days</li>
                <li><strong>Cryptocurrency:</strong> 1-3 business days (subject to network conditions)</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">8. Disputes and Appeals</h2>
              <p className="text-muted-foreground leading-relaxed">
                If your refund request is denied and you believe the decision was incorrect, you may appeal by providing additional documentation within 14 days. All appeals are reviewed by a senior team member. Final decisions on appeals are binding.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">9. Exceptions</h2>
              <p className="text-muted-foreground leading-relaxed">
                In exceptional circumstances (such as documented medical emergencies or bereavement), we may consider refund requests that fall outside our standard policy. These are reviewed on a case-by-case basis at our discretion.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">10. Contact Us</h2>
              <p className="text-muted-foreground leading-relaxed">
                If you have questions about this refund policy or need to request a refund, please contact our support team through the Contact page or via our WhatsApp/Telegram channels.
              </p>
            </section>
          </div>
        </div>
      </section>
    </Layout>
  );
}
