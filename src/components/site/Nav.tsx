import { Link, useRouter, useRouteContext } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { signOutFn } from "@/lib/functions";

const links = [
  { to: "/approach", label: "How it works" },
  { to: "/services", label: "What we offer" },
  { to: "/sectors", label: "Sectors" },
  { to: "/reach", label: "Reach" },
  { to: "/contact", label: "Contact" },
] as const;

/**
 * The one header for the public site, the candidate area and the sign-in pages.
 * `overlay` floats over the landing hero and gains a background on scroll;
 * `solid` is a sticky bar for inner pages. Staff are Supabase users with a
 * verified role, so they get the staff dashboard instead of "My account".
 */
export function Nav({ variant = "overlay" }: { variant?: "overlay" | "solid" }) {
  const { session } = useRouteContext({ from: "__root__" });
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  const signedIn = !!session.userId;
  const isStaff = session.isStaff;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 32);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  async function signOut() {
    setOpen(false);
    await signOutFn();
    toast("Signed out");
    await router.navigate({ to: "/" });
    await router.invalidate();
  }

  const solid = variant === "solid" || scrolled || open;
  const position = variant === "solid" ? "sticky" : "fixed";

  return (
    <nav
      className={`${position} top-0 left-0 right-0 z-[100] flex items-center justify-between transition-all duration-[400ms] [transition-timing-function:var(--ease-publication)] ${
        solid
          ? "py-3 bg-paper/90 backdrop-blur-xl backdrop-saturate-150 border-b border-rule"
          : "py-5 bg-transparent border-b border-transparent"
      }`}
      style={{ paddingLeft: "clamp(20px, 4.5vw, 64px)", paddingRight: "clamp(20px, 4.5vw, 64px)" }}
    >
      <Link
        to="/"
        onClick={() => setOpen(false)}
        className="font-display text-[19px] font-medium tracking-[-0.025em] text-ink shrink-0"
        style={{ fontVariationSettings: '"opsz" 144, "SOFT" 30' }}
      >
        UK Talent{" "}
        <em
          className="not-italic font-normal text-ink-soft italic"
          style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80' }}
        >
          Link
        </em>
      </Link>

      {/* Desktop */}
      <ul className="hidden md:flex gap-7 items-center list-none p-0 m-0">
        {links.map((l) => (
          <li key={l.to}>
            <Link
              to={l.to}
              className="text-[13px] text-ink-mute hover:text-ink transition-colors relative group"
              activeProps={{ className: "text-[13px] text-ink" }}
            >
              {l.label}
              <span className="absolute left-0 -bottom-0.5 h-px w-0 bg-ink transition-[width] duration-300 group-hover:w-full [transition-timing-function:var(--ease-publication)]" />
            </Link>
          </li>
        ))}
        <li>
          <div className="w-px h-4 bg-rule mx-1" aria-hidden="true" />
        </li>
        {signedIn ? (
          <>

            <li>
              <button
                type="button"
                onClick={signOut}
                className="text-[13px] text-ink-mute hover:text-ink transition-colors bg-transparent border-0 p-0 cursor-pointer"
              >
                Sign out
              </button>
            </li>
            <li>
              <Link
                to={isStaff ? "/admin" : "/app"}
                title={session.email ?? undefined}
                className="text-[13px] px-4 py-2 bg-ink text-paper rounded-full transition-opacity duration-300 hover:opacity-80"
              >
                {isStaff ? "Staff dashboard →" : "My account →"}
              </Link>
            </li>
          </>
        ) : (
          <>
            <li>
              <Link to="/auth/login" className="text-[13px] text-ink-mute hover:text-ink transition-colors">
                Sign in
              </Link>
            </li>
            <li>
              <Link
                to="/auth/register"
                className="text-[13px] px-4 py-2 bg-ink text-paper rounded-full transition-opacity duration-300 hover:opacity-80"
              >
                Register free →
              </Link>
            </li>
          </>
        )}
      </ul>

      {/* Mobile burger */}
      <button
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="md:hidden bg-transparent border-0 p-2 cursor-pointer -mr-2 flex flex-col justify-center gap-[5px]"
      >
        <span className={`block w-5 h-px bg-ink transition-all duration-300 origin-center ${open ? "translate-y-[6px] rotate-45" : ""}`} />
        <span className={`block w-5 h-px bg-ink transition-all duration-300 ${open ? "opacity-0 scale-x-0" : ""}`} />
        <span className={`block w-5 h-px bg-ink transition-all duration-300 origin-center ${open ? "-translate-y-[6px] -rotate-45" : ""}`} />
      </button>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden fixed inset-0 top-[57px] bg-paper z-[99] overflow-y-auto">
          <div className="flex flex-col" style={{ padding: "clamp(20px, 4.5vw, 64px)" }}>
            <ul className="list-none p-0 m-0 border-t border-rule">
              {links.map((l) => (
                <li key={l.to} className="border-b border-rule">
                  <Link
                    to={l.to}
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between py-5 text-ink"
                    activeProps={{ className: "flex items-center justify-between py-5 text-accent" }}
                  >
                    <span
                      className="font-display font-light tracking-[-0.02em]"
                      style={{ fontSize: "clamp(24px, 5vw, 36px)", fontVariationSettings: '"opsz" 144, "SOFT" 40' }}
                    >
                      {l.label}
                    </span>
                    <span className="text-ink-mute text-xl">→</span>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-10 flex flex-col gap-3">
              {signedIn ? (
                <>
                  <Link
                    to={isStaff ? "/admin" : "/app"}
                    onClick={() => setOpen(false)}
                    className="w-full text-center text-[14px] px-6 py-4 bg-ink text-paper rounded-full"
                  >
                    {isStaff ? "Staff dashboard →" : "My account →"}
                  </Link>
                  <button
                    type="button"
                    onClick={signOut}
                    className="w-full text-center text-[14px] px-6 py-4 border border-rule text-ink-soft rounded-full bg-transparent cursor-pointer"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/auth/register"
                    onClick={() => setOpen(false)}
                    className="w-full text-center text-[14px] px-6 py-4 bg-ink text-paper rounded-full"
                  >
                    Register free →
                  </Link>
                  <Link
                    to="/auth/login"
                    onClick={() => setOpen(false)}
                    className="w-full text-center text-[14px] px-6 py-4 border border-rule text-ink-soft rounded-full"
                  >
                    Sign in
                  </Link>
                </>
              )}
            </div>

            <div className="mt-auto pt-12">
              <div className="font-mono text-[11px] tracking-[0.12em] uppercase text-ink-mute space-y-1">
                <div>London · Dubai · Riyadh</div>
                <div>info@uktalentlink.co.uk</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
