import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { SiteLayout, Wrap } from "@/components/site/Layout";
import { Reveal } from "@/components/site/Reveal";
import { toast } from "sonner";
import { submitEnquiryFn } from "@/lib/functions";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — UK Talent Link" },
      { name: "description", content: "Questions about a role, your CV or your account? A real person at UK Talent Link replies, usually within one working day. Offices in London and Dubai." },
      { property: "og:title", content: "Contact — UK Talent Link" },
      { property: "og:description", content: "Questions about a role, your CV or your account? A real person replies, usually within one working day." },
    ],
  }),
  component: ContactPage,
});

const ENQUIRY_TYPES = [
  "I'm looking for a role",
  "Help with my CV or account",
  "A question about my rights at work",
  "Moving to or from the Gulf",
  "Something else",
];

function ContactPage() {
  return (
    <SiteLayout>
      <section className="bg-paper text-ink pt-44 pb-24 md:pt-56 md:pb-40 relative overflow-hidden min-h-screen">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 55% 50% at 85% 20%, oklch(0.285 0.075 263 / 0.07), transparent 70%), radial-gradient(ellipse 40% 40% at 10% 80%, oklch(0.285 0.075 263 / 0.04), transparent 70%)",
          }}
        />

        <Wrap className="relative z-10">
          <Reveal>
            <div className="font-mono text-xs tracking-[0.15em] uppercase text-ink-mute flex items-center gap-3.5">
              <span className="w-7 h-px bg-ink/40" />
              Contact
            </div>
            <h1
              className="font-display font-extralight leading-[0.97] tracking-[-0.035em] mt-7 max-w-[16ch]"
              style={{ fontSize: "clamp(44px, 7vw, 108px)", fontVariationSettings: '"opsz" 144, "SOFT" 40' }}
            >
              Talk to a{" "}
              <em
                className="italic text-accent"
                style={{ fontVariationSettings: '"opsz" 144, "SOFT" 100' }}
              >
                real person.
              </em>
            </h1>
          </Reveal>

          <div className="grid md:grid-cols-[5fr_6fr] gap-12 md:gap-20 mt-20">
            {/* Left — contact details */}
            <Reveal>
              <div className="flex flex-col gap-0">
                <Detail label="Write" value="info@uktalentlink.co.uk" href="mailto:info@uktalentlink.co.uk" />
                <Detail label="Call" value="+44 (0)20 7189 2857" href="tel:+442071892857" />
                <Detail label="London" value="Chancery House, 53–64 Chancery Lane, London WC2A 1QS" />
                <Detail label="Dubai" value="Level 14, Boulevard Plaza Tower 1, Mohammed Bin Rashid Boulevard, Dubai" />
                <Detail label="Hours" value="Monday – Friday · 09:00 – 18:00 GMT / GST" />
              </div>

              <div className="mt-12 pt-8 border-t border-rule">
                <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-ink-mute mb-5">
                  What to expect
                </div>
                <ol className="list-none p-0 m-0 space-y-4">
                  {[
                    "We read every message and reply personally, usually within one working day.",
                    "Looking for a role? The quickest way to be considered is to upload your CV — you'll be matched to every role we're recruiting for.",
                    "If it's easier to talk it through, say so and we'll suggest times for a short call.",
                    "We'll tell you honestly if we're not the right fit, and suggest who is.",
                  ].map((step, i) => (
                    <li key={i} className="flex gap-4 text-[14px] text-ink-soft">
                      <span className="font-mono text-[10px] text-ink-mute mt-0.5 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                      {step}
                    </li>
                  ))}
                </ol>
                <Link
                  to="/auth/register"
                  className="mt-8 inline-flex items-center gap-2 text-[13px] px-5 py-2.5 bg-ink text-paper rounded-full hover:opacity-80 transition-opacity"
                >
                  Register free →
                </Link>
              </div>
            </Reveal>

            {/* Right — form */}
            <Reveal>
              <ContactForm />
            </Reveal>
          </div>
        </Wrap>
      </section>
    </SiteLayout>
  );
}

function Detail({ label, value, href }: { label: string; value: string; href?: string }) {
  const content = (
    <div className="py-5 border-t border-rule">
      <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-ink-mute mb-2">{label}</div>
      <div
        className="font-display font-light leading-[1.25] tracking-[-0.01em]"
        style={{ fontSize: "clamp(16px, 1.8vw, 22px)", fontVariationSettings: '"opsz" 144, "SOFT" 40' }}
      >
        {value}
      </div>
    </div>
  );
  return href ? (
    <a href={href} className="block transition-opacity hover:opacity-70 group">
      {content}
    </a>
  ) : (
    content
  );
}

