import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  Asset,
  JobEvent,
  Preflight,
  ProcessingJob,
  RemovalMode,
  SizeLine,
  StudioOptions,
} from "@/lib/types";

type UploadEntry = {
  id: string;
  fileName: string;
  progress: number;
  state: "uploading" | "completed" | "failed" | "cancelled";
  error?: string;
};

type StudioState = {
  locale: "fr" | "ar";
  activeStep: 1 | 2 | 3;
  activeTab: "new" | "library";
  assets: Asset[];
  selectedAssetId: string | null;
  uploads: UploadEntry[];
  jobs: Record<string, ProcessingJob>;
  mode: RemovalMode;
  sizes: SizeLine[];
  ratioLocked: boolean;
  options: StudioOptions;
  preflight: Preflight | null;
  setLocale: (locale: "fr" | "ar") => void;
  setStep: (step: 1 | 2 | 3) => void;
  setTab: (tab: "new" | "library") => void;
  setAssets: (assets: Asset[]) => void;
  addAsset: (asset: Asset) => void;
  patchAsset: (assetId: string, patch: Partial<Asset>) => void;
  selectAsset: (assetId: string) => void;
  updateUpload: (entry: UploadEntry) => void;
  setJob: (job: ProcessingJob) => void;
  applyJobEvent: (jobId: string, event: JobEvent) => void;
  setMode: (mode: RemovalMode) => void;
  setRatioLocked: (locked: boolean) => void;
  addSize: (size: Omit<SizeLine, "id">) => void;
  updateSize: (id: string, patch: Partial<SizeLine>) => void;
  removeSize: (id: string) => void;
  setOptions: (patch: Partial<StudioOptions>) => void;
  setPreflight: (preflight: Preflight | null) => void;
};

const initialOptions: StudioOptions = {
  humanReview: false,
  individualCut: false,
  resolutionEnhancement: "none",
  autoCenter: true,
  transparentMargin: false,
  residueCleanup: true,
  haloRemoval: true,
  garmentPreview: "dark",
  notes: "",
};

export const useStudio = create<StudioState>()(
  persist(
    (set) => ({
  locale: "fr",
  activeStep: 1,
  activeTab: "new",
  assets: [],
  selectedAssetId: null,
  uploads: [],
  jobs: {},
  mode: "automatic",
  sizes: [],
  ratioLocked: true,
  options: initialOptions,
  preflight: null,
  setLocale: (locale) => set({ locale }),
  setStep: (activeStep) => set({ activeStep }),
  setTab: (activeTab) => set({ activeTab }),
  setAssets: (assets) => set({ assets }),
  addAsset: (asset) =>
    set((state) => ({
      assets: [asset, ...state.assets.filter((item) => item.id !== asset.id)],
      selectedAssetId: state.selectedAssetId ?? asset.id,
    })),
  patchAsset: (assetId, patch) =>
    set((state) => ({
      assets: state.assets.map((asset) =>
        asset.id === assetId ? { ...asset, ...patch } : asset,
      ),
    })),
  selectAsset: (selectedAssetId) => set({ selectedAssetId, preflight: null }),
  updateUpload: (entry) =>
    set((state) => ({
      uploads: [
        ...state.uploads.filter((item) => item.id !== entry.id),
        entry,
      ],
    })),
  setJob: (job) =>
    set((state) => ({ jobs: { ...state.jobs, [job.id]: job } })),
  applyJobEvent: (jobId, event) =>
    set((state) => {
      const previous = state.jobs[jobId];
      if (!previous) return state;
      return {
        jobs: {
          ...state.jobs,
          [jobId]: {
            ...previous,
            state: event.state,
            progress: event.progress,
            stage_message: event.message,
          },
        },
      };
    }),
  setMode: (mode) => set({ mode }),
  setRatioLocked: (ratioLocked) => set({ ratioLocked }),
  addSize: (size) =>
    set((state) => ({
      sizes: [...state.sizes, { ...size, id: crypto.randomUUID() }],
    })),
  updateSize: (id, patch) =>
    set((state) => ({
      sizes: state.sizes.map((size) => (size.id === id ? { ...size, ...patch } : size)),
    })),
  removeSize: (id) =>
    set((state) => ({ sizes: state.sizes.filter((size) => size.id !== id) })),
  setOptions: (patch) =>
    set((state) => ({ options: { ...state.options, ...patch } })),
  setPreflight: (preflight) => set({ preflight }),
    }),
    {
      name: "printelly-background-studio-state",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        locale: state.locale,
        activeStep: state.activeStep,
        activeTab: state.activeTab,
        assets: state.assets,
        selectedAssetId: state.selectedAssetId,
        uploads: [],
        jobs: {},
        mode: state.mode,
        sizes: state.sizes,
        ratioLocked: state.ratioLocked,
        options: state.options,
        preflight: state.preflight,
      }),
    },
  ),
);
