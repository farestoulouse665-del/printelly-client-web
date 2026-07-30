export type Asset = {
  id: string;
  name: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  width: number;
  height: number;
  dpi_x: number | null;
  dpi_y: number | null;
  color_profile: string;
  has_transparency: boolean;
  status: string;
  quality_score: number | null;
  warnings: Array<{ code?: string; message?: string }>;
  archived: boolean;
  created_at: string;
  updated_at: string;
  original_download_url: string | null;
  preview_download_url?: string | null;
  final_download_url: string | null;
};

export type JobState =
  | "queued"
  | "decoding"
  | "validating"
  | "analyzing"
  | "segmenting"
  | "refining"
  | "protecting_details"
  | "cleaning"
  | "cleaning_residues"
  | "upscaling"
  | "validating_upscale"
  | "generating_preview"
  | "awaiting_review"
  | "exporting"
  | "completed"
  | "failed"
  | "cancelled";

export type ProcessingJob = {
  id: string;
  asset_id: string;
  state: JobState;
  progress: number;
  stage_message: string;
  mode: RemovalMode;
  parameters: Record<string, unknown>;
  report: Record<string, unknown>;
  error_code: string | null;
  error_message: string | null;
  cancel_requested: boolean;
  attempt: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  download_url: string | null;
};

export type RemovalMode =
  | "automatic"
  | "person_hair"
  | "logo_text"
  | "complex_illustration"
  | "product"
  | "white_background"
  | "black_background"
  | "gray_background"
  | "colored_background"
  | "clean_transparent"
  | "preserve_shadows"
  | "remove_shadows"
  | "dtf_high_precision";

export type JobEvent = {
  id: number;
  state: JobState;
  progress: number;
  message: string;
  details: Record<string, unknown>;
  created_at: string;
};

export type PreflightIssue = {
  code: string;
  severity: "info" | "warning" | "error";
  title: string;
  explanation: string;
  location: { x: number; y: number; width: number; height: number } | null;
  automatic_fix: string | null;
};

export type Preflight = {
  id: string;
  asset_id: string;
  status: "ready" | "review" | "correction_required";
  score: number;
  width_cm: number;
  height_cm: number;
  dpi: number;
  issues: PreflightIssue[];
  metrics: Record<string, unknown>;
  created_at: string;
};

export type SizeLine = {
  id: string;
  label: string;
  widthCm: number;
  heightCm: number;
  quantity: number;
  variants: number;
};

export type StudioOptions = {
  humanReview: boolean;
  individualCut: boolean;
  resolutionEnhancement: "none" | "2x" | "4x" | "300dpi" | "600dpi";
  autoCenter: boolean;
  transparentMargin: boolean;
  residueCleanup: boolean;
  haloRemoval: boolean;
  garmentPreview: "light" | "dark";
  notes: string;
};

export type Quote = {
  id: string;
  currency: "DZD";
  subtotal_dzd: number;
  discount_dzd: number;
  fees_dzd: number;
  delivery_dzd: number;
  total_dzd: number;
  breakdown: Record<string, unknown>;
  expires_at: string;
};
