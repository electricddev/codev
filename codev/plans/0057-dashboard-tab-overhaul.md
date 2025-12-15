# Plan 0057: Dashboard Tab Overhaul

## Overview

Rename "Projects" tab to "Dashboard", add two-column layout (Tabs + Files), remove welcome page, add status indicators for builders, and add quick-action buttons.

## Implementation Phases

### Phase 1: Rename Tab and Remove Welcome Page

**File:** `packages/codev/templates/dashboard-split.html`

**Changes:**
1. Change tab name from "Projects" to "Dashboard" in the tabs initialization:
```javascript
// Change:
name: 'Projects',
// To:
name: 'Dashboard',
```

2. Remove `renderWelcome()` function and all welcome-related code (`projects-welcome` class, `showWelcome` variable)
3. Modify `renderProjectsTabContent()` to always show the dashboard layout (never welcome page)
4. Update empty state message when no projectlist.md exists:
   - From welcome page to: "No projects yet. Ask the Architect to create your first project."

### Phase 2: Create Two-Column Layout Structure

**File:** `packages/codev/templates/dashboard-split.html`

**Add CSS:**
```css
.dashboard-header {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  padding: 16px;
}

@media (max-width: 900px) {
  .dashboard-header {
    grid-template-columns: 1fr;
  }
}

.dashboard-column {
  background: var(--bg-tertiary);
  border-radius: 8px;
  padding: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 250px;
}

.dashboard-column h3 {
  font-size: 12px;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 8px;
  flex-shrink: 0;
}

.tabs-list, .files-list {
  flex: 1;
  overflow-y: auto;
}

.dashboard-actions {
  flex-shrink: 0;
  margin-top: 8px;
  display: flex;
  gap: 8px;
}
```

**Modify `renderDashboardTab()` (renamed from `renderProjectsTabContent`):**
```javascript
function renderDashboardTab() {
  const container = document.getElementById('tab-content');
  container.innerHTML = `
    <div class="dashboard-header">
      <div class="dashboard-column">
        <h3>Tabs</h3>
        <div class="tabs-list" id="dashboard-tabs-list"></div>
        <div class="dashboard-actions">
          <button class="btn btn-sm" onclick="createNewShell()">+ New Shell</button>
          <button class="btn btn-sm" onclick="createNewWorktreeShell()">+ New Worktree</button>
        </div>
      </div>
      <div class="dashboard-column">
        <h3>Files</h3>
        <div class="files-list" id="dashboard-files-list"></div>
      </div>
    </div>
    <div class="dashboard-projects" id="dashboard-projects"></div>
  `;

  renderTabsList();
  renderDashboardFiles();
  renderProjectsList();
}
```

### Phase 3: Implement Tabs List with Status Indicators

**File:** `packages/codev/templates/dashboard-split.html`

**Add CSS for status indicators:**
```css
.tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.tab-item:hover {
  background: var(--bg-secondary);
}

.tab-item.active {
  background: var(--accent);
  color: white;
}

.status-indicator {
  width: 10px;
  height: 10px;
  font-size: 10px;
  font-family: monospace;
}

.status-working {
  color: var(--status-active);
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.status-idle {
  color: var(--status-waiting);
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}

.empty-state {
  color: var(--text-muted);
  font-size: 13px;
  padding: 12px;
  text-align: center;
}
```

**Activity Tracking Approach:**

Since ttyd terminals run in iframes and don't emit cross-origin events, we use a polling approach with the backend:

1. **Backend tracking**: The dashboard server already tracks builders. Add a `lastActivity` field to builder state that updates when:
   - Builder is spawned (initial activity)
   - Builder creates a PR (from git hooks or status checks)
   - Or: poll builder tmux panes for recent output

2. **Simpler alternative**: If terminal output tracking proves complex, use a simpler heuristic:
   - "Working" if builder was spawned in last 5 minutes OR status is "spawning"/"implementing"
   - "Idle" if status is "blocked" or "pr-ready" or spawned > 5 minutes ago with no status change

