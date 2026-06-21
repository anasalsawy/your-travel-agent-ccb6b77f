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
                <strong className="text-foreground">Important:</strong> Refund eligibility for flights and rentals depends on the airline or supplier's fare rules. Please read this policy carefully before booking.
              </p>
            </div>
          </div>

          <div className="prose prose-lg dark:prose-invert max-w-none space-y-8">
            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">1. General Refund Policy</h2>
              <p className="text-muted-foreground leading-relaxed">
                At Your Travel Agent, we strive to ensure customer satisfaction with every transaction. Refund eligibility differs based on the type of booking and the rules of the underlying airline or rental supplier. We treat every refund request fairly and transparently.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">2. Flight Ticket Requests</h2>

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
              <h2 className="font-display text-2xl font-semibold mb-4">3. Car Rental Bookings</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Car rental cancellations follow the supplier's policy on your confirmation. In general:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Most rentals can be cancelled free of charge up to 24-48 hours before pickup</li>
                <li>Late cancellations or no-shows may incur a fee or full charge depending on the supplier</li>
                <li>We'll always quote the cancellation terms upfront so you know what you're agreeing to</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">4. Escrow Transactions</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                For bookings paid via our Escrow.com option:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Funds are held until you confirm receipt and satisfaction with the booking</li>
                <li>Disputes must be raised within 48 hours of delivery confirmation</li>
                <li>Our dispute resolution team will review evidence from both parties</li>
                <li>If your claim is validated, a full refund will be issued</li>
                <li>Fraudulent claims will result in account suspension</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">5. PayPal Buyer Protection</h2>
              <p className="text-muted-foreground leading-relaxed">
                Purchases made via PayPal are covered under PayPal's Buyer Protection program. If you do not receive your booking or it is significantly not as described, you may file a claim directly with PayPal within 180 days of payment.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">6. How to Request a Refund</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                To request a refund:
              </p>
              <ol className="list-decimal list-inside text-muted-foreground space-y-2 ml-4">
                <li>Contact our support team via WhatsApp, Telegram, or the contact form within 7 days of booking</li>
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
