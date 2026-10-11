// The passport secret's triggers (SPEC §15.1): activations within SECRET_WINDOW_MS of each other
// count up. The first wiggles the passport, the second flips it, the third opens the secret.
// A gap longer than the window starts the count over, and so does opening it.
export const SECRET_WINDOW_MS = 1500;

// The sidebar logo is also the link to the Overworld: a first activation navigates after this
// long, unless a second one comes first.
export const NAVIGATE_DELAY_MS = 350;

export type SecretHandlers = {
  wiggle: () => void;
  flip: () => void;
  open: () => void;
  // Only for a trigger that is also a link.
  navigate?: () => void;
};

export function secretClicks(handlers: SecretHandlers) {
  let count = 0;
  let last = -Infinity;
  let navigation: ReturnType<typeof setTimeout> | undefined;

  return {
    activate() {
      const now = Date.now();
      if (now - last > SECRET_WINDOW_MS) count = 0;
      last = now;
      clearTimeout(navigation);
      navigation = undefined;
      count += 1;

      if (count === 1) {
        handlers.wiggle();
        if (handlers.navigate) navigation = setTimeout(handlers.navigate, NAVIGATE_DELAY_MS);
      } else if (count === 2) {
        handlers.flip();
      } else {
        count = 0;
        last = -Infinity;
        handlers.open();
      }
    },
    // A pending navigation shouldn't outlive the trigger.
    dispose() {
      clearTimeout(navigation);
    },
  };
}
