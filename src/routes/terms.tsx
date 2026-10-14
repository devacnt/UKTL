import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Using Talent Compass — UK Talent Link" }] }),
  component: Terms,
});

function Terms() {
  return (
    <LegalPage
      eyebrow="Terms"
      title="Using Talent Compass"
      lede="Talent Compass helps candidates review their CVs, discover vacancies and access workplace guidance through UK Talent Link."
      sections={[
        {
          id: "account-uploads",
          title: "Your account and uploads",
          body: (
            <p>
              Keep your credentials private and provide accurate information. Only upload documents you are entitled to
              share. Do not upload malicious files, impersonate another person or attempt to access someone else’s records.
            </p>
          ),
        },
        {
          id: "assessments-vacancies",
          title: "Assessments and vacancies",
          body: (
            <p>
              AI-generated extraction, scores and suggestions can contain errors. Review and correct your profile and
              request human review when needed. Job availability can change, and a match or expression of interest does not
              guarantee an interview, an application to an external employer or employment.
            </p>
          ),
        },
        {
          id: "workplace-guidance",
          title: "Workplace guidance",
          body: (
            <p>
              General workplace information is not a substitute for advice on your individual circumstances. Use the
              consultation option or contact a qualified adviser where appropriate.
            </p>
          ),
        },
        {
          id: "questions",
          title: "Questions and information",
          body: (
            <>
              <p>Contact the team about account problems, corrections, service details or privacy requests.</p>
              <p className="flex flex-wrap gap-6">
                <Link to="/contact">Contact the team</Link>
                <Link to="/privacy">Your information</Link>
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
