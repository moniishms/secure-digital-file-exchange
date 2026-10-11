/**
 * SecureVault - File Service (Mock / Integration Ready)
 * 
 * Manages file uploads, listing, downloads, and deletions.
 * In prototype mode, simulates AWS S3 interactions with local persistence.
 * 
 * AWS Integration Target:
 * 1. listFiles(): GET /files via API Gateway -> Lambda -> S3 Bucket ListObjectsV2 / DynamoDB.
 * 2. uploadFile():
 *    Step A: POST /files/upload-request -> Lambda returns S3 Presigned PUT URL.
 *    Step B: PUT file directly to S3 Presigned URL (zero server bandwidth).
 *    Step C: POST /files/confirm -> Lambda records metadata in DynamoDB.
 * 3. downloadFile(): GET /files/{id}/download-url -> Lambda returns time-limited S3 Presigned GET URL.
 * 4. deleteFile(): DELETE /files/{id} -> Lambda deletes S3 object & DynamoDB record.
 */

const FileService = {
  // Default mock files provided on first load
  _defaultFiles: [
    {
      id: "file_f01",
      name: "research_report.pdf",
      size: 2516582, // 2.4 MB
      sizeFormatted: "2.4 MB",
      type: "application/pdf",
      extension: "pdf",
      uploadDate: "2026-10-10 14:32",
      classification: "Confidential",
      status: "Encrypted",
      s3Key: "uploads/usr_8921/2026-10/research_report_enc.pdf",
      sha256: "a3f5c7199c0d285b73917469a4d85e7293a6e812d45c63ef9081bb23190ab76e"
    },
    {
      id: "file_f02",
      name: "project_proposal.docx",
      size: 1153433, // 1.1 MB
      sizeFormatted: "1.1 MB",
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extension: "docx",
      uploadDate: "2026-10-09 11:15",
      classification: "Internal",
      status: "Encrypted",
      s3Key: "uploads/usr_8921/2026-10/project_proposal_enc.docx",
      sha256: "9b32c6a47e12f00a582914db83920cda4f61e71239857d4cb9842a1708234ea5"
    },
    {
      id: "file_f03",
      name: "presentation.pptx",
      size: 5033164, // 4.8 MB
      sizeFormatted: "4.8 MB",
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      extension: "pptx",
      uploadDate: "2026-10-08 16:45",
      classification: "Restricted",
      status: "Encrypted",
      s3Key: "uploads/usr_8921/2026-10/presentation_enc.pptx",
      sha256: "3e5a7b9c1d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2f4a"
    },
    {
      id: "file_f04",
      name: "dataset.zip",
      size: 8912896, // 8.5 MB
      sizeFormatted: "8.5 MB",
      type: "application/zip",
      extension: "zip",
      uploadDate: "2026-10-07 09:20",
      classification: "Confidential",
      status: "Encrypted",
      s3Key: "uploads/usr_8921/2026-10/dataset_enc.zip",
      sha256: "7c1e3a5b9d2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c"
    },
    {
      id: "file_f05",
      name: "meeting_notes.txt",
      size: 14336, // 14 KB
      sizeFormatted: "14 KB",
      type: "text/plain",
      extension: "txt",
      uploadDate: "2026-10-06 17:05",
      classification: "Public",
      status: "Encrypted",
      s3Key: "uploads/usr_8921/2026-10/meeting_notes_enc.txt",
      sha256: "4b6d8f0a2c4e6b8d0f2a4c6e8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2e4b6d"
    }
  ],

  /**
   * Helper to format bytes into readable units
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  },

  /**
   * Helper to format current date/time
   */
  getCurrentTimestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  },

  /**
   * Retrieves list of all files
   * @returns {Promise<Array>} Array of file objects
   */
  async listFiles() {
    if (CONFIG.isMockMode()) {
      const stored = localStorage.getItem('sv_mock_files');
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error("Error parsing stored mock files", e);
        }
      }
      // Initialize with default files
      localStorage.setItem('sv_mock_files', JSON.stringify(this._defaultFiles));
      return [...this._defaultFiles];
    }

    // AWS Integration:
    // const res = await fetch(`${CONFIG.aws.apiGatewayUrl}/files`, {
    //   headers: { Authorization: AuthService.getAuthToken() }
    // });
    // return await res.json();
    throw new Error("AWS API integration pending configuration.");
  },

  /**
   * Simulates an upload to S3 with progress callbacks
   * @param {File} file Raw browser file
   * @param {string} classification 'Confidential' | 'Restricted' | 'Internal' | 'Public'
   * @param {Function} onProgress Progress callback ({ percentage, stage })
   * @returns {Promise<Object>} Created file record
   */
  async uploadFile(file, classification = 'Internal', onProgress = () => {}) {
    // 1. Strict validation
    if (!file) {
      throw new Error("No file selected.");
    }
    if (file.size > CONFIG.limits.maxUploadSizeBytes) {
      throw new Error(`File size exceeds maximum limit of ${CONFIG.limits.maxUploadSizeMB} MB. Selected file is ${this.formatBytes(file.size)}.`);
    }

    if (CONFIG.isMockMode()) {
      // Realistic simulation with multi-stage progress
      return new Promise((resolve) => {
        let percent = 0;
        
        onProgress({ percentage: 10, stage: "Calculating SHA-256 hash & validating payload..." });

        const interval = setInterval(() => {
          percent += 20;
          if (percent === 30) {
            onProgress({ percentage: 35, stage: "Requesting S3 Presigned Upload URL..." });
          } else if (percent === 50) {
            onProgress({ percentage: 65, stage: "Streaming encrypted chunks to Amazon S3 (Simulated)..." });
          } else if (percent === 70) {
            onProgress({ percentage: 85, stage: "Applying Server-Side KMS Encryption..." });
          } else if (percent >= 100) {
            clearInterval(interval);
            onProgress({ percentage: 100, stage: "Upload verified and finalized!" });

            const ext = file.name.split('.').pop().toLowerCase();
            const newFile = {
              id: "file_" + Math.random().toString(36).substr(2, 9),
              name: file.name,
              size: file.size,
              sizeFormatted: this.formatBytes(file.size),
              type: file.type || "application/octet-stream",
              extension: ext,
              uploadDate: this.getCurrentTimestamp(),
              classification: classification || "Internal",
              status: "Encrypted",
              s3Key: `uploads/usr_8921/${new Date().toISOString().slice(0,7)}/${file.name}`,
              sha256: Array.from(new Uint8Array(32)).map(() => Math.floor(Math.random()*16).toString(16)).join('')
            };

            // Save to mock storage
            this.listFiles().then((files) => {
              const updated = [newFile, ...files];
              localStorage.setItem('sv_mock_files', JSON.stringify(updated));
              
              // Record in audit log
              if (window.AuditService) {
                AuditService.logActivity('Upload', newFile.name, `Uploaded as ${classification} (${newFile.sizeFormatted})`, 'Success');
              }
              
              resolve(newFile);
            });
          }
        }, 180);
      });
    }

    // AWS Integration:
    // Step 1: Request presigned PUT URL from API Gateway
    // const presignRes = await fetch(`${CONFIG.aws.apiGatewayUrl}/files/presign-upload`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     Authorization: AuthService.getAuthToken()
    //   },
    //   body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, classification })
    // });
    // const { uploadUrl, fileId, s3Key } = await presignRes.json();
    //
    // Step 2: Upload directly to S3 via PUT request with progress
    // return new Promise((resolve, reject) => {
    //   const xhr = new XMLHttpRequest();
    //   xhr.open('PUT', uploadUrl, true);
    //   xhr.setRequestHeader('Content-Type', file.type);
    //   xhr.upload.onprogress = (e) => {
    //     if (e.lengthComputable) {
    //       const percentage = Math.round((e.loaded / e.total) * 100);
    //       onProgress({ percentage, stage: `Uploading to S3 (${percentage}%)...` });
    //     }
    //   };
    //   xhr.onload = async () => {
    //     if (xhr.status === 200) {
    //       // Step 3: Confirm with API Gateway
    //       const confirmRes = await fetch(`${CONFIG.aws.apiGatewayUrl}/files/confirm`, {
    //         method: 'POST',
    //         headers: { 'Content-Type': 'application/json', Authorization: AuthService.getAuthToken() },
    //         body: JSON.stringify({ fileId, s3Key, filename: file.name })
    //       });
    //       resolve(await confirmRes.json());
    //     } else {
    //       reject(new Error("S3 Upload Failed with status " + xhr.status));
    //     }
    //   };
    //   xhr.onerror = () => reject(new Error("Network error during S3 upload."));
    //   xhr.send(file);
    // });
  },

  /**
   * Deletes a file by ID
   * @param {string} fileId 
   * @returns {Promise<boolean>}
   */
  async deleteFile(fileId) {
    const files = await this.listFiles();
    const targetFile = files.find(f => f.id === fileId);
    
    if (!targetFile) {
      throw new Error("File not found.");
    }

    if (CONFIG.isMockMode()) {
      const remaining = files.filter(f => f.id !== fileId);
      localStorage.setItem('sv_mock_files', JSON.stringify(remaining));

      if (window.AuditService) {
        AuditService.logActivity('Delete', targetFile.name, `Removed from storage (${targetFile.sizeFormatted})`, 'Success');
      }

      return true;
    }

    // AWS Integration:
    // await fetch(`${CONFIG.aws.apiGatewayUrl}/files/${fileId}`, {
    //   method: 'DELETE',
    //   headers: { Authorization: AuthService.getAuthToken() }
    // });
    // return true;
  },

  /**
   * Initiates simulated file download
   * @param {string} fileId 
   */
  async downloadFile(fileId) {
    const files = await this.listFiles();
    const target = files.find(f => f.id === fileId);
    if (!target) throw new Error("File not found.");

    if (CONFIG.isMockMode()) {
      // Create a mock simulated file download using a client-side Blob
      const mockContent = `[SecureVault Demo File Archive]\n\n` +
        `Filename: ${target.name}\n` +
        `Security Classification: ${target.classification}\n` +
        `Original Simulated Size: ${target.sizeFormatted}\n` +
        `Simulated S3 Storage Key: ${target.s3Key}\n` +
        `Simulated SHA-256 Hash: ${target.sha256}\n` +
        `Downloaded At: ${this.getCurrentTimestamp()}\n\n` +
        `NOTE: This is a simulated download generated locally by the SecureVault prototype.\n` +
        `In production, an Amazon S3 pre-signed GET URL will securely stream the original binary file.`;

      const blob = new Blob([mockContent], { type: 'text/plain;charset=utf-8' });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = target.name.endsWith('.txt') ? target.name : `${target.name}.demo.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      if (window.AuditService) {
        AuditService.logActivity('Download', target.name, `Simulated secure download completed`, 'Success');
      }

      return { success: true, fileName: target.name };
    }

    // AWS Integration:
    // const res = await fetch(`${CONFIG.aws.apiGatewayUrl}/files/${fileId}/download-url`, {
    //   headers: { Authorization: AuthService.getAuthToken() }
    // });
    // const { presignedGetUrl } = await res.json();
    // window.open(presignedGetUrl, '_blank');
  },

  /**
   * Resets mock files to default initial state
   */
  resetToDefaults() {
    localStorage.setItem('sv_mock_files', JSON.stringify(this._defaultFiles));
    return [...this._defaultFiles];
  }
};

window.FileService = FileService;
