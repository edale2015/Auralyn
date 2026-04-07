/**
 * Thin facade for the physician self-improvement review workflow.
 * Routes import only from this file so the governance surface stays explicit.
 */
export {
  listPendingReviews,
  approveAndApplyAction,
  rejectImprovementAction,
  getReviewHistory,
  getImprovementLog,
} from "./selfImprove";
