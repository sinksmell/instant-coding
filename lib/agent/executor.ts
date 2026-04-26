import { createGitHubClient, getRepoTree, getFileContent, createBranch, createOrUpdateFile, createPullRequest } from "@/lib/github/client";
import { createClient } from "@/lib/supabase/server";
import { decrypt } from "@/lib/crypto";

interface TaskPayload {
  taskId: string;
  userId: string;
  githubId: string;
  accessToken: string;
  repoOwner: string;
  repoName: string;
  branch: string;
  description: string;
}

interface LogEntry {
  type: "command" | "output" | "error" | "success";
  content: string;
  timestamp: string;
}

async function appendLog(taskId: string, entry: LogEntry) {
  const supabase = createClient();
  const { data: task } = await supabase
    .from("tasks")
    .select("logs")
    .eq("id", taskId)
    .single();

  const logs = (task?.logs as LogEntry[]) || [];
  logs.push(entry);

  await supabase
    .from("tasks")
    .update({ logs: logs as unknown as string })
    .eq("id", taskId);
}

async function updateTaskStatus(
  taskId: string,
  status: string,
  extra?: { pr_url?: string; diff?: string; completed_at?: string }
) {
  const supabase = createClient();
  await supabase
    .from("tasks")
    .update({
      status,
      ...extra,
    })
    .eq("id", taskId);
}

