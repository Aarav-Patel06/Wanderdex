"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import { errorCopy, sendJson } from "@/components/add/api";
import { NoteField, RatingField, WhenField } from "@/components/add/visit-fields";
import { RpgDialog } from "@/components/dialogs/rpg-dialog";
import { Loading } from "@/components/loading";
import type { PlaceVisit } from "@/components/places/place-detail";
import { Alert, AlertDescription } from "@/components/ui/8bit/alert";
import type { VisitEdit } from "@/lib/visits";
import { initialWhen, isComplete, whenValue } from "@/lib/when";

// Editing a visit (SPEC §14.4) in an RPG dialog, with the confirmation card's date & time,
// precision, rating, and note fields and rules. The date is in the visit's stored zone, which
// the server uses to store it again (SPEC §8). The category is the place's, in the page header.
// Mounted while open; it closes once the page has refreshed with the saved values.
export function EditVisitDialog({ visit, onClose }: { visit: PlaceVisit; onClose: () => void }) {
  const router = useRouter();
  const [when, setWhen] = useState(() => initialWhen(visit.visited, visit.timezone));
  const [rating, setRating] = useState(visit.rating);
  const [note, setNote] = useState(visit.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function save() {
    if (saving) return;
    setError(null);
    startSaving(async () => {
      const edit: VisitEdit = { visited: { value: whenValue(when), precision: when.precision }, rating, note };
      const result = await sendJson("PATCH", `/api/visits/${visit.id}`, edit);
      if (!result.ok) {
        if (result.error === "unauthorized") return router.push("/login");
        return setError(errorCopy(result.error));
      }
      startSaving(() => {
        router.refresh();
        onClose();
      });
    });
  }

  return (
    <RpgDialog
      open
      onOpenChange={(next) => {
        if (!next && !saving) onClose();
      }}
      title="Edit visit"
      // An exact time that was cleared can't be saved.
      choices={[
        { label: "Save", onSelect: save, disabled: saving || !isComplete(when) },
        { label: "Cancel", onSelect: onClose, disabled: saving },
      ]}
      // Room for the rating's row of ten 44px cells from sm up; phones get two rows of five.
      className="sm:max-w-lg"
    >
      {/* The fields keep the confirmation card's look on a surface panel with notched corners
          (rpg-box's clip-path, shell.css): their dark pixel borders and shading would vanish on
          the dark box. */}
      <div className="rpg-box flex flex-col gap-4 bg-surface p-4 text-text">
        <WhenField when={when} onChange={setWhen} timeZone={visit.timezone} disabled={saving} />
        <RatingField value={rating} onChange={setRating} disabled={saving} />
        <NoteField value={note} onChange={setNote} disabled={saving} />
        {saving && <Loading />}
        {error && (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
    </RpgDialog>
  );
}
