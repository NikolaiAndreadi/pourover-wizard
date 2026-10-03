/** Timestamp uses the same injected monotonic clock as session events. */
export interface ScaleSample {
  atMs: number;
  grams: number;
  /** Display chart continuity; omitted for synthetic samples. */
  segment?: number;
}
