# Plan: Secure Remote Access

## Metadata
- **Spec**: codev/specs/0062-secure-remote-access.md
- **Status**: approved
- **Created**: 2025-12-25

## Overview

Implement secure remote access to Agent Farm via SSH tunneling, enabled by a reverse proxy that consolidates all ttyd instances behind a single port.

**Components**:
1. Reverse proxy in dashboard server
2. Dashboard UI updates (iframe URLs)
3. `af tunnel` CLI command

---

## Implementation Phases

### Phase 1: Reverse Proxy

**Goal**: Route `/terminal/:id` to correct ttyd instance with WebSocket support.

**Files to modify**:
- `packages/codev/src/agent-farm/servers/dashboard-server.ts` - Add proxy routes and WebSocket handling

**New dependencies**:
```bash
cd packages/codev && npm install http-proxy
```

**Why http-proxy instead of http-proxy-middleware**: The dashboard uses raw `http.createServer()`, not Express. The `http-proxy` package gives direct control over WebSocket upgrades.

**Implementation**:

1. Add import and create proxy instance:
```typescript
import httpProxy from 'http-proxy';

const terminalProxy = httpProxy.createProxyServer({ ws: true });

terminalProxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err.message);
  if (res && 'writeHead' in res && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Terminal unavailable' }));
  }
});
```

2. Add port lookup function (uses existing state API):
```typescript
function getPortForTerminal(id: string): number | null {
  const state = loadState();

  if (id === 'architect') {
    return state.architect?.port || null;
  }

  // Builder format: builder-{id} (e.g., builder-0055, builder-worktree-abc)
  if (id.startsWith('builder-')) {
    const builderId = id.replace('builder-', '');
    const builder = state.builders.find(b => b.id === builderId);
    return builder?.port || null;
  }

  // Util format: util-{id}
  if (id.startsWith('util-')) {
    const utilId = id.replace('util-', '');
    const util = state.utils.find(u => u.id === utilId);
    return util?.port || null;
  }

  return null;
}
```

3. Add HTTP route for `/terminal/:id`:
```typescript
// In the request handler, before the 404 fallback:
const terminalMatch = url.pathname.match(/^\/terminal\/([^/]+)(\/.*)?$/);
if (terminalMatch) {
  const terminalId = terminalMatch[1];
  const port = getPortForTerminal(terminalId);

  if (!port) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Terminal not found: ${terminalId}` }));
    return;
  }

  // Rewrite path to strip /terminal/:id prefix
  req.url = terminalMatch[2] || '/';
  terminalProxy.web(req, res, { target: `http://localhost:${port}` });
  return;
}
```

4. Add WebSocket upgrade handler:
```typescript
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', `http://localhost:${port}`);
  const terminalMatch = url.pathname.match(/^\/terminal\/([^/]+)(\/.*)?$/);

  if (terminalMatch) {
    const terminalId = terminalMatch[1];
    const terminalPort = getPortForTerminal(terminalId);

    if (terminalPort) {
      req.url = terminalMatch[2] || '/';
      terminalProxy.ws(req, socket, head, { target: `http://localhost:${terminalPort}` });
    } else {
      socket.destroy();
    }
  }
});
```

**Tests**:
- Unit test: `getPortForTerminal()` returns correct ports for architect/builder/util
- Unit test: `getPortForTerminal()` returns null for unknown IDs
- Integration test: `GET /terminal/architect` returns 200 when architect running
- Integration test: `GET /terminal/unknown` returns 404
- Integration test: WebSocket upgrade to `/terminal/architect` succeeds

---

### Phase 2: Dashboard UI Updates

**Goal**: Change terminal iframes from direct port URLs to proxied URLs.

**Files to modify**:
- `packages/codev/skeleton/templates/dashboard-split.html` - Update iframe src generation
- `codev-skeleton/templates/dashboard-split.html` - Same (source template)

**Current pattern** (around line 400+ in the template JS):
```javascript
// When creating terminal tabs, the iframe src is set like:
iframe.src = `http://localhost:${tab.port}`;
```

**New pattern**:
```javascript
// For architect:
iframe.src = `/terminal/architect`;

// For builders:
iframe.src = `/terminal/builder-${tab.id}`;

