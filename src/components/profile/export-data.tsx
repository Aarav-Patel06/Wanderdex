"use client";

import { useTransition } from "react";

import { useRouter } from "next/navigation";
import { Download } from "pixelarticons/react/Download";

import { errorCopy } from "@/components/add/api";
import { Button } from "@/components/ui/8bit/button";
import { toast } from "@/components/ui/8bit/toast";
import { type ExportRow, exportFilename, toCsv, toJson } from "@/lib/export-file";

const FILES = {
  csv: { label: "Download CSV", type: "text/csv;charset=utf-8", build: toCsv },
  json: { label: "Download JSON", type: "application/json", build: toJson },
} as const;

// Export data (SPEC §14.6): the user's visits from /api/export, saved as a file built here.
export function ExportData() {
  const router = useRouter();
  const [exporting, startExporting] = useTransition();

  function exportAs(kind: keyof typeof FILES) {
    if (exporting) return;
    startExporting(async () => {
      try {
        const res = await fetch("/api/export");
        if (res.status === 401) return router.push("/login");
        if (!res.ok) throw new Error(`export: ${res.status}`);
        const { visits } = (await res.json()) as { visits: ExportRow[] };
        const { type, build } = FILES[kind];
        save(new Blob([build(visits)], { type }), exportFilename(kind));
      } catch {
        toast(errorCopy("upstream_error"));
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-button-group px-1.5">
      {(Object.keys(FILES) as (keyof typeof FILES)[]).map((kind) => (
        <Button key={kind} type="button" variant="secondary" disabled={exporting} onClick={() => exportAs(kind)} className="gap-2">
          <Download aria-hidden="true" className="size-6 shrink-0" />
          {FILES[kind].label}
        </Button>
      ))}
    </div>
  );
}

// A download link for the file, clicked. iPhone Safari saves it to Downloads (or asks first). It
// reads the blob after the click returns, so the URL is revoked only later.
function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
