import { PipelineLeadPage } from "@/components/pipelines/pipeline-lead-page";

type RouteParams = {
  params: Promise<{ dealId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const RETURN_PARAM_KEYS = ["pipeline", "stage", "date", "view", "start", "end"] as const;

export default async function PipelineDealRoute({ params, searchParams }: RouteParams) {
  const [{ dealId }, query] = await Promise.all([params, searchParams]);
  const returnParams = new URLSearchParams();

  for (const key of RETURN_PARAM_KEYS) {
    const value = query[key];
    if (typeof value === "string" && value) returnParams.set(key, value);
  }

  const returnTo = returnParams.size > 0 ? `/pipelines?${returnParams.toString()}` : "/pipelines";
  return <PipelineLeadPage dealId={dealId} returnTo={returnTo} />;
}