/**
 * SecureVault - Audit & Activity Service (Security Trail & Logging)
 * 
 * Provides an audit trail of file transactions, access events, and security alerts.
 * 
 * Backend Architecture Context:
 * - Person 3 implemented CloudWatch audit logging in a separate Express app for log group /secure-file-sharing/audit.
 * - Person 2's API Gateway does not expose /audit or /audit-logs routes (returns 404).
 * - This service captures client-side events, maintains persistent compliance history,
 *   and provides CSV/JSON exports.
 */

const AuditService = {
  // Initial realistic sample activities
  _defaultLogs: [
    {
      id: "log_101",
      action: "Access Denied",
      fileName: "financial_forecast_q4.pdf",
      user: "Unknown (IP: 198.51.100.44)",
      timestamp: "2026-10-18 09:12",
      status: "Denied",
      details: "Simulated S3 Bucket Policy blocked unauthenticated public GET attempt"
    },
    {
      id: "log_102",
      action: "Share Created",
      fileName: "project_proposal.docx",
      user: "Alex Mercer",
      timestamp: "2026-10-18 10:15",
      status: "Success",
      details: "Generated simulated presigned URL (TTL: 5m)"
    },
    {
      id: "log_103",
      action: "Download",
      fileName: "research_report.pdf",
      user: "Alex Mercer",
      timestamp: "2026-10-18 16:40",
      status: "Success",
      details: "Authenticated file download via presigned token"
    },
    {
      id: "log_104",
      action: "Upload",
      fileName: "research_report.pdf",
      user: "Alex Mercer",
      timestamp: "2026-10-18 14:32",
      status: "Success",
      details: "Uploaded with Confidential classification & KMS encryption"
    },
    {
      id: "log_105",
      action: "Delete",
      fileName: "old_draft_notes.txt",
      user: "Alex Mercer",
      timestamp: "2026-10-17 13:05",
      status: "Success",
      details: "File removed permanently from S3 bucket"
    },
    {
      id: "log_106",
      action: "Access Denied",
      fileName: "confidential_keys.pem",
      user: "Ext-Client (IP: 203.0.113.19)",
      timestamp: "2026-10-16 22:18",
      status: "Denied",
      details: "JWT authorizer blocked request with missing bearer token"
    }
  ],

  /**
   * Retrieves all audit log entries
   * @returns {Promise<Array>}
   */
  async getAuditLogs() {
    const storageKey = CONFIG.isMockMode() ? 'sv_mock_logs' : 'sv_live_logs';
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error("Error reading stored logs", e);
      }
    }

    if (CONFIG.isMockMode()) {
      localStorage.setItem('sv_mock_logs', JSON.stringify(this._defaultLogs));
      return [...this._defaultLogs];
    }

    // In Live Mode, seed with initial session notice if empty
    const initialLiveLogs = [
      {
        id: "log_live_01",
        action: "System Init",
        fileName: "SecureFileExchangeAPI",
        user: "System",
        timestamp: FileService.getCurrentTimestamp ? FileService.getCurrentTimestamp() : new Date().toISOString().replace('T', ' ').slice(0, 16),
        status: "Success",
        details: "Live AWS Backend active (ap-south-1). CloudWatch audit group: /secure-file-sharing/audit"
      }
    ];
    localStorage.setItem('sv_live_logs', JSON.stringify(initialLiveLogs));
    return initialLiveLogs;
  },

  /**
   * Records a new activity event
   * @param {string} action 'Upload' | 'Download' | 'Share Created' | 'Share Revoked' | 'Delete' | 'Access Denied' | 'Login' | 'Logout'
   * @param {string} fileName 
   * @param {string} details 
   * @param {string} status 'Success' | 'Denied' | 'Warning'
   */
  async logActivity(action, fileName, details = '', status = 'Success') {
    const user = window.AuthService ? AuthService.getCurrentUser().name : "User";
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const newLog = {
      id: "log_" + Math.random().toString(36).substring(2, 9),
      action: action,
      fileName: fileName || "System Resource",
      user: user,
      timestamp: timestamp,
      status: status,
      details: details || "Action executed via SecureVault client"
    };

    const storageKey = CONFIG.isMockMode() ? 'sv_mock_logs' : 'sv_live_logs';
    const logs = await this.getAuditLogs();
    const updated = [newLog, ...logs];
    localStorage.setItem(storageKey, JSON.stringify(updated));
    return newLog;
  },

  /**
   * Exports audit log records as a downloadable JSON or CSV file
   * @param {string} format 'json' | 'csv'
   */
  async exportLogs(format = 'json') {
    const logs = await this.getAuditLogs();
    let content = '';
    let mimeType = '';
    let filename = `securevault_audit_export_${Date.now()}`;

    if (format === 'csv') {
      const headers = ['ID', 'Action', 'File Name', 'User', 'Timestamp', 'Status', 'Details'];
      const rows = logs.map(l => [
        `"${l.id}"`,
        `"${l.action}"`,
        `"${l.fileName}"`,
        `"${l.user}"`,
        `"${l.timestamp}"`,
        `"${l.status}"`,
        `"${l.details.replace(/"/g, '""')}"`
      ]);
      content = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      mimeType = 'text/csv;charset=utf-8;';
      filename += '.csv';
    } else {
      content = JSON.stringify(logs, null, 2);
      mimeType = 'application/json;charset=utf-8;';
      filename += '.json';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Resets audit logs to default sample state
   */
  resetToDefaults() {
    localStorage.setItem('sv_mock_logs', JSON.stringify(this._defaultLogs));
    localStorage.removeItem('sv_live_logs');
    return [...this._defaultLogs];
  }
};

window.AuditService = AuditService;
