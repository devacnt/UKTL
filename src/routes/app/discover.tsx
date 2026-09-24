import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { getDiscoverJobsFn, recordSwipeFn, undoSwipeFn } from "@/lib/functions";
import { filterJobs } from "@/lib/job-search";
import type { Job } from "@/lib/schemas/job";

export const Route = createFileRoute("/app/discover")({
  validateSearch: (s) => z.object({ candidate: z.string().optional(), q: z.string().optional(), location: z.string().optional() }).parse(s),
  loaderDeps: ({ search }) => ({ candidateId: search.candidate }),
  loader: async ({ deps }) =>
    getDiscoverJobsFn({ data: { candidateId: deps.candidateId } }),
  component: DiscoverPage,
});

// Minimum horizontal travel to register a swipe
const SWIPE_THRESHOLD = 90;
// px to start showing the decision badge
const BADGE_START = 30;

type SwipeAction = "interested" | "dismissed";
type FlyDir = "right" | "left" | null;

function DiscoverPage() {
  const { jobs: loadedJobs, matches, candidateId, canDecide, signedIn, unavailable } = Route.useLoaderData();

  const search = Route.useSearch();
  const initialJobs = useMemo(() => filterJobs(loadedJobs, search.q ?? "", search.location ?? ""), [loadedJobs, search.q, search.location]);

  const [queue, setQueue] = useState<Job[]>(initialJobs);
  const [swipedCount, setSwipedCount] = useState(0);
  const [flyDir, setFlyDir] = useState<FlyDir>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [lastDecision, setLastDecision] = useState<{job:Job;swipedAt:number} | null>(null);
  const generation = useRef(0);

  // Drag state via ref — avoids re-renders during drag
  const drag = useRef({ active: false, startX: 0, startY: 0, x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const isAnimating = useRef(false);

  useEffect(() => {
    generation.current += 1;
    setQueue(initialJobs); setSwipedCount(0); setLastDecision(null); setSaveError("");
    setFlyDir(null); setSaving(false); isAnimating.current = false;
    return () => { generation.current += 1; };
  }, [initialJobs,candidateId]);

  const current = queue[0] ?? null;
  const next = queue[1] ?? null;
  const afterNext = queue[2] ?? null;

  const applyDragTransform = useCallback((x: number, y: number) => {
    const card = cardRef.current;
    if (!card) return;
    const rotate = x * 0.07;
    card.style.transform = `translateX(${x}px) translateY(${y * 0.15}px) rotate(${rotate}deg)`;
    card.style.transition = "none";

    // Badge opacity driven by distance
    const norm = Math.abs(x) / SWIPE_THRESHOLD;
    const keenBadge = card.querySelector<HTMLElement>(".swipe-badge-keen");
    const passBadge = card.querySelector<HTMLElement>(".swipe-badge-pass");
    if (keenBadge) keenBadge.style.opacity = x > BADGE_START ? String(Math.min(1, norm)) : "0";
    if (passBadge) passBadge.style.opacity = x < -BADGE_START ? String(Math.min(1, norm)) : "0";
  }, []);

  const resetCard = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    card.style.transform = "";
    card.style.transition = "";
    const keenBadge = card.querySelector<HTMLElement>(".swipe-badge-keen");
    const passBadge = card.querySelector<HTMLElement>(".swipe-badge-pass");
    if (keenBadge) keenBadge.style.opacity = "0";
    if (passBadge) passBadge.style.opacity = "0";
  }, []);

  const triggerSwipe = useCallback(async (action: SwipeAction) => {
    if (isAnimating.current || !current || !candidateId || !canDecide) return;
    const version = generation.current;
    isAnimating.current = true; setSaving(true); setSaveError(""); resetCard();
    try {
      const saved = await recordSwipeFn({data:{candidateId,jobId:current.id,action}});
      if (!saved.ok) throw new Error("Decision was not saved. Please try again.");
      if (version !== generation.current) return;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reducedMotion) setFlyDir(action === "interested" ? "right" : "left");
      setTimeout(() => {
        if (version !== generation.current) return;
        setQueue(q=>q.filter(j=>j.id !== current.id)); setSwipedCount(n=>n+1);
        setLastDecision({job:current,swipedAt:saved.swipedAt});
        setFlyDir(null); setSaving(false); isAnimating.current = false;
      }, reducedMotion ? 0 : 380);
    } catch (e) {
      if (version !== generation.current) return;
      setSaveError(e instanceof Error ? e.message : "Decision was not saved. Please try again.");
      setSaving(false); isAnimating.current = false; resetCard();
    }
  },[current,candidateId,canDecide,resetCard]);

  async function undoLast() {
    if (!lastDecision || !candidateId || isAnimating.current) return;
    const version = generation.current;
    isAnimating.current = true; setSaving(true); setSaveError("");
    try {
      await undoSwipeFn({data:{candidateId,jobId:lastDecision.job.id,swipedAt:lastDecision.swipedAt}});
      if (version !== generation.current) return;
      setQueue(q=>[lastDecision.job,...q.filter(j=>j.id !== lastDecision.job.id)]);
      setLastDecision(null); setSwipedCount(n=>Math.max(0,n-1));
    } catch (e) { if (version === generation.current) setSaveError(e instanceof Error ? e.message : "Undo failed. Please retry."); }
    finally { if (version === generation.current) {setSaving(false); isAnimating.current = false;} }
  }

  // Pointer handlers
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (isAnimating.current || !canDecide) return;
    drag.current = { active: true, startX: e.clientX, startY: e.clientY, x: 0, y: 0 };
    cardRef.current?.setPointerCapture(e.pointerId);
  }, [canDecide]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drag.current.active) return;
      drag.current.x = e.clientX - drag.current.startX;
      drag.current.y = e.clientY - drag.current.startY;
      applyDragTransform(drag.current.x, drag.current.y);
    },
    [applyDragTransform],
  );

  const onPointerUp = useCallback(() => {
    if (!drag.current.active) return;
    drag.current.active = false;
    const { x } = drag.current;
    if (x > SWIPE_THRESHOLD) {
      triggerSwipe("interested");
    } else if (x < -SWIPE_THRESHOLD) {
      triggerSwipe("dismissed");
    } else {
      resetCard();
    }
  }, [triggerSwipe, resetCard]);

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.repeat || (e.target instanceof HTMLElement && e.target.closest("input,textarea,select,button,a,[contenteditable=true]"))) return;
      if (e.key === "ArrowRight") triggerSwipe("interested");
      if (e.key === "ArrowLeft") triggerSwipe("dismissed");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [triggerSwipe]);

  // ── Fly-off transform applied to front card
  const flyTransform =
    flyDir === "right"
      ? "translateX(140vw) rotate(28deg)"
      : flyDir === "left"
        ? "translateX(-140vw) rotate(-28deg)"
        : undefined;

  const feedback = <div className="w-full max-w-[520px] my-4 text-sm" aria-live="polite">
    <Link to="/app/jobs" search={{ q: search.q, location: search.location }} className="underline block mb-3">Search roles / change filters</Link>
    {(search.q || search.location) && <p className="mb-3">Filtered by: {[search.q, search.location].filter(Boolean).join(" · ")}</p>}
    {saving && <p>Saving…</p>}
    {saveError && <p role="alert" className="text-red-700">{saveError}</p>}
    {lastDecision && <button disabled={saving} onClick={undoLast} className="underline mt-2 disabled:opacity-50">Undo last decision</button>}
    {signedIn && <Link to="/app/activity" className="underline block mt-3">View interests and history</Link>}
  </div>;
  if (unavailable) return <div role="alert"><h1 className="font-display text-3xl">Discovery is temporarily unavailable</h1><p className="my-4">Your decisions have not been changed. Please reload to try again.</p></div>;
  if (queue.length === 0) return <div className="flex flex-col items-center">{feedback}{(search.q || search.location) ? <p className="my-10 text-center">No undecided roles match these filters. Change your search or view your interests and history.</p> : <EmptyState swipedCount={swipedCount} candidateId={candidateId} />}</div>;

  return (
    <div className="flex flex-col items-center min-h-[calc(100vh-100px)] pb-12 select-none">
      {/* Header */}
      <div className="w-full max-w-[520px] mb-8 mt-2">
        <div className="font-mono text-[11px] tracking-[0.15em] uppercase text-ink-mute mb-3">
          — Discover
        </div>
        <div className="flex items-end justify-between gap-4">
          <h1
            className="font-display font-light leading-[1.05] tracking-[-0.02em]"
            style={{ fontSize: "clamp(28px, 3.5vw, 40px)" }}
          >
            Find your{" "}
            <em className="not-italic italic font-normal text-ink-soft">
              next role
            </em>
          </h1>
          <div className="text-sm text-ink-mute tabular-nums flex-shrink-0 pb-1">
            {queue.length} remaining
          </div>
        </div>
        {canDecide && (
          <p className="text-sm text-ink-mute mt-2">
            Swipe right to express interest · left to skip. Interest is not an external job application.
          </p>
        )}
        {!canDecide && (
          <p className="text-sm text-ink-mute mt-2">
            Browsing only.{" "}
            <Link to={signedIn ? "/app/upload" : "/auth/login"} className="underline">
              {signedIn ? "Upload your CV" : "Sign in"}
            </Link>{" "}
            to record your own decisions.
          </p>
        )}
      </div>

      {feedback}
      {/* Card stack */}
      <div className="relative w-full max-w-[520px]" style={{ height: 520 }}>
        {/* Ghost cards behind */}
        {afterNext && (
          <GhostCard depth={2} />
        )}
        {next && (
          <GhostCard depth={1} />
        )}

        {/* Front card */}
        <div
          ref={cardRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {drag.current.active=false;resetCard();}}
          style={{
            position: "absolute",
            inset: 0,
            cursor: "grab",
            transform: flyTransform,
            transition: flyDir ? "transform 0.38s cubic-bezier(0.36, 0, 0.66, -0.2)" : "transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)",
            touchAction: "pan-y",
          }}
        >
          <JobCard job={current} score={matches[current.id]} />

          {/* Decision overlays */}
          <div
            className="swipe-badge-keen absolute top-6 left-6 font-mono text-sm font-medium tracking-[0.12em] uppercase px-3 py-1.5 rounded border-2 border-emerald-500 text-emerald-600 bg-emerald-50/90 pointer-events-none"
            style={{ opacity: 0, transition: "opacity 0.1s" }}
          >
            Keen
          </div>
          <div
            className="swipe-badge-pass absolute top-6 right-6 font-mono text-sm font-medium tracking-[0.12em] uppercase px-3 py-1.5 rounded border-2 border-rose-500 text-rose-600 bg-rose-50/90 pointer-events-none"
            style={{ opacity: 0, transition: "opacity 0.1s" }}
          >
            Pass
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-6 mt-10">
        <ActionButton
          onClick={() => triggerSwipe("dismissed")}
          disabled={saving || !canDecide}
          label="Pass"
          icon="←"
          tone="pass"
        />
        <div className="font-mono text-xs text-ink-mute text-center">
          or use ← → keys
        </div>
        <ActionButton
          onClick={() => triggerSwipe("interested")}
          disabled={saving || !canDecide}
          label="Keen"
          icon="→"
          tone="keen"
        />
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function JobCard({ job, score }: { job: Job; score?: number }) {
  return (
    <div
      className="h-full rounded-xl bg-paper border border-rule flex flex-col overflow-hidden"
      style={{ boxShadow: "0 4px 24px oklch(0.18 0.005 80 / 0.12), 0 1px 4px oklch(0.18 0.005 80 / 0.08)" }}
    >
      {/* Card top — sector + score */}
      <div className="flex items-start justify-between px-8 pt-7 pb-5 border-b border-rule">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-ink-mute">
            {job.sector ?? "Open sector"}
          </span>
          <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-ink-mute">
            {job.seniority ?? "Open level"}
          </span>
        </div>
        {score !== undefined && (
          <div className="flex flex-col items-end">
            <div
              className="font-display font-light tabular-nums leading-none"
              style={{
                fontSize: "clamp(36px, 5vw, 48px)",
                color: scoreColor(score),
              }}
            >
              {score}
            </div>
            <div className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink-mute mt-0.5">
              match
            </div>
          </div>
        )}
      </div>

      {/* Title + company */}
      <div className="px-8 pt-6 pb-4 flex-1 flex flex-col gap-4">
        <div>
          <h2
            className="font-display font-light leading-[1.1] tracking-[-0.02em]"
            style={{ fontSize: "clamp(22px, 3.5vw, 30px)" }}
          >
            {job.title}
          </h2>
          <p className="text-[15px] text-ink-soft mt-2">
            {job.company ?? "Confidential"} · {job.location ?? "Location TBC"}
          </p>
          {job.min_years_experience && (
            <p className="text-sm text-ink-mute mt-1">
              {job.min_years_experience}+ years required
            </p>
          )}
        </div>

        {/* Description */}
        {job.description && (
          <p className="text-sm text-ink-soft leading-relaxed line-clamp-3">
            {job.description}
          </p>
        )}

        {/* Must-have skills */}
        {job.must_have_skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-auto">
            {job.must_have_skills.slice(0, 5).map((s) => (
              <span
                key={s}
                className="inline-block border border-rule rounded-full px-2.5 py-0.5 font-mono text-[10px] tracking-[0.06em] text-ink-soft bg-paper-deep"
              >
                {s}
              </span>
            ))}
            {job.must_have_skills.length > 5 && (
              <span className="inline-block px-2.5 py-0.5 font-mono text-[10px] text-ink-mute">
                +{job.must_have_skills.length - 5} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Card bottom hint */}
      <div className="px-8 py-4 border-t border-rule">
        <p className="text-xs text-ink-mute">Drag to decide · or use buttons below</p>
      </div>
    </div>
  );
}

function GhostCard({ depth }: { depth: 1 | 2 }) {
  const scale = depth === 1 ? 0.965 : 0.93;
  const yOffset = depth === 1 ? 14 : 26;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transform: `scale(${scale}) translateY(-${yOffset}px)`,
        transformOrigin: "bottom center",
        pointerEvents: "none",
      }}
    >
      <div
        className="h-full rounded-xl bg-paper border border-rule"
        style={{
          opacity: depth === 1 ? 0.7 : 0.4,
          boxShadow: "0 2px 12px oklch(0.18 0.005 80 / 0.06)",
        }}
      />
    </div>
  );
}

