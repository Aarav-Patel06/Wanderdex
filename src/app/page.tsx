"use client";

// TEMPORARY component preview. Replaced by the Overworld in the next step.
import { useState } from "react";

import Image from "next/image";

import { RpgDialog } from "@/components/dialogs/rpg-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/8bit/alert";
import { Button } from "@/components/ui/8bit/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/8bit/card";
import { Input } from "@/components/ui/8bit/input";
import { Label } from "@/components/ui/8bit/label";
import { toast } from "@/components/ui/8bit/toast";

const pins = [
  "food",
  "cafe",
  "bar",
  "museum",
  "landmark",
  "park_nature",
  "shopping",
  "stay",
  "entertainment",
  "other",
  "group",
];

export default function PreviewPage() {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-8">
      <section className="flex flex-col gap-2">
        <h1>WANDERDEX</h1>
        <h2>Section header</h2>
        <h3>Card title</h3>
        <p className="text-body">Body: Collect places. Build your world.</p>
        <p className="text-small">Small: labels and secondary text.</p>
        <p className="text-tiny">Tiny: captions and metadata.</p>
      </section>

      <section className="flex flex-col gap-4">
        <h2>Buttons</h2>
        <div className="flex flex-wrap items-center gap-6">
          <Button>Add visit</Button>
          <Button variant="secondary">Cancel</Button>
          <Button variant="ghost">Text button</Button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2>Input</h2>
        <Label htmlFor="note">Note</Label>
        <Input id="note" placeholder="Add a note..." />
      </section>

      <section className="flex flex-col gap-4">
        <h2>Card</h2>
        <Card>
          <CardHeader>
            <CardTitle>Ichiran Ramen</CardTitle>
            <CardDescription>Tokyo, Japan</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <Image
              src="/sprites/pin_food.png"
              alt=""
              width={64}
              height={64}
              unoptimized
              className="pixelated"
            />
            <p>Food · 8/10 · Mar 12, 2025</p>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-6">
        <h2>Alerts</h2>
        <Alert variant="warning">
          <AlertTitle>This photo has no location data.</AlertTitle>
          <AlertDescription>Type where it was taken instead.</AlertDescription>
        </Alert>
        <Alert variant="error">
          <AlertTitle>The map spirits aren&apos;t answering. Try again.</AlertTitle>
        </Alert>
      </section>

      <section className="flex flex-col gap-4">
        <h2>Toasts</h2>
        <div className="flex flex-wrap items-center gap-6">
          <Button
            variant="secondary"
            onClick={() =>
              toast("New place discovered!", {
                description: "Ichiran Ramen added to your Wanderdex.",
                variant: "success",
              })
            }
          >
            Success
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast("First visit to a new country!", {
                description: "You visited Japan for the first time!",
                variant: "visited",
              })
            }
          >
            Visited
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast("Slow down, traveler! Try again in a bit.")}
          >
            Default
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2>RPG dialog</h2>
        <div>
          <Button onClick={() => setDialogOpen(true)}>Log out</Button>
        </div>
        <RpgDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title="Leave the Overworld?"
          choices={[
            { label: "Yes", onSelect: () => setDialogOpen(false) },
            { label: "No", onSelect: () => setDialogOpen(false) },
          ]}
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2>Pins</h2>
        {[32, 64].map((size) => (
          <div key={size} className="flex flex-wrap items-end gap-4">
            {pins.map((pin) => (
              <Image
                key={pin}
                src={`/sprites/pin_${pin}.png`}
                alt={pin}
                width={size}
                height={size}
                unoptimized
                className="pixelated"
              />
            ))}
          </div>
        ))}
      </section>
    </main>
  );
}
