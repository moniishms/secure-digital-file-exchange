/**
 * SecureVault - Main Application Bootstrap & Coordinator
 * 
 * Coordinates services, views, toast notifications, dashboard statistics,
 * notification bell dropdown, profile menu, and settings synchronization.
 */

// Global Toast Notification Utility
const Toast = {
  container: null,

  init() {
    this.container = document.getElementById('toastContainer');
  },

  show(title, message, type = 'info', duration = 3500) {
    if (!this.container) {
      this.container = document.getElementById('toastContainer');
    }
    if (!this.container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    } else if (type === 'warning') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    } else {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }

    toast.innerHTML = `
      <div style="flex-shrink: 0; margin-top: 1px;">${iconSvg}</div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close" aria-label="Close notification">&times;</button>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
      this.dismiss(toast);
    });

    this.container.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(toast);
      }, duration);
    }
  },

  dismiss(toast) {
    if (!toast || !toast.parentElement) return;
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 200);
  }
};

window.Toast = Toast;

const App = {
  async init() {
    Toast.init();
    this.bindHeaderDropdowns();
    this.bindSettingsForm();

    // Initialize submodules
    if (window.Navigation) Navigation.init();
    if (window.FileManager) FileManager.init();
    if (window.SharingManager) SharingManager.init();
    if (window.ActivityManager) ActivityManager.init();

    // Render initial views & header profile
    this.renderUserProfile();
    await this.renderDashboard();
  },

  bindHeaderDropdowns() {
    // Profile menu dropdown toggle
    const profileTrigger = document.getElementById('topbarProfileTrigger');
    const profileMenu = document.getElementById('profileDropdownMenu');

    if (profileTrigger && profileMenu) {
      profileTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        profileMenu.classList.toggle('active');
        const notifMenu = document.getElementById('notificationsDropdownMenu');
        if (notifMenu) notifMenu.classList.remove('active');
      });
    }

    // Notifications menu toggle
    const notifTrigger = document.getElementById('topbarNotifTrigger');
    const notifMenu = document.getElementById('notificationsDropdownMenu');

    if (notifTrigger && notifMenu) {
      notifTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        notifMenu.classList.toggle('active');
        if (profileMenu) profileMenu.classList.remove('active');
      });
    }

    // Dismiss dropdowns on outside click
    document.addEventListener('click', () => {
      if (profileMenu) profileMenu.classList.remove('active');
      if (notifMenu) notifMenu.classList.remove('active');
    });

    // Logout button
    const logoutBtn = document.getElementById('logoutButton');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await AuthService.logout();
        Toast.show('Demo Logout', 'Signed out from simulated session. Re-authenticating demo user.', 'info');
        if (profileMenu) profileMenu.classList.remove('active');
      });
    }

    // Mark notifications read
    const markReadBtn = document.getElementById('markAllReadBtn');
    const notifBadge = document.getElementById('notifBadgeDot');
    if (markReadBtn) {
      markReadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (notifBadge) notifBadge.style.display = 'none';
        Toast.show('Notifications', 'All system notices marked as read.', 'info');
      });
    }
  },

  renderUserProfile() {
    const user = AuthService.getCurrentUser();
    const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2);

    // Sidebar user block
    const sbAvatar = document.getElementById('sidebarUserAvatar');
    const sbName = document.getElementById('sidebarUserName');
    const sbRole = document.getElementById('sidebarUserRole');

    if (sbAvatar) sbAvatar.textContent = initials;
    if (sbName) sbName.textContent = user.name;
    if (sbRole) sbRole.textContent = user.role;

    // Topbar user trigger
    const tbAvatar = document.getElementById('topbarUserAvatar');
    const tbName = document.getElementById('topbarUserName');
    if (tbAvatar) tbAvatar.textContent = initials;
    if (tbName) tbName.textContent = user.name;

    // Dropdown user header
    const ddName = document.getElementById('dropdownUserName');
    const ddEmail = document.getElementById('dropdownUserEmail');
    if (ddName) ddName.textContent = user.name;
    if (ddEmail) ddEmail.textContent = user.email;
  },

  async renderDashboard() {
    const files = await FileService.listFiles();
    const shares = await SharingService.listSharedFiles();
    const logs = await AuditService.getAuditLogs();

    // 1. Metric: Total Files
    const totalFilesEl = document.getElementById('metricTotalFiles');
    if (totalFilesEl) totalFilesEl.textContent = files.length;

    // 2. Metric: Storage Used
    const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
    const storageUsedEl = document.getElementById('metricStorageUsed');
    const quotaFillEl = document.getElementById('metricQuotaProgressFill');
    const quotaTextEl = document.getElementById('metricQuotaText');

    const quotaBytes = CONFIG.limits.storageQuotaBytes; // 100 MB
    const percentage = Math.min(100, Math.round((totalBytes / quotaBytes) * 100));

    if (storageUsedEl) storageUsedEl.textContent = FileService.formatBytes(totalBytes);
    if (quotaFillEl) quotaFillEl.style.width = `${percentage}%`;
    if (quotaTextEl) quotaTextEl.textContent = `${percentage}% of ${CONFIG.limits.storageQuotaBytes / (1024*1024)} MB Demo Limit`;

    // 3. Metric: Active Shares
    const activeSharesCount = shares.filter(s => s.status === 'Active').length;
    const activeSharesEl = document.getElementById('metricActiveShares');
    if (activeSharesEl) activeSharesEl.textContent = activeSharesCount;

    // 4. Metric: Recent Activity Count
    const activityCountEl = document.getElementById('metricActivityCount');
    if (activityCountEl) activityCountEl.textContent = logs.length;

    // 5. Dashboard Recent Files Table (Top 4)
    const recentTableBody = document.getElementById('dashboardRecentFilesTableBody');
    if (recentTableBody) {
      const topRecent = files.slice(0, 4);
      if (topRecent.length === 0) {
        recentTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">No files uploaded yet. Click Upload File to begin.</td></tr>`;
      } else {
        recentTableBody.innerHTML = topRecent.map(file => {
          const ext = file.extension ? file.extension.toUpperCase() : 'FILE';
          const badgeClass = `badge-${file.classification ? file.classification.toLowerCase() : 'internal'}`;
          return `
            <tr>
              <td>
                <div class="file-cell">
                  <div class="file-type-icon ${file.extension || 'code'}">${ext.slice(0, 4)}</div>
                  <div class="file-name-meta">
                    <div class="file-primary-name" title="${file.name}">${file.name}</div>
                    <div class="file-secondary-meta">${file.sizeFormatted}</div>
                  </div>
                </div>
              </td>
              <td>${file.uploadDate}</td>
              <td>
                <span class="badge ${badgeClass}">
                  <span class="badge-dot"></span>
                  ${file.classification}
                </span>
              </td>
              <td>
                <span class="badge badge-encrypted">
                  <span class="badge-dot"></span>
                  ${file.status}
                </span>
              </td>
              <td>
                <div class="action-buttons-group">
                  <button class="action-btn" title="Download" onclick="FileManager.triggerDownload('${file.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </button>
                  <button class="action-btn share" title="Share" onclick="SharingManager.openShareModal('${file.id}')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // 6. Dashboard Recent Activity Panel (Top 4)
    const dashboardActivityList = document.getElementById('dashboardActivityList');
    if (dashboardActivityList) {
      const topLogs = logs.slice(0, 4);
      if (topLogs.length === 0) {
        dashboardActivityList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 24px;">No recent activity logged.</div>`;
      } else {
        dashboardActivityList.innerHTML = topLogs.map(log => {
          let iconType = 'upload';
          const actLower = log.action.toLowerCase();
          if (actLower.includes('download')) iconType = 'download';
          else if (actLower.includes('share')) iconType = 'share';
          else if (actLower.includes('delete')) iconType = 'delete';
          else if (actLower.includes('denied')) iconType = 'denied';

          return `
            <div class="activity-item">
              <div class="activity-icon-node ${iconType}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  ${ActivityManager.getSvgPathForAction(iconType)}
                </svg>
              </div>
              <div class="activity-content">
                <div class="activity-headline">${log.action}: ${log.fileName}</div>
                <div class="activity-details">${log.details || log.user}</div>
                <div class="activity-time">${log.timestamp} • Status: ${log.status}</div>
              </div>
            </div>
          `;
        }).join('');
      }
    }
  },

  bindSettingsForm() {
    // Populate form values from Config & AuthService
    const user = AuthService.getCurrentUser();
    const nameInput = document.getElementById('settingsUserName');
    const emailInput = document.getElementById('settingsUserEmail');
    const deptInput = document.getElementById('settingsUserDept');

    if (nameInput) nameInput.value = user.name || '';
    if (emailInput) emailInput.value = user.email || '';
    if (deptInput) deptInput.value = user.department || '';

    // AWS Config inputs
    const apiInput = document.getElementById('settingsAwsApiUrl');
    const regionInput = document.getElementById('settingsAwsRegion');
    const bucketInput = document.getElementById('settingsAwsBucket');
    const cognitoInput = document.getElementById('settingsAwsCognitoId');

    if (apiInput) apiInput.value = CONFIG.aws.apiGatewayUrl || '';
    if (regionInput) regionInput.value = CONFIG.aws.region || 'us-east-1';
    if (bucketInput) bucketInput.value = CONFIG.aws.s3BucketName || 'securevault-demo-bucket';
    if (cognitoInput) cognitoInput.value = CONFIG.aws.cognitoClientId || '';

    // Save Profile Form
    const profileForm = document.getElementById('settingsProfileForm');
    if (profileForm) {
      profileForm.addEventListener('submit', (e) => {
        e.preventDefault();
        AuthService.updateProfile({
          name: nameInput.value.trim(),
          email: emailInput.value.trim(),
          department: deptInput.value.trim()
        });
        this.renderUserProfile();
        Toast.show('Profile Updated', 'User profile information updated locally.', 'success');
      });
    }

    // Save AWS Integration Settings Form
    const awsForm = document.getElementById('settingsAwsForm');
    if (awsForm) {
      awsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        CONFIG.updateAwsConfig({
          apiGatewayUrl: apiInput.value.trim(),
          region: regionInput.value.trim(),
          s3BucketName: bucketInput.value.trim(),
          cognitoClientId: cognitoInput.value.trim()
        });
        Toast.show('Integration Config Saved', 'AWS backend endpoints saved for service calls.', 'success');
      });
    }

    // Reset Demo Data Button
    const resetBtn = document.getElementById('resetDemoDataBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (confirm('Reset all demo data back to factory defaults? This will restore sample files, shared links, and activity logs.')) {
          FileService.resetToDefaults();
          SharingService.resetToDefaults();
          AuditService.resetToDefaults();
          this.renderDashboard();
          if (window.FileManager) FileManager.render();
          if (window.SharingManager) SharingManager.render();
          if (window.ActivityManager) ActivityManager.render();
          Toast.show('Reset Complete', 'Demo data restored to initial factory sample state.', 'info');
        }
      });
    }
  }
};

window.App = App;

// Bootstrap on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