function ContactForm() {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const field = (key: string) => String(fd.get(key) ?? "").trim();
    setError(null);
    setSending(true);
    try {
      await submitEnquiryFn({
        data: {
          name: field("name"),
          email: field("email"),
          company: field("company") || undefined,
          enquiry_type: field("type") || undefined,
          message: field("msg"),
        },
      });
      setSent(true);
      toast.success("Enquiry sent — we'll reply within one working day");
    } catch {
      setError("We couldn't send your message just now. Please email us directly and we'll pick it up.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="bg-paper-deep/60 border border-rule rounded-2xl p-9 flex flex-col gap-4 min-h-[400px] justify-center">
        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-ink-mute">Message sent</div>
        <h3
          className="font-display font-light leading-[1.1] tracking-[-0.02em] m-0"
          style={{ fontSize: "clamp(22px, 2.5vw, 34px)", fontVariationSettings: '"opsz" 144, "SOFT" 40' }}
        >
          Thank you — we'll be in touch.
        </h3>
        <p className="text-ink-soft text-[14px] leading-[1.6] m-0">
          A member of our team will read your message and reply personally, usually within one working day. If your matter is urgent, please call us directly.
        </p>
        <a
          href="tel:+442071892857"
          className="mt-4 inline-flex items-center gap-2 text-[13px] text-ink-soft hover:text-ink transition-colors"
        >
          +44 (0)20 7189 2857 →
        </a>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-paper-deep/60 border border-rule rounded-2xl p-9 backdrop-blur-sm"
    >
      <h3
        className="font-display font-light leading-[1.1] tracking-[-0.02em] m-0 mb-2"
        style={{ fontSize: "clamp(20px, 2.2vw, 28px)", fontVariationSettings: '"opsz" 144, "SOFT" 40' }}
      >
        Send us a message.
      </h3>
      <p className="text-ink-mute text-[13px] m-0 mb-8 leading-[1.5]">
        We read every message. A real person replies.
      </p>

      <div className="space-y-6">
        {[
          { label: "Your name", id: "name", type: "text", required: true },
          { label: "Email address", id: "email", type: "email", required: true },
        ].map((f) => (
          <div key={f.id}>
            <label htmlFor={f.id} className="block font-mono text-[10px] tracking-[0.14em] uppercase text-ink-mute mb-2.5">
              {f.label}{f.required && <span className="text-ink-mute ml-1">*</span>}
            </label>
            <input
              id={f.id}
              name={f.id}
              type={f.type}
              required={f.required}
              className="w-full bg-transparent border-0 border-b border-rule py-3 text-[15px] text-ink placeholder:text-ink-mute outline-none focus:border-ink transition-colors"
            />
          </div>
        ))}

        <div>
          <label htmlFor="type" className="block font-mono text-[10px] tracking-[0.14em] uppercase text-ink-mute mb-2.5">
            Type of enquiry
          </label>
          <select
            id="type"
            name="type"
            className="w-full bg-transparent border-0 border-b border-rule py-3 text-[15px] text-ink outline-none focus:border-ink transition-colors appearance-none"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' fill='none'%3E%3Cpath d='M1 1l5 5 5-5' stroke='rgba(128,128,128,0.7)' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 4px center" }}
          >
            <option value="">What's this about?</option>
            {ENQUIRY_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="msg" className="block font-mono text-[10px] tracking-[0.14em] uppercase text-ink-mute mb-2.5">
            How can we help? <span className="text-ink-mute">*</span>
          </label>
          <textarea
            id="msg"
            name="msg"
            required
            rows={4}
            placeholder="A couple of sentences is enough — the kind of role you're after, a question about your CV or your account."
            className="w-full bg-transparent border-0 border-b border-rule py-3 text-[15px] text-ink placeholder:text-ink-mute outline-none focus:border-ink transition-colors resize-none"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={sending}
        className="mt-8 w-full bg-ink text-paper border-0 px-6 py-4 text-[14px] font-medium tracking-[-0.005em] rounded-full cursor-pointer transition-all duration-300 hover:opacity-80 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {sending ? "Sending…" : "Send enquiry"}
      </button>

      {error ? (
        <p role="alert" className="text-[13px] text-center mt-4 m-0 text-ink-soft">
          {error}{" "}
          <a href="mailto:info@uktalentlink.co.uk" className="underline text-ink">
            info@uktalentlink.co.uk
          </a>
        </p>
      ) : (
        <p className="text-ink-mute text-[12px] text-center mt-4 m-0">
          We'll reply to your email within one working day.
        </p>
      )}
    </form>
  );
}
