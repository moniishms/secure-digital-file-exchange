/**
 * SecureVault - Activity & Audit Trail Module
 * 
 * Manages the timeline and table rendering for security logs,
 * action filtering, and audit export triggers.
 */

const ActivityManager = {
  activeFilter: 'all',

  init() {
    this.bindEvents();
  },

  bindEvents() {
    // Action filter pills
    document.querySelectorAll('.activity-filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.activity-filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.activeFilter = pill.getAttribute('data-filter') || 'all';
        this.render();
      });
    });

    // Export buttons
    const exportCsvBtn = document.getElementById('exportAuditCsvBtn');
    const exportJsonBtn = document.getElementById('exportAuditJsonBtn');

    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', async () => {
        await AuditService.exportLogs('csv');
        Toast.show('Export Generated', 'Audit log downloaded as CSV.', 'info');
      });
    }

    if (exportJsonBtn) {
      exportJsonBtn.addEventListener('click', async () => {
        await AuditService.exportLogs('json');
        Toast.show('Export Generated', 'Audit log downloaded as JSON.', 'info');
      });
    }
  },

  async render() {
    const tableBody = document.getElementById('activityTableBody');
    const emptyState = document.getElementById('activityEmptyState');
    if (!tableBody) return;

    let logs = await AuditService.getAuditLogs();

    // Filter logs if needed
    if (this.activeFilter !== 'all') {
      logs = logs.filter(item => {
        const action = item.action.toLowerCase();
        if (this.activeFilter === 'upload') return action.includes('upload');
        if (this.activeFilter === 'download') return action.includes('download');
        if (this.activeFilter === 'share') return action.includes('share');
        if (this.activeFilter === 'delete') return action.includes('delete');
        if (this.activeFilter === 'denied') return action.includes('denied');
        return true;
      });
    }

    if (!logs || logs.length === 0) {
      tableBody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    tableBody.innerHTML = logs.map(log => {
      let statusBadge = '';
      if (log.status === 'Success') {
        statusBadge = `<span class="badge badge-encrypted"><span class="badge-dot"></span> Success</span>`;
      } else if (log.status === 'Denied') {
        statusBadge = `<span class="badge badge-confidential"><span class="badge-dot"></span> Denied</span>`;
      } else {
        statusBadge = `<span class="badge badge-restricted"><span class="badge-dot"></span> ${log.status}</span>`;
      }

      let iconType = 'upload';
      const actLower = log.action.toLowerCase();
      if (actLower.includes('download')) iconType = 'download';
      else if (actLower.includes('share')) iconType = 'share';
      else if (actLower.includes('delete')) iconType = 'delete';
      else if (actLower.includes('denied')) iconType = 'denied';

      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="activity-icon-node ${iconType}" style="width: 28px; height: 28px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  ${this.getSvgPathForAction(iconType)}
                </svg>
              </span>
              <strong style="font-size: 0.86rem; color: var(--text-main);">${log.action}</strong>
            </div>
          </td>
          <td>
            <div style="font-weight: 500;">${log.fileName}</div>
            <div style="font-size: 0.74rem; color: var(--text-muted);">${log.details || ''}</div>
          </td>
          <td>
            <span style="font-size: 0.84rem; color: var(--text-main);">${log.user}</span>
          </td>
          <td style="font-size: 0.82rem; color: var(--text-muted);">${log.timestamp}</td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }).join('');
  },

  getSvgPathForAction(type) {
    if (type === 'download') {
      return '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>';
    }
    if (type === 'share') {
      return '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>';
    }
    if (type === 'delete') {
      return '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>';
    }
    if (type === 'denied') {
      return '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>';
    }
    // Upload default
    return '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>';
  }
};

window.ActivityManager = ActivityManager;
