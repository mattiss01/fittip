import { describe, expect, it } from "vitest";

import { privacyNotice, readOperator, terms } from "@/lib/legal";

/**
 * B4 (owner, 16 Nov 2026): the operator's details come from Vercel
 * variables, never the public repository, and a missing one shows a
 * placeholder instead of refusing to run.
 */
describe("the operator in the legal documents", () => {
  const operator = {
    name: "Alex Example",
    address: "Examplestraße 1, 1234 Example Town, Austria",
    email: "alex@example.test",
  };

  it("is read from the three variables", () => {
    expect(
      readOperator({
        FITTIP_OPERATOR_NAME: ` ${operator.name} `,
        FITTIP_OPERATOR_ADDRESS: operator.address,
        FITTIP_OPERATOR_EMAIL: operator.email,
      }),
    ).toEqual(operator);
  });

  it("shows placeholders for any that is missing or blank", () => {
    expect(readOperator({ FITTIP_OPERATOR_NAME: "  " })).toEqual({
      name: "[full name]",
      address: "[street, postcode, city], Austria",
      email: "[contact email]",
    });
  });

  it("names the operator, their address and email in both documents", () => {
    for (const document of [privacyNotice(operator), terms(operator)]) {
      const text = JSON.stringify(document);
      expect(text).toContain(operator.name);
      expect(text).toContain(operator.address);
      expect(text).toContain(operator.email);
      expect(text).toContain("§25 of the Austrian Media Act");
    }
  });

  it("follows Austrian law, with no German references left", () => {
    const text = JSON.stringify([privacyNotice(operator), terms(operator)]);
    expect(text).toContain("Austrian law applies.");
    expect(text).toContain("Datenschutzbehörde");
    expect(text).not.toMatch(/German|Germany|BGB|TDDDG|\[n\] days/);
  });
});
