/**
 * Kept as a re-export so the progress screen and its test are unchanged. The
 * implementation moved to `@/lib/training/describe-measurement` when the plan's
 * activity editor needed the same words; this file is a leftover of that move
 * and can be deleted once its two importers point at the new home.
 */
export { describeMeasurement as describeTarget } from "@/lib/training/describe-measurement";
