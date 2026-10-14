import { useState, useCallback, useRef } from "react";
import { createFileRoute, Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { CvSimulation } from "@/components/app/CvSimulation";
import { cvHistoryFn } from "@/lib/account-functions";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/AppLayout";
import { uploadAndParseCvFn } from "@/lib/functions";

// Sign-in is enforced by the /app layout guard and again by uploadAndParseCvFn.
export const Route = createFileRoute("/app/upload")({
  loader: async () => { try { return {history:await cvHistoryFn(),unavailable:false}; } catch { return {history:[],unavailable:true}; } },
  component: UploadPage,
});

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPT = ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

type Stage = "idle" | "processing" | "done" | "failed";

const STAGE_LABELS: Record<Stage, string> = {
  idle: "",
  processing: "Uploading and assessing your CV…",
  done: "Done — redirecting…",
  failed: "Something went wrong",
};

function UploadPage() {
  const {history,unavailable} = Route.useLoaderData();
  const navigate = useNavigate();
  const { session } = useRouteContext({ from: "__root__" });
  const isStaff = session.isStaff;
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = stage !== "idle" && stage !== "failed";

  function validateAndSetFile(f: File | null) {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setError(`File is too large (${(f.size / 1048576).toFixed(1)} MB). Maximum is 10 MB.`);
      return;
    }
    setError(null);
    setFile(f);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    validateAndSetFile(e.dataTransfer.files[0] ?? null);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setDragOver(false), []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || busy) return;
    setError(null);
    setStage("processing");


    try {
      const fd = new FormData();
      fd.append("file", file);
      const result = await uploadAndParseCvFn({ data: fd });

      if (result.status === "failed") {
        const message = result.error ?? "CV parsing failed — check the file and try again.";
        setError(message);
        setStage("failed");
        toast.error(message);
        return;
      }

      setStage("done");
      toast.success(result.status === "queued" ? "CV securely uploaded — processing is queued" : `CV parsed — quality ${result.quality.score}/100`);
      await navigate({ to: "/app/candidates/$id", params: { id: result.id } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStage("failed");
      toast.error(message);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={isStaff ? "Upload a CV" : "My CV"}
        title={
          isStaff ? (
            <>
              Add a candidate{" "}
              <em className="not-italic italic font-normal text-ink-soft">from a CV.</em>
            </>
          ) : (
            <>
              Upload your CV,{" "}
              <em className="not-italic italic font-normal text-ink-soft">see where you fit.</em>
            </>
          )
        }
        lede={
          isStaff
            ? "PDF, DOCX or plain text. The profile is extracted, graded and ranked against every open mandate."
            : "PDF, DOCX or plain text. We read your CV, give you a quality score with specific improvement tips, and match you to the roles we're recruiting for."
        }
      />

      <CvSimulation />
      {unavailable && <p role="alert" className="my-4 text-sm">CV history is temporarily unavailable. Previous versions have not been removed.</p>}
      {!!history.length && <section className="max-w-[720px] my-6"><h2 className="font-display text-2xl">CV version history</h2><p className="text-sm text-ink-soft my-2">Previous uploads are retained. Open a version to review its assessment and download the original when scanning is available.</p><ul className="space-y-3">{history.map(item=><li key={item.id} className="text-sm break-words"><Link to="/app/candidates/$id" params={{id:item.id}} className="underline">{item.source_filename ?? "CV"}</Link> · {new Date(item.created_at).toISOString().slice(0,10)} · {item.status}</li>)}</ul></section>}
      <form onSubmit={onSubmit} className="max-w-[720px]">
        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          aria-label="Click or drag a file to upload"
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && !busy && inputRef.current?.click()}
          className={`
            relative border border-dashed rounded-md px-8 py-16 text-center cursor-pointer
            transition-colors duration-150 select-none
            ${dragOver && !busy ? "border-ink bg-paper-deep/50" : ""}
            ${!dragOver && !file ? "border-rule hover:border-ink/50" : ""}
            ${file && !busy ? "border-ink/40 bg-paper-deep/30" : ""}
            ${busy ? "cursor-not-allowed" : ""}
          `}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            disabled={busy}
            onChange={(e) => validateAndSetFile(e.target.files?.[0] ?? null)}
          />

          {busy ? (
            <div className="space-y-4">
              <div className="font-display text-xl text-ink">{STAGE_LABELS[stage]}</div>
              <p role="status" className="text-xs text-ink-mute">Please keep this page open until the upload is confirmed. You can return to your profile to check processing.</p>
            </div>
          ) : file ? (
            <>
              <div className="text-2xl mb-2">📄</div>
              <div className="font-display text-xl text-ink">{file.name}</div>
              <div className="text-sm text-ink-soft mt-1.5">
                {file.size >= 1048576
                  ? `${(file.size / 1048576).toFixed(1)} MB`
                  : `${(file.size / 1024).toFixed(1)} KB`}{" "}
                · click or drag to replace
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl mb-2">⬆</div>
              <div className="font-display text-xl text-ink">
                {dragOver ? "Drop to upload" : "Drag a CV here"}
              </div>
              <div className="text-sm text-ink-soft mt-1.5">
                or click to browse · PDF, DOCX, TXT · max 10 MB
              </div>
            </>
          )}
        </div>

        {/* Progress label */}
        {busy && (
          <div className="mt-2 flex items-center gap-2 px-1">
            <span className="w-1.5 h-1.5 rounded-full bg-ink animate-pulse" />
            <span className="text-xs text-ink-soft font-mono">{STAGE_LABELS[stage]}</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">
            {error}
          </div>
        )}

        {/* Footer row */}
        <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-xs text-ink-mute max-w-[44ch]">
            Files are kept in private storage. Claude processes your document to extract its contents and prepare your assessment.
          </p>
          <button
            type="submit"
            disabled={!file || busy}
            className="flex-shrink-0 text-[13px] px-5 py-2.5 border border-ink bg-ink text-paper rounded-full
              disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            {busy ? STAGE_LABELS[stage].replace("…", "") : "Parse & match →"}
          </button>
        </div>
      </form>

      {/* Pipeline explainer */}
      <section className="mt-14 max-w-[720px]">
        <div className="font-mono text-[11px] tracking-[0.15em] uppercase text-ink-mute mb-4">
          — What happens
        </div>
        <ol className="space-y-3">
          {[
            ["Store", "Your CV is stored privately and accessed only through your account or authorised UKTL staff."],
            ["Read", "Claude extracts your experience, skills and education into a structured profile."],
            ["Score", "Your CV gets a 0–100 quality score with specific tips to improve it."],
            ["Match", "You are matched against every open role; the best fits appear under Job matches."],
          ].map(([step, desc], i) => (
            <li key={step} className="flex gap-4 text-sm">
              <span className="flex-shrink-0 w-5 h-5 mt-0.5 rounded-full border border-rule flex items-center justify-center font-mono text-[10px] text-ink-mute">
                {i + 1}
              </span>
              <span>
                <span className="font-medium text-ink">{step} — </span>
                <span className="text-ink-soft">{desc}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

