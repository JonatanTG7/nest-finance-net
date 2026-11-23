import { describe, expect, it } from "vitest";
import {
  hasTrackNamed,
  isPresetPicked,
  newCustomRow,
  presetForName,
  removeRow,
  renameRow,
  rowFromAllocation,
  rowFromPreset,
  rowsToInputs,
  splitBarSegments,
  splitCanSave,
  togglePreset,
  TRACK_PRESETS,
  type PickerRow,
} from "./track-picker";
import { deriveTrackType, type TrackAllocationRow } from "./track-splits";

describe("TRACK_PRESETS", () => {
  it("declares a type for every preset that matches the name derivation", () => {
    for (const p of TRACK_PRESETS) {
      expect(deriveTrackType(p.name)).toBe(p.type);
    }
  });
  it("has no duplicate preset names", () => {
    const names = TRACK_PRESETS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("presetForName", () => {
  it("matches presets case- and space-insensitively", () => {
    expect(presetForName("מניות")?.type).toBe("equities");
    expect(presetForName("  מחקה   S&P 500 ")?.type).toBe("index");
    expect(presetForName("מסלול שלא קיים")).toBeNull();
    expect(presetForName("")).toBeNull();
  });
});

describe("togglePreset / isPresetPicked", () => {
  const equities = TRACK_PRESETS[0];
  it("adds a row on first tap and removes it on the second", () => {
    const added = togglePreset([], equities);
    expect(added).toHaveLength(1);
    expect(added[0].track_name).toBe("מניות");
    expect(added[0].track_type).toBe("equities");
    expect(added[0].allocation_pct_balance).toBeNull();
    expect(isPresetPicked(added, equities)).toBe(true);
    const removed = togglePreset(added, equities);
    expect(removed).toHaveLength(0);
    expect(isPresetPicked(removed, equities)).toBe(false);
  });
  it("keeps other rows when toggling one preset", () => {
    const rows = togglePreset(togglePreset([], equities), TRACK_PRESETS[1]);
    expect(rows).toHaveLength(2);
    const after = togglePreset(rows, equities);
    expect(after.map((r) => r.track_name)).toEqual(["מחקה S&P 500"]);
  });
});

describe("rowFromPreset / newCustomRow", () => {
  it("fixes the preset type; a custom row derives its type until picked by hand", () => {
    const preset = rowFromPreset(TRACK_PRESETS[3]);
    expect(preset.track_type).toBe("bonds");
    expect(preset.typeManual).toBe(true);
    const custom = newCustomRow("מסלול אג״ח");
    expect(custom.track_type).toBe("bonds");
    expect(custom.typeManual).toBe(false);
    expect(custom.presetName).toBeNull();
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

describe("rowFromAllocation", () => {
  it("links an existing row to its preset by name, so the chip shows picked", () => {
    const r = rowFromAllocation(row({ track_name: "מניות", track_type: "equities" }));
    expect(r.presetName).toBe("מניות");
    expect(r.typeManual).toBe(true);
  });
  it("leaves non-preset names unlinked", () => {
    const r = rowFromAllocation(row({ track_name: "מסלול משולב מיוחד" }));
    expect(r.presetName).toBeNull();
  });
});

describe("renameRow", () => {
  it("drops the preset link when the name moves away from the preset", () => {
    const rows = [rowFromPreset(TRACK_PRESETS[0])];
    const renamed = renameRow(rows, rows[0].key, "מניות ישראליות");
    expect(renamed[0].presetName).toBeNull();
    expect(isPresetPicked(renamed, TRACK_PRESETS[0])).toBe(false);
    // Renaming back to the preset name re-links the chip.
    const back = renameRow(renamed, rows[0].key, "מניות");
    expect(back[0].presetName).toBe("מניות");
  });
  it("re-derives the type for custom rows only", () => {
    const custom = [newCustomRow("מסלול מניות")];
    const renamed = renameRow(custom, custom[0].key, "מסלול כספי");
    expect(renamed[0].track_type).toBe("cash");
    const preset = [rowFromPreset(TRACK_PRESETS[0])];
    const presetRenamed = renameRow(preset, preset[0].key, "מסלול כספי");
    expect(presetRenamed[0].track_type).toBe("equities");
  });
});

describe("hasTrackNamed / removeRow", () => {
  it("detects duplicate names for the custom-add input", () => {
    const rows = [rowFromPreset(TRACK_PRESETS[0])];
    expect(hasTrackNamed(rows, "מניות")).toBe(true);
    expect(hasTrackNamed(rows, "  מניות ")).toBe(true);
    expect(hasTrackNamed(rows, "כספי")).toBe(false);
    expect(hasTrackNamed(rows, "")).toBe(false);
  });
  it("removes only the chosen row", () => {
    const rows = [rowFromPreset(TRACK_PRESETS[0]), rowFromPreset(TRACK_PRESETS[1])];
    expect(removeRow(rows, rows[0].key).map((r) => r.track_name)).toEqual(["מחקה S&P 500"]);
  });
});

function pickerRow(partial: Partial<PickerRow>): PickerRow {
  return {
    key: crypto.randomUUID(),
    presetName: null,
    track_name: "מסלול",
    track_code: null,
    track_type: "general",
    typeManual: true,
    allocation_pct_balance: null,
    allocation_pct_deposits: null,
    return_year_pct: null,
    ...partial,
  };
}

describe("rowsToInputs", () => {
  it("drops deposits percentages on 'clear', keeps them on 'keep'", () => {
    const rows = [
      pickerRow({
        track_name: "מניות",
        allocation_pct_balance: 60,
        allocation_pct_deposits: 50,
      }),
    ];
    expect(rowsToInputs(rows, "clear")[0].allocation_pct_deposits).toBeNull();
    expect(rowsToInputs(rows, "keep")[0].allocation_pct_deposits).toBe(50);
  });

  it("preserves deposits percentages and returns for the balance-only dialog", () => {
    const rows = [
      pickerRow({
        track_name: "מחקה S&P 500",
        allocation_pct_balance: 80,
        allocation_pct_deposits: 70,
        return_year_pct: 12.5,
      }),
    ];
    const [input] = rowsToInputs(rows, "keep");
    expect(input.allocation_pct_deposits).toBe(70);
    expect(input.return_year_pct).toBe(12.5);
  });
});

describe("splitCanSave", () => {
  it("allows under-100% and empty splits, blocks over-100% and unnamed rows", () => {
    expect(splitCanSave([], false)).toBe(true);
    expect(splitCanSave([pickerRow({ allocation_pct_balance: 60 })], false)).toBe(true);
    expect(
      splitCanSave(
        [pickerRow({ allocation_pct_balance: 60 }), pickerRow({ allocation_pct_balance: 50 })],
        false,
      ),
    ).toBe(false);
    expect(splitCanSave([pickerRow({ track_name: "  " })], false)).toBe(false);
    expect(
      splitCanSave([pickerRow({ allocation_pct_balance: 60, allocation_pct_deposits: 110 })], true),
    ).toBe(false);
    // The deposits split is ignored when it is off.
    expect(
      splitCanSave(
        [pickerRow({ allocation_pct_balance: 60, allocation_pct_deposits: 110 })],
        false,
      ),
    ).toBe(true);
  });
});

describe("splitBarSegments", () => {
  it("builds largest-first segments with an unallocated remainder", () => {
    const segments = splitBarSegments([
      pickerRow({ track_name: "מניות", track_type: "equities", allocation_pct_balance: 20 }),
      pickerRow({ track_name: "S&P 500", track_type: "index", allocation_pct_balance: 50 }),
      pickerRow({ track_name: "לא ידוע", allocation_pct_balance: null }),
    ]);
    expect(segments.map((s) => [s.name, s.pct, s.isUnallocated])).toEqual([
      ["S&P 500", 50, false],
      ["מניות", 20, false],
      ["לא מוקצה", 30, true],
    ]);
    expect(segments[0].color).toBe("#2563eb");
  });
  it("returns no segments without any tracks", () => {
    expect(splitBarSegments([])).toEqual([]);
  });
  it("has no remainder when the split is complete", () => {
    const segments = splitBarSegments([pickerRow({ allocation_pct_balance: 100 })]);
    expect(segments).toHaveLength(1);
    expect(segments[0].isUnallocated).toBe(false);
  });
});
