import { ReviewPacketResult, RankedItem } from '../../../shared/brainEngineTypes';

export function runPhysicianReviewPacketEngine(
  risks: string[],
  differentials: RankedItem[],
  tests: RankedItem[]
): ReviewPacketResult {
  return {
    summary: `Top concern: ${differentials[0]?.id || 'undifferentiated complaint'} with ${risks.length} risk markers.`,
    keyRisks: risks,
    topDifferentials: differentials.slice(0, 5),
    recommendedTests: tests.slice(0, 5)
  };
}
