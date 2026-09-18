import { expect, type Page, type Request } from "@playwright/test";

/**
 * Noise the network stack emits when a request cannot finish because the
 * browser was disconnected. It is the disconnection reporting itself, not the
 * application saying anything, so a flow that takes the browser offline on
 * purpose must not count it as a product error.
 */
const DISCONNECTION_NOISE =
  /net::ERR_INTERNET_DISCONNECTED|net::ERR_NETWORK_CHANGED|net::ERR_NAME_NOT_RESOLVED/;

export function isDisconnectionNoise(text: string): boolean {
  return DISCONNECTION_NOISE.test(text);
}

/**
 * The decision the collector makes, kept separate from the Playwright wiring so
 * it can be exercised directly. Disconnection noise is dropped only while a
 * deliberate offline window is open; everything else is always kept, including
 * a genuine error the surface logs while it is offline.
 */
export class ConsoleErrorLog {
  readonly errors: string[] = [];
  private offlineWindows = 0;

  record(text: string): void {
    if (this.offlineWindows > 0 && isDisconnectionNoise(text)) return;
    this.errors.push(text);
  }

  openOfflineWindow(): void {
    this.offlineWindows += 1;
  }

  closeOfflineWindow(): void {
    this.offlineWindows = Math.max(0, this.offlineWindows - 1);
  }
}

export type ConsoleErrorWatch = {
  /** Every console error the page reported, minus the deliberate disconnections. */
  readonly errors: string[];
  /**
   * Takes the browser offline, runs `body`, and restores the connection. The
   * window stays open until every request the disconnection interrupted has
   * settled, because the browser reports those a few milliseconds after it is
   * back online — the race that made these flows fail at random.
   */
  whileOffline(body: () => Promise<void>): Promise<void>;
};

export function watchConsoleErrors(page: Page): ConsoleErrorWatch {
  const log = new ConsoleErrorLog();
  const inFlight = new Set<Request>();

  page.on("request", (request) => inFlight.add(request));
  page.on("requestfinished", (request) => inFlight.delete(request));
  page.on("requestfailed", (request) => inFlight.delete(request));
  page.on("console", (message) => {
    if (message.type() === "error") log.record(message.text());
  });

  return {
    errors: log.errors,
    async whileOffline(body) {
      log.openOfflineWindow();
      await page.context().setOffline(true);
      try {
        await body();
      } finally {
        const interrupted = [...inFlight];
        await page.context().setOffline(false);
        await expect
          .poll(() => interrupted.filter((request) => inFlight.has(request)), {
            message:
              "requests interrupted by the deliberate disconnection never settled",
            timeout: 10_000,
          })
          .toEqual([]);
        log.closeOfflineWindow();
      }
    },
  };
}
