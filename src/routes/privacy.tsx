import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"

import { Badge } from "#/components/ui/badge.tsx"
import { buttonVariants } from "#/components/ui/button.tsx"

export const Route = createFileRoute("/privacy")({
  component: Privacy,
  head: () => ({
    meta: [
      { title: "Privacy Policy — Sakekeep" },
      {
        name: "description",
        content: "Information about the processing of personal data at Sakekeep.",
      },
    ],
  }),
})

function Privacy() {
  return (
    <main id="main-content" className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-20">
      <article className="flex flex-col gap-10">
        <header className="flex flex-col items-start gap-5">
          <Badge variant="secondary">Privacy</Badge>
          <div className="flex flex-col gap-3">
            <h1 className="font-heading text-4xl font-medium tracking-tight sm:text-5xl">
              Privacy Policy
            </h1>
            <p className="text-muted-foreground">Last updated: August 2026</p>
          </div>
        </header>

        <PrivacySection title="1. Controller">
          <p>
            The controller within the meaning of the EU General Data Protection Regulation (GDPR)
            is:
          </p>
          <address className="not-italic">
            Patrik Simms
            <br />
            Lokstedter Steindamm 96
            <br />
            22529 Hamburg
            <br />
            Germany
            <br />
            Email:{" "}
            <PrivacyLink href="mailto:patriksimms@outlook.de">patriksimms@outlook.de</PrivacyLink>
          </address>
        </PrivacySection>

        <PrivacySection title="2. General information on data processing">
          <p>
            Sakekeep lets you create collaborative memory books, collect contributions and photos,
            design book pages, and generate print-ready PDF files. We process personal data only to
            the extent necessary for these purposes, for secure operation of the service, or on the
            basis of your consent.
          </p>
          <p>
            The applicable legal basis is stated for each processing activity below. Where no
            specific retention period is given, we delete personal data as soon as the purpose of
            its processing no longer applies and no statutory retention obligations or legitimate
            grounds require further storage.
          </p>
        </PrivacySection>

        <PrivacySection title="3. Provision and hosting">
          <p>
            The application is operated on infrastructure provided by Hetzner Online GmbH,
            Industriestr. 25, 91710 Gunzenhausen, Germany. When you access the service, technically
            necessary connection data may be processed. This includes in particular your IP address,
            date and time of access, the requested URL, the amount of data transferred, the HTTP
            status, the referrer URL, and browser and operating system information.
          </p>
          <p>
            This processing serves the secure and reliable provision of the service, error analysis,
            and the prevention of abusive access. The legal basis is Art. 6(1)(f) GDPR. Our
            legitimate interest lies in the secure and uninterrupted operation of the application.
            We have entered into a data processing agreement with Hetzner pursuant to Art. 28 GDPR.
          </p>
          <p>
            Security-related log data is stored only for as long as it is required for the purposes
            stated above and is then deleted, unless a specific security incident requires longer
            retention.
          </p>
        </PrivacySection>

        <PrivacySection title="4. Domain Name System via Cloudflare">
          <p>
            For the technical resolution of our domain we use DNS services provided by Cloudflare,
            Inc., 101 Townsend St., San Francisco, CA 94107, USA. Technically necessary DNS and
            connection information may be processed in this context. We do not use Cloudflare to
            create usage profiles, and our website traffic is not routed through Cloudflare's proxy.
          </p>
          <p>
            The legal basis is Art. 6(1)(f) GDPR. Our legitimate interest lies in the fast,
            resilient, and attack-protected availability of our service. Where data is transferred
            to the USA, Cloudflare relies in particular on the EU-US Data Privacy Framework and
            supplementary contractual safeguards. A Data Processing Addendum is in place with
            Cloudflare.
          </p>
        </PrivacySection>

        <PrivacySection title="5. User accounts and sign-in with Clerk">
          <p>
            For sign-in and the management of organizer accounts we use Clerk, a service provided by
            Clerk, Inc., 660 King Street, Unit 345, San Francisco, CA 94107, USA. The data processed
            may include in particular your email address, name, user ID, sign-in timestamps, IP
            address, device and browser information, and session and security data. Clerk sets
            technically necessary cookies and similar storage mechanisms to maintain your session
            and to protect against abuse.
          </p>
          <p>
            This processing takes place to provide and secure your user account on the basis of Art.
            6(1)(b) and Art. 6(1)(f) GDPR. The legitimate interest lies in protecting accounts and
            non-public project areas. Data processing by Clerk on our behalf is governed by Clerk's
            Data Processing Addendum, which forms part of our agreement with Clerk. Where Clerk
            processes certain data for its own purposes, such as managing its contractual
            relationship or complying with its own legal obligations, Clerk acts as an independent
            controller in that respect. Transfers of data to the USA are based in particular on the
            EU-US Data Privacy Framework and, where required, on Standard Contractual Clauses. For
            further information, see Clerk's{" "}
            <PrivacyLink href="https://clerk.com/legal/gdpr">GDPR notes</PrivacyLink> and{" "}
            <PrivacyLink href="https://clerk.com/legal/dpa">Data Processing Addendum</PrivacyLink>.
          </p>
          <p>
            Account data is generally processed for the lifetime of the user account and removed
            after its deletion, unless statutory obligations or security reasons require limited
            further retention.
          </p>
        </PrivacySection>

        <PrivacySection title="6. Projects, contributions, photos, and exports">
          <p>
            When you use Sakekeep, we process the project information and questions created by the
            organizer as well as the answers and photos submitted by contributors. Depending on
            their content, this data may include names, personal memories, opinions, links, and
            information about persons depicted or mentioned. We also process technical identifiers,
            submission timestamps, layout data, and the resulting book pages, preview images, and
            PDF exports.
          </p>
          <p>
            This processing serves exclusively the collection, design, provision, and export of the
            respective memory book. For organizers, it is based on Art. 6(1)(b) GDPR. Content
            voluntarily submitted by contributors is processed on the basis of their consent
            pursuant to Art. 6(1)(a) GDPR. Consent may be withdrawn at any time with effect for the
            future by email to the contact address stated above. The lawfulness of processing
            carried out before the withdrawal remains unaffected.
          </p>
          <p>
            Contributors should not submit special categories of personal data within the meaning of
            Art. 9 GDPR and should only upload photos of, or information about, other persons if
            they are entitled to do so. Contributions are made via a project-specific link. This
            link must be treated confidentially and shared only with the intended contributors.
            Where contributions contain personal data about third parties, such as persons shown in
            photos, it is generally impossible or would involve disproportionate effort for us to
            inform those persons individually (Art. 14(5)(b) GDPR); this privacy policy therefore
            serves as the public source of information about the processing.
          </p>
          <p>
            Project content remains stored until it is deleted by the organizer, consent is
            effectively withdrawn, or the purpose of the project no longer applies, unless
            overriding statutory grounds prevent deletion. When a project is deleted, the associated
            answers, images, preview files, and exports are scheduled for deletion as well.
          </p>
        </PrivacySection>

        <PrivacySection title="7. File storage with Contabo">
          <p>
            Uploaded photos, the preview images generated from them, design files, and PDF exports
            are stored in S3-compatible object storage provided by Contabo GmbH, Aschauer Straße
            32a, 81549 Munich, Germany. Storage takes place to provide the features described in
            section 6.
          </p>
          <p>
            Depending on the data subject, the legal basis is Art. 6(1)(b) or Art. 6(1)(a) GDPR. We
            have entered into a data processing agreement with Contabo pursuant to Art. 28 GDPR.
            Files are removed in accordance with the deletion rules that apply to the respective
            project.
          </p>
        </PrivacySection>

        <PrivacySection title="8. Local contribution drafts">
          <p>
            Answers that have not yet been submitted and selected images may be stored locally in
            the contributor's browser. This allows a contribution to be resumed after a page reload
            or an interruption. Draft data is transferred to our servers only when the contribution
            is submitted.
          </p>
          <p>
            This local storage is necessary for the draft feature expressly requested by the user
            and takes place in accordance with Section 25(2) no. 2 of the German Telecommunications
            Digital Services Data Protection Act (TDDDG) and Art. 6(1)(b) GDPR. It can be ended by
            deleting the website data in your browser.
          </p>
        </PrivacySection>

        <PrivacySection title="9. Recipients and processors">
          <p>
            Personal data is shared only with those service providers that we need to operate the
            application and that are described above. Where these companies process data on our
            behalf, they have been contractually bound in accordance with Art. 28 GDPR. We do not
            share personal data for advertising purposes and we do not sell personal data.
          </p>
        </PrivacySection>

        <PrivacySection title="10. Your rights">
          <p>Subject to the statutory requirements, you have in particular the right to:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>access the personal data we process about you (Art. 15 GDPR),</li>
            <li>rectification of inaccurate data (Art. 16 GDPR),</li>
            <li>erasure of your data (Art. 17 GDPR),</li>
            <li>restriction of processing (Art. 18 GDPR),</li>
            <li>data portability (Art. 20 GDPR),</li>
            <li>object to processing based on Art. 6(1)(e) or (f) GDPR (Art. 21 GDPR), and</li>
            <li>withdraw consent with effect for the future (Art. 7(3) GDPR).</li>
          </ul>
          <p>
            To exercise your rights, a message to the email address stated above is sufficient. You
            also have the right to lodge a complaint with a data protection supervisory authority
            (Art. 77 GDPR). The authority responsible for us is generally the Hamburg Commissioner
            for Data Protection and Freedom of Information (Der Hamburgische Beauftragte für
            Datenschutz und Informationsfreiheit).
          </p>
        </PrivacySection>

        <PrivacySection title="11. Right to object to processing based on legitimate interests">
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="font-medium">
              Where we process personal data on the basis of Art. 6(1)(f) GDPR, you have the right
              to object at any time, on grounds relating to your particular situation. We will then
              no longer process the data concerned unless we can demonstrate compelling legitimate
              grounds that override your interests, rights, and freedoms, or the processing serves
              the establishment, exercise, or defense of legal claims.
            </p>
          </div>
        </PrivacySection>

        <PrivacySection title="12. Updates to this privacy policy">
          <p>
            We update this privacy policy when features, service providers, or legal requirements
            change. The version published on this page applies.
          </p>
        </PrivacySection>

        <Link to="/" className={buttonVariants({ variant: "ghost", className: "self-start" })}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back to home
        </Link>
      </article>
    </main>
  )
}

function PrivacySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 leading-relaxed text-foreground/90">
      <h2 className="font-heading text-2xl font-medium tracking-tight text-foreground">{title}</h2>
      {children}
    </section>
  )
}

function PrivacyLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="rounded-sm text-primary underline decoration-primary/35 underline-offset-4 hover:decoration-primary"
    >
      {children}
    </a>
  )
}