**Add JavaScript:**
```javascript
// Track builder activity (simplified approach)
function getBuilderStatus(tab) {
  if (tab.type !== 'builder') return null;

  // Use builder status from state if available
  const builderState = builders.find(b => b.id === tab.id);
  if (builderState) {
    if (['spawning', 'implementing'].includes(builderState.status)) {
      return 'working';
    }
    if (['blocked', 'pr-ready', 'complete'].includes(builderState.status)) {
      return 'idle';
    }
  }
  return 'working'; // Default to working if unknown
}

function renderTabsList() {
  const container = document.getElementById('dashboard-tabs-list');
  if (!container) return;

  // Filter to terminal tabs only (not Dashboard itself)
  const terminalTabs = tabs.filter(t => t.type !== 'projects' && t.id !== 'projects');

  if (terminalTabs.length === 0) {
    container.innerHTML = '<div class="empty-state">No tabs open</div>';
    return;
  }

  container.innerHTML = terminalTabs.map(tab => {
    const isActive = tab.id === activeTabId;
    const status = getBuilderStatus(tab);
    const statusHtml = status === 'working'
      ? '<span class="status-indicator status-working" title="Working">*</span>'
      : status === 'idle'
      ? '<span class="status-indicator status-idle" title="Idle">_</span>'
      : '';

    return `
      <div class="tab-item ${isActive ? 'active' : ''}" onclick="switchToTab('${tab.id}')">
        ${statusHtml}
        <span class="tab-name">${escapeHtml(tab.name)}</span>
      </div>
    `;
  }).join('');
}
```

### Phase 4: Refactor File Browser for Reuse

**File:** `packages/codev/templates/dashboard-split.html`

The existing file browser code is in `renderFilesTabContent()`. Refactor to make it reusable:

```javascript
// Extract core file browser rendering into reusable function
function renderFileBrowser(containerId, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const { compact = false, onFileClick = null } = options;

  // Reuse existing file tree logic from renderFilesTabContent
  // but render into the specified container
  // If compact, add max-height constraint

  if (compact) {
    container.style.maxHeight = '200px';
    container.style.overflowY = 'auto';
  }

  // ... existing file tree rendering logic ...
  // When file clicked: call onFileClick(path) if provided, else openFileInTab(path)
}

function renderDashboardFiles() {
  renderFileBrowser('dashboard-files-list', {
    compact: true,
    onFileClick: (path) => openFileInTab(path)
  });
}
```

### Phase 5: Add Quick Action Buttons

**File:** `packages/codev/templates/dashboard-split.html`

**Add JavaScript:**
```javascript
async function createNewShell() {
  try {
    const response = await fetch('/api/tabs/shell', { method: 'POST' });
    const data = await response.json();
    if (!data.success) {
      showError(data.error || 'Failed to create shell');
      return;
    }
    await refreshState();
    switchToTab(data.tab.id);
  } catch (err) {
    showError('Network error: ' + err.message);
  }
}

async function createNewWorktreeShell() {
  const branch = prompt('Branch name (leave empty for temp worktree):');
  if (branch === null) return; // User cancelled

  try {
    const response = await fetch('/api/tabs/shell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worktree: true, branch: branch || undefined })
    });
    const data = await response.json();
    if (!data.success) {
      showError(data.error || 'Failed to create worktree shell');
      return;
    }
    await refreshState();
    switchToTab(data.tab.id);
  } catch (err) {
    showError('Network error: ' + err.message);
  }
}

function showError(message) {
  // Use existing error display mechanism if available, else alert
  if (typeof showNotification === 'function') {
    showNotification(message, 'error');
  } else {
    alert(message);
  }
}
```

### Phase 6: Backend Worktree Support

**File:** `packages/codev/src/agent-farm/servers/dashboard-server.ts`

**Modify `/api/tabs/shell` handler:**

