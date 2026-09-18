import { describe, expect, it } from "vitest";

import { ConsoleErrorLog, isDisconnectionNoise } from "./console-errors";

const DISCONNECTED =
  "Failed to load resource: net::ERR_INTERNET_DISCONNECTED";
const PRODUCT_ERROR = "Uncaught TypeError: cannot read properties of undefined";

describe("ConsoleErrorLog", () => {
  it("keeps disconnection noise that arrives outside a deliberate offline window", () => {
    const log = new ConsoleErrorLog();

    log.record(DISCONNECTED);

    expect(log.errors).toEqual([DISCONNECTED]);
  });

  it("drops disconnection noise while the window is open, including after the browser is back online", () => {
    const log = new ConsoleErrorLog();

    log.openOfflineWindow();
    log.record(DISCONNECTED);
    // The browser reports interrupted requests a few milliseconds late, which
    // is why the window closes on settled requests rather than on reconnection.
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