// For utils:
iframe.src = `/terminal/util-${tab.id}`;
```

**Implementation steps**:

1. Find the `createTerminalTab()` or equivalent function in the template
2. Update iframe src based on tab type:
```javascript
function getTerminalUrl(tab) {
  if (tab.type === 'architect') return '/terminal/architect';
  if (tab.type === 'builder') return `/terminal/builder-${tab.id}`;
  if (tab.type === 'util' || tab.type === 'shell') return `/terminal/util-${tab.id}`;
  // Fallback for backward compatibility during transition
  return `http://localhost:${tab.port}`;
}
```

3. Add error handling for iframe load failures:
```javascript
iframe.onerror = () => {
  // Show retry UI
  iframe.parentElement.innerHTML = `
    <div class="terminal-error">
      <p>Terminal unavailable</p>
      <button onclick="retryTerminal('${tab.id}')">Retry</button>
    </div>
  `;
};
```

**Tests**:
- Manual: Open dashboard, verify architect iframe uses `/terminal/architect`
- Manual: Spawn builder, verify iframe uses `/terminal/builder-{id}`
- Manual: Open shell, verify iframe uses `/terminal/util-{id}`
- Manual: Network tab shows proxied requests (no direct port access)

---

### Phase 3: `af tunnel` Command

**Goal**: Output SSH command for remote access.

**Files to create**:
- `packages/codev/src/agent-farm/commands/tunnel.ts`

**Files to modify**:
- `packages/codev/src/agent-farm/index.ts` - Register tunnel command

**Implementation**:

```typescript
// packages/codev/src/agent-farm/commands/tunnel.ts

import { networkInterfaces, userInfo, platform } from 'os';
import { loadState } from '../state.js';

export function tunnelCommand(): void {
  const state = loadState();

  // Check if Agent Farm is running (architect exists)
  if (!state.architect) {
    console.error('Agent Farm is not running. Start with: af start');
    process.exit(1);
  }

  // Windows-specific guidance
  if (platform() === 'win32') {
    console.log('Note: Windows requires OpenSSH Server to be enabled.');
    console.log('See: https://docs.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse');
    console.log('');
    console.log('Alternatively, use WSL2 or Tailscale for remote access.');
    console.log('');
  }

  const ips = getLocalIPs();
  const user = userInfo().username;
  const dashboardPort = state.architect.port - 1; // Architect is port + 1

  console.log('To access Agent Farm remotely, run this on your other device:\n');

  if (ips.length === 0) {
    console.log(`  ssh -L ${dashboardPort}:localhost:${dashboardPort} ${user}@<your-ip>`);
  } else {
    for (const ip of ips) {
      console.log(`  ssh -L ${dashboardPort}:localhost:${dashboardPort} ${user}@${ip}`);
    }
  }

  console.log(`\nThen open: http://localhost:${dashboardPort}`);
  console.log(`\nTip: Add to ~/.ssh/config for easy access:`);
  console.log(`  Host agent-farm`);
  console.log(`    HostName ${ips[0] || '<your-ip>'}`);
  console.log(`    User ${user}`);
  console.log(`    LocalForward ${dashboardPort} localhost:${dashboardPort}`);
}

function getLocalIPs(): string[] {
  const interfaces = networkInterfaces();
  const ips: string[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      // Skip loopback, internal, and IPv6
      if (addr.internal) continue;
      if (addr.family !== 'IPv4') continue;
      ips.push(addr.address);
    }
  }

  return ips;
}
```

**Register in CLI** (`packages/codev/src/agent-farm/index.ts`):
```typescript
import { tunnelCommand } from './commands/tunnel.js';

// Add to command definitions:
program
  .command('tunnel')
  .description('Show SSH command for remote access')
  .action(tunnelCommand);
```

**Tests**:
- Unit test: `getLocalIPs()` filters correctly (mock `networkInterfaces()`)
- Integration test: `af tunnel` when running → outputs SSH command
- Integration test: `af tunnel` when not running → error message
- Manual test: Windows platform detection (if available)

---

### Phase 4: Documentation

**Files to modify**:
- `CLAUDE.md` - Add to "Architect-Builder Pattern" section
- `AGENTS.md` - Same content (keep in sync)
- `README.md` - Add brief mention in features

**Content to add** (after "CLI Commands" section):

```markdown
### Remote Access

Access Agent Farm from another device (iPad, laptop, etc.) via SSH tunnel:

1. Start Agent Farm: `af start`
2. Get SSH command: `af tunnel`
3. Run the SSH command on your remote device
4. Open http://localhost:4200 in your browser

