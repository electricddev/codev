/**
 * Prompt command builder for AI CLIs.
 *
 * Example usage:
 * ```ts
 * const cmd = buildPromptCommand({
 *   command: 'claude --model opus',
 *   systemPromptFile: '/tmp/role.md',
 *   userPromptFile: '/tmp/prompt.txt',
 * });
 *
 * // Use in a shell script:
 * // exec ${cmd}
 * ```
 */

export type KnownCli = "claude" | "codex" | "gemini";

export interface PromptCommandOptions {
  command: string | string[];
  systemPromptFile?: string;
  userPromptFile?: string;
  userPromptText?: string;
  mode?: "interactive" | "one-shot";
}

function normalizeCommand(command: string | string[]): string {
  if (Array.isArray(command)) {
    return command
      .map((part) => part.trim())
      .join(" ")
      .trim();
  }
  return command.trim();
}

function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function catFile(path: string): string {
  return `$(cat ${quoteShellArg(path)})`;
}

function detectCli(command: string): KnownCli | null {
  const tokens = command.trim().split(/\s+/);
  for (const token of tokens) {
    if (!token) continue;
    if (token.includes("=") && !token.includes("/")) continue; // env var assignment
    if (token.startsWith("-")) continue;
    const name = token.split("/").pop() || token;
    if (name === "claude" || name === "codex" || name === "gemini") {
      return name;
    }
  }
  return null;
}

function userPromptArg(options: PromptCommandOptions): string | null {
  if (options.userPromptText !== undefined) {
    return quoteShellArg(options.userPromptText);
  }
  if (options.userPromptFile) {
    return catFile(options.userPromptFile);
  }
  return null;
}

/**
 * Build a runnable shell command string with prompt injection.
 */
export function buildPromptCommand(options: PromptCommandOptions): string {
  const base = normalizeCommand(options.command);
  if (!base) return base;

  const cli = detectCli(base);
  const userArg = userPromptArg(options);

  if (cli === "claude") {
    let cmd = base;
    if (options.systemPromptFile) {
      cmd += ` --append-system-prompt "${catFile(options.systemPromptFile)}"`;
    }
    if (userArg) {
      cmd += ` ${userArg}`;
    }
    return cmd;
  }

  if (cli === "codex") {
    let cmd = base;
    if (options.systemPromptFile && !cmd.includes("developer_instructions=")) {
      cmd += ` -c developer_instructions=${quoteShellArg(
        options.systemPromptFile
      )}`;
    }
    if (userArg && (options.mode ?? "interactive") === "one-shot") {
      cmd += ` ${userArg}`;
    } else if (userArg && (options.mode ?? "interactive") === "interactive") {
      cmd += ` ${userArg}`;
    }
    return cmd;
  }

  if (cli === "gemini") {
    let cmd = base;
    if (options.systemPromptFile) {
      cmd = `GEMINI_SYSTEM_MD=${quoteShellArg(
        options.systemPromptFile
      )} ${cmd}`;
    }
    if (userArg) {
      cmd += ` ${userArg}`;
    }
    return cmd;
  }

  // Unknown command: only append user prompt if provided.
  return userArg ? `${base} ${userArg}` : base;
}
