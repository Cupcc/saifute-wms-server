import {
  buildCompactDocumentNo,
  buildDailyDocumentNoStem,
  buildDailySequenceDocumentNo,
  buildDashedTimestampDocumentNo,
} from "./document-number.util";

describe("document-number.util", () => {
  const bizDate = new Date("2026-05-18T00:00:00.000Z");

  it("builds fixed-length daily sequence document numbers", () => {
    expect(buildDailyDocumentNoStem("RK", bizDate)).toBe("RK20260518");
    expect(buildDailySequenceDocumentNo("RK", bizDate, 7)).toBe(
      "RK20260518007",
    );
  });

  it("normalizes legacy long prefixes to two characters", () => {
    expect(buildCompactDocumentNo("TGC", bizDate, 0)).toBe("TG20260518001");
    expect(buildCompactDocumentNo("XSTH", bizDate, 1)).toBe("XT20260518002");
    expect(buildDashedTimestampDocumentNo("RDPUR", bizDate, 2)).toBe(
      "RQ20260518003",
    );
  });
});
