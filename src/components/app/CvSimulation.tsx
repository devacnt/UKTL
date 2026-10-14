import { useState } from "react";
/** Browser-only demonstration. No file, score or fictional identity enters recruitment data. */
export function CvSimulation() {
  const [filename,setFilename]=useState(""); const [error,setError]=useState(""); const [headline,setHeadline]=useState("Example project manager");
  async function select(file:File|undefined){
    setFilename("");setError("");if(!file)return;
    if(!file.size || file.size>10*1024*1024 || !/\.(pdf|docx)$/i.test(file.name)){setError("Choose a PDF or DOCX between 1 byte and 10 MB.");return;}
    const bytes=new Uint8Array(await file.slice(0,5).arrayBuffer());
    if(/\.pdf$/i.test(file.name)?new TextDecoder().decode(bytes)!=="%PDF-":!(bytes[0]===80&&bytes[1]===75&&bytes[2]===3&&bytes[3]===4)){setError("File contents do not match its extension.");return;}
    setFilename(file.name);
  }
  return <details className="max-w-[720px] my-8 border border-rule rounded-lg p-5"><summary className="cursor-pointer min-h-11 font-medium">Try a simulated CV assessment</summary>
    <p className="my-3 text-sm text-ink-soft">Testing only. Your file stays in this browser and is not uploaded, scanned or sent to Claude. Results below are fictional examples, not an assessment of your CV. Refreshing clears the demonstration.</p>
    <label className="block text-sm">Select a test PDF or DOCX<input type="file" accept=".pdf,.docx" onChange={e=>void select(e.target.files?.[0])} className="block w-full min-w-0 my-3 text-sm" /></label>
    {error&&<p role="alert">{error}</p>}
    {filename&&<section aria-label="Simulated assessment" className="mt-5 space-y-4 break-words"><h2 className="font-display text-2xl">Simulation · 72/100</h2><p className="text-sm">Selected locally: {filename}</p>
      <label className="block text-sm">Example headline (editable)<input value={headline} onChange={e=>setHeadline(e.target.value)} className="block w-full border border-rule p-3 mt-2 rounded" /></label>
      <p className="text-sm">Example skills: project planning, stakeholder communication. Experience: example project manager, 2020–2025. Education: example degree. Certification: example project qualification.</p>
      <dl className="space-y-2 text-sm">{[["Contact information",80],["Experience",70],["Skills",75],["Education",65],["Clarity and structure",70]].map(([label,score])=><div key={label} className="flex justify-between gap-4"><dt>{label}</dt><dd>{score}/100</dd></div>)}</dl>
      <p className="text-sm">Example improvement report: quantify project outcomes, include dates and explain your contribution. Keep descriptions concise.</p>
      <p className="text-sm font-medium">This result is not saved, used for job ranking or visible to employers.</p><button type="button" onClick={()=>setFilename("")} className="min-h-11 underline">Clear simulation</button>
    </section>}
  </details>;
}
