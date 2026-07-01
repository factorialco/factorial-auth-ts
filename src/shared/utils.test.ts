import { describe, expect, it } from "vitest";
import { isPresent, isRecord, isString } from "@/shared/utils";

describe("isString", () => {
  it("accepts strings and rejects everything else", () => {
    expect(isString("x")).toBe(true);
    expect(isString(1)).toBe(false);
    expect(isString(null)).toBe(false);
    expect(isString(undefined)).toBe(false);
  });
});

describe("isPresent", () => {
  it("rejects null and undefined", () => {
    expect(isPresent(null)).toBe(false);
    expect(isPresent(undefined)).toBe(false);
  });

  it("accepts other values, including falsy ones", () => {
    expect(isPresent(0)).toBe(true);
    expect(isPresent("")).toBe(true);
    expect(isPresent(false)).toBe(true);
  });
});

describe("isRecord", () => {
  it("accepts plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it("rejects null, arrays, and primitives", () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord("x")).toBe(false);
    expect(isRecord(1)).toBe(false);
  });
});
