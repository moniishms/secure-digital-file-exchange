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

  show(title, message, type = 'info', duration = 4000) {
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
  awsConnectionState: 'unverified', // 'unverified' | 'connected' | 'error' | 'unauthorized'
  awsConnectionError: null,

  async init() {
    Toast.init();

    // Check for Cognito OAuth 2.0 PKCE Callback (?code=...&state=...)
    if (window.AuthService && AuthService.init) {
      await AuthService.init();
    }

    this.bindHeaderDropdowns();
    this.bindSettingsForm();

    // Initialize submodules
    if (window.Navigation) Navigation.init();
    if (window.FileManager) {
      FileManager.init();
      FileManager.render();
    }
    if (window.SharingManager) {
      SharingManager.init();
      SharingManager.render();
    }
    if (window.ActivityManager) {
      ActivityManager.init();
      ActivityManager.render();
    }

    // Render initial views & header profile
    this.renderUserProfile();
    await this.renderDashboard();
  },

  setAwsConnectionState(state, errorMsg = null) {
    this.awsConnectionState = state;
    this.awsConnectionError = errorMsg;

    const isMock = CONFIG.isMockMode();
    const isAuth = AuthService.isAuthenticated();

    // 1. Topbar Mode Badge
    const modeBadge = document.getElementById('app-mode-badge');
    const modeLabel = document.getElementById('app-mode-label');

    if (modeBadge && modeLabel) {
      modeBadge.classList.remove('mode-mock', 'mode-live-unauth', 'mode-live-verifying', 'mode-live-connected', 'mode-live-error');

      if (isMock) {
        modeBadge.classList.add('mode-mock');
        modeLabel.textContent = 'Demo Mode • S3 Mock';
      } else if (!isAuth) {
        modeBadge.classList.add('mode-live-unauth');
        modeLabel.textContent = 'Live AWS (Sign In Required)';
      } else if (state === 'connected') {
        modeBadge.classList.add('mode-live-connected');
        modeLabel.textContent = 'Live AWS (Connected)';
      } else if (state === 'error') {
        modeBadge.classList.add('mode-live-error');
        modeLabel.textContent = 'Live AWS (Unreachable)';
      } else if (state === 'unauthorized') {
        modeBadge.classList.add('mode-live-error');
        modeLabel.textContent = 'Live AWS (Session Expired)';
      } else {
        modeBadge.classList.add('mode-live-verifying');
        modeLabel.textContent = 'Live AWS (Verifying...)';
      }
    }

    // 2. Sidebar Brand Badge
    const brandBadge = document.getElementById('brandAppBadge');
    if (brandBadge) {
      if (isMock) {
        brandBadge.textContent = 'Demo';
        brandBadge.style.backgroundColor = '#E2E8F0';
        brandBadge.style.color = '#475569';
        brandBadge.style.borderColor = '#CBD5E1';
      } else if (!isAuth) {
        brandBadge.textContent = 'Live (Sign In)';
        brandBadge.style.backgroundColor = '#FEF3C7';
        brandBadge.style.color = '#92400E';
        brandBadge.style.borderColor = '#FDE68A';
      } else if (state === 'connected') {
        brandBadge.textContent = 'AWS Live';
        brandBadge.style.backgroundColor = '#DCFCE7';
        brandBadge.style.color = '#15803D';
        brandBadge.style.borderColor = '#BBF7D0';
      } else if (state === 'error') {
        brandBadge.textContent = 'AWS Offline';
        brandBadge.style.backgroundColor = '#FEE2E2';
        brandBadge.style.color = '#991B1B';
        brandBadge.style.borderColor = '#FECACA';
      } else {
        brandBadge.textContent = 'AWS Connecting';
        brandBadge.style.backgroundColor = '#EFF6FF';
        brandBadge.style.color = '#1D4ED8';
        brandBadge.style.borderColor = '#BFDBFE';
      }
    }

    // 3. Dashboard Integration Notice Banner
    const bannerTitle = document.getElementById('dashboardIntegrationBannerTitle');
    const bannerSubtitle = document.getElementById('dashboardIntegrationBannerSubtitle');
    if (bannerTitle && bannerSubtitle) {
      if (isMock) {
        bannerTitle.textContent = 'Operating in Client Prototype Mode';
        bannerSubtitle.textContent = 'Local mock service layer active • Switch to Live AWS Backend in Settings to connect API Gateway.';
      } else if (!isAuth) {
        bannerTitle.textContent = 'Live AWS Backend Selected (Sign In Required)';
        bannerSubtitle.textContent = `Amazon Cognito authentication required to access private S3 bucket (${CONFIG.aws.s3BucketName}) in ${CONFIG.aws.region}.`;
      } else if (state === 'connected') {
        bannerTitle.textContent = `Connected to AWS API Gateway (${CONFIG.aws.region})`;
        bannerSubtitle.textContent = `S3 Storage: ${CONFIG.aws.s3BucketName} • Cognito JWT Authorizer Active & Verified.`;
      } else if (state === 'error') {
        bannerTitle.textContent = 'Live AWS Backend: Connection Unreachable';
        bannerSubtitle.textContent = errorMsg ? `Gateway Notice: ${errorMsg}` : 'Unable to complete API Gateway request. Check network connection or CORS configuration.';
      } else {
        bannerTitle.textContent = 'Verifying AWS API Gateway Connection...';
        bannerSubtitle.textContent = `Connecting to ${CONFIG.aws.apiGatewayUrl}/files`;
      }
    }
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

    // Login buttons (topbar and dropdown)
    const topbarSignInBtn = document.getElementById('topbarSignInBtn');
    if (topbarSignInBtn) {
      topbarSignInBtn.addEventListener('click', (e) => {
        e.preventDefault();
        AuthService.login();
      });
    }

    const dropdownLoginBtn = document.getElementById('loginButton');
    if (dropdownLoginBtn) {
      dropdownLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (profileMenu) profileMenu.classList.remove('active');
        AuthService.login();
      });
    }

    // Auth banner sign-in buttons in files view
    document.querySelectorAll('.btn-login-cognito').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        AuthService.login();
      });
    });

    // Logout button
    const logoutBtn = document.getElementById('logoutButton');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (profileMenu) profileMenu.classList.remove('active');
        await AuthService.logout();
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
    const isAuth = AuthService.isAuthenticated();
    const isMock = CONFIG.isMockMode();
    const user = AuthService.getCurrentUser();

    // Determine clean avatar initials
    let initials = 'AM';
    if (!isMock && !isAuth) {
      initials = '--';
    } else if (user && user.name && user.name !== 'Sign In') {
      initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    } else if (user && user.email) {
      initials = user.email.slice(0, 2).toUpperCase();
    }

    // Update connection status badges
    this.setAwsConnectionState(this.awsConnectionState, this.awsConnectionError);

    // Sidebar user block
    const sbAvatar = document.getElementById('sidebarUserAvatar');
    const sbName = document.getElementById('sidebarUserName');
    const sbRole = document.getElementById('sidebarUserRole');

    if (sbAvatar) sbAvatar.textContent = initials;
    if (sbName) sbName.textContent = isMock ? user.name : (isAuth ? (user.name || 'Cognito User') : 'Guest');
    if (sbRole) sbRole.textContent = isMock ? user.role : (isAuth ? (user.role || 'Authenticated') : 'Sign In Required');

    // Topbar user trigger
    const tbAvatar = document.getElementById('topbarUserAvatar');
    const tbName = document.getElementById('topbarUserName');
    if (tbAvatar) tbAvatar.textContent = initials;
    if (tbName) tbName.textContent = isMock ? user.name : (isAuth ? (user.name || 'Cognito User') : 'Sign In');

    // Dropdown user header
    const ddName = document.getElementById('dropdownUserName');
    const ddEmail = document.getElementById('dropdownUserEmail');
    if (ddName) ddName.textContent = isMock ? user.name : (isAuth ? (user.name || 'Cognito User') : 'Guest Session');
    if (ddEmail) ddEmail.textContent = isMock ? user.email : (isAuth ? user.email : 'Cognito Authentication Required');

    // Toggle Sign In vs Sign Out buttons in header
    const topbarSignInBtn = document.getElementById('topbarSignInBtn');
    const dropdownLoginBtn = document.getElementById('loginButton');
    const dropdownLogoutBtn = document.getElementById('logoutButton');
    const logoutLabel = document.getElementById('logoutButtonLabel');

    if (isMock) {
      if (topbarSignInBtn) topbarSignInBtn.style.display = 'none';
      if (dropdownLoginBtn) dropdownLoginBtn.style.display = 'none';
      if (dropdownLogoutBtn) dropdownLogoutBtn.style.display = 'flex';
      if (logoutLabel) logoutLabel.textContent = 'Demo Reset';
    } else if (isAuth) {
      if (topbarSignInBtn) topbarSignInBtn.style.display = 'none';
      if (dropdownLoginBtn) dropdownLoginBtn.style.display = 'none';
      if (dropdownLogoutBtn) dropdownLogoutBtn.style.display = 'flex';
      if (logoutLabel) logoutLabel.textContent = 'Sign Out';
    } else {
      if (topbarSignInBtn) topbarSignInBtn.style.display = 'inline-flex';
      if (dropdownLoginBtn) dropdownLoginBtn.style.display = 'flex';
      if (dropdownLogoutBtn) dropdownLogoutBtn.style.display = 'none';
    }

    // Authentication banner in files view
    const filesAuthBanner = document.getElementById('filesAuthBanner');
    if (filesAuthBanner) {
      filesAuthBanner.style.display = (!isMock && !isAuth) ? 'flex' : 'none';
    }
  },

  async renderDashboard() {
    let files = [];
    let shares = [];
    let logs = [];

    const isAuth = AuthService.isAuthenticated();
    const isMock = CONFIG.isMockMode();

    if (isMock || isAuth) {
      try {
        files = await FileService.listFiles();
        this.setAwsConnectionState('connected');
      } catch (err) {
        console.warn('Dashboard could not load files:', err.message);
        if (!isMock) {
          this.setAwsConnectionState(isAuth ? 'error' : 'unauthorized', err.message);
        }
      }
    } else {
      this.setAwsConnectionState('unauthorized');
    }

    try {
      shares = await SharingService.listSharedFiles();
    } catch (err) {
      console.warn('Dashboard could not load shares:', err.message);
    }

    try {
      logs = await AuditService.getAuditLogs();
    } catch (err) {
      console.warn('Dashboard could not load audit logs:', err.message);
    }

    // 1. Metric: Total Files
    const totalFilesEl = document.getElementById('metricTotalFiles');
    if (totalFilesEl) totalFilesEl.textContent = files.length;

    const metric1Subtitle = document.getElementById('metric1Subtitle');
    if (metric1Subtitle) {
      metric1Subtitle.textContent = isMock ? 'in virtual S3 bucket' : `in AWS S3 (${CONFIG.aws.s3BucketName})`;
    }

    // 2. Metric: Storage Used
    const totalBytes = files.reduce((sum, f) => sum + (f.size || 0), 0);
    const storageUsedEl = document.getElementById('metricStorageUsed');
    const quotaFillEl = document.getElementById('metricQuotaProgressFill');
    const quotaTextEl = document.getElementById('metricQuotaText');

    const quotaBytes = CONFIG.limits.storageQuotaBytes; // 100 MB
    const percentage = Math.min(100, Math.round((totalBytes / quotaBytes) * 100));

    if (storageUsedEl) storageUsedEl.textContent = FileService.formatBytes(totalBytes);
    if (quotaFillEl) quotaFillEl.style.width = `${percentage}%`;
    if (quotaTextEl) {
      const quotaMb = Math.round(quotaBytes / (1024 * 1024));
      quotaTextEl.textContent = `${percentage}% of ${quotaMb} MB ${isMock ? 'Demo Limit' : 'Storage Quota'}`;
    }

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
        const msg = (!isMock && !isAuth)
          ? 'Cognito authentication required. Sign in to view files stored in AWS S3.'
          : 'No files stored in this vault yet. Click Upload File to begin.';
        recentTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">${msg}</td></tr>`;
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
          const actLower = (log.action || '').toLowerCase();
          if (actLower.includes('download')) iconType = 'download';
          else if (actLower.includes('share')) iconType = 'share';
          else if (actLower.includes('delete')) iconType = 'delete';
          else if (actLower.includes('denied')) iconType = 'denied';
          else if (actLower.includes('login') || actLower.includes('init')) iconType = 'share';

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
    // Populate Profile form
    const user = AuthService.getCurrentUser();
    const nameInput = document.getElementById('settingsUserName');
    const emailInput = document.getElementById('settingsUserEmail');
    const deptInput = document.getElementById('settingsUserDept');

    if (nameInput) nameInput.value = user.name || '';
    if (emailInput) emailInput.value = user.email || '';
    if (deptInput) deptInput.value = user.department || '';

    // AWS Config inputs
    const modeSelect = document.getElementById('settingsAppMode');
    const apiInput = document.getElementById('settingsAwsApiUrl');
    const regionInput = document.getElementById('settingsAwsRegion');
    const bucketInput = document.getElementById('settingsAwsBucket');
    const poolIdInput = document.getElementById('settingsAwsCognitoPoolId');
    const cognitoInput = document.getElementById('settingsAwsCognitoId');
    const domainInput = document.getElementById('settingsAwsCognitoDomain');
    const redirectInput = document.getElementById('settingsAwsRedirectUri');
    const logoutInput = document.getElementById('settingsAwsLogoutUri');
    const tokenTypeSelect = document.getElementById('settingsAwsTokenType');

    const defaultRedirect = window.location.origin + window.location.pathname;

    if (modeSelect) modeSelect.value = CONFIG.appMode || 'live';
    if (apiInput) apiInput.value = CONFIG.aws.apiGatewayUrl || '';
    if (regionInput) regionInput.value = CONFIG.aws.region || 'ap-south-1';
    if (bucketInput) bucketInput.value = CONFIG.aws.s3BucketName || 'securevault-files-2026-ms-7391';
    if (poolIdInput) poolIdInput.value = CONFIG.aws.cognitoPoolId || '';
    if (cognitoInput) cognitoInput.value = CONFIG.aws.cognitoClientId || '';
    if (domainInput) domainInput.value = CONFIG.aws.cognitoDomain || '';
    if (redirectInput) redirectInput.value = CONFIG.aws.redirectUri || defaultRedirect;
    if (logoutInput) logoutInput.value = CONFIG.aws.logoutUri || defaultRedirect;
    if (tokenTypeSelect) tokenTypeSelect.value = CONFIG.aws.tokenType || 'id_token';

    // Save Profile Form
    const profileForm = document.getElementById('settingsProfileForm');
    if (profileForm) {
      profileForm.onsubmit = (e) => {
        e.preventDefault();
        AuthService.updateProfile({
          name: nameInput.value.trim(),
          email: emailInput.value.trim(),
          department: deptInput.value.trim()
        });
        this.renderUserProfile();
        Toast.show('Profile Updated', 'User profile information updated locally.', 'success');
      };
    }

    // Save AWS Integration Settings Form
    const awsForm = document.getElementById('settingsAwsForm');
    if (awsForm) {
      awsForm.onsubmit = (e) => {
        e.preventDefault();

        const newAppMode = modeSelect ? modeSelect.value : CONFIG.appMode;

        CONFIG.updateAwsConfig({
          appMode: newAppMode,
          apiGatewayUrl: apiInput.value.trim(),
          region: regionInput.value.trim(),
          s3BucketName: bucketInput.value.trim(),
          cognitoPoolId: poolIdInput ? poolIdInput.value.trim() : '',
          cognitoClientId: cognitoInput.value.trim(),
          cognitoDomain: domainInput ? domainInput.value.trim() : '',
          redirectUri: redirectInput ? redirectInput.value.trim() : '',
          logoutUri: logoutInput ? logoutInput.value.trim() : '',
          tokenType: tokenTypeSelect ? tokenTypeSelect.value : 'id_token'
        });

        // Reset connection verification status on config change
        this.awsConnectionState = 'unverified';
        this.renderUserProfile();
        this.renderDashboard();
        if (window.FileManager) FileManager.render();
        if (window.SharingManager) SharingManager.render();
        if (window.ActivityManager) ActivityManager.render();

        Toast.show(
          'Configuration Saved',
          `Application settings updated (${newAppMode === 'live' ? 'Live AWS Backend' : 'Mock Demo Mode'}).`,
          'success'
        );
      };
    }

    // Reset Demo Data Button
    const resetBtn = document.getElementById('resetDemoDataBtn');
    if (resetBtn) {
      resetBtn.onclick = () => {
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
      };
    }

    // Restore Default AWS Endpoints Button
    const resetAwsBtn = document.getElementById('resetAwsConfigBtn');
    if (resetAwsBtn) {
      resetAwsBtn.onclick = () => {
        if (confirm('Restore default AWS configuration settings (API Gateway, S3 Bucket, ap-south-1)?')) {
          CONFIG.resetToDefaults();
          this.bindSettingsForm();
          this.awsConnectionState = 'unverified';
          this.renderUserProfile();
          this.renderDashboard();
          if (window.FileManager) FileManager.render();
          Toast.show('AWS Config Restored', 'AWS endpoint defaults restored.', 'info');
        }
      };
    }
  }
};

window.App = App;

// Bootstrap on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
