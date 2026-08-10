import { Gauge } from "lucide-react";

import { PageContainer } from "../components/PageContainer";
import { PageTransition } from "../components/PageTransition";
import { ConsoleOverview } from "../components/ConsoleOverview";
import { PageHeader } from "../components/ui";

/**
 * What the platform is doing, measured from its own audit trail and corpus.
 *
 * There used to be a "System" panel here that swapped the model provider. It
 * was removed rather than fixed: switching pointed retrieval at a different,
 * empty Qdrant collection, so every answer abstained until a re-index that has
 * no button anywhere — and the setting lived in process memory, so it reset on
 * the next restart. A control that breaks the deployment and cannot be undone
 * from the interface is worse than no control.
 */
export function AdminConsole() {
  return (
    <PageTransition>
      <PageContainer>
        <PageHeader icon={Gauge} eyebrow="Platform telemetry" title="Admin console" sub="What the platform is doing." />
        <ConsoleOverview />
      </PageContainer>
    </PageTransition>
  );
}