The dashboard and all terminals work identically via the tunnel. SSH handles authentication and encryption.

**Note**: Requires SSH server on the dev machine. On Windows, enable OpenSSH Server or use WSL2.
```

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `packages/codev/package.json` | Modify | Add `http-proxy` dependency |
| `packages/codev/src/agent-farm/servers/dashboard-server.ts` | Modify | Add proxy routes and WebSocket handling |
| `packages/codev/src/agent-farm/commands/tunnel.ts` | Create | Tunnel command implementation |
| `packages/codev/src/agent-farm/index.ts` | Modify | Register tunnel command |
| `packages/codev/skeleton/templates/dashboard-split.html` | Modify | Use proxied terminal URLs |
| `codev-skeleton/templates/dashboard-split.html` | Modify | Use proxied terminal URLs (source) |
| `CLAUDE.md` | Modify | Document remote access |
| `AGENTS.md` | Modify | Document remote access (sync) |

---

## Testing Strategy

### Unit Tests

1. **Port lookup** (`packages/codev/src/agent-farm/__tests__/tunnel.test.ts`):
   - `getPortForTerminal('architect')` → architect port
   - `getPortForTerminal('builder-0055')` → builder port
   - `getPortForTerminal('util-abc')` → util port
   - `getPortForTerminal('unknown')` → null

2. **IP detection**:
   - Multiple interfaces → all IPs returned
   - No interfaces → empty array
   - Loopback excluded
   - IPv6 excluded

### Integration Tests

3. **Proxy routing** (can use mock ttyd or real instances):
   - `GET /terminal/architect` when running → 200
   - `GET /terminal/unknown` → 404
   - `GET /terminal/architect` when ttyd down → 502

4. **WebSocket upgrade**:
   - Connect to `/terminal/architect` → successful upgrade
   - Connect to `/terminal/unknown` → connection closed

5. **af tunnel command**:
   - When running → outputs SSH command with correct port
   - When not running → error message

### Manual Tests

6. **End-to-end SSH tunnel**:
   - Start Agent Farm on machine A
   - Run `af tunnel`, copy SSH command
   - On machine B, run SSH command
   - Open `http://localhost:4200` on machine B
   - Interact with terminals (type, scroll, copy)
   - Verify WebSocket stays connected

7. **Dashboard error states**:
   - Stop a builder's ttyd process
   - Verify iframe shows error/retry UI

---

## Acceptance Criteria Checklist

From spec:

**`af tunnel` Command**:
- [ ] Outputs complete SSH command with correct port
- [ ] Detects and displays all non-loopback IPv4 addresses
- [ ] Shows current username in SSH command
- [ ] Works when no builders are active (architect only)
- [ ] Shows helpful error when Agent Farm not running
- [ ] On Windows, shows SSH server setup instructions

**Reverse Proxy**:
- [ ] Routes `/terminal/architect` to architect ttyd port
- [ ] Routes `/terminal/builder-{id}` to correct builder ttyd port
- [ ] Routes `/terminal/util-{id}` to correct utility ttyd port
- [ ] Proxies WebSocket connections bidirectionally
- [ ] Returns 404 for unknown terminal IDs
- [ ] Returns 502 when target ttyd is unavailable

**Dashboard UI**:
- [ ] All terminal iframes use `/terminal/:id` URLs
- [ ] Terminals work identically via local access and SSH tunnel
- [ ] Error states displayed appropriately (optional retry button)

**Security**:
- [ ] Dashboard still rejects non-localhost Host headers
- [ ] Proxy only routes to local ttyd instances (no SSRF)
- [ ] No new network listeners (only existing port 4200)

---

## Dependencies

```json
{
  "http-proxy": "^1.18.1"
}
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| WebSocket proxy issues | Medium | High | Use proven `http-proxy` library |
| Port lookup race conditions | Low | Low | SQLite provides atomic reads |
| Breaking existing local access | Low | High | Proxied URLs work for local too |
| ttyd version incompatibility | Low | Medium | Document minimum ttyd version |

---

## Estimated Complexity

- **Phase 1 (Proxy)**: Medium - WebSocket upgrade handling, but using proven library
- **Phase 2 (UI)**: Low - Simple iframe src changes + error handling
- **Phase 3 (Tunnel)**: Low - String formatting and OS APIs
- **Phase 4 (Docs)**: Low - Documentation only

**Total**: ~200-300 lines of new code
