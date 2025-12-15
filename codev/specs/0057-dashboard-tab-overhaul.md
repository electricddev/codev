# Spec 0057: Dashboard Tab Overhaul

## Summary

Rename the "Projects" tab to "Dashboard", redesign it with a two-column top section (Tabs + Files) and single-column project view below, remove the welcome page, and add quick-action buttons for creating shells and worktrees.

## Problem Statement

The current "Projects" tab has several UX issues:

1. **Name mismatch**: "Projects" suggests just project tracking, but it should be the central command hub
2. **Welcome page obstruction**: New users see a welcome page instead of useful content - there's no project list to show yet, but there's plenty of useful UI to display
3. **Missing context**: Open tabs and files aren't visible from the projects view
4. **No quick actions**: Users must use CLI commands to spawn shells/worktrees

## Proposed Solution

### 1. Rename to "Dashboard"

The first tab becomes "Dashboard" instead of "Projects" - reflecting its role as the central control panel.

### 2. Two-Column Top Section

```
+--------------------+--------------------+
|       TABS         |       FILES        |
| [Builder 0047]     | [+] [Expand All]   |
| [Utility: debug]   | codev/             |
| [Spec 0048]        |   specs/           |
|                    |     0057-...       |
| [+ New Shell]      |   plans/           |
| [+ New Worktree]   |                    |
+--------------------+--------------------+
```

**Left Column: Tabs**
- List of currently open tabs (builders, utilities, files)
- Click to switch to that tab
- Shows tab type icon/indicator
- **Status indicators for builders:**
  - Spinning circle: actively working (output changing)
  - Flashing cursor: idle/waiting for input (no output change in last 60 seconds)
- Action buttons at bottom:
  - `+ New Shell` - Opens a new utility shell
  - `+ New Worktree Shell` - Opens a shell in a new git worktree

**Right Column: Files**
- Compact file browser (reuse from spec 0055)
- Expand/Collapse All buttons in header
- Click file to open in new tab

### 3. Single-Column Project View

Below the two columns, the **existing project table/list view** remains unchanged but takes full width. No kanban layout - retain current implementation.

### 4. Remove Welcome Page

Instead of showing a welcome page when there's no projectlist.md:
- Show the same Dashboard layout
- Tabs section shows any open tabs
- Files section shows the file browser
- Projects section shows: "No projects yet. Ask the Architect to create your first project."

## Requirements

### Functional

1. **Tab renamed**: "Projects" tab becomes "Dashboard" tab
2. **Two-column header**:
   - Left: list of open tabs with click-to-switch
   - Right: file browser (compact mode)
3. **Tab status indicators**:
   - Builders show spinning indicator when actively working
   - Builders show flashing cursor when idle (no output for 60+ seconds)
4. **Quick action buttons**:
   - "New Shell" - calls existing `/api/tabs/shell` endpoint
   - "New Worktree Shell" - calls `/api/tabs/shell` with `worktree: true` parameter
5. **Full-width projects below**: Existing project list view unchanged, spans full width
6. **No welcome page**: Always show the dashboard layout; if no projects, show helpful message in projects section

### Non-Functional

1. **Responsive**: At viewport width < 900px, columns stack vertically (Tabs on top, Files below)
2. **Performance**: Tab list and file browser should be lightweight; file browser limited to 200px height with scroll
3. **Consistency**: Reuse existing file browser component from spec 0055

## Empty States

### Tabs Column (no open tabs)
Show: "No tabs open" with the action buttons still visible below.

### Projects Section (no projectlist.md)
Show: "No projects yet. Ask the Architect to create your first project."

### Projects Section (empty or malformed projectlist.md)
Show: "No projects found. Add projects to `codev/projectlist.md`."

## Tab Status Detection

To determine if a builder is actively working or idle:

1. **Track last output timestamp** per terminal tab
2. **Working state**: Output received within last 60 seconds - show spinning indicator
3. **Idle state**: No output for 60+ seconds - show flashing cursor indicator
4. **Update frequency**: Check every 5 seconds or on output event

Implementation approach:
- Dashboard already receives terminal output events via the iframe
- Add a `lastActivity` timestamp to tab state
- Poll or use message events to update activity status

## API Endpoints

### Existing Endpoint: `POST /api/tabs/shell`

Currently creates a utility shell. Extend to support worktree parameter:

**Request:**
```json
{
  "worktree": true,      // Optional: create shell in new worktree
  "branch": "my-branch"  // Optional: branch name for worktree (if omitted, creates temp worktree)
}
```

**Response (success):**
```json
{
  "success": true,
  "tab": {
    "id": "util-abc123",
    "name": "Utility",
    "type": "utility",
    "port": 4215
  }
}
```

**Response (error):**
```json
{
  "success": false,
  "error": "Worktree creation failed: branch 'my-branch' already exists"
}
```

### Error Handling

The dashboard should handle these error cases:

1. **Shell creation fails**: Show error toast/message, don't create broken tab
2. **Worktree already exists**: Show error message with guidance
3. **Git errors**: Display git error message to user
4. **Network errors**: Show "Failed to connect" message

## Acceptance Criteria

