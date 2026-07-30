import { describe, expect, it } from "vitest";
import {
  parametersForRemovalMode,
  REMOVAL_PROFILES,
} from "@/lib/removal-profiles";

const EXPECTED_MODES = [
  "automatic",
  "person_hair",
  "logo_text",
  "complex_illustration",
  "product",
  "white_background",
  "black_background",
  "gray_background",
  "colored_background",
  "clean_transparent",
  "preserve_shadows",
  "remove_shadows",
  "dtf_high_precision",
];

describe("background removal profiles", () => {
  it("exposes every supported backend mode exactly once", () => {
    expect(REMOVAL_PROFILES.map((profile) => profile.mode)).toEqual(EXPECTED_MODES);
    expect(new Set(REMOVAL_PROFILES.map((profile) => profile.mode)).size).toBe(13);
  });

  it("keeps high precision and original dimensions enabled for every profile", () => {
    for (const profile of REMOVAL_PROFILES) {
      expect(parametersForRemovalMode(profile.mode)).toMatchObject({
        high_precision: true,
        protect_details: true,
        output_original_size: true,
      });
    }
  });

  it("enables protected smart processing for black backgrounds", () => {
    expect(parametersForRemovalMode("black_background")).toMatchObject({
      black_background_mode: "smart",
      protect_details: true,
      output_original_size: true,
    });
  });

  it("keeps transparent sources non-destructive", () => {
    expect(parametersForRemovalMode("clean_transparent")).toMatchObject({
      cleanup: "light",
      decontaminate: false,
      remove_haze: false,
      output_original_size: true,
    });
  });
});
