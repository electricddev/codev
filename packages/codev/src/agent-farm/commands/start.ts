/**
 * Start command - launches the architect dashboard
 */

import { resolve, basename } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import type { StartOptions, ArchitectState } from '../types.js';
import { getConfig, ensureDirectories } from '../utils/index.js';
import { logger, fatal } from '../utils/logger.js';
import { spawnDetached, commandExists, findAvailablePort, openBrowser, run, spawnTtyd } from '../utils/shell.js';
import { checkCoreDependencies } from '../utils/deps.js';
import { loadState, setArchitect } from '../state.js';
import { handleOrphanedSessions, warnAboutStaleArtifacts } from '../utils/orphan-handler.js';

/**
 * Parsed remote target
 */
interface ParsedRemote {
  user: string;
  host: string;
  remotePath?: string;
}

/**
 * Parse remote target string: user@host or user@host:/path
 */
export function parseRemote(remote: string): ParsedRemote {
  // Match: user@host or user@host:/path
  const match = remote.match(/^([^@]+)@([^:]+)(?::(.+))?$/);
  if (!match) {
    throw new Error(`Invalid remote format: ${remote}. Use user@host or user@host:/path`);
  }
  return { user: match[1], host: match[2], remotePath: match[3] };
}

/**
 * Find and load a role file - tries local codev/roles/ first, falls back to bundled
 */
function loadRolePrompt(config: { codevDir: string; bundledRolesDir: string }, roleName: string): { content: string; source: string } | null {
  // Try local project first
  const localPath = resolve(config.codevDir, 'roles', `${roleName}.md`);
  if (existsSync(localPath)) {
    return { content: readFileSync(localPath, 'utf-8'), source: 'local' };
  }

  // Fall back to bundled
  const bundledPath = resolve(config.bundledRolesDir, `${roleName}.md`);
  if (existsSync(bundledPath)) {
    return { content: readFileSync(bundledPath, 'utf-8'), source: 'bundled' };
  }

  return null;
}

/**
 * Start Agent Farm on a remote machine via SSH
 */
async function startRemote(options: StartOptions): Promise<void> {
  const config = getConfig();
  const { user, host, remotePath } = parseRemote(options.remote!);
  const localPort = options.port || config.dashboardPort;

  logger.header('Starting Remote Agent Farm');
  logger.kv('Host', `${user}@${host}`);
  if (remotePath) logger.kv('Path', remotePath);
  logger.kv('Local Port', localPort);

  // Build the remote command
  // If no path specified, use the current directory name to find project on remote
  const projectName = basename(config.projectRoot);
  const cdCommand = remotePath
    ? `cd ${remotePath}`
    : `cd ${projectName} 2>/dev/null || cd ~/${projectName} 2>/dev/null`;
  const remoteCommand = `${cdCommand} && af start --port ${localPort}`;

  // Check if local port is already in use
  try {
    const response = await fetch(`http://localhost:${localPort}/`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(500),
    });
    // If we get here, something is already running on this port
    fatal(`Port ${localPort} is already in use locally. Stop the existing service or use --port to specify a different port.`);
  } catch {
    // Port is available, continue
  }

  logger.info('Connecting via SSH...');

  // Spawn SSH with port forwarding
  const sshArgs = [
    '-L', `${localPort}:localhost:${localPort}`,
    '-t',  // Force TTY for remote af start
    '-o', 'ServerAliveInterval=30',  // Keep connection alive
    '-o', 'ServerAliveCountMax=3',
    `${user}@${host}`,
    remoteCommand,
  ];

  const ssh: ChildProcess = spawn('ssh', sshArgs, {
    stdio: ['inherit', 'pipe', 'inherit'],
  });

  // Track if we've seen the dashboard URL
  let dashboardReady = false;
  let dashboardUrl = '';

  // Parse SSH stdout for the dashboard URL
  ssh.stdout?.on('data', (data: Buffer) => {
    const output = data.toString();
    process.stdout.write(output); // Echo to user

    // Look for dashboard URL in output
    const dashboardMatch = output.match(/Dashboard:\s*(http:\/\/localhost:\d+)/);
    if (dashboardMatch && !dashboardReady) {
      dashboardReady = true;
      dashboardUrl = dashboardMatch[1];

      // Give it a moment to fully start, then open browser
      setTimeout(async () => {
        logger.blank();
        logger.success('Remote Agent Farm connected!');
        logger.kv('Dashboard', `http://localhost:${localPort}`);
        logger.info('Press Ctrl+C to disconnect');

        await openBrowser(`http://localhost:${localPort}`);
      }, 1000);
    }
  });

  // Handle SSH exit
  ssh.on('exit', (code) => {
    logger.blank();
    if (code === 0) {
      logger.info('Remote session ended');
    } else if (code === 255) {
      logger.error(`Could not connect to ${user}@${host}`);
      logger.info('Check that:');
      logger.info('  1. The host is reachable');
      logger.info('  2. SSH keys are configured');
      logger.info('  3. Agent Farm is installed on the remote machine');
    } else {
      logger.error(`Remote session ended with code ${code}`);
    }
    process.exit(code || 0);
  });

  // Handle SIGINT to gracefully close SSH
  process.on('SIGINT', () => {
    logger.info('Closing remote connection...');
    ssh.kill('SIGTERM');
  });

  // Keep the process alive
  await new Promise(() => {}); // Never resolves - waits for SSH exit
}

