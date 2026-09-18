import type { Page, Request } from "@playwright/test";

/**
 * Noise the network stack emits when a request cannot finish because the
 * browser was disconnected. It is the disconnection reporting itself, not the
 * application saying anything, so a flow that takes the browser offline on
 * purpose must not count it as a product error.
 */
const DISCONNECTION_NOISE =
  /net::ERR_INTERNET_DISCONNECTED|net::ERR_NETWORK_CHANGED|net::ERR_NAME_NOT_RESOLVED/;

/**
 * How long a console report may trail the `requestfailed` event for the same
 * request. The two travel different paths out of the browser, so their order is
 * not guaranteed; the failures this helper exists to swallow were observed
 * ~3 ms behind their request.
 */
const TRAILING_REPORT_MS = 250;

/** Bound on waiting for interrupted requests. A request that never settles is not this helper's business. */
const DRAIN_TIMEOUT_MS = 10_000;

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
  private offline = false;

  record(text: string): void {
    if (this.offline && isDisconnectionNoise(text)) return;
    this.errors.push(text);
  }

  openOfflineWindow(): void {
    this.offline = true;
  }

  closeOfflineWindow(): void {
    this.offline = false;
  }
}

export type ConsoleErrorWatch = {
  /** Every console error the page reported, minus the deliberate disconnections. */
  readonly errors: string[];
  /**
   * Takes the browser offline, runs `body`, and restores the connection. The
   * window stays open until every request the disconnection interrupted has
   * settled and their reports have had time to arrive — the race that made
   * these flows fail at random.
   */
  whileOffline(body: () => Promise<void>): Promise<void>;
};

export function watchConsoleErrors(page: Page): ConsoleErrorWatch {
  const log = new ConsoleErrorLog();
  const inFlight = new Set<Request>();
  let notifyDrained: (() => void) | null = null;

  const settled = (request: Request) => {
    inFlight.delete(request);
    if (inFlight.size === 0 && notifyDrained) {
      notifyDrained();
      notifyDrained = null;
    }
  };

  page.on("request", (request) => inFlight.add(request));
  page.on("requestfinished", settled);
  page.on("requestfailed", settled);
  page.on("console", (message) => {
    if (message.type() === "error") log.record(message.text());
  });

  const drained = () =>
    inFlight.size === 0
      ? Promise.resolve()
      : Promise.race([
          new Promise<void>((resolve) => {
            notifyDrained = resolve;
          }),
          page.waitForTimeout(DRAIN_TIMEOUT_MS),
        ]);

  return {
    errors: log.errors,
    async whileOffline(body) {
      log.openOfflineWindow();
      await page.context().setOffline(true);
      try {
        await body();
      } finally {
        await page.context().setOffline(false);
        await drained();
        await page.waitForTimeout(TRAILING_REPORT_MS);
        log.closeOfflineWindow();
      }
    },
  };
}
