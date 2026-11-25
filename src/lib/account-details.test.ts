import { describe, expect, it } from "vitest";
import {
  arrangeDetailFields,
  customFieldsCanSave,
  diffCustomFields,
  normalizeCustomFieldInputs,
  type CustomFieldRow,
  type DetailFieldDef,
} from "./account-details";

function def(
  key: string,
  value: string | null,
  group: "account" | "meta" = "account",
): DetailFieldDef {
  return { key, label: key, value, group };
}

describe("arrangeDetailFields", () => {
  it("drops rows with no value", () => {
    const { account, meta } = arrangeDetailFields(
      [def("kind", "קרן פנסיה"), def("company", null), def("owner", "יונתן", "meta")],
      [],
    );
    expect(account.map((f) => f.key)).toEqual(["kind"]);
    expect(meta.map((f) => f.key)).toEqual(["owner"]);
  });

  it("drops hidden rows", () => {
    const { account, meta } = arrangeDetailFields(
      [def("kind", "קרן פנסיה"), def("company", "מנורה"), def("owner", "יונתן", "meta")],
      ["company"],
    );
    expect(account.map((f) => f.key)).toEqual(["kind"]);
    expect(meta.map((f) => f.key)).toEqual(["owner"]);
  });

  it("always renders meta rows last, even when they come first in input", () => {
    const { account, meta } = arrangeDetailFields(
      [
        def("owner", "יונתן", "meta"),
        def("kind", "קרן פנסיה"),
        def("data_source", "אזור אישי", "meta"),
        def("company", "מנורה"),
      ],
      [],
    );
    expect(account.map((f) => f.key)).toEqual(["kind", "company"]);
    expect(meta.map((f) => f.key)).toEqual(["owner", "data_source"]);
  });

  it("keeps custom fields in the account block", () => {
    const { account, meta } = arrangeDetailFields(
      [def("owner", "יונתן", "meta"), def("custom:1", "168"), def("kind", "קרן פנסיה")],
      [],
    );
    expect(account.map((f) => f.key)).toEqual(["custom:1", "kind"]);
    expect(meta.map((f) => f.key)).toEqual(["owner"]);
  });

  it("a hidden meta row stays hidden even when it has a value", () => {
    const { meta } = arrangeDetailFields([def("owner", "יונתן", "meta")], ["owner"]);
    expect(meta).toEqual([]);
  });
});

describe("normalizeCustomFieldInputs", () => {
  it("trims and drops rows missing label or value", () => {
    expect(
      normalizeCustomFieldInputs([
        { label: "  מספר קופה ", value: " 168 " },
        { label: "רק כותרת", value: "   " },
        { label: "", value: "רק ערך" },
        { label: "   ", value: "" },
      ]),
    ).toEqual([{ label: "מספר קופה", value: "168" }]);
  });

  it("keeps ids of existing rows", () => {
    expect(normalizeCustomFieldInputs([{ id: "abc", label: "א", value: "ב" }])).toEqual([
      { id: "abc", label: "א", value: "ב" },
    ]);
  });
});

describe("customFieldsCanSave", () => {
  it("blocks half-filled rows", () => {
    expect(customFieldsCanSave([{ label: "א", value: "" }])).toBe(false);
    expect(customFieldsCanSave([{ label: "", value: "ב" }])).toBe(false);
    expect(customFieldsCanSave([{ label: "א", value: "ב" }])).toBe(true);
    expect(customFieldsCanSave([{ label: "", value: "" }])).toBe(true);
    expect(
      customFieldsCanSave([
        { label: "א", value: "ב" },
        { label: "ג", value: "" },
      ]),
    ).toBe(false);
  });
});

function row(id: string, label: string, value: string): CustomFieldRow {
  return {
    id,
    household_id: "h",
    investment_account_id: "a",
    label,
    value,
    sort_order: 0,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };
}

describe("diffCustomFields", () => {
  it("reports adds, edits and deletes", () => {
    const changes = diffCustomFields(
      [row("1", "מספר קופה", "168"), row("2", "יועץ", "דנה")],
      [
        { id: "1", label: "מספר קופה", value: "169" },
        { label: "טלפון", value: "050" },
      ],
    );
    expect(changes).toEqual([
      { field: "custom_field", oldValue: "מספר קופה: 168", newValue: "מספר קופה: 169" },
      { field: "custom_field", oldValue: null, newValue: "טלפון: 050" },
      { field: "custom_field", oldValue: "יועץ: דנה", newValue: null },
    ]);
  });

  it("reports nothing when nothing changed", () => {
    expect(diffCustomFields([row("1", "א", "ב")], [{ id: "1", label: "א", value: "ב" }])).toEqual(
      [],
    );
  });

  it("treats a label-only change as a change", () => {
    expect(diffCustomFields([row("1", "א", "ב")], [{ id: "1", label: "ג", value: "ב" }])).toEqual([
      { field: "custom_field", oldValue: "א: ב", newValue: "ג: ב" },
    ]);
  });
});