function ActionButton({
  onClick,
  label,
  icon,
  tone,
  disabled,
}: {
  onClick: () => void;
  label: string;
  icon: string;
  tone: "keen" | "pass";
  disabled: boolean;
}) {
  const cls =
    tone === "keen"
      ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-500"
      : "border-rose-300 text-rose-700 hover:bg-rose-50 hover:border-rose-500";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-5 py-2.5 border rounded-full font-mono text-sm tracking-[0.06em] transition-colors ${cls}`}
    >
      {tone === "pass" && <span>{icon}</span>}
      {label}
      {tone === "keen" && <span>{icon}</span>}
    </button>
  );
}

function EmptyState({ swipedCount, candidateId }: { swipedCount: number; candidateId?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-200px)] text-center px-4">
      <div className="font-mono text-[11px] tracking-[0.15em] uppercase text-ink-mute mb-6">
        — Discover
      </div>
      <h2
        className="font-display font-light leading-[1.1] tracking-[-0.02em] mb-4"
        style={{ fontSize: "clamp(28px, 4vw, 40px)" }}
      >
        You're all caught up
      </h2>
      <p className="text-ink-soft text-[15px] max-w-[40ch] leading-relaxed mb-8">
        {swipedCount > 0
          ? `You reviewed ${swipedCount} role${swipedCount !== 1 ? "s" : ""}.`
          : "No open roles at the moment."}{" "}
        New mandates are added as they come in.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <Link
          to="/app"
          className="text-sm px-5 py-2.5 border border-ink bg-ink text-paper rounded-full hover:opacity-90 transition-opacity"
        >
          Back to overview
        </Link>
        {candidateId && (
          <Link
            to="/app/candidates/$id"
            params={{ id: candidateId }}
            className="text-sm px-5 py-2.5 border border-rule rounded-full hover:border-ink transition-colors"
          >
            View your profile
          </Link>
        )}
      </div>
    </div>
  );
}

function scoreColor(score: number): string {
  if (score >= 75) return "oklch(0.45 0.12 155)"; // green
  if (score >= 55) return "oklch(0.55 0.12 80)";  // amber
  return "oklch(0.55 0.18 25)";                    // rose
}
