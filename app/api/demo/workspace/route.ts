import { PEER_FILES } from "@/lib/demo/assemble";
import { loadDemoWorkspace } from "@/lib/demo/load";
import { SWARM_NOTE } from "@/lib/demo/swarm-note";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    peerFiles: PEER_FILES,
    swarm: SWARM_NOTE,
    workspace: loadDemoWorkspace(),
  });
}