1. First tab is labeled "Dashboard" not "Projects"
2. Dashboard shows two columns at top (Tabs, Files)
3. Clicking a tab in the Tabs column switches to that tab
4. Clicking a file in Files column opens it in a new tab (or switches to existing tab if already open)
5. Builder tabs show spinning indicator when working, flashing cursor when idle
6. "New Shell" button creates a new utility terminal
7. "New Worktree Shell" button prompts for branch name and creates shell in worktree
8. Existing project list view appears below the two columns (not kanban)
9. No welcome page - dashboard is always shown
10. If no projectlist.md exists, projects section shows "Ask the Architect" guidance
11. Errors from shell/worktree creation are displayed to user
12. At narrow viewports (<900px), columns stack vertically

## Wireframe

```
+------------------------------------------------------------------+
| AF: project-name                              [Refresh] [Stop]   |
+------------------------------------------------------------------+
| [Dashboard] [Builder 0047] [Spec 0048.md] [x]                    |
+------------------------------------------------------------------+
|                                                                   |
| +-- TABS ----------------------+  +-- FILES -------------------+ |
| | [*] Builder 0047             |  | [+] [Expand] [Collapse]    | |
| | [ ] Utility: debug           |  | codev/                     | |
| | [ ] Spec 0048.md             |  |   specs/                   | |
| |                              |  |     0057-dashboard-...     | |
| | [+ New Shell]                |  |   plans/                   | |
| | [+ New Worktree Shell]       |  | src/                       | |
| +------------------------------+  +----------------------------+ |
|                                                                   |
| +-- PROJECTS -------------------------------------------------- + |
| | [Existing project list/table view - unchanged]                | |
| +--------------------------------------------------------------+ |
+------------------------------------------------------------------+

Legend: [*] = spinning (working), [_] = flashing cursor (idle)
```

## Files to Modify

### Frontend
- `packages/codev/templates/dashboard-split.html` - Main implementation (CSS grid, tab list, file browser integration, action buttons, status indicators)

### Backend
- `packages/codev/src/agent-farm/servers/dashboard-server.ts` - Extend `/api/tabs/shell` endpoint to support worktree parameter

## Technical Notes

### Tab List Data

The tab list is already maintained in JavaScript state. Render it as a clickable list with status indicators:

```javascript
function renderTabsList() {
  const tabsList = document.getElementById('tabs-list');
  if (tabs.length === 0) {
    tabsList.innerHTML = '<div class="empty-state">No tabs open</div>';
    return;
  }
  tabsList.innerHTML = tabs.map(tab => `
    <div class="tab-item ${tab.id === activeTabId ? 'active' : ''}"
         onclick="switchToTab('${tab.id}')">
      ${getStatusIndicator(tab)}
      <span class="tab-name">${escapeHtml(tab.name)}</span>
    </div>
  `).join('');
}

function getStatusIndicator(tab) {
  if (tab.type !== 'builder') return '';
  const isIdle = (Date.now() - tab.lastActivity) > 60000;
  if (isIdle) {
    return '<span class="status-idle" title="Waiting for input">_</span>';
  }
  return '<span class="status-working" title="Working">*</span>';
}
```

### File Browser Integration

Reuse the file browser from spec 0055 but in a compact inline mode:

```javascript
// Render file browser in the right column with height constraint
renderFileBrowser('#files-column', {
  compact: true,
  maxHeight: '200px',
  onFileClick: (path) => openFileInTab(path)
});
```

### New Shell Actions

```javascript
async function createNewShell() {
  try {
    const response = await fetch('/api/tabs/shell', { method: 'POST' });
    const data = await response.json();
    if (!data.success) {
      showError(data.error || 'Failed to create shell');
      return;
    }
    // Tab will be added via state refresh
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
    switchToTab(data.tab.id);
  } catch (err) {
    showError('Network error: ' + err.message);
  }
}
```

### Backend Worktree Support

In `dashboard-server.ts`, extend the shell handler:

```typescript
app.post('/api/tabs/shell', async (req, res) => {
  const { worktree, branch } = req.body || {};

  try {
    if (worktree) {
      // Create worktree and shell in it
      const worktreePath = await createWorktree(branch);
      const tab = await createUtilityShell({ cwd: worktreePath });
      res.json({ success: true, tab });
    } else {
      // Existing behavior
      const tab = await createUtilityShell();
      res.json({ success: true, tab });
    }
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});
```

## Testing

### Frontend Tests
- Tab list renders correctly with 0, 1, and multiple tabs
- Builder tabs show correct status indicator (working vs idle)
- Clicking tab in list switches active tab
- New Shell button calls API and handles success/error
- New Worktree Shell button prompts for branch and calls API
- File browser renders in compact mode
- Clicking file opens in new tab (or switches to existing)
- Responsive layout stacks at narrow viewport
- Empty states display correctly

### Backend Tests
- `POST /api/tabs/shell` creates regular shell
- `POST /api/tabs/shell` with `worktree: true` creates worktree shell
- `POST /api/tabs/shell` with `worktree: true, branch: "name"` creates named worktree
- Error responses for git failures
- Error responses for existing worktree/branch

## Out of Scope

- Kanban view for projects (retain existing list/table view)
- Adding drag-and-drop for tabs
- Tab reordering
- Persistent tab state across page refreshes (already works)
- Branch selection dropdown (simple prompt is sufficient for v1)
