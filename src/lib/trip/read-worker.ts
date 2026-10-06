import tzLookup from "@photostructure/tz-lookup";

import { READ_CONCURRENCY } from "@/lib/trip/config";
import { collectFiles, handleReadRequest, type ReadBatch, type ReadMessage } from "@/lib/trip/pipeline";

// The Trip Photos reading worker (SPEC §11.8 steps 2–4), started by read-client.ts: reading,
// grouping, and thumbnails (pipeline.ts) run here, so the page stays responsive with hundreds of
// photos. The files stay in the browser.
const scope = self as unknown as {
  postMessage: (message: ReadMessage, transfer?: Transferable[]) => void;
  addEventListener: (type: "message", listener: (event: MessageEvent<ReadBatch>) => void) => void;
};

const collect = collectFiles((files) => {
  void handleReadRequest(files, (message, transfer) => scope.postMessage(message, transfer), tzLookup, READ_CONCURRENCY);
});
scope.addEventListener("message", (event) => collect(event.data));
