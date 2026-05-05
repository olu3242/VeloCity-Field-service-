// VeloCity AI Agent Registry
export { alice, AliceAgent } from "./alice";
export { max, MaxAgent } from "./max";
export { quinn, QuinnAgent } from "./quinn";
export { nova, NovaAgent } from "./nova";
export { rex, RexAgent } from "./rex";
export { ivy, IvyAgent } from "./ivy";
export { finn, FinnAgent } from "./finn";
export { lena, LenaAgent } from "./lena";
export { tess, TessAgent } from "./tess";
export { gabriel, GabrielAgent } from "./gabriel";

export type { AliceOutput } from "./alice";
export type { MaxOutput, MatchScore } from "./max";
export type { QuinnOutput, QuinnEstimateOutput } from "./quinn";
export type { NovaTransitionOutput, NovaReminderOutput } from "./nova";
export type { RexTrustOutput, RexReviewAnalysis } from "./rex";
export type { IvyOutput } from "./ivy";
export type { FinnPayoutOutput, FinnReconciliationOutput } from "./finn";
export type { LenaRebookOutput, LenaRetentionOutput } from "./lena";
export type { TessMarketOutput, TessServiceabilityOutput } from "./tess";
export type { GabrielComplianceOutput, GabrielProviderScreenOutput } from "./gabriel";
