import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";

let sdk: NodeSDK | null = null;
let started = false;

export async function startTelemetry(serviceName: string) {
  if (started) return;

  const exporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  });

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      "service.name": serviceName,
      "deployment.environment": process.env.NODE_ENV || "development"
    }),
    traceExporter: exporter,
    instrumentations: [getNodeAutoInstrumentations()]
  });

  await sdk.start();
  started = true;
  console.log(`✅ OpenTelemetry started for ${serviceName}`);
}

export async function stopTelemetry() {
  if (!sdk) return;
  await sdk.shutdown();
}