/**
 * Start the architect dashboard
 */
export async function start(options: StartOptions = {}): Promise<void> {
  // Handle remote mode
  if (options.remote) {
    return startRemote(options);
  }

  const config = getConfig();

  // Check for and clean up orphaned tmux sessions
  await handleOrphanedSessions({ kill: true });

  // Warn about stale artifacts from bash-era
  warnAboutStaleArtifacts(config.codevDir);

  // Check if already running
  const state = loadState();
  if (state.architect) {
    logger.warn(`Architect already running on port ${state.architect.port}`);
    logger.info(`Dashboard: http://localhost:${config.dashboardPort}`);
    return;
  }

  // Ensure directories exist
  await ensureDirectories(config);

  // Check all core dependencies (node, tmux, ttyd, git)
  await checkCoreDependencies();

  // Command is passed from index.ts (already resolved via CLI > config.json > default)
  let cmd = options.cmd || 'claude';

  // Check if base command exists before we wrap it in a launch script
  const baseCmdName = cmd.split(' ')[0];
  if (!(await commandExists(baseCmdName))) {
    fatal(`Command not found: ${baseCmdName}`);
  }

  // Load architect role if available and not disabled
  if (!options.noRole) {
    const role = loadRolePrompt(config, 'architect');
    if (role) {
      // Write role to a file and create a launch script to avoid shell escaping issues
      // The architect.md file contains backticks, $variables, and other shell-sensitive chars
      const roleFile = resolve(config.stateDir, 'architect-role.md');
      // Inject the actual dashboard port into the role prompt
      const roleContent = role.content.replace(/\{PORT\}/g, String(config.dashboardPort));
      writeFileSync(roleFile, roleContent, 'utf-8');

      const launchScript = resolve(config.stateDir, 'launch-architect.sh');
      writeFileSync(launchScript, `#!/bin/bash
cd "${config.projectRoot}"
exec ${cmd} --append-system-prompt "$(cat '${roleFile}')"
`, { mode: 0o755 });

      cmd = launchScript;
      logger.info(`Loaded architect role (${role.source})`);
    }
  }

  // Find available port for architect terminal
  let architectPort = config.architectPort;
  if (options.port !== undefined) {
    const parsedPort = Number(options.port);
    if (!Number.isFinite(parsedPort) || parsedPort < 1024 || parsedPort > 65535) {
      fatal(`Invalid port: ${options.port}. Must be a number between 1024-65535`);
    }
    architectPort = parsedPort;
  }

  logger.header('Starting Agent Farm');
  logger.kv('Project', config.projectRoot);
  logger.kv('Command', cmd);
  logger.kv('Port', architectPort);

  // Start architect in tmux session for persistence
  // Use port in session name to ensure uniqueness across projects
  const sessionName = `af-architect-${architectPort}`;

  // Kill any existing session
  try {
    await run(`tmux kill-session -t ${sessionName} 2>/dev/null || true`);
  } catch {
    // Ignore
  }

  // Create tmux session with the command
  // Note: Inner double quotes handle paths with spaces (e.g., "My Drive")
  await run(`tmux new-session -d -s ${sessionName} -x 200 -y 50 '"${cmd}"'`, { cwd: config.projectRoot });
  await run(`tmux set-option -t ${sessionName} status off`);
  await run(`tmux set-option -t ${sessionName} -g mouse on`);
  await run(`tmux set-option -t ${sessionName} -g set-clipboard on`);
  await run(`tmux set-option -t ${sessionName} -g allow-passthrough on`);

  // Copy selection to clipboard when mouse is released (pbcopy for macOS)
  await run(`tmux bind-key -T copy-mode MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "pbcopy"`);
  await run(`tmux bind-key -T copy-mode-vi MouseDragEnd1Pane send-keys -X copy-pipe-and-cancel "pbcopy"`);

  // Start ttyd attached to the tmux session
  const customIndexPath = resolve(config.templatesDir, 'ttyd-index.html');
  const hasCustomIndex = existsSync(customIndexPath);
  if (hasCustomIndex) {
    logger.info('Using custom terminal with file click support');
  }

  const bindHost = options.allowInsecureRemote ? '0.0.0.0' : undefined;

  if (options.allowInsecureRemote) {
    logger.warn('⚠️  INSECURE MODE: Binding to 0.0.0.0 - accessible from any network!');
    logger.warn('   No authentication - anyone on your network can access the terminal.');
    logger.warn('   DEPRECATED: Use `af start --remote user@host` for secure remote access instead.');
  }

  const ttydProcess = spawnTtyd({
    port: architectPort,
    sessionName,
    cwd: config.projectRoot,
    customIndexPath: hasCustomIndex ? customIndexPath : undefined,
    bindHost,
  });

  if (!ttydProcess?.pid) {
    fatal('Failed to start ttyd process');
  }

  // Save architect state
  const architectState: ArchitectState = {
    port: architectPort,
    pid: ttydProcess.pid,
    cmd,
    startedAt: new Date().toISOString(),
    tmuxSession: sessionName,
  };

  setArchitect(architectState);

  // Wait a moment for ttyd to start
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Start the dashboard server on the main port
  const dashboardPort = config.dashboardPort;
  await startDashboard(config.projectRoot, dashboardPort, architectPort, bindHost);

  logger.blank();
  logger.success('Agent Farm started!');
  logger.kv('Dashboard', `http://localhost:${dashboardPort}`);

  // Open dashboard in browser
  await openBrowser(`http://localhost:${dashboardPort}`);
}

