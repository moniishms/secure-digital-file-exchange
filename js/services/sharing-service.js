/**
 * SecureVault - Sharing Service (Mock / Integration Ready)
 * 
 * Manages time-limited secure shareable links.
 * 
 * AWS Integration Target:
 * - Real secure sharing uses Amazon S3 Presigned GET URLs with `ExpiresIn` set between 300 to 3600 seconds.
 * - The backend Lambda signs the request using the IAM execution role credentials without exposing AWS keys.
 * - S3 automatically rejects any request received after the expiration timestamp.
 * - Revocation is recorded in DynamoDB to invalidate links at an API Gateway Lambda authorizer layer.
 */

const SharingService = {
  // Initial demo shared links
  _defaultShares: [
    {
      id: "share_s01",
      fileId: "file_f01",
      fileName: "research_report.pdf",
      fileSize: "2.4 MB",
      classification: "Confidential",
      createdDate: "2026-10-11 08:30",
      expiresDate: "2026-10-11 09:30",
      expiryMinutes: 60,
      status: "Expired", // Expired for demo realism
      simulatedUrl: "https://securevault-demo.local/s3/presigned-get?file=research_report.pdf&token=sv_exp_7f8a9b&expires=1760175000",
      revoked: false
    },
    {
      id: "share_s02",
      fileId: "file_f02",
      fileName: "project_proposal.docx",
      fileSize: "1.1 MB",
      classification: "Internal",
      createdDate: "2026-10-11 10:15",
      expiresDate: "2026-10-11 11:15",
      expiryMinutes: 60,
      status: "Active",
      simulatedUrl: "https://securevault-demo.local/s3/presigned-get?file=project_proposal.docx&token=sv_exp_2c4d6e&expires=1760181300",
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
          console.error("Error parsing stored mock shares", e);
        }
      }
      localStorage.setItem('sv_mock_shares', JSON.stringify(this._defaultShares));
      return [...this._defaultShares];
    }

    // AWS Integration:
    // const res = await fetch(`${CONFIG.aws.apiGatewayUrl}/shares`, {
    //   headers: { Authorization: AuthService.getAuthToken() }
    // });
    // return await res.json();
    throw new Error("AWS API integration pending configuration.");
  },

  /**
   * Generates a simulated secure presigned link
   * @param {string} fileId 
   * @param {number} expiryMinutes 5, 15, or 60
   * @returns {Promise<Object>} Share metadata and simulated link
   */
  async generateSecureLink(fileId, expiryMinutes = 15) {
    const files = await FileService.listFiles();
    const targetFile = files.find(f => f.id === fileId);

    if (!targetFile) {
      throw new Error("Target file not found.");
    }

    const minutesNum = parseInt(expiryMinutes, 10) || 15;
    const expiresDate = this.getExpirationDateString(minutesNum);
    const token = "sv_demo_" + Math.random().toString(36).substring(2, 10);
    const simulatedUrl = `https://securevault-demo.local/s3/presigned-get?file=${encodeURIComponent(targetFile.name)}&token=${token}&expires_in=${minutesNum}m`;

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
      simulatedUrl: simulatedUrl,
      revoked: false
    };

    if (CONFIG.isMockMode()) {
      const shares = await this.listSharedFiles();
      const updated = [newShare, ...shares];
      localStorage.setItem('sv_mock_shares', JSON.stringify(updated));

      if (window.AuditService) {
        AuditService.logActivity('Share Created', targetFile.name, `Temporary link valid for ${minutesNum} min (${expiresDate})`, 'Success');
      }

      return newShare;
    }

    // AWS Integration:
    // const res = await fetch(`${CONFIG.aws.apiGatewayUrl}/shares/generate`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     Authorization: AuthService.getAuthToken()
    //   },
    //   body: JSON.stringify({ fileId, expirySeconds: minutesNum * 60 })
    // });
    // return await res.json();
  },

  /**
   * Revokes an existing shared link
   * @param {string} shareId 
   * @returns {Promise<boolean>}
   */
  async revokeShare(shareId) {
    const shares = await this.listSharedFiles();
    const targetIndex = shares.findIndex(s => s.id === shareId);

    if (targetIndex === -1) {
      throw new Error("Shared link record not found.");
    }

    if (CONFIG.isMockMode()) {
      shares[targetIndex].status = "Revoked";
      shares[targetIndex].revoked = true;
      localStorage.setItem('sv_mock_shares', JSON.stringify(shares));

      if (window.AuditService) {
        AuditService.logActivity('Share Revoked', shares[targetIndex].fileName, `Access revoked for share #${shareId}`, 'Success');
      }

      return true;
    }

    // AWS Integration:
    // await fetch(`${CONFIG.aws.apiGatewayUrl}/shares/${shareId}/revoke`, {
    //   method: 'POST',
    //   headers: { Authorization: AuthService.getAuthToken() }
    // });
    // return true;
  },

  /**
   * Resets mock shares to default
   */
  resetToDefaults() {
    localStorage.setItem('sv_mock_shares', JSON.stringify(this._defaultShares));
    return [...this._defaultShares];
  }
};

window.SharingService = SharingService;
