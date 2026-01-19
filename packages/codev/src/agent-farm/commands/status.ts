/**
 * Status command - shows status of all agents
 */

import type { Builder } from '../types.js';
import { loadState, updateBuilderStatus } from '../state.js';
import { logger, fatal } from '../utils/logger.js';
import { isProcessRunning } from '../utils/shell.js';
import { send } from './send.js';
import chalk from 'chalk';

const VALID_STATUSES: Builder['status'][] = [
  'spawning',
  'implementing',
  'blocked',
  'pr-ready',
  'complete',
];

function normalizeStatus(input: string): Builder['status'] {
  const normalized = input.trim().toLowerCase().replace(/_/g, '-');
  if (!VALID_STATUSES.includes(normalized as Builder['status'])) {
    fatal(
      `Invalid status: ${input}. Valid statuses: ${VALID_STATUSES.join(', ')}`
    );
  }
  return normalized as Builder['status'];
}

function detectCurrentBuilderId(): string | null {
  const cwd = process.cwd();
  const match = cwd.match(/\.builders\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Display status of all agent farm processes
 */
export async function status(): Promise<void> {
  const state = loadState();

  logger.header('Agent Farm Status');

  // Architect status
  if (state.architect) {
    const running = await isProcessRunning(state.architect.pid);
    const statusText = running ? chalk.green('running') : chalk.red('stopped');
    logger.kv('Architect', `${statusText} (PID: ${state.architect.pid}, port: ${state.architect.port})`);
    logger.kv('  Command', state.architect.cmd);
    logger.kv('  Started', state.architect.startedAt);
  } else {
    logger.kv('Architect', chalk.gray('not running'));
  }

  logger.blank();

  // Builders
  if (state.builders.length > 0) {
    logger.info('Builders:');
    const widths = [12, 20, 10, 12, 10, 6];

    logger.row(['ID', 'Name', 'Type', 'Status', 'Phase', 'Port'], widths);
    logger.row(['──', '────', '────', '──────', '─────', '────'], widths);

    for (const builder of state.builders) {
      const running = await isProcessRunning(builder.pid);
      const statusColor = getStatusColor(builder.status, running);
      const typeColor = getTypeColor(builder.type || 'spec');

      logger.row([
        builder.id,
        builder.name.substring(0, 18),
        typeColor(builder.type || 'spec'),
        statusColor(builder.status),
        builder.phase.substring(0, 8),
        String(builder.port),
      ], widths);
    }
  } else {
    logger.info('Builders: none');
  }

  logger.blank();

  // Utils
  if (state.utils.length > 0) {
    logger.info('Utility Terminals:');
    const widths = [8, 20, 8];

    logger.row(['ID', 'Name', 'Port'], widths);
    logger.row(['──', '────', '────'], widths);

    for (const util of state.utils) {
      const running = await isProcessRunning(util.pid);
      const name = running ? util.name : chalk.gray(util.name + ' (stopped)');

      logger.row([
        util.id,
        name.substring(0, 18),
        String(util.port),
      ], widths);
    }
  } else {
    logger.info('Utility Terminals: none');
  }

  logger.blank();

  // Annotations
  if (state.annotations.length > 0) {
    logger.info('Annotations:');
    const widths = [8, 30, 8];

    logger.row(['ID', 'File', 'Port'], widths);
    logger.row(['──', '────', '────'], widths);

    for (const annotation of state.annotations) {
      const running = await isProcessRunning(annotation.pid);
      const file = running ? annotation.file : chalk.gray(annotation.file + ' (stopped)');

      logger.row([
        annotation.id,
        file.substring(0, 28),
        String(annotation.port),
      ], widths);
    }
  } else {
    logger.info('Annotations: none');
  }
}

interface SetStatusOptions {
  builder: string;
  status: string;
  notify?: boolean;
}

/**
 * Set a builder's status
 */
export async function setStatus(options: SetStatusOptions): Promise<void> {
  const builderId = options.builder.trim();
  const statusValue = normalizeStatus(options.status);

  const updated = updateBuilderStatus(builderId, statusValue);
  if (!updated) {
    fatal(`Builder not found: ${builderId}`);
  }

  logger.success(`Builder ${builderId} status set to ${statusValue}`);

  if (options.notify) {
    const currentBuilderId = detectCurrentBuilderId();
    if (!currentBuilderId) {
      fatal('Must run from a builder worktree to notify the Architect');
    }
    if (currentBuilderId !== builderId) {
      fatal(
        `Current builder (${currentBuilderId}) does not match target (${builderId})`
      );
    }

    await send({
      builder: 'architect',
      message: `Status: ${builderId} -> ${statusValue}`,
    });
  }
}

function getStatusColor(status: string, running: boolean): (text: string) => string {
  if (!running) {
    return chalk.gray;
  }

  switch (status) {
    case 'implementing':
      return chalk.blue;
    case 'blocked':
      return chalk.yellow;
    case 'pr-ready':
      return chalk.green;
    case 'complete':
      return chalk.green;
    default:
      return chalk.white;
  }
}

function getTypeColor(type: string): (text: string) => string {
  switch (type) {
    case 'spec':
      return chalk.cyan;
    case 'task':
      return chalk.magenta;
    case 'protocol':
      return chalk.yellow;
    case 'worktree':
      return chalk.blue;
    case 'shell':
      return chalk.gray;
    default:
      return chalk.white;
  }
}
