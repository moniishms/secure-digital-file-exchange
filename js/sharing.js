/**
 * SecureVault - Sharing Module
 * 
 * Manages the Secure Link Generation Modal, clipboard copying,
 * and the Shared Files management table view with real-time revocation.
 */

const SharingManager = {
  currentFileIdToShare: null,

  init() {
    this.bindModalEvents();
  },

  bindModalEvents() {
    const modal = document.getElementById('shareModal');
    const closeBtn = document.getElementById('closeShareModalBtn');
    const cancelBtn = document.getElementById('cancelShareBtn');
    const generateBtn = document.getElementById('generateLinkBtn');
    const copyBtn = document.getElementById('copyShareLinkBtn');

    const closeModal = () => {
      if (modal) modal.classList.remove('active');
      this.resetShareModal();
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    if (generateBtn) {
      generateBtn.addEventListener('click', () => {
        this.executeGenerateLink();
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        this.copyGeneratedLink();
      });
    }
  },

  async openShareModal(fileId) {
    this.currentFileIdToShare = fileId;
    const modal = document.getElementById('shareModal');
    if (!modal) return;

    this.resetShareModal();

    // Fetch file details
    const files = await FileService.listFiles();
    const target = files.find(f => f.id === fileId);

    if (target) {
      const fileNameEl = document.getElementById('shareModalFileName');
      const fileMetaEl = document.getElementById('shareModalFileMeta');
      if (fileNameEl) fileNameEl.textContent = target.name;
      if (fileMetaEl) fileMetaEl.textContent = target.sizeFormatted;
    }

    modal.classList.add('active');
  },

  resetShareModal() {
    const linkResultBox = document.getElementById('shareLinkResultContainer');
    const generateBtn = document.getElementById('generateLinkBtn');
    const linkInput = document.getElementById('generatedShareLinkInput');
    const copyBtn = document.getElementById('copyShareLinkBtn');

    if (linkResultBox) linkResultBox.style.display = 'none';
    if (generateBtn) {
      generateBtn.style.display = 'inline-flex';
      generateBtn.disabled = false;
    }
    if (linkInput) linkInput.value = '';
    if (copyBtn) {
      copyBtn.innerHTML = `
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        <span>Copy Link</span>
      `;
    }
  },

  async executeGenerateLink() {
    if (!this.currentFileIdToShare) return;

    const validitySelect = document.getElementById('shareValiditySelect');
    const expiryMinutes = validitySelect ? parseInt(validitySelect.value, 10) : 15;

    const generateBtn = document.getElementById('generateLinkBtn');
    const linkResultBox = document.getElementById('shareLinkResultContainer');
    const linkInput = document.getElementById('generatedShareLinkInput');
    const expiryNotice = document.getElementById('shareExpiryTimestampNotice');

    if (generateBtn) generateBtn.disabled = true;

    try {
      const shareRecord = await SharingService.generateSecureLink(this.currentFileIdToShare, expiryMinutes);
      const linkUrl = shareRecord.shareUrl || shareRecord.url || shareRecord.simulatedUrl || '';

      if (linkInput) linkInput.value = linkUrl;
      if (expiryNotice) expiryNotice.textContent = `Valid until: ${shareRecord.expiresDate} (${expiryMinutes} minutes TTL)`;

      if (linkResultBox) linkResultBox.style.display = 'block';
      if (generateBtn) generateBtn.style.display = 'none';

      const isSimulated = shareRecord.isSimulated || CONFIG.isMockMode();
      Toast.show(
        'Secure Link Generated',
        isSimulated ? `Simulated demo link created with ${expiryMinutes}m validity.` : `Time-limited S3 presigned URL created with ${expiryMinutes}m validity.`,
        isSimulated ? 'info' : 'success'
      );

      // Update shared table if open
      this.render();
      if (window.App) App.renderDashboard();
    } catch (err) {
      Toast.show('Error', err.message, 'error');
      if (generateBtn) generateBtn.disabled = false;
    }
  },

  copyGeneratedLink() {
    const linkInput = document.getElementById('generatedShareLinkInput');
    const copyBtn = document.getElementById('copyShareLinkBtn');
    if (!linkInput || !linkInput.value) return;

    linkInput.select();
    const onSuccess = () => {
      if (copyBtn) {
        copyBtn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Copied!</span>
        `;
        setTimeout(() => {
          copyBtn.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span>Copy Link</span>
          `;
        }, 2200);
      }
      Toast.show('Copied to Clipboard', 'The secure temporary URL is ready to share.', 'info');
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(linkInput.value).then(onSuccess).catch(() => {
        try {
          document.execCommand('copy');
          onSuccess();
        } catch (e) {
          Toast.show('Copy Failed', 'Please select and copy the link manually.', 'error');
        }
      });
    } else {
      try {
        document.execCommand('copy');
        onSuccess();
      } catch (e) {
        Toast.show('Copy Failed', 'Please select and copy the link manually.', 'error');
      }
    }
  },

  async copyShareUrl(url) {
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      Toast.show('Copied to Clipboard', 'Temporary S3 presigned link copied.', 'info');
    }).catch(() => {
      Toast.show('Copy Failed', 'Unable to copy URL to clipboard.', 'error');
    });
  },

  async copyShareLinkById(shareId) {
    try {
      const shares = await SharingService.listSharedFiles();
      const target = shares.find(s => s.id === shareId);
      const url = target?.shareUrl || target?.url || target?.simulatedUrl;
      if (url) {
        this.copyShareUrl(url);
      } else {
        Toast.show('Copy Error', 'Share URL not found.', 'error');
      }
    } catch (err) {
      Toast.show('Copy Error', err.message, 'error');
    }
  },

  async revokeShare(shareId) {
    try {
      await SharingService.revokeShare(shareId);
      Toast.show('Share Revoked', 'The temporary access link has been invalidated.', 'warning');
      this.render();
      if (window.App) App.renderDashboard();
    } catch (err) {
      Toast.show('Revocation Failed', err.message, 'error');
    }
  },

  async render() {
    const tableBody = document.getElementById('sharedTableBody');
    const emptyState = document.getElementById('sharedEmptyState');
    if (!tableBody) return;

    const shares = await SharingService.listSharedFiles();

    if (!shares || shares.length === 0) {
      tableBody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    tableBody.innerHTML = shares.map(share => {
      let badgeHtml = '';
      if (share.status === 'Active') {
        badgeHtml = `<span class="badge badge-encrypted"><span class="badge-dot"></span> Active (${share.expiryMinutes}m)</span>`;
      } else if (share.status === 'Revoked') {
        badgeHtml = `<span class="badge badge-revoked"><span class="badge-dot"></span> Revoked</span>`;
      } else {
        badgeHtml = `<span class="badge badge-expired"><span class="badge-dot"></span> Expired</span>`;
      }

      const canCopy = share.status === 'Active';
      const canRevoke = share.status === 'Active';

      return `
        <tr>
          <td>
            <div class="file-cell">
              <div class="file-type-icon docx">URL</div>
              <div class="file-name-meta">
                <div class="file-primary-name">${share.fileName}</div>
                <div class="file-secondary-meta">${share.fileSize}</div>
              </div>
            </div>
          </td>
          <td>${share.createdDate}</td>
          <td>${share.expiresDate}</td>
          <td>${badgeHtml}</td>
          <td>
            <div class="action-buttons-group">
              ${canCopy ? `
                <button class="action-btn share" title="Copy Link" onclick="SharingManager.copyShareLinkById('${share.id}')">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
              ` : `
                <button class="action-btn" disabled style="opacity: 0.4; cursor: not-allowed;" title="Link no longer active">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
              `}
              ${canRevoke ? `
                <button class="btn btn-outline btn-sm" style="color: var(--color-error); border-color: var(--border-error);" onclick="SharingManager.revokeShare('${share.id}')">
                  Revoke
                </button>
              ` : `
                <span style="font-size: 0.78rem; color: var(--text-light);">Inactive</span>
              `}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }
};

window.SharingManager = SharingManager;
