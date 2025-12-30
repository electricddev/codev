/**
 * Tests for port registry utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { GLOBAL_SCHEMA } from '../db/schema.js';

// We need to mock the global db to use our test database
// Import the actual functions after setting up mocks
let cleanupStaleEntries: typeof import('../utils/port-registry.js').cleanupStaleEntries;
let getPortBlock: typeof import('../utils/port-registry.js').getPortBlock;

describe('Port Registry', () => {
  const testDir = resolve(tmpdir(), `.test-port-registry-${process.pid}`);
  const testDbPath = resolve(testDir, 'global.db');
  let db: Database.Database;

  beforeEach(async () => {
    // Clean up before each test
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });

    // Create test database with global schema
    db = new Database(testDbPath);
    db.pragma('journal_mode = WAL');
    db.exec(GLOBAL_SCHEMA);

    // Mock getGlobalDb to return our test database
    vi.doMock('../db/index.js', () => ({
      getGlobalDb: () => db,
    }));

    // Import functions after mocking
    const portRegistry = await import('../utils/port-registry.js');
    cleanupStaleEntries = portRegistry.cleanupStaleEntries;
    getPortBlock = portRegistry.getPortBlock;
  });

  afterEach(() => {
    vi.resetModules();
    if (db) {
      db.close();
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('cleanupStaleEntries', () => {
    it('should remove entries for non-existent project paths', () => {
      // Insert allocation for non-existent path
      db.prepare(`
        INSERT INTO port_allocations (project_path, base_port, pid)
        VALUES ('/non/existent/path', 4200, NULL)
      `).run();

      const result = cleanupStaleEntries();

      expect(result.removed).toContain('/non/existent/path');
      expect(result.remaining).toBe(0);

      // Verify it's actually gone
      const count = db.prepare('SELECT COUNT(*) as c FROM port_allocations').get() as { c: number };
      expect(count.c).toBe(0);
    });

    it('should keep entries for existing project paths', () => {
      // Create a real directory
      const existingPath = join(testDir, 'existing-project');
      mkdirSync(existingPath, { recursive: true });

      // Insert allocation for existing path
      db.prepare(`
        INSERT INTO port_allocations (project_path, base_port, pid)
        VALUES (?, 4200, NULL)
      `).run(existingPath);

      const result = cleanupStaleEntries();

      expect(result.removed).toHaveLength(0);
      expect(result.remaining).toBe(1);

      // Verify it's still there
      const count = db.prepare('SELECT COUNT(*) as c FROM port_allocations').get() as { c: number };
      expect(count.c).toBe(1);
    });

    it('should clear stale PIDs but keep allocation for existing projects', () => {
      // Create a real directory
      const existingPath = join(testDir, 'existing-project');
      mkdirSync(existingPath, { recursive: true });

      // Insert allocation with a PID that definitely doesn't exist (use very high number)
      const stalePid = 999999999;
      db.prepare(`
        INSERT INTO port_allocations (project_path, base_port, pid)
        VALUES (?, 4200, ?)
      `).run(existingPath, stalePid);

      const result = cleanupStaleEntries();

      // Should not be removed (project exists)
      expect(result.removed).toHaveLength(0);
      expect(result.remaining).toBe(1);

      // Verify PID was cleared but allocation remains
      const alloc = db.prepare('SELECT * FROM port_allocations WHERE project_path = ?').get(existingPath) as { pid: number | null };
      expect(alloc.pid).toBeNull();
    });

    it('should handle mixed scenarios correctly', () => {
      // Create one real directory
      const existingPath = join(testDir, 'existing-project');
      mkdirSync(existingPath, { recursive: true });

      // Insert multiple allocations
      db.prepare(`
        INSERT INTO port_allocations (project_path, base_port, pid)
        VALUES (?, 4200, NULL)
      `).run(existingPath);

      db.prepare(`
        INSERT INTO port_allocations (project_path, base_port, pid)
        VALUES ('/gone/project1', 4300, NULL)
      `).run();

      db.prepare(`
        INSERT INTO port_allocations (project_path, base_port, pid)
        VALUES ('/gone/project2', 4400, NULL)
      `).run();

      const result = cleanupStaleEntries();

      expect(result.removed).toHaveLength(2);
      expect(result.removed).toContain('/gone/project1');
      expect(result.removed).toContain('/gone/project2');
      expect(result.remaining).toBe(1);
    });
  });
});
