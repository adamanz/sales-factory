import { WorkspaceApp } from "@/components/demo/workspace-app";
import { loadDemoWorkspace } from "@/lib/demo/load";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sample workspace · Sales Factory" };

type Search = { call?: string; tour?: string; at?: string };

export default async function DemoPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const workspace = loadDemoWorkspace();
  const known = workspace.calls.some((call) => call.id === params.call);
  const initialCallId = known && params.call ? params.call : workspace.calls[0].id;

  return (
    <WorkspaceApp
      workspace={workspace}
      initialCallId={initialCallId}
      unknownCall={Boolean(params.call) && !known}
      forceTour={params.tour === "1"}
      skipTour={params.tour === "0"}
      startAt={params.at === "start" ? "start" : "end"}
    />
  );
}
