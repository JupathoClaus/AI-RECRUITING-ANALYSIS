import { describe, it, expect } from "vitest"
import { parseNonNegativeIntegerHeader, parseContentDispositionFilename, sanitizeDownloadFilename } from "../export-helpers"

describe("parseNonNegativeIntegerHeader", () => {
  it("null → null", () => expect(parseNonNegativeIntegerHeader(null)).toBeNull())
  it("empty string → null", () => expect(parseNonNegativeIntegerHeader("")).toBeNull())
  it("non-numeric → null", () => expect(parseNonNegativeIntegerHeader("abc")).toBeNull())
  it("decimal → null", () => expect(parseNonNegativeIntegerHeader("5.2")).toBeNull())
  it("negative → null", () => expect(parseNonNegativeIntegerHeader("-3")).toBeNull())
  it("zero → 0", () => expect(parseNonNegativeIntegerHeader("0")).toBe(0))
  it("normal → 5000", () => expect(parseNonNegativeIntegerHeader("5000")).toBe(5000))
  it("huge → null", () => expect(parseNonNegativeIntegerHeader("99999999999999999999")).toBeNull())
})

describe("sanitizeDownloadFilename", () => {
  it("normal name", () => expect(sanitizeDownloadFilename("report.csv", "fallback.csv")).toBe("report.csv"))
  it("removes slash", () => expect(sanitizeDownloadFilename("../../etc.csv", "fall.csv")).toBe("etc.csv"))
  it("removes backslash", () => expect(sanitizeDownloadFilename("..\\..\\etc.csv", "fall.csv")).toBe("etc.csv"))
  it("removes control chars", () => expect(sanitizeDownloadFilename("re\x00port.csv", "fall.csv")).toBe("report.csv"))
  it("removes quotes", () => expect(sanitizeDownloadFilename('"report.csv"', "fall.csv")).toBe("report.csv"))
  it("blank → fallback", () => expect(sanitizeDownloadFilename("", "fall.csv")).toBe("fall.csv"))
  it("no extension → fallback", () => expect(sanitizeDownloadFilename("report", "fall.csv")).toBe("fall.csv"))
})

describe("parseContentDispositionFilename", () => {
  it("null → report name fallback", () => expect(parseContentDispositionFilename(null, "candidates")).toBe("candidates.csv"))
  it("plain filename", () => expect(parseContentDispositionFilename('attachment; filename="report.csv"', "x")).toBe("report.csv"))
  it("filename without quotes", () => expect(parseContentDispositionFilename("attachment; filename=report.csv", "x")).toBe("report.csv"))
  it("UTF-8 filename*", () => expect(parseContentDispositionFilename("attachment; filename*=UTF-8''candidats.csv", "x")).toBe("candidats.csv"))
  it("encoded spaces in filename*", () => expect(parseContentDispositionFilename("attachment; filename*=UTF-8''my%20report.csv", "x")).toBe("my report.csv"))
  it("malformed filename* falls back to filename", () => expect(parseContentDispositionFilename('attachment; filename*=invalid; filename="safe.csv"', "x")).toBe("safe.csv"))
  it("malformed → fallback", () => expect(parseContentDispositionFilename("attachment; filename=..\\..\\evil.csv", "x")).toBe("evil.csv"))
})