/**
 * Wait for a server to respond on a given port
 * Returns true if server responds, false if timeout
 */
async function waitForServer(port: number, timeoutMs: number = 5000): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 100;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(`http://localhost:${port}/`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(500),
      });
      if (response.ok || response.status === 404) {
        return true; // Server is responding
      }
    } catch {
      // Server not ready yet, continue polling
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return false;
}

/**
 * Start the dashboard HTTP server
 */
async function startDashboard(projectRoot: string, port: number, _architectPort: number, bindHost?: string): Promise<void> {
  const config = getConfig();

  // Try TypeScript source first (dev mode), then compiled JS
  const tsScript = resolve(config.serversDir, 'dashboard-server.ts');
  const jsScript = resolve(config.serversDir, 'dashboard-server.js');

  let command: string;
  let args: string[];

  // Args: <port> [bindHost]
  const serverArgs = [String(port)];
  if (bindHost) {
    serverArgs.push(bindHost);
  }

  if (existsSync(tsScript)) {
    // Dev mode: run with tsx
    command = 'npx';
    args = ['tsx', tsScript, ...serverArgs];
  } else if (existsSync(jsScript)) {
    // Prod mode: run compiled JS
    command = 'node';
    args = [jsScript, ...serverArgs];
  } else {
    logger.warn('Dashboard server not found, skipping dashboard');
    return;
  }

  logger.debug(`Starting dashboard: ${command} ${args.join(' ')}`);

  const serverProcess = spawnDetached(command, args, {
    cwd: projectRoot,
  });

  if (!serverProcess.pid) {
    logger.warn('Failed to start dashboard server');
    return;
  }

  // Wait for server to actually be ready
  const isReady = await waitForServer(port, 5000);
  if (!isReady) {
    logger.warn(`Dashboard server did not respond on port ${port} within 5 seconds`);
    logger.warn('Check for errors above or run with DEBUG=1 for more details');
  }
}