async function callClaudeAPI(
  apiKey: string,
  baseUrl: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const url = `${baseUrl}/v1/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || "";
}

export async function executeTask(payload: TaskPayload) {
  const { taskId, userId, accessToken, repoOwner, repoName, branch, description } = payload;

  const now = () => new Date().toLocaleTimeString("zh-CN", { hour12: false });

  await updateTaskStatus(taskId, "running");
  await appendLog(taskId, {
    type: "command",
    content: `Starting task: ${description.slice(0, 60)}...`,
    timestamp: now(),
  });

  try {
    const supabase = createClient();

    // 1. Get user's API key
    const { data: user } = await supabase
      .from("users")
      .select("anthropic_api_key_encrypted, anthropic_base_url")
      .eq("id", userId)
      .single();

    if (!user?.anthropic_api_key_encrypted) {
      throw new Error("Anthropic API Key not configured. Please set it in Settings > API Key.");
    }

    const apiKey = decrypt(user.anthropic_api_key_encrypted);
    const baseUrl = user.anthropic_base_url || "https://api.anthropic.com";

    await appendLog(taskId, {
      type: "output",
      content: `API config loaded. Base URL: ${baseUrl}`,
      timestamp: now(),
    });

    // 2. Connect to GitHub
    const octokit = createGitHubClient(accessToken);
    await appendLog(taskId, {
      type: "command",
      content: `Connecting to GitHub: ${repoOwner}/${repoName}`,
      timestamp: now(),
    });

    // 3. Fetch repo tree
    const tree = await getRepoTree(octokit, repoOwner, repoName, branch);
    const filePaths = tree.map((t) => t.path).filter((p): p is string => !!p);

    await appendLog(taskId, {
      type: "output",
      content: `Found ${filePaths.length} files in repository`,
      timestamp: now(),
    });

    // 4. Read key files (limit to first 20 for context)
    const codeFiles = filePaths
      .filter((p) =>
        /\.(ts|tsx|js|jsx|py|go|rs|java|kt|swift|rb|php|cs|cpp|c|h|md|json|yaml|yml|toml)$/.test(p)
      )
      .slice(0, 20);

    const fileContents: { path: string; content: string }[] = [];
    for (const path of codeFiles) {
      const file = await getFileContent(octokit, repoOwner, repoName, path, branch);
      if (file) {
        fileContents.push({ path, content: file.content });
      }
    }

    await appendLog(taskId, {
      type: "output",
      content: `Read ${fileContents.length} source files for context`,
      timestamp: now(),
    });

    // 5. Call Claude API
    await appendLog(taskId, {
      type: "command",
      content: "Calling Claude API to generate code changes...",
      timestamp: now(),
    });

    const systemPrompt = `You are an expert software engineer. Based on the user's request and the provided repository files, generate code changes.

Rules:
1. Return ONLY a JSON object with this exact format:
{
  "changes": [
    {
      "path": "relative/file/path",
      "action": "create" | "modify" | "delete",
      "content": "full file content"
    }
  ],
  "prTitle": "Brief PR title",
  "prBody": "Detailed description of changes"
}
2. For "modify" action, provide the COMPLETE new file content, not a diff.
3. Keep changes minimal and focused on the user's request.
4. Do not include markdown code blocks around the JSON.`;

    const fileContext = fileContents
      .map((f) => `--- ${f.path} ---\n${f.content.slice(0, 3000)}`)
      .join("\n\n");

    const userPrompt = `Repository: ${repoOwner}/${repoName}\nBranch: ${branch}\n\nRequest: ${description}\n\nRepository files:\n${fileContext}`;

    const claudeResponse = await callClaudeAPI(apiKey, baseUrl, systemPrompt, userPrompt);

    await appendLog(taskId, {
      type: "output",
      content: `Claude response received (${claudeResponse.length} chars)`,
      timestamp: now(),
    });

    // 6. Parse response
    let changes: { path: string; action: string; content: string }[] = [];
    let prTitle = `Instant Coding: ${description.slice(0, 50)}`;
    let prBody = description;

    try {
      // Try to extract JSON from the response
      const jsonMatch = claudeResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        changes = parsed.changes || [];
        prTitle = parsed.prTitle || prTitle;
        prBody = parsed.prBody || prBody;
      }
    } catch (e) {
      await appendLog(taskId, {
        type: "error",
        content: `Failed to parse Claude response as JSON. Raw response will be saved as a new file.`,
        timestamp: now(),
      });
      // Fallback: save the raw response as a suggestion file
      changes = [{
        path: "INSTANT_CODING_SUGGESTIONS.md",
        action: "create",
        content: `# AI Suggestions\n\n${claudeResponse}`,
      }];
    }

    if (changes.length === 0) {
      throw new Error("No code changes were generated.");
    }

    await appendLog(taskId, {
      type: "output",
      content: `Generated ${changes.length} file changes`,
      timestamp: now(),
    });

    // 7. Create new branch
    const newBranch = `instant-coding/${taskId.slice(0, 8)}`;
    await createBranch(octokit, repoOwner, repoName, branch, newBranch);

    await appendLog(taskId, {
      type: "output",
      content: `Created branch: ${newBranch}`,
      timestamp: now(),
    });

    // 8. Apply changes
    for (const change of changes) {
      if (change.action === "delete") continue;

      const existing = await getFileContent(octokit, repoOwner, repoName, change.path, newBranch);

      await createOrUpdateFile(
        octokit,
        repoOwner,
        repoName,
        newBranch,
        change.path,
        change.content,
        `Update ${change.path} via Instant Coding`,
        existing?.sha
      );

      await appendLog(taskId, {
        type: "output",
        content: `${change.action === "create" ? "Created" : "Modified"}: ${change.path}`,
        timestamp: now(),
      });
    }

    // 9. Create PR
    const pr = await createPullRequest(
      octokit,
      repoOwner,
      repoName,
      prTitle,
      newBranch,
      branch,
      prBody
    );

    const diffSummary = changes
      .map((c) => `${c.action === "create" ? "+" : "M"} ${c.path}`)
      .join("\n");

    await appendLog(taskId, {
      type: "success",
      content: `PR created: ${pr.html_url}`,
      timestamp: now(),
    });

    await updateTaskStatus(taskId, "completed", {
      pr_url: pr.html_url,
      diff: diffSummary,
      completed_at: new Date().toISOString(),
    });

    return { success: true, prUrl: pr.html_url };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    await appendLog(taskId, {
      type: "error",
      content: message,
      timestamp: now(),
    });

    await updateTaskStatus(taskId, "failed");

    return { success: false, error: message };
  }
}
