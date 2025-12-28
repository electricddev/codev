/**
 * Tests for start command utilities
 */

import { describe, it, expect } from 'vitest';
import { parseRemote } from '../commands/start.js';

describe('parseRemote', () => {
  it('should parse user@host format', () => {
    const result = parseRemote('alice@example.com');

    expect(result.user).toBe('alice');
    expect(result.host).toBe('example.com');
    expect(result.remotePath).toBeUndefined();
  });

  it('should parse user@host:/path format', () => {
    const result = parseRemote('bob@192.168.1.100:/home/bob/project');

    expect(result.user).toBe('bob');
    expect(result.host).toBe('192.168.1.100');
    expect(result.remotePath).toBe('/home/bob/project');
  });

  it('should parse relative path', () => {
    const result = parseRemote('tidybot@robot:robot-project');

    expect(result.user).toBe('tidybot');
    expect(result.host).toBe('robot');
    expect(result.remotePath).toBe('robot-project');
  });

  it('should parse path with tilde', () => {
    const result = parseRemote('user@server:~/projects/myapp');

    expect(result.user).toBe('user');
    expect(result.host).toBe('server');
    expect(result.remotePath).toBe('~/projects/myapp');
  });

  it('should throw for invalid format: missing @', () => {
    expect(() => parseRemote('just-a-host')).toThrow('Invalid remote format');
  });

  it('should throw for empty string', () => {
    expect(() => parseRemote('')).toThrow('Invalid remote format');
  });

  it('should throw for malformed: @host only', () => {
    expect(() => parseRemote('@host')).toThrow('Invalid remote format');
  });

  it('should throw for malformed: user@ only', () => {
    expect(() => parseRemote('user@')).toThrow('Invalid remote format');
  });

  it('should handle complex hostnames', () => {
    const result = parseRemote('deploy@my-server.internal.company.com');

    expect(result.user).toBe('deploy');
    expect(result.host).toBe('my-server.internal.company.com');
    expect(result.remotePath).toBeUndefined();
  });

  it('should handle complex paths', () => {
    const result = parseRemote('admin@server:/var/www/app-name_v2/current');

    expect(result.user).toBe('admin');
    expect(result.host).toBe('server');
    expect(result.remotePath).toBe('/var/www/app-name_v2/current');
  });
});
