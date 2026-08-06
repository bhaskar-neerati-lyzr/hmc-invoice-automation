import { promises as fs } from "fs";
import path from "path";
import CopyField from "./CopyField";

export const dynamic = "force-dynamic";

type AgentConfig = {
  name: string;
  agent_role: string;
  agent_instructions: string;
  agent_goal: string;
};

async function loadAgentConfig(): Promise<AgentConfig | null> {
  try {
    const filePath = path.join(process.cwd(), "..", "ocr_agent.json");
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as AgentConfig;
  } catch {
    return null;
  }
}

export default async function AgentConfigPage() {
  const config = await loadAgentConfig();

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <main className="flex w-full max-w-2xl flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Agent Config
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Live from <code>ocr_agent.json</code> — copy each field into the matching box in Lyzr Studio.
          </p>
        </div>

        {config === null ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            ocr_agent.json not found or invalid. Check that it still exists at the project root.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <CopyField label="Name" value={config.name} />
            <CopyField label="Agent Role" value={config.agent_role} />
            <CopyField label="Agent Instructions" value={config.agent_instructions} />
            <CopyField label="Agent Goal" value={config.agent_goal} />
          </div>
        )}
      </main>
    </div>
  );
}
