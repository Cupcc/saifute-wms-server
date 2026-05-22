import {
  buildFallbackCode,
  buildLegacyWorkshopCode,
  DEFAULT_WORKSHOP_CODE,
  DEFAULT_WORKSHOP_NAME,
  resolveDeterministicCodes,
  stableJsonStringify,
} from "../../scripts/migration/shared/deterministic";

describe("migration deterministic helpers", () => {
  it("should keep the first active duplicate code and rewrite the rest deterministically", () => {
    const resolution = resolveDeterministicCodes(
      [
        { legacyId: 10, isActive: false, sourceCode: "013" },
        { legacyId: 5, isActive: true, sourceCode: "013" },
        { legacyId: 12, isActive: true, sourceCode: "013" },
      ],
      "MAT-LEGACY",
    );

    expect(resolution.codeByLegacyId.get(5)).toBe("013");
    expect(resolution.codeByLegacyId.get(12)).toBe("013-LEGACY-12");
    expect(resolution.codeByLegacyId.get(10)).toBe("013-LEGACY-10");
    expect(resolution.rewrites).toEqual([
      {
        originalCode: "013",
        keptLegacyId: 5,
        rewritten: [
          {
            legacyId: 12,
            rewrittenCode: "013-LEGACY-12",
          },
          {
            legacyId: 10,
            rewrittenCode: "013-LEGACY-10",
          },
        ],
      },
    ]);
  });

  it("should create deterministic fallback codes for missing source codes", () => {
    const resolution = resolveDeterministicCodes(
      [{ legacyId: 21, isActive: true, sourceCode: "   " }],
      "CUS-LEGACY",
    );

    expect(resolution.codeByLegacyId.get(21)).toBe(
      buildFallbackCode("CUS-LEGACY", 21),
    );
    expect(buildLegacyWorkshopCode(8)).toBe("WS-LEGACY-8");
    expect(DEFAULT_WORKSHOP_CODE).toBe("WS-LEGACY-DEFAULT");
    expect(DEFAULT_WORKSHOP_NAME).toBe("默认车间");
  });

  it("should avoid collisions with existing legacy-style rewritten codes", () => {
    const resolution = resolveDeterministicCodes(
      [
        { legacyId: 5, isActive: true, sourceCode: "013" },
        { legacyId: 12, isActive: true, sourceCode: "013" },
        { legacyId: 13, isActive: true, sourceCode: "013-LEGACY-12" },
      ],
      "MAT-LEGACY",
    );

    expect(resolution.codeByLegacyId.get(5)).toBe("013");
    expect(resolution.codeByLegacyId.get(13)).toBe("013-LEGACY-12");
    expect(resolution.codeByLegacyId.get(12)).toBe("013-LEGACY-12-DUP-1");
  });

  it("should serialize reports with stable key ordering", () => {
    const serialized = stableJsonStringify({
      zebra: 1,
      alpha: {
        second: true,
        first: "x",
      },
      beta: [{ z: 1, a: 2 }],
    });

    expect(serialized).toBe(
      [
        "{",
        '  "alpha": {',
        '    "first": "x",',
        '    "second": true',
        "  },",
        '  "beta": [',
        "    {",
        '      "a": 2,',
        '      "z": 1',
        "    }",
        "  ],",
        '  "zebra": 1',
        "}",
      ].join("\n"),
    );
  });
});
