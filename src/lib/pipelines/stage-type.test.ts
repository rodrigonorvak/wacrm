import { describe, expect, it } from "vitest";

import { getMetaEventForStageType } from "./stage-type";

describe("getMetaEventForStageType", () => {
  it.each([
    ["other", null],
    ["lead", "Lead"],
    ["schedule", "Schedule"],
    ["purchase", "Purchase"],
  ] as const)("maps %s to its Meta event", (stageType, eventName) => {
    expect(getMetaEventForStageType(stageType)).toBe(eventName);
  });

  it("does not map an unset type to a Meta event", () => {
    expect(getMetaEventForStageType(undefined)).toBeNull();
  });
});
