import type { Page, Request } from "@playwright/test";
import { describe, expect, it } from "vitest";

import {
  ConsoleErrorLog,
  isDisconnectionNoise,
  watchConsoleErrors,
} from "./console-errors";

const DISCONNECTED = "Failed to load resource: net::ERR_INTERNET_DISCONNECTED";
const PRODUCT_ERROR = "Uncaught TypeError: cannot read properties of undefined";

describe("ConsoleErrorLog", () => {
  it("keeps disconnection noise that arrives outside a deliberate offline window", () => {
    const log = new ConsoleErrorLog();

    log.record(DISCONNECTED);

    expect(log.errors).toEqual([DISCONNECTED]);
  });

  it("drops disconnection noise while the window is open", () => {
    const log = new ConsoleErrorLog();

    log.openOfflineWindow();
    log.record(DISCONNECTED);
    log.closeOfflineWindow();

    expect(log.errors).toEqual([]);
  });

  it("still fails on a genuine error logged while offline", () => {
    const log = new ConsoleErrorLog();

    log.openOfflineWindow();
    log.record(PRODUCT_ERROR);
    log.closeOfflineWindow();

    expect(log.errors).toEqual([PRODUCT_ERROR]);
  });

  it("re-arms once the window closes", () => {
    const log = new ConsoleErrorLog();

    log.openOfflineWindow();
    log.record(DISCONNECTED);
    log.closeOfflineWindow();
    log.record(DISCONNECTED);

    expect(log.errors).toEqual([DISCONNECTED]);
  });

  it("recognizes the disconnection failures a deliberate offline window produces", () => {
    expect(isDisconnectionNoise(DISCONNECTED)).toBe(true);
    expect(
      isDisconnectionNoise("Failed to load resource: net::ERR_NETWORK_CHANGED"),
    ).toBe(true);
    expect(isDisconnectionNoise(PRODUCT_ERROR)).toBe(false);
    expect(isDisconnectionNoise("Failed to load resource: 500")).toBe(false);
  });
});

/**
 * Stands in for the Playwright page so the wiring — not just the decision — can
 * be driven through the exact sequence that made CI run 33309063845 fail: a
 * request in flight when the browser goes offline, its failure reported after
 * the connection is restored.
 */
class FakePage {
  private readonly handlers = new Map<string, ((payload: never) => void)[]>();
  readonly offlineStates: boolean[] = [];
  /** Runs while the helper waits out a trailing console report. */
  duringTrailingWait: (() => void) | null = null;

  on(event: string, handler: (payload: never) => void): void {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
  }

  context() {
    return {
      setOffline: async (offline: boolean) => {
        this.offlineStates.push(offline);
      },
    };
  }

  async waitForTimeout(): Promise<void> {
    const during = this.duringTrailingWait;
    this.duringTrailingWait = null;
    during?.();
  }

  request(url: string): Request {
    const request = { url: () => url } as Request;
    this.emit("request", request);
    return request;
  }

  failRequest(request: Request): void {
    this.emit("requestfailed", request);
  }

  consoleError(text: string): void {
    this.emit("console", { type: () => "error", text: () => text });
  }

  consoleLog(text: string): void {
    this.emit("console", { type: () => "log", text: () => text });
  }

  private emit(event: string, payload: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) {
      (handler as (value: unknown) => void)(payload);
    }
  }
}

describe("watchConsoleErrors", () => {
  const watch = () => {
    const page = new FakePage();
    return { page, watch: watchConsoleErrors(page as unknown as Page) };
  };

  it("swallows the disconnection report even when it trails the failed request", async () => {
    const { page, watch: collector } = watch();
    const prefetch = page.request("/home/today?_rsc=1");

    await collector.whileOffline(async () => {
      page.failRequest(prefetch);
      // The report the browser files once it is back online, which the old
      // collector counted as a product error 30 lines later.
      page.duringTrailingWait = () => page.consoleError(DISCONNECTED);
    });

    expect(collector.errors).toEqual([]);
    expect(page.offlineStates).toEqual([true, false]);
  });

  it("fails on a console error raised anywhere else in the flow", async () => {
    const { page, watch: collector } = watch();

    page.consoleError(PRODUCT_ERROR);
    await collector.whileOffline(async () => {});
    page.consoleError("Uncaught (in promise) Error: plan save failed");

    expect(collector.errors).toEqual([
      PRODUCT_ERROR,
      "Uncaught (in promise) Error: plan save failed",
    ]);
  });

  it("fails on a genuine error the surface logs while it is offline", async () => {
    const { page, watch: collector } = watch();

    await collector.whileOffline(async () => {
      page.consoleError(PRODUCT_ERROR);
    });

    expect(collector.errors).toEqual([PRODUCT_ERROR]);
  });

  it("ignores console output that is not an error", async () => {
    const { page, watch: collector } = watch();

    page.consoleLog(PRODUCT_ERROR);

    expect(collector.errors).toEqual([]);
  });
});
