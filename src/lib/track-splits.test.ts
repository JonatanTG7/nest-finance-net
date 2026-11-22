import { describe, expect, it } from "vitest";
import {
  balanceInTrack,
  buildSplitSegments,
  deriveTrackType,
  mergeImportedTracks,
  normalizePct,
  splitStatus,
  sumSplitPct,
  trackTypeColor,
  unallocatedPct,
  type TrackAllocationRow,
} from "./track-splits";

describe("deriveTrackType", () => {
  it("derives types from Hebrew track names", () => {
    expect(deriveTrackType("מסלול מניות")).toBe("equities");
    expect(deriveTrackType("מסלול מחקה מדד S&P500")).toBe("index");
    expect(deriveTrackType("מסלול פסיבי-מדדי מניות")).toBe("index");
    expect(deriveTrackType("מסלול לבני 50 ומטה")).toBe("age-based");
    expect(deriveTrackType("מסלול אג״ח")).toBe("bonds");
    expect(deriveTrackType("מסלול כספי")).toBe("cash");
    expect(deriveTrackType("מסלול הלכתי")).toBe("halacha");
    expect(deriveTrackType("מסלול כללי")).toBe("general");
    expect(deriveTrackType("משהו לא מוכר")).toBe("general");
  });
});

describe("trackTypeColor", () => {
  it("returns the fixed palette color and falls back to general", () => {
    expect(trackTypeColor("equities")).toBe("#16a34a");
    expect(trackTypeColor("index")).toBe("#2563eb");
    expect(trackTypeColor("mystery")).toBe("#94a3b8");
  });
});

describe("normalizePct", () => {
  it("rounds to one decimal and clamps into 0–100", () => {
    expect(normalizePct(62.94)).toBe(62.9);
    expect(normalizePct(62.95)).toBe(63);
    expect(normalizePct(150)).toBe(100);
    expect(normalizePct(-3)).toBe(0);
    expect(normalizePct(null)).toBeNull();
    expect(normalizePct(undefined)).toBeNull();
    expect(normalizePct(NaN)).toBeNull();
  });
});

describe("split sums", () => {
  const rows = [
    { allocation_pct_balance: 62.9, allocation_pct_deposits: 50 },
    { allocation_pct_balance: 37.1, allocation_pct_deposits: null },
    { allocation_pct_balance: null, allocation_pct_deposits: 50 },
  ];
  it("sums each split separately, nulls as zero", () => {
    expect(sumSplitPct(rows, "allocation_pct_balance")).toBe(100);
    expect(sumSplitPct(rows, "allocation_pct_deposits")).toBe(100);
  });
  it("reports the unallocated remainder", () => {
    expect(unallocatedPct(rows, "allocation_pct_balance")).toBe(0);
    expect(
      unallocatedPct(
        [{ allocation_pct_balance: 20, allocation_pct_deposits: null }],
        "allocation_pct_balance",
      ),
    ).toBe(80);
  });
  it("classifies complete / under / over", () => {
    expect(splitStatus(100)).toBe("complete");
    expect(splitStatus(99.9)).toBe("under");
    expect(splitStatus(100.1)).toBe("over");
    expect(splitStatus(0)).toBe("under");
  });
});

describe("balanceInTrack", () => {
  it("derives the amount from % × balance, rounded to ₪", () => {
    expect(balanceInTrack(100000, 62.9)).toBe(62900);
    expect(balanceInTrack(131969, 37.1)).toBe(48960);
    expect(balanceInTrack(100000, null)).toBe(0);
  });
});

function row(partial: Partial<TrackAllocationRow>): TrackAllocationRow {
  return {
    id: "id",
    household_id: "h",
    investment_account_id: "a",
    track_name: "מסלול",
    track_code: null,
    track_type: "general",
    allocation_pct_balance: null,
    allocation_pct_deposits: null,
    return_year_pct: null,
    sort_order: 0,
    created_at: "",
    updated_at: "",
    ...partial,
  } as TrackAllocationRow;
}

describe("buildSplitSegments", () => {
  it("builds largest-first segments with an unallocated remainder", () => {
    const segments = buildSplitSegments(
      [
        row({ id: "1", track_name: "מניות", track_type: "equities", allocation_pct_balance: 20 }),
        row({ id: "2", track_name: "S&P 500", track_type: "index", allocation_pct_balance: 50 }),
      ],
      100000,
    );
    expect(segments.map((s) => [s.name, s.pct, s.amountIls])).toEqual([
      ["S&P 500", 50, 50000],
      ["מניות", 20, 20000],
      ["לא מוקצה", 30, 30000],
    ]);
    expect(segments[2].isUnallocated).toBe(true);
  });
  it("has no remainder when the split is complete", () => {
    const segments = buildSplitSegments([row({ id: "1", allocation_pct_balance: 100 })], 50000);
    expect(segments).toHaveLength(1);
    expect(segments[0].isUnallocated).toBe(false);
  });
  it("folds tracks without a percentage into the remainder", () => {
    const segments = buildSplitSegments(
      [
        row({ id: "1", track_name: "מניות", allocation_pct_balance: 60 }),
        row({ id: "2", track_name: "מיובא מהדוח", allocation_pct_balance: null }),
      ],
      100000,
    );
    expect(segments.map((s) => s.name)).toEqual(["מניות", "לא מוקצה"]);
    expect(segments[1].pct).toBe(40);
  });
  it("returns no segments without any tracks", () => {
    expect(buildSplitSegments([], 100000)).toEqual([]);
  });
});

describe("mergeImportedTracks", () => {
  const existing = [
    row({
      id: "1",
      track_name: "מסלול מניות",
      track_type: "equities",
      allocation_pct_balance: 62.9,
      return_year_pct: -5,
    }),
  ];
  it("refreshes the return of a matched track and keeps its percentage", () => {
    const { toSave, added, updated } = mergeImportedTracks(existing, [
      { name: "מסלול מניות", returnYearPct: -9.39 },
    ]);
    expect(added).toBe(0);
    expect(updated).toBe(1);
    expect(toSave).toHaveLength(1);
    expect(toSave[0].allocation_pct_balance).toBe(62.9);
    expect(toSave[0].return_year_pct).toBe(-9.39);
  });
  it("adds new tracks with NO percentage (the statement has none)", () => {
    const { toSave, added, updated } = mergeImportedTracks(existing, [
      { name: "מסלול מחקה מדד S&P500", returnYearPct: -2.3 },
    ]);
    expect(added).toBe(1);
    expect(updated).toBe(0);
    expect(toSave).toHaveLength(2);
    const addedRow = toSave[1];
    expect(addedRow.track_name).toBe("מסלול מחקה מדד S&P500");
    expect(addedRow.track_type).toBe("index");
    expect(addedRow.allocation_pct_balance).toBeNull();
    expect(addedRow.allocation_pct_deposits).toBeNull();
    expect(addedRow.return_year_pct).toBe(-2.3);
  });
  it("keeps tracks missing from the import and dedupes repeats", () => {
    const { toSave, added } = mergeImportedTracks(existing, [
      { name: "מסלול חדש", returnYearPct: 1 },
      { name: "מסלול חדש", returnYearPct: 1 },
    ]);
    expect(added).toBe(1);
    expect(toSave.map((t) => t.track_name)).toEqual(["מסלול מניות", "מסלול חדש"]);
  });
});
