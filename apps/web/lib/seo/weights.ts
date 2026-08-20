/**
 * Dimension weights for the transparent SEO health score.
 * These are configuration values, not ranking predictions.
 */

export const DIMENSION_WEIGHTS = {
  "Technical SEO": 0.2,
  "Indexability": 0.15,
  "Content": 0.15,
  "Internal Linking": 0.1,
  "Structured Data": 0.1,
  "Performance": 0.15,
  "GEO/AEO Readiness": 0.15,
} as const;

export type DimensionName = keyof typeof DIMENSION_WEIGHTS;

export const DIMENSIONS: readonly DimensionName[] = Object.keys(
  DIMENSION_WEIGHTS,
) as DimensionName[];
