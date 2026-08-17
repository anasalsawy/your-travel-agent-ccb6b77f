import { Layout } from "@/components/layout/Layout";
import { Helmet } from "react-helmet-async";

export default function PrivacyPolicy() {
  return (
    <Layout>
      <Helmet>
        <title>Privacy Policy | Your Travel Agent</title>
        <meta
          name="description"
          content="Your Travel Agent Privacy Policy: learn what information we collect, how we use and protect it, and your choices when using our services or Facebook/Meta integrations."
        />
      </Helmet>

      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-6">Privacy Policy</h1>
          <p className="text-muted-foreground mb-12">Last Updated: August 17, 2026</p>

          <div className="prose prose-lg dark:prose-invert max-w-none space-y-10">
            <section>
              <p className="text-muted-foreground leading-relaxed">
                Your Travel Agent ("we," "us," or "our") operates the Your Travel Agent service and related applications, websites, and integrations, including applications that interact with Meta Platforms, Inc. ("Meta") services such as Facebook.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-4">
                This Privacy Policy explains what information we collect, how we use it, how we protect it, and the choices available to you when you use our services or interact with our Facebook/Meta application.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">1. Information We Collect</h2>

              <h3 className="font-display text-xl font-medium mb-3">Information You Provide</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Depending on how you interact with our services, we may collect:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Name</li>
                <li>Email address</li>
                <li>Telephone number</li>
                <li>Mailing address</li>
                <li>Travel preferences and requirements</li>
                <li>Information included in travel inquiries</li>
                <li>Messages you send to us</li>
                <li>Information you provide when requesting a quote or booking assistance</li>
                <li>Account or authentication information when applicable</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-4">
                You are not required to provide information that is not necessary for the service you are requesting.
              </p>

              <h3 className="font-display text-xl font-medium mb-3 mt-8">Information Received Through Meta Platforms</h3>
              <p className="text-muted-foreground leading-relaxed mb-4">
                If you interact with our Facebook Page, Facebook Messenger, Facebook Lead Ads, or another Meta service through our application, we may receive information that you choose to provide or that Meta makes available to our application in accordance with your Meta privacy settings and applicable Meta policies. This may include:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Facebook user ID</li>
                <li>Name</li>
                <li>Public profile information</li>
                <li>Email address, when available and authorized</li>
                <li>Telephone number, when available and authorized</li>
                <li>Messages and communications sent to our Page or application</li>
                <li>Information submitted through Facebook Lead Ads</li>
                <li>Information associated with interactions with our Facebook Page</li>
                <li>Other information that you explicitly authorize our application to access</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-4">
                We only request permissions and information that are reasonably necessary for the functionality of our application.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">2. How We Use Information</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We may use collected information to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Respond to travel inquiries</li>
                <li>Provide travel quotes and assistance</li>
                <li>Communicate with customers and prospective customers</li>
                <li>Process or assist with travel bookings</li>
                <li>Provide requested travel-related services</li>
                <li>Respond to Facebook Messenger communications</li>
                <li>Process information submitted through Facebook Lead Ads</li>
                <li>Manage customer inquiries and leads</li>
                <li>Improve our services</li>
                <li>Maintain and troubleshoot our systems</li>
                <li>Prevent fraud, abuse, or unauthorized access</li>
                <li>Comply with legal obligations</li>
                <li>Protect our rights and the security of our users and services</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-4">
                We do not use information obtained through Meta solely to make decisions about a person's eligibility for unrelated services.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">3. Facebook and Meta Data</h2>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Our application may use information obtained through Meta APIs and services to provide functionality requested by users or administrators of the application.</li>
                <li>We handle Meta Platform data in accordance with applicable Meta Platform Terms, Developer Policies, and other applicable requirements.</li>
                <li>We do not sell Facebook user data or Meta Platform data.</li>
                <li>We do not use Meta Platform data for purposes unrelated to the functionality for which it was obtained without appropriate authorization.</li>
              </ul>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">4. Sharing of Information</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We may share information when reasonably necessary to provide the services you request. This may include sharing information with:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Travel suppliers and booking providers when necessary to fulfill a travel request</li>
                <li>Technology and hosting providers that help us operate our services</li>
                <li>Communication providers used to send messages or notifications</li>
                <li>Payment providers when necessary to process a transaction</li>
                <li>Professional advisors or service providers acting on our behalf</li>
                <li>Government authorities or law enforcement when legally required</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-4">
                Service providers are expected to process information only for legitimate business purposes and in accordance with applicable requirements.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-4">
                We do not sell personal information or Facebook user data to third parties.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">5. Data Retention</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                We retain personal information only for as long as reasonably necessary to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Provide the requested services</li>
                <li>Maintain business and transaction records</li>
                <li>Resolve disputes</li>
                <li>Prevent fraud and abuse</li>
                <li>Comply with legal, accounting, tax, or regulatory obligations</li>
                <li>Enforce our agreements</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-4">
                When information is no longer reasonably necessary, we may delete it, anonymize it, or securely dispose of it, subject to applicable legal requirements.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">6. Security</h2>
              <p className="text-muted-foreground leading-relaxed">
                We take reasonable administrative, technical, and organizational measures designed to protect personal information against unauthorized access, alteration, disclosure, loss, or destruction. However, no method of transmitting or storing information electronically can be guaranteed to be completely secure.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">7. Your Choices and Rights</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Depending on applicable law, you may have the right to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Request access to personal information we hold about you</li>
                <li>Request correction of inaccurate information</li>
                <li>Request deletion of your personal information</li>
                <li>Request restriction of certain processing</li>
                <li>Object to certain uses of your information</li>
                <li>Withdraw consent where processing is based on consent</li>
                <li>Request information about how your data is processed</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-4">
                To exercise these rights, contact us using the information in the Contact Us section below.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">8. Deleting Your Data</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                You may request deletion of personal information that we hold about you. If you interacted with our Facebook/Meta application, you may also request deletion of information associated with your interaction with the application.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-4">
                To request deletion, contact us at{" "}
                <a href="mailto:privacy@your-travel-agent.net" className="text-primary hover:underline">
                  privacy@your-travel-agent.net
                </a>
                . Please include enough information for us to identify the relevant account or interaction.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                We will process valid deletion requests within a reasonable period and subject to any information that we are legally required to retain.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">9. Facebook App Data Deletion</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                If you remove our application's access through Facebook, this will prevent the application from accessing additional information through the permissions you previously granted, subject to Meta's systems and policies.
              </p>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Removing access does not necessarily delete information that was previously lawfully collected and retained by us.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                If you want us to delete information previously obtained through our application, contact{" "}
                <a href="mailto:privacy@your-travel-agent.net" className="text-primary hover:underline">
                  privacy@your-travel-agent.net
                </a>
                . We will process the request in accordance with applicable law and our data-retention obligations.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">10. Cookies and Similar Technologies</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Our website and services may use cookies and similar technologies to:
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-2 ml-4">
                <li>Maintain functionality</li>
                <li>Remember preferences</li>
                <li>Understand how our services are used</li>
                <li>Improve security</li>
                <li>Analyze website performance</li>
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-4">
                You can configure your browser to reject or delete cookies. Some functionality may not work correctly if cookies are disabled.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">11. Third-Party Services</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                Our services may contain links to or integrations with third-party websites and services. Third-party services operate under their own privacy policies and terms. We are not responsible for the privacy practices of third parties that we do not control.
              </p>
              <p className="text-muted-foreground leading-relaxed">
                In particular, when you use Facebook or other Meta services, your interaction with those services is also governed by Meta's applicable policies.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">12. Children's Privacy</h2>
              <p className="text-muted-foreground leading-relaxed">
                Our services are not intended for children under the age required by applicable law to provide consent to processing of personal information. We do not knowingly collect personal information from children in violation of applicable law. If you believe that a child has provided personal information to us improperly, please contact us so that we can investigate and take appropriate action.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">13. International Data Transfers</h2>
              <p className="text-muted-foreground leading-relaxed">
                Your information may be processed or stored in countries other than the country in which you reside. Where required by applicable law, we will take appropriate measures to protect personal information transferred across jurisdictions.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">14. Changes to This Privacy Policy</h2>
              <p className="text-muted-foreground leading-relaxed">
                We may update this Privacy Policy from time to time to reflect changes to our services, legal requirements, or privacy practices. When we make material changes, we may update the Last Updated date displayed at the beginning of this policy. Your continued use of our services after an updated Privacy Policy becomes effective constitutes use subject to the updated policy to the extent permitted by applicable law.
              </p>
            </section>

            <section>
              <h2 className="font-display text-2xl font-semibold mb-4">15. Contact Us</h2>
              <div className="text-muted-foreground leading-relaxed space-y-2">
                <p>
                  <strong>Your Travel Agent</strong>
                </p>
                <p>
                  Email:{" "}
                  <a href="mailto:privacy@your-travel-agent.net" className="text-primary hover:underline">
                    privacy@your-travel-agent.net
                  </a>
                </p>
                <p>
                  Website:{" "}
                  <a
                    href="https://your-travel-agent.net"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    https://your-travel-agent.net
                  </a>
                </p>
                <p className="pt-2">Effective Date: August 17, 2026</p>
              </div>
            </section>
          </div>
        </div>
      </section>
    </Layout>
  );
}
