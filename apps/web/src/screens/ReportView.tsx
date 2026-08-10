import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { PageContainer } from "../components/PageContainer";
import { PageTransition } from "../components/PageTransition";
import { SourceViewer, type SourceTarget } from "../components/SourceViewer";
import { ReportCard } from "../components/chat/ReportCard";
import { Button, Spinner } from "../components/ui";
import { api } from "../lib/api";
import type { ReportDraft } from "../lib/types";

/**
 * Full-page report. Read-and-export only — every edit happens by asking in the
 * chat, so there is one place where a report can change.
 */
export function ReportView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [target, setTarget] = useState<SourceTarget | null>(null);

  const report = useQuery<ReportDraft>({
    queryKey: ["report", id],
    queryFn: () => api.get(`/reports/${id}`),
    enabled: !!id,
  });

  return (
    <PageTransition>
      <PageContainer>
        <div className="mb-6 flex items-center justify-between gap-4">
          <button
            onClick={() => navigate("/reports")}
            className="inline-flex items-center gap-1.5 text-sm text-fg-low transition-colors hover:text-fg-hi"
          >
            <ArrowLeft className="h-4 w-4" /> All reports
          </button>
          {report.data?.session_id && (
            <Button variant="ghost" onClick={() => navigate(`/chat?session=${report.data!.session_id}`)}>
              <MessageSquare className="h-4 w-4" /> Continue in chat
            </Button>
          )}
        </div>

        {report.isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="h-6 w-6" />
          </div>
        ) : report.data ? (
          <ReportCard
            data={{
              report_id: report.data.id,
              title: report.data.title,
              sections: report.data.sections,
              charts: report.data.charts,
            }}
            compact={false}
            onOpenCitation={(c) => setTarget({ chunkId: c.chunk_id })}
          />
        ) : (
          <p className="py-16 text-center text-sm text-fg-low">That report is no longer available.</p>
        )}

        <SourceViewer target={target} onClose={() => setTarget(null)} />
      </PageContainer>
    </PageTransition>
  );
}
