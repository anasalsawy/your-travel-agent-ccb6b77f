import { Layout } from "@/components/layout/Layout";

export default function Terms() {
  return (
    <Layout>
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-8">Terms of Service</h1>
          <p className="text-muted-foreground mb-8">Last updated: January 23, 2026</p>

          <div className="prose prose-lg dark:prose-invert max-w-none space-y-8">
            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground leading-relaxed">
                By accessing or using Your Travel Agent ("we," "our," or "us") website and services, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services. We reserve the right to modify these terms at any time, and your continued use constitutes acceptance of any changes.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">2. Description of Services</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Your Travel Agent provides a personal travel concierge service for:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Custom flight ticket quotes and bookings</li>
                <li>Car rental quotes and bookings worldwide</li>
                <li>Optional Escrow.com payment protection on transactions</li>
                <li>AI-assisted travel planning through our Maya assistant</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">3. User Accounts</h2>
              <h3 className="font-display text-xl font-medium mb-3">Account Registration</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                To access certain features, you must create an account. You agree to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Provide accurate, current, and complete information</li>
                <li>Maintain the security of your account credentials</li>
                <li>Notify us immediately of any unauthorized access</li>
                <li>Accept responsibility for all activities under your account</li>
              </ul>

              <h3 className="font-display text-xl font-medium mb-3 mt-6">Account Termination</h3>
              <p className="text-muted-foreground leading-relaxed">
                We reserve the right to suspend or terminate accounts that violate these terms, engage in fraudulent activity, or for any other reason at our discretion.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">4. Airline & Supplier Terms</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                All flights and rental bookings are subject to the issuing airline's or supplier's terms, including:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Fare rules and refundability</li>
                <li>Booking restrictions and blackout dates</li>
                <li>Change and cancellation fees</li>
                <li>Baggage, insurance, and other ancillary charges</li>
              </ul>
              <h3 className="font-display text-xl font-medium mb-3 mt-6">No Guarantee on Third Parties</h3>
              <p className="text-muted-foreground leading-relaxed">
                We do not control airline or rental supplier policies and cannot guarantee they will honor every change request. Suppliers may change their policies at any time without notice.
              </p>
            </section>


            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">5. Ticket Request Services</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                When you submit a ticket request:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>We will provide a quote based on current availability and pricing</li>
                <li>Prices are subject to change until payment is confirmed</li>
                <li>Tickets are non-refundable unless otherwise stated</li>
                <li>You are responsible for providing accurate passenger information</li>
                <li>Name changes after ticketing may incur additional fees or be impossible</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">6. Payment Terms</h2>
              <h3 className="font-display text-xl font-medium mb-3">Accepted Methods</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We accept various payment methods including credit cards, PayPal, cryptocurrency, and bank transfers. All payments are processed securely through third-party providers.
              </p>

              <h3 className="font-display text-xl font-medium mb-3">Escrow Protection</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                For marketplace transactions, we offer escrow protection. Funds are held securely until the buyer confirms receipt and satisfaction with the purchase.
              </p>

              <h3 className="font-display text-xl font-medium mb-3">Currency</h3>
              <p className="text-muted-foreground leading-relaxed">
                All prices are displayed in USD unless otherwise indicated. You are responsible for any currency conversion fees charged by your payment provider.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">7. Limitation of Liability</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Our services are provided "as is" without warranties of any kind</li>
                <li>We are not liable for any indirect, incidental, special, or consequential damages</li>
                <li>Our total liability shall not exceed the amount you paid for the specific service</li>
                <li>We are not responsible for airline policy changes, flight cancellations, or schedule changes</li>
                <li>We are not liable for losses resulting from unauthorized account access</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">8. Indemnification</h2>
              <p className="text-muted-foreground leading-relaxed">
                You agree to indemnify and hold harmless Your Travel Agent, its officers, directors, employees, and agents from any claims, damages, losses, or expenses (including legal fees) arising from your use of our services, violation of these terms, or infringement of any third-party rights.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">9. Prohibited Activities</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                You agree not to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Use our services for any unlawful purpose</li>
                <li>Attempt to circumvent security measures</li>
                <li>Submit false or misleading information</li>
                <li>Engage in fraudulent transactions</li>
                <li>Interfere with the proper functioning of our website</li>
                <li>Harvest or collect user data without consent</li>
              </ul>
            </section>


            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">10. Intellectual Property</h2>
              <p className="text-muted-foreground leading-relaxed">
                All content on our website, including text, graphics, logos, and software, is the property of Your Travel Agent or its licensors and is protected by intellectual property laws. You may not reproduce, distribute, or create derivative works without our express written permission.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">11. Dispute Resolution</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Any disputes arising from these terms or your use of our services shall be:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>First attempted to be resolved through good-faith negotiation</li>
                <li>Subject to binding arbitration if negotiation fails</li>
                <li>Governed by the laws of the State of Delaware, USA</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-4">
                You waive any right to participate in class action lawsuits against us.
              </p>
            </section>


            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">13. Force Majeure</h2>
              <p className="text-muted-foreground leading-relaxed">
                We shall not be liable for any failure to perform due to circumstances beyond our reasonable control, including natural disasters, pandemics, government actions, airline bankruptcies, or other force majeure events.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">14. Severability</h2>
              <p className="text-muted-foreground leading-relaxed">
                If any provision of these terms is found to be unenforceable, the remaining provisions shall continue in full force and effect.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">15. Contact Information</h2>
              <p className="text-muted-foreground leading-relaxed">
                For questions about these Terms of Service, please contact us through our website's support channels or the contact information provided on our platform.
              </p>
            </section>
          </div>
        </div>
      </section>
    </Layout>
  );
}
