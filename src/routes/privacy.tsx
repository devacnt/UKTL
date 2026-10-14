import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Your information — UK Talent Link" }] }),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalPage
      eyebrow="Privacy"
      title="Your information"
      lede="UK Talent Link uses the information you provide to operate your candidate account, assess your CV, suggest relevant vacancies and respond to workplace questions or consultation requests."
      sections={[
        {
          id: "what-we-process",
          title: "What the platform processes",
          body: (
            <p>
              Account contact details, uploaded CVs and extracted career information, assessment results, job interests,
              workplace questions, consultation records and technical security records. Avoid including unnecessary
              sensitive information in your CV or questions.
            </p>
          ),
        },
        {
          id: "ai-and-providers",
          title: "AI and service providers",
          body: (
            <p>
              CV assessment and some guidance use Anthropic’s AI service. The platform also uses infrastructure, private
              file security, vacancy, booking and email services to deliver the relevant features. AI assessments may be
              incomplete or incorrect. You can correct your extracted profile and ask the team to review a result; a score
              is not an employment decision.
            </p>
          ),
        },
        {
          id: "your-requests",
          title: "Access and your requests",
          body: (
            <>
              <p>
                Candidate records are restricted to the account owner and authorized firm staff. From your profile you can
                download a self-service data copy, request a full reviewed export or ask for erasure. The team reviews the
                scope of requests, records held by service providers and any applicable retention requirements before
                confirming completion.
              </p>
              <p>
                <Link to="/app/profile">Manage your data</Link>
              </p>
            </>
          ),
        },
        {
          id: "cookies-retention",
          title: "Cookies and retention questions",
          body: (
            <>
              <p>
                Sign-in uses session cookies to keep your account secure. Contact the team for the retention period and
                handling arrangements applicable to your records, or to raise a privacy concern.
              </p>
              <p>
                <a href="mailto:info@uktalentlink.co.uk">Contact UK Talent Link</a>
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
