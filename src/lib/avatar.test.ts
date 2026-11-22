import { describe, expect, it } from "vitest";
import { MAX_AVATAR_BYTES, isExternalAvatarUrl, validateAvatarFile } from "@/lib/avatar";

describe("isExternalAvatarUrl", () => {
  it("treats https URLs as external (auth provider photo)", () => {
    expect(isExternalAvatarUrl("https://lh3.googleusercontent.com/a/photo")).toBe(true);
  });

  it("treats http URLs as external", () => {
    expect(isExternalAvatarUrl("http://example.com/pic.jpg")).toBe(true);
  });

  it("treats a storage path as internal", () => {
    expect(isExternalAvatarUrl("550e8400-1234/avatar.jpg")).toBe(false);
  });

  it("treats null and empty as internal", () => {
    expect(isExternalAvatarUrl(null)).toBe(false);
    expect(isExternalAvatarUrl("")).toBe(false);
  });
});

describe("validateAvatarFile", () => {
  it("accepts an image within the size cap", () => {
    expect(validateAvatarFile({ type: "image/jpeg", size: 1024 })).toBeNull();
    expect(validateAvatarFile({ type: "image/png", size: MAX_AVATAR_BYTES })).toBeNull();
  });

  it("rejects non-images", () => {
    expect(validateAvatarFile({ type: "application/pdf", size: 100 })).toBe("נא לבחור קובץ תמונה");
    expect(validateAvatarFile({ type: "", size: 100 })).toBe("נא לבחור קובץ תמונה");
  });

  it("rejects files over the size cap", () => {
    expect(validateAvatarFile({ type: "image/jpeg", size: MAX_AVATAR_BYTES + 1 })).toBe(
      "התמונה גדולה מדי — עד 5MB",
    );
  });
});