```typescript
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

app.post('/api/tabs/shell', async (req, res) => {
  try {
    const { worktree, branch } = req.body || {};

    let cwd = projectDir;

    if (worktree) {
      // Validate branch name if provided
      if (branch && !/^[a-zA-Z0-9_\-\/]+$/.test(branch)) {
        return res.json({
          success: false,
          error: 'Invalid branch name. Use only letters, numbers, underscores, hyphens, and slashes.'
        });
      }

      // Create worktrees directory if needed
      const worktreesDir = path.join(projectDir, '.worktrees');
      if (!fs.existsSync(worktreesDir)) {
        fs.mkdirSync(worktreesDir, { recursive: true });
      }

      // Generate worktree name
      const worktreeName = branch || `temp-${Date.now()}`;
      const worktreePath = path.join(worktreesDir, worktreeName);

      // Check if worktree already exists
      if (fs.existsSync(worktreePath)) {
        return res.json({
          success: false,
          error: `Worktree '${worktreeName}' already exists at ${worktreePath}`
        });
      }

      // Create worktree
      try {
        const gitCmd = branch
          ? `git worktree add "${worktreePath}" -b "${branch}"`
          : `git worktree add "${worktreePath}" --detach`;
        execSync(gitCmd, { cwd: projectDir, stdio: 'pipe' });
      } catch (gitError: any) {
        const errorMsg = gitError.stderr?.toString() || gitError.message;
        return res.json({
          success: false,
          error: `Git worktree creation failed: ${errorMsg}`
        });
      }

      cwd = worktreePath;
    }

    // Create utility shell in the specified directory
    const util = await createUtilityTerminal({ cwd });

    res.json({
      success: true,
      tab: {
        id: util.id,
        name: util.name,
        type: 'utility',
        port: util.port
      }
    });
  } catch (err: any) {
    res.json({
      success: false,
      error: err.message || 'Unknown error creating shell'
    });
  }
});
```

### Phase 7: Update Empty States

**File:** `packages/codev/templates/dashboard-split.html`

**Modify project list rendering:**
```javascript
function renderProjectsList() {
  const container = document.getElementById('dashboard-projects');
  if (!container) return;

  // Check if projectlist.md was found/loaded
  if (projectsLoadError === 'not_found') {
    container.innerHTML = `
      <div class="empty-state" style="padding: 24px;">
        No projects yet. Ask the Architect to create your first project.
      </div>
    `;
    return;
  }

  if (!projectsData || projectsData.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 24px;">
        No projects found. Add projects to <code>codev/projectlist.md</code>.
      </div>
    `;
    return;
  }

  // Render existing project list/table view (unchanged)
  renderExistingProjectView(container, projectsData);
}
```

### Phase 8: Wire Up Refresh and Testing

**File:** `packages/codev/templates/dashboard-split.html`

**Add refresh handling:**
```javascript
// Re-render tabs list when state changes
function onStateChanged() {
  if (activeTabId === 'projects') { // or 'dashboard' after rename
    renderTabsList();
  }
}

// Hook into existing state refresh mechanism
// (the dashboard already polls for state updates)
```

**Manual Testing Checklist:**
1. Dashboard tab shows "Dashboard" not "Projects"
2. Two-column layout displays (Tabs on left, Files on right)
3. At <900px viewport, columns stack vertically
4. Clicking tab in list switches to that tab
5. Builder status indicators show (working vs idle based on status)
6. "New Shell" creates a utility shell successfully
7. "New Worktree Shell" prompts for branch, creates worktree shell
8. Error cases: invalid branch name shows error, existing worktree shows error
9. File browser shows project files in compact mode
10. Clicking file opens in new tab
11. Project list appears below columns (existing view, unchanged)
12. Empty state when no projectlist.md: "Ask the Architect"
13. Empty state when no tabs: "No tabs open"

## File Summary

| File | Action |
|------|--------|
| `packages/codev/templates/dashboard-split.html` | Modify (major changes) |
| `packages/codev/src/agent-farm/servers/dashboard-server.ts` | Modify (worktree support) |

## Risks and Mitigations

1. **Terminal activity detection complexity**
   - Risk: ttyd doesn't emit cross-origin events
   - Mitigation: Use builder status (spawning/implementing vs blocked/complete) as proxy for activity instead of real terminal output

2. **File browser refactoring**
   - Risk: Existing code may be tightly coupled to full-tab rendering
   - Mitigation: If refactoring is complex, inline a simplified version for dashboard

3. **Git worktree errors**
   - Risk: Various git failures (dirty state, existing branch, etc.)
   - Mitigation: Comprehensive error handling in Phase 6 with user-friendly messages

4. **Large file trees**
   - Risk: Performance with many files
   - Mitigation: Height constraint and lazy loading (defer if needed)

## Verification

1. Refresh dashboard - should show "Dashboard" tab
2. Two columns visible at full width, stacked on narrow
3. Tab list shows open tabs with working/idle indicators for builders
4. New Shell/New Worktree buttons work
5. File browser shows tree, clicking opens files
6. Project list unchanged from current behavior
7. No welcome page ever shown
