import { beforeEach, describe, expect, it } from "vitest";
import type { Asset } from "@/lib/types";
import { useStudio } from "@/store/studio";

function asset(id: string): Asset {
  return {
    id,
    name: `${id}.png`,
    original_filename: `${id}.png`,
    mime_type: "image/png",
    byte_size: 1024,
    width: 1000,
    height: 1000,
    dpi_x: 300,
    dpi_y: 300,
    color_profile: "sRGB",
    has_transparency: false,
    status: "ready",
    quality_score: null,
    warnings: [],
    archived: false,
    created_at: "2026-07-30T00:00:00Z",
    updated_at: "2026-07-30T00:00:00Z",
    original_download_url: `/api/v1/files/${id}/original`,
    final_download_url: null,
  };
}

describe("TransferLab studio asset selection", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useStudio.setState({
      activeStep: 2,
      activeTab: "library",
      assets: [],
      selectedAssetId: null,
      preflight: null,
    });
  });

  it("selects every newly imported asset, including after a previous import", () => {
    const first = asset("first");
    const second = asset("second");

    useStudio.getState().addAsset(first);
    useStudio.getState().addAsset(second);

    const state = useStudio.getState();
    expect(state.assets.map((item) => item.id)).toEqual(["second", "first"]);
    expect(state.selectedAssetId).toBe("second");
    expect(state.activeTab).toBe("new");
    expect(state.activeStep).toBe(1);
  });

  it("keeps a valid library selection and falls back when it disappears", () => {
    const first = asset("first");
    const second = asset("second");

    useStudio.getState().setAssets([first, second]);
    useStudio.getState().selectAsset("second");
    useStudio.getState().setAssets([second, first]);
    expect(useStudio.getState().selectedAssetId).toBe("second");

    useStudio.getState().setAssets([first]);
    expect(useStudio.getState().selectedAssetId).toBe("first");

    useStudio.getState().setAssets([]);
    expect(useStudio.getState().selectedAssetId).toBeNull();
  });
});
