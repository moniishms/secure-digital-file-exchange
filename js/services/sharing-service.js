/**
 * SecureVault - Sharing Service (Time-Limited Presigned URLs)
 * 
 * Manages time-limited secure shareable links.
 * 
 * Security:
 * - Scopes browser storage strictly by the verified Cognito user's stable 'sub'.
 * - Never shares localStorage records between different Cognito accounts in the same browser.
 * - In Live AWS mode, strictly isolates share history and never displays mock/default shares.
 * - Real temporary S3 presigned URLs are generated via API Gateway POST /files/{fileId}/share.
 * - Dynamic expiration check automatically marks expired presigned links.
 */

const SharingService = {
  _defaultShares: [
    {
      id: "share_s01",
      fileId: "file_f01",
      fileName: "research_report.pdf",
      fileSize: "2.4 MB",
      classification: "Confidential",
      createdDate: "2026-10-18 08:30",
      expiresDate: "2026-10-18 08:35",
      expiryMinutes: 5,
      status: "Expired",
      simulatedUrl: "https://securevault-files-2026-ms-7391.s3.ap-south-1.amazonaws.com/shares/research_report.pdf?X-Amz-Expires=300",
      isSimulated: true,
      revoked: false
    },
    {
      id: "share_s02",
      fileId: "file_f02",
      fileName: "project_proposal.docx",
      fileSize: "1.1 MB",
      classification: "Internal",
      createdDate: "2026-10-18 10:15",
      expiresDate: "2026-10-18 10:20",
      expiryMinutes: 5,
      status: "Active",
      simulatedUrl: "https://securevault-files-2026-ms-7391.s3.ap-south-1.amazonaws.com/shares/project_proposal.docx?X-Amz-Expires=300",
      isSimulated: true,
      revoked: false
    }
  ],

  /**
   * Resolves the storage key for share records:
   * - Mock mode: 'sv_mock_shares'
   * - Live AWS mode: strictly scoped to the authenticated Cognito user's stable 'sub'
   * - Unauthenticated in Live mode: returns null to prevent data cross-contamination
   */
  getStorageKey() {
    if (CONFIG.isMockMode()) {
      return 'sv_mock_shares';
    }
    const user = (window.AuthService && typeof AuthService.getCurrentUser === 'function')
      ? AuthService.getCurrentUser()
      : null;
    const sub = user?.sub || (user?.id && user.id !== 'usr_cognito' ? user.id : null);
    return sub ? `sv_live_shares_${sub}` : null;
  },

  /**
   * Calculates formatted expiration date string in local time
   */
  getExpirationDateString(minutes) {
    const d = new Date(Date.now() + minutes * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  /**
   * Formats ISO timestamp to YYYY-MM-DD HH:mm or falls back to relative minutes
   */
  formatIsoDate(isoString, fallbackMinutes = 15) {
    if (isoString) {
      try {
        const d = new Date(isoString);
        if (!isNaN(d.getTime())) {
          const pad = (n) => String(n).padStart(2, '0');
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
      } catch (e) {}
    }
    return this.getExpirationDateString(fallbackMinutes);
  },

  /**
   * Retrieves list of all shared links strictly for the current authenticated user
   * @returns {Promise<Array>}
   */
  async listSharedFiles() {
    // Purge legacy un-scoped storage key to eliminate cross-account data leaks
    try {
      localStorage.removeItem('sv_live_shares');
    } catch (e) {}

    if (CONFIG.isMockMode()) {
      const stored = localStorage.getItem('sv_mock_shares');
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error("Error parsing stored shares", e);
        }
      }
      localStorage.setItem('sv_mock_shares', JSON.stringify(this._defaultShares));
      return [...this._defaultShares];
    }

    // Live AWS Mode:
    // Strictly isolate shares by current user's authenticated sub.
    // Never show mock/default share records in live AWS mode.
    if (!AuthService.isAuthenticated()) {
      return [];
    }

    const storageKey = this.getStorageKey();
    if (!storageKey) {
      return [];
    }

    const stored = localStorage.getItem(storageKey);
    let shares = [];
    if (stored) {
      try {
        shares = JSON.parse(stored);
        if (!Array.isArray(shares)) shares = [];
      } catch (e) {
        console.error("Error parsing stored live shares", e);
        shares = [];
      }
    }

    // Filter to ensure no mock records or mismatched account records appear
    const currentUser = AuthService.getCurrentUser();
    const currentSub = currentUser?.sub;
    shares = shares.filter(s => {
      if (s.id === 'share_s01' || s.id === 'share_s02') return false;
      if (s.isSimulated) return false;
      if (s.ownerSub && currentSub && s.ownerSub !== currentSub) return false;
      return true;
    });

    // Dynamically evaluate expiration
    const now = Date.now();
    let updatedNeeded = false;
    shares.forEach(share => {
      if (share.status === 'Active' && share.expiresDate) {
        const expTime = new Date(share.expiresDate).getTime();
        if (!isNaN(expTime) && expTime <= now) {
          share.status = 'Expired';
          updatedNeeded = true;
        }
      }
    });

    if (updatedNeeded) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(shares));
      } catch (e) {}
    }

    return shares;
  },

  /**
   * Generates a secure presigned link via AWS API Gateway or tracks it locally in Mock mode
   * @param {string} fileId 
   * @param {number} expiryMinutes Default 15 minutes
   * @returns {Promise<Object>} Share metadata and real or mock link
   */
  async generateSecureLink(fileId, expiryMinutes = 15) {
    if (!fileId || typeof fileId !== 'string' || !fileId.trim()) {
      throw new Error("Invalid file identifier. Please select a valid file to share.");
    }

    const minutesNum = parseInt(expiryMinutes, 10) || 15;
    const cleanFileId = (fileId.includes('/') || fileId.includes('\\'))
      ? fileId.replace(/\\/g, '/').split('/').pop().trim()
      : fileId.trim();

    if (!cleanFileId || cleanFileId === '.' || cleanFileId === '..') {
      throw new Error("Invalid file identifier format.");
    }

    // In Mock Mode: construct simulated share record locally
    if (CONFIG.isMockMode()) {
      const files = await FileService.listFiles();
      const targetFile = files.find(f => (f.id === cleanFileId || f.fileId === cleanFileId));

      if (!targetFile) {
        throw new Error("Target file not found in local demo storage.");
      }

      const expiresDate = this.getExpirationDateString(minutesNum);
      const storageKey = 'sv_mock_shares';

      const shareUrl = `https://${CONFIG.aws.s3BucketName}.s3.${CONFIG.aws.region}.amazonaws.com/shares/${targetFile.name}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${minutesNum * 60}&demo=true`;

      const newShare = {
        id: "share_" + Math.random().toString(36).substring(2, 9),
        fileId: targetFile.id,
        fileName: targetFile.name,
        fileSize: targetFile.sizeFormatted,
        classification: targetFile.classification,
        createdDate: FileService.getCurrentTimestamp(),
        expiresDate: expiresDate,
        expiryMinutes: minutesNum,
        status: "Active",
        shareUrl: shareUrl,
        simulatedUrl: shareUrl,
        url: shareUrl,
        isSimulated: true,
        revoked: false
      };

      const shares = await this.listSharedFiles();
      const updated = [newShare, ...shares];
      localStorage.setItem(storageKey, JSON.stringify(updated));

      if (window.AuditService) {
        window.AuditService.logActivity(
          'Share Created',
          targetFile.name,
          `Demo simulated presigned link generated (${minutesNum}m expiration)`,
          'Success'
        );
      }

      return newShare;
    }

    // Live AWS Backend Mode:
    // 0. Verify API URL configuration
    if (!CONFIG.aws?.apiGatewayUrl || !CONFIG.aws.apiGatewayUrl.trim()) {
      throw new Error("AWS API Gateway URL is not configured. Please check your settings.");
    }

    // 1. Verify authentication
    if (!AuthService.isAuthenticated()) {
      throw new Error("Authentication required: Please sign in with Amazon Cognito before generating a share link.");
    }

    const token = AuthService.getAuthToken();
    if (!token) {
      throw new Error("Valid authentication token missing: Please sign in with Amazon Cognito.");
    }

    const storageKey = this.getStorageKey();
    if (!storageKey) {
      throw new Error("Unable to determine user-scoped storage key. Please re-authenticate.");
    }

    // 2. Request real S3 presigned GET URL from API Gateway POST /files/{fileId}/share
    let response;
    try {
      response = await fetch(`${CONFIG.aws.apiGatewayUrl}/files/${encodeURIComponent(cleanFileId)}/share`, {
        method: 'POST',
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          expiryMinutes: minutesNum,
          expiresIn: minutesNum * 60
        })
      });
    } catch (networkError) {
      throw new Error(`Failed to contact AWS API Gateway: ${networkError.message}. Check network connection and CORS settings.`);
    }

    let errorMsg = '';
    if (!response.ok) {
      try {
        const errJson = await response.json();
        errorMsg = errJson.message || errJson.error || '';
      } catch (e) {
        errorMsg = await response.text().catch(() => '');
      }
    }

    if (response.status === 400) {
      throw new Error(`Invalid share request (HTTP 400): ${errorMsg || 'Invalid file ID or expiration parameters.'}`);
    }

    if (response.status === 401) {
      AuthService.handleUnauthorized();
      throw new Error(`Unauthorized (HTTP 401): Your Cognito session has expired or the token is invalid. Please sign in again.`);
    }

    if (response.status === 403) {
      throw new Error(`Access Forbidden (HTTP 403): You do not have permission to share this file.`);
    }

    if (response.status === 404) {
      throw new Error(`File not found (HTTP 404): ${errorMsg || 'The requested file was not found in your vault partition.'}`);
    }

    if (response.status >= 500) {
      throw new Error(`Server error processing share link (HTTP ${response.status}): ${errorMsg || 'Internal server error in Lambda backend.'}`);
    }

    if (!response.ok) {
      throw new Error(`AWS share link generation failed (HTTP ${response.status}): ${errorMsg || response.statusText}`);
    }

    const data = await response.json();
    const presignedShareUrl = data.shareUrl || data.downloadUrl || data.url;

    if (!presignedShareUrl) {
      throw new Error("AWS backend did not return a valid presigned share URL.");
    }

    // 3. Resolve metadata for local tracking
    let targetFile = null;
    try {
      const files = await FileService.listFiles();
      targetFile = files.find(f => (f.id === cleanFileId || f.fileId === cleanFileId));
    } catch (e) {
      // Continue even if listFiles fails
    }

    const resolvedFileName = data.filename || (targetFile ? targetFile.name : cleanFileId.replace(/^\d+-(?:[a-f0-9]+-)?/, ''));
    const resolvedFileSize = targetFile ? targetFile.sizeFormatted : 'Encrypted File';
    const resolvedClassification = targetFile ? targetFile.classification : 'Internal';
    const expiresDate = data.expiresDate ? this.formatIsoDate(data.expiresDate, minutesNum) : this.getExpirationDateString(minutesNum);
    const currentUser = AuthService.getCurrentUser();

    const newShare = {
      id: "share_" + Math.random().toString(36).substring(2, 9),
      fileId: cleanFileId,
      fileName: resolvedFileName,
      fileSize: resolvedFileSize,
      classification: resolvedClassification,
      createdDate: FileService.getCurrentTimestamp(),
      expiresDate: expiresDate,
      expiryMinutes: data.expiryMinutes || minutesNum,
      status: "Active",
      shareUrl: presignedShareUrl,
      simulatedUrl: presignedShareUrl,
      url: presignedShareUrl,
      isSimulated: false,
      revoked: false,
      ownerSub: currentUser?.sub || null
    };

    const shares = await this.listSharedFiles();
    const updated = [newShare, ...shares];
    localStorage.setItem(storageKey, JSON.stringify(updated));

    if (window.AuditService) {
      window.AuditService.logActivity(
        'Share Created',
        resolvedFileName,
        `Real S3 presigned GET URL generated (${newShare.expiryMinutes}m TTL)`,
        'Success'
      );
    }

    return newShare;
  },

  /**
   * Revokes an existing shared link
   * @param {string} shareId 
   * @returns {Promise<boolean>}
   */
  async revokeShare(shareId) {
    const storageKey = this.getStorageKey();
    if (!storageKey) {
      throw new Error("Authentication required: Cannot revoke share link without an active session.");
    }
    const shares = await this.listSharedFiles();
    const targetIndex = shares.findIndex(s => s.id === shareId);

    if (targetIndex === -1) {
      throw new Error("Shared link record not found.");
    }

    shares[targetIndex].status = "Revoked";
    shares[targetIndex].revoked = true;
    localStorage.setItem(storageKey, JSON.stringify(shares));

    if (window.AuditService) {
      window.AuditService.logActivity(
        'Share Revoked',
        shares[targetIndex].fileName,
        `Revoked sharing access for link #${shareId}`,
        'Success'
      );
    }

    return true;
  },

  /**
   * Resets mock shares to default; in Live mode purges user share history
   */
  resetToDefaults() {
    localStorage.setItem('sv_mock_shares', JSON.stringify(this._defaultShares));
    try {
      localStorage.removeItem('sv_live_shares');
      const storageKey = this.getStorageKey();
      if (storageKey && !CONFIG.isMockMode()) {
        localStorage.removeItem(storageKey);
      }
    } catch (e) {}
    return [...this._defaultShares];
  }
};

window.SharingService = SharingService;
