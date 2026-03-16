import { selectProtocol } from '../brain/protocolSelector';

export class ProtocolSelectionEngine {
  readonly name = 'protocolSelectionEngine';

  run(context: any): any {
    const complaint = (context.complaint ?? '').toLowerCase().replace(/[\s-]+/g, '_');
    const protocol = selectProtocol(complaint);

    return {
      ...context,
      protocol: protocol.id,
      protocolName: protocol.name,
      protocolSource: protocol.source,
      protocolEvidenceLevel: protocol.evidenceLevel,
      protocolSafetyPriorities: protocol.safetyPriorities,
      protocolDispositionGuidance: protocol.dispositionGuidance,
    };
  }
}
