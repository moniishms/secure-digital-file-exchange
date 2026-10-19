/**
 * SecureVault - Sharing Service (Time-Limited Presigned URLs)
 * 
 * Manages time-limited secure shareable links.
 * 
 * Backend Architecture Context:
 * - Current deployed API Gateway (SecureVaultAPI) routes: GET /files, POST /files, DELETE /files/{fileId}.
 * - Generating real temporary S3 presigned URLs requires a backend route (such as POST /files/{fileId}/share or POST /shares).
 * - Live AWS mode strictly avoids simulating fake S3 presigned URLs.
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
      revoked: false
    }
  ],

  /**
   * Calculates formatted expiration date string
   */
  getExpirationDateString(minutes) {
    const d = new Date(Date.now() + minutes * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  /**
   * Retrieves list of all shared links
   * @returns {Promise<Array>}
   */
  async listSharedFiles() {
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

    // In Live Mode: only show links if a dedicated backend route is deployed
    const stored = localStorage.getItem('sv_live_shares');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error("Error parsing stored live shares", e);
      }
    }
    return [];
  },

  /**
   * Generates a secure presigned link or tracks it locally in Mock mode
   * @param {string} fileId 
   * @param {number} expiryMinutes Default 5 minutes
   * @returns {Promise<Object>} Share metadata and link
   */
  async generateSecureLink(fileId, expiryMinutes = 5) {
    // In Live Mode: Do not simulate presigned URLs or call nonexistent endpoints
    if (!CONFIG.isMockMode()) {
      throw new Error(
        "Presigned share link generation requires an AWS backend endpoint (e.g., POST /files/{fileId}/share or POST /shares) which is not yet deployed on SecureVaultAPI. Live AWS mode does not fabricate mock S3 presigned URLs."
      );
    }

    const files = await FileService.listFiles();
    const targetFile = files.find(f => (f.id === fileId || f.fileId === fileId));

    if (!targetFile) {
      throw new Error("Target file not found for sharing.");
    }

    const minutesNum = parseInt(expiryMinutes, 10) || 5;
    const expiresDate = this.getExpirationDateString(minutesNum);
    const storageKey = 'sv_mock_shares';

    const shareUrl = `https://${CONFIG.aws.s3BucketName}.s3.${CONFIG.aws.region}.amazonaws.com/${targetFile.s3Key || targetFile.name}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${minutesNum * 60}`;

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
      simulatedUrl: shareUrl,
      revoked: false
    };

    const shares = await this.listSharedFiles();
    const updated = [newShare, ...shares];
    localStorage.setItem(storageKey, JSON.stringify(updated));

    if (window.AuditService) {
      AuditService.logActivity(
        'Share Created',
        targetFile.name,
        `Demo presigned link generated (${minutesNum}m expiration)`,
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
    if (!CONFIG.isMockMode()) {
      throw new Error(
        "Share revocation requires a backend API route (e.g., DELETE /shares/{shareId}) which is not yet implemented on the deployed API Gateway."
      );
    }

    const storageKey = 'sv_mock_shares';
    const shares = await this.listSharedFiles();
    const targetIndex = shares.findIndex(s => s.id === shareId);

    if (targetIndex === -1) {
      throw new Error("Shared link record not found.");
    }

    shares[targetIndex].status = "Revoked";
    shares[targetIndex].revoked = true;
    localStorage.setItem(storageKey, JSON.stringify(shares));

    if (window.AuditService) {
      AuditService.logActivity(
        'Share Revoked',
        shares[targetIndex].fileName,
        `Revoked sharing access for link #${shareId}`,
        'Success'
      );
    }

    return true;
  },

  /**
   * Resets mock shares to default
   */
  resetToDefaults() {
    localStorage.setItem('sv_mock_shares', JSON.stringify(this._defaultShares));
    localStorage.removeItem('sv_live_shares');
    return [...this._defaultShares];
  }
};

window.SharingService = SharingService;
