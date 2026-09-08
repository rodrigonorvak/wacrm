import { describe, expect, it } from "vitest";
import { getElementorEventId, readElementorField } from "./elementor";

describe("Elementor payload helpers", () => {
  it("reads flat field IDs", () => {
    expect(readElementorField({ nome: " Maria Silva " }, "nome")).toBe("Maria Silva");
  });

  it("reads the nested fields shape", () => {
    expect(
      readElementorField(
        { fields: { telefone: { value: "+5511999999999" } } },
        "telefone",
      ),
    ).toBe("+5511999999999");
  });

  it("reads raw values and array values", () => {
    expect(readElementorField({ interesse: { raw_value: "Curso" } }, "interesse")).toBe("Curso");
    expect(readElementorField({ tags: { value: ["A", "B"] } }, "tags")).toBe("A, B");
  });

  it("reads an Elementor field list", () => {
    expect(
      readElementorField(
        { fields: [{ id: "field_phone", value: "+5511999999999" }] },
        "field_phone",
      ),
    ).toBe("+5511999999999");
  });

  it("returns null for empty or missing fields", () => {
    expect(readElementorField({ nome: "   " }, "nome")).toBeNull();
    expect(readElementorField({}, "nome")).toBeNull();
  });

  it("prefers event_id, then submission_id, then id", () => {
    expect(getElementorEventId({ event_id: "event-1", submission_id: "submission-1" })).toBe("event-1");
    expect(getElementorEventId({ submission_id: "submission-1", id: "row-1" })).toBe("submission-1");
    expect(getElementorEventId({ id: "row-1" })).toBe("row-1");
    expect(getElementorEventId({})).toBeNull();
  });
});
