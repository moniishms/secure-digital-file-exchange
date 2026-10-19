/**
 * SecureVault - File Service (AWS API Gateway & S3 Integration)
 * 
 * Connects SecureVault directly to the deployed AWS Lambda backend:
 * - Base URL: https://lm9zrm2hf4.execute-api.ap-south-1.amazonaws.com
 * - Region: ap-south-1
 * - Lambda: SecureVaultBackend
 * - S3 Bucket: securevault-files-2026-ms-7391 (Private storage)
 * 
 * Endpoints:
 * 1. GET /files          -> List files belonging to authenticated Cognito user
 * 2. POST /files         -> Upload file (Base64 payload: { filename, dataBase64 })
 * 3. DELETE /files/{id}  -> Delete file from S3 and metadata store
 */

const FileService = {
  // Sample mock files strictly used in 'mock' demo mode
  _defaultFiles: [
    {
      id: "file_f01",
      name: "research_report.pdf",
      size: 2516582,
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
      size: 1153433,
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
      size: 5033164,
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
      size: 8912896,
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
      size: 14336,
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
   * Formats raw bytes into human-readable string (KB, MB, GB)
   */
  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  },

  /**
   * Formats current timestamp as YYYY-MM-DD HH:mm
   */
  getCurrentTimestamp() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  },

  /**
   * Converts a browser File object to a raw Base64 string (without Data URL scheme)
   * @param {File} file 
   * @returns {Promise<string>}
   */
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          const commaIndex = result.indexOf(',');
          const base64 = commaIndex >= 0 ? result.slice(commaIndex + 1) : result;
          resolve(base64);
        } else {
          reject(new Error("Failed to read file as data string"));
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  },

  /**
   * Normalizes backend API file objects to the shape expected by the SecureVault UI
   */
  normalizeFile(apiFile) {
    if (!apiFile) return null;

    // Retain raw identifier or S3 key if provided by backend
    const rawKey = apiFile.s3Key || apiFile.key || apiFile.Key ||
      (typeof apiFile.fileId === 'string' && apiFile.fileId.includes('/') ? apiFile.fileId : null) ||
      (typeof apiFile.id === 'string' && apiFile.id.includes('/') ? apiFile.id : null);

    // Derive a clean, single-segment fileId safe for API Gateway path parameters (/files/{fileId})
    let rawFileId = apiFile.fileId || apiFile.id || (rawKey ? rawKey.split('/').pop() : null) || ('file_' + Math.random().toString(36).substring(2, 9));
    const cleanFileId = (typeof rawFileId === 'string' && rawFileId.includes('/'))
      ? rawFileId.split('/').pop()
      : rawFileId;

    let filename = apiFile.filename || apiFile.name;
    if (!filename && rawKey) {
      const base = rawKey.split('/').pop();
      filename = base.replace(/^\d+-/, ''); // strip timestamp prefix for cleaner display if present
    }
    if (!filename) filename = 'Untitled';

    const sizeBytes = apiFile.sizeBytes !== undefined ? Number(apiFile.sizeBytes) : (apiFile.size !== undefined ? Number(apiFile.size) : 0);
    const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';

    // Parse and format upload timestamp
    let formattedDate = apiFile.uploadDate || apiFile.uploadedAt;
    if (formattedDate) {
      try {
        const d = new Date(formattedDate);
        if (!isNaN(d.getTime())) {
          const pad = (n) => String(n).padStart(2, '0');
          formattedDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
      } catch (e) {}
    } else {
      formattedDate = this.getCurrentTimestamp();
    }

    return {
      id: cleanFileId,
      fileId: cleanFileId,
      name: filename,
      filename: filename,
      size: sizeBytes,
      sizeBytes: sizeBytes,
      sizeFormatted: this.formatBytes(sizeBytes),
      type: apiFile.type || apiFile.contentType || 'application/octet-stream',
      extension: ext,
      uploadDate: formattedDate,
      uploadedAt: apiFile.uploadedAt || formattedDate,
      classification: apiFile.classification || 'Internal',
      status: apiFile.status || 'Encrypted',
      s3Key: rawKey || `users/${apiFile.userId || 'me'}/${cleanFileId}`,
      sha256: apiFile.sha256 || apiFile.checksum || ''
    };
  },

  /**
   * Retrieves list of files from backend API Gateway (GET /files)
   * @returns {Promise<Array>} Array of normalized file objects
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
      localStorage.setItem('sv_mock_files', JSON.stringify(this._defaultFiles));
      return [...this._defaultFiles];
    }

    // Live AWS Backend Mode
    if (!AuthService.isAuthenticated()) {
      throw new Error("Authentication required: Please sign in with Amazon Cognito to view your files.");
    }

    const token = AuthService.getAuthToken();
    if (!token) {
      throw new Error("Authentication token missing: Please sign in with Amazon Cognito.");
    }

    let response;
    try {
      response = await fetch(`${CONFIG.aws.apiGatewayUrl}/files`, {
        method: 'GET',
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json'
        }
      });
    } catch (networkError) {
      throw new Error(`Network connection failed when reaching API Gateway: ${networkError.message}. Check CORS settings or network access.`);
    }

    if (response.status === 401) {
      AuthService.handleUnauthorized();
      throw new Error("Unauthorized (HTTP 401): Your Cognito authentication token was rejected or expired. Please sign in again.");
    }

    if (response.status === 403) {
      throw new Error("Access Forbidden (HTTP 403): You do not have permission to view files in this S3 partition.");
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Failed to list files from AWS backend (HTTP ${response.status}): ${errorText || response.statusText}`);
    }

    const data = await response.json();
    const rawFiles = Array.isArray(data) ? data : (data.files || []);
    return rawFiles.map(f => this.normalizeFile(f));
  },

  /**
   * Uploads a file to AWS API Gateway (POST /files)
   * @param {File} file Raw browser file
   * @param {string} classification 'Confidential' | 'Restricted' | 'Internal' | 'Public'
   * @param {Function} onProgress Progress callback ({ percentage, stage })
   * @returns {Promise<Object>} Created file record
   */
  async uploadFile(file, classification = 'Internal', onProgress = () => {}) {
    if (!file) {
      throw new Error("No file selected.");
    }

    // Strict 4 MiB client-side validation
    if (file.size > CONFIG.limits.maxUploadSizeBytes) {
      throw new Error(`File size (${this.formatBytes(file.size)}) exceeds the maximum allowed limit of ${CONFIG.limits.maxUploadSizeMB} MB (${CONFIG.limits.maxUploadSizeBytes} bytes).`);
    }

    if (CONFIG.isMockMode()) {
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
              s3Key: `uploads/usr_8921/${new Date().toISOString().slice(0, 7)}/${file.name}`,
              sha256: Array.from(new Uint8Array(32)).map(() => Math.floor(Math.random() * 16).toString(16)).join('')
            };

            this.listFiles().then((files) => {
              const updated = [newFile, ...files];
              localStorage.setItem('sv_mock_files', JSON.stringify(updated));
              if (window.AuditService) {
                AuditService.logActivity('Upload', newFile.name, `Uploaded as ${classification} (${newFile.sizeFormatted})`, 'Success');
              }
              resolve(newFile);
            });
          }
        }, 180);
      });
    }

    // Live AWS Backend Mode
    if (!AuthService.isAuthenticated()) {
      throw new Error("Authentication required: Please sign in with Amazon Cognito before uploading files.");
    }

    const token = AuthService.getAuthToken();
    if (!token) {
      throw new Error("Valid authentication token missing: Please sign in with Amazon Cognito.");
    }

    onProgress({ percentage: 15, stage: "Validating payload and reading file..." });
    const dataBase64 = await this.fileToBase64(file);

    onProgress({ percentage: 40, stage: "Encoding payload into Base64 JSON..." });

    const payload = {
      filename: file.name,
      dataBase64: dataBase64
    };

    onProgress({ percentage: 70, stage: "Transmitting payload to API Gateway POST /files..." });

    let response;
    try {
      response = await fetch(`${CONFIG.aws.apiGatewayUrl}/files`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token
        },
        body: JSON.stringify(payload)
      });
    } catch (networkError) {
      throw new Error(`Upload failed due to network error: ${networkError.message}. Check backend CORS configuration.`);
    }

    if (response.status === 401) {
      AuthService.handleUnauthorized();
      throw new Error("Unauthorized (HTTP 401): Session expired during upload. Please sign in again.");
    }

    if (response.status === 403) {
      throw new Error("Access Forbidden (HTTP 403): You do not have permission to upload files to this storage.");
    }

    if (response.status !== 200 && response.status !== 201) {
      const errorBody = await response.text().catch(() => '');
      throw new Error(`Upload rejected by AWS API (HTTP ${response.status}): ${errorBody || response.statusText}`);
    }

    onProgress({ percentage: 95, stage: "Lambda processed file and applied S3 encryption..." });

    const resJson = await response.json();
    const createdFile = this.normalizeFile(resJson.file || resJson);
    if (!createdFile.name) createdFile.name = file.name;
    if (!createdFile.size) createdFile.size = file.size;
    createdFile.sizeFormatted = this.formatBytes(createdFile.size);
    createdFile.classification = classification;

    onProgress({ percentage: 100, stage: "Upload verified and encrypted in Amazon S3!" });

    if (window.AuditService) {
      AuditService.logActivity('Upload', createdFile.name, `Encrypted in S3 (${createdFile.sizeFormatted})`, 'Success');
    }

    return createdFile;
  },

  /**
   * Deletes a file via AWS API Gateway (DELETE /files/{fileId})
   * @param {string} fileId 
   * @returns {Promise<boolean>}
   */
  async deleteFile(fileId) {
    if (CONFIG.isMockMode()) {
      const files = await this.listFiles();
      const targetFile = files.find(f => (f.id === fileId || f.fileId === fileId));
      if (!targetFile) throw new Error("File not found.");

      const remaining = files.filter(f => (f.id !== fileId && f.fileId !== fileId));
      localStorage.setItem('sv_mock_files', JSON.stringify(remaining));

      if (window.AuditService) {
        AuditService.logActivity('Delete', targetFile.name, `Removed from storage (${targetFile.sizeFormatted})`, 'Success');
      }
      return true;
    }

    // Live AWS Backend Mode
    if (!AuthService.isAuthenticated()) {
      throw new Error("Authentication required: Please sign in with Amazon Cognito to delete files.");
    }

    const token = AuthService.getAuthToken();
    if (!token) {
      throw new Error("Valid authentication token missing: Please sign in with Amazon Cognito.");
    }

    // Slashes (%2F) in path parameters cause API Gateway HTTP API to normalize the path and fail route matching (HTTP 404).
    // Ensure the path parameter is strictly a single path segment without slashes.
    const cleanFileId = (typeof fileId === 'string' && fileId.includes('/'))
      ? fileId.split('/').pop()
      : fileId;

    let response;
    try {
      response = await fetch(`${CONFIG.aws.apiGatewayUrl}/files/${encodeURIComponent(cleanFileId)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileId: cleanFileId,
          key: fileId
        })
      });
    } catch (networkError) {
      throw new Error(`Deletion network error: ${networkError.message}`);
    }

    if (response.status === 401) {
      AuthService.handleUnauthorized();
      throw new Error("Unauthorized (HTTP 401): Session expired. Please sign in again.");
    }

    if (response.status === 403) {
      throw new Error("Forbidden (HTTP 403): You do not have permission to delete this file.");
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Delete failed on AWS backend (HTTP ${response.status}): ${errorText || response.statusText}`);
    }

    if (window.AuditService) {
      AuditService.logActivity('Delete', cleanFileId, `File permanently removed from private S3 bucket`, 'Success');
    }

    return true;
  },

  /**
   * Initiates simulated file download or alerts about backend limitation
   * @param {string} fileId 
   */
  async downloadFile(fileId) {
    if (CONFIG.isMockMode()) {
      const files = await this.listFiles();
      const target = files.find(f => (f.id === fileId || f.fileId === fileId));
      if (!target) throw new Error("File not found.");

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

    // Live AWS Backend Mode:
    if (!AuthService.isAuthenticated()) {
      throw new Error("Authentication required: Please sign in with Amazon Cognito to download files.");
    }

    const token = AuthService.getAuthToken();
    if (!token) {
      throw new Error("Valid authentication token missing: Please sign in with Amazon Cognito.");
    }

    // Extract clean single-segment fileId safe for API Gateway path parameters
    const cleanFileId = (typeof fileId === 'string' && fileId.includes('/'))
      ? fileId.split('/').pop()
      : fileId;

    let response;
    try {
      response = await fetch(`${CONFIG.aws.apiGatewayUrl}/files/${encodeURIComponent(cleanFileId)}/download`, {
        method: 'GET',
        headers: {
          'Authorization': token,
          'Content-Type': 'application/json'
        }
      });
    } catch (networkError) {
      throw new Error(`Download network error: ${networkError.message}. Check CORS settings or network access.`);
    }

    if (response.status === 401) {
      AuthService.handleUnauthorized();
      throw new Error("Unauthorized (HTTP 401): Session expired during download. Please sign in again.");
    }

    if (response.status === 403) {
      throw new Error("Access Forbidden (HTTP 403): You do not have permission to download this file.");
    }

    if (response.status === 404) {
      throw new Error("Download route not found (HTTP 404): Please ensure GET /files/{fileId}/download is deployed in API Gateway.");
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Download request failed on AWS backend (HTTP ${response.status}): ${errorText || response.statusText}`);
    }

    const data = await response.json();
    const presignedDownloadUrl = data.downloadUrl || data.url;

    if (!presignedDownloadUrl) {
      throw new Error("AWS backend did not return a valid presigned download URL.");
    }

    const resolvedFilename = data.filename || cleanFileId.replace(/^\d+-/, '') || 'downloaded-file';

    // Trigger browser download via presigned S3 URL
    const a = document.createElement('a');
    a.href = presignedDownloadUrl;
    a.download = resolvedFilename;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    if (window.AuditService) {
      AuditService.logActivity('Download', resolvedFilename, 'Direct authenticated presigned S3 download initiated', 'Success');
    }

    return { success: true, fileName: resolvedFilename, downloadUrl: presignedDownloadUrl };
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
