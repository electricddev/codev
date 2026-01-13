import { writeFileSync } from "node:fs";

export interface LaunchScriptOptions {
  scriptPath: string;
  cwd: string;
  execCommand: string;
  mode?: number;
}

export function writeLaunchScript(options: LaunchScriptOptions): string {
  const { scriptPath, cwd, execCommand, mode = 0o755 } = options;

  const content = `#!/bin/bash
cd "${cwd}"
exec ${execCommand}
`;
  writeFileSync(scriptPath, content, { mode });
  return scriptPath;
}

export function quoteShellArg(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function buildExecCommand(command: string, args: string[] = []): string {
  const base = command.trim();
  if (args.length === 0) {
    return base;
  }
  return `${base} ${args.map(quoteShellArg).join(" ")}`;
}
