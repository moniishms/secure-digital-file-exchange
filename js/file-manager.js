/**
 * SecureVault - File Manager Module
 * 
 * Handles file table rendering, search, filtering, sorting,
 * drag-and-drop uploads, deletion modals, and download triggers.
 */

const FileManager = {
  currentFilter: 'all',
  currentSort: 'date-desc',
  searchQuery: '',
  selectedFileForUpload: null,
  fileIdToDelete: null,

  init() {
    this.bindEvents();
    this.bindUploadModalEvents();
    this.bindDeleteModalEvents();
  },

  bindEvents() {
    // Search input
    const searchInput = document.getElementById('fileSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.render();
      });
    }

    // Filter pills
    document.querySelectorAll('.filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.currentFilter = pill.getAttribute('data-filter') || 'all';
        this.render();
      });
    });

    // Sort select
    const sortSelect = document.getElementById('fileSortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.currentSort = e.target.value;
        this.render();
      });
    }

    // Upload buttons that open modal
    document.querySelectorAll('.btn-trigger-upload').forEach(btn => {
      btn.addEventListener('click', () => {
        this.openUploadModal();
      });
    });
  },

  bindUploadModalEvents() {
    const modal = document.getElementById('uploadModal');
    const closeBtn = document.getElementById('closeUploadModalBtn');
    const cancelBtn = document.getElementById('cancelUploadBtn');
    const dropzone = document.getElementById('uploadDropzone');
    const fileInput = document.getElementById('filePickerInput');
    const browseBtn = document.getElementById('browseFilesBtn');
    const submitBtn = document.getElementById('startUploadBtn');

    if (closeBtn) closeBtn.addEventListener('click', () => this.closeUploadModal());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeUploadModal());

    // Browse click
    if (browseBtn && fileInput) {
      browseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
      });
    }

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());

      // Drag and drop handlers
      ['dragenter', 'dragover'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('dragover');
        });
      });

      ['dragleave', 'drop'].forEach(name => {
        dropzone.addEventListener(name, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('dragover');
        });
      });

      dropzone.addEventListener('drop', (e) => {
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          this.handleFileSelected(files[0]);
        }
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.handleFileSelected(e.target.files[0]);
        }
      });
    }

    // Submit upload button
    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        this.executeUpload();
      });
    }
  },

  bindDeleteModalEvents() {
    const modal = document.getElementById('deleteModal');
    const closeBtn = document.getElementById('closeDeleteModalBtn');
    const cancelBtn = document.getElementById('cancelDeleteBtn');
    const confirmBtn = document.getElementById('confirmDeleteBtn');

    const closeModal = () => {
      if (modal) modal.classList.remove('active');
      this.fileIdToDelete = null;
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        if (!this.fileIdToDelete) return;
        try {
          await FileService.deleteFile(this.fileIdToDelete);
          Toast.show('File Deleted', 'The file was removed from storage.', 'info');
          closeModal();
          this.render();
          if (window.App) App.renderDashboard();
        } catch (err) {
          Toast.show('Delete Error', err.message, 'error');
        }
      });
    }
  },

  openUploadModal() {
    const modal = document.getElementById('uploadModal');
    if (!modal) return;
    this.resetUploadModal();
    modal.classList.add('active');
  },

  closeUploadModal() {
    const modal = document.getElementById('uploadModal');
    if (modal) modal.classList.remove('active');
    this.resetUploadModal();
  },

  resetUploadModal() {
    this.selectedFileForUpload = null;
    const fileInput = document.getElementById('filePickerInput');
    if (fileInput) fileInput.value = '';

    const preview = document.getElementById('uploadFilePreview');
    if (preview) preview.classList.remove('active');

    const progressBox = document.getElementById('uploadProgressBox');
    if (progressBox) progressBox.style.display = 'none';

    const errorAlert = document.getElementById('uploadErrorAlert');
    if (errorAlert) errorAlert.style.display = 'none';

    const submitBtn = document.getElementById('startUploadBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span>Upload to S3</span>`;
    }
  },

  handleFileSelected(file) {
    this.selectedFileForUpload = file;
    const preview = document.getElementById('uploadFilePreview');
    const fileNameSpan = document.getElementById('previewFileName');
    const fileSizeSpan = document.getElementById('previewFileSize');
    const errorAlert = document.getElementById('uploadErrorAlert');
    const submitBtn = document.getElementById('startUploadBtn');

    if (!file) return;

    // Check size limit (10 MB strict validation)
    const maxBytes = CONFIG.limits.maxUploadSizeBytes;
    if (file.size > maxBytes) {
      if (errorAlert) {
        errorAlert.style.display = 'block';
        errorAlert.textContent = `File size (${FileService.formatBytes(file.size)}) exceeds the maximum allowed limit of ${CONFIG.limits.maxUploadSizeMB} MB.`;
      }
      if (submitBtn) submitBtn.disabled = true;
      if (preview) preview.classList.remove('active');
      return;
    }

    if (errorAlert) errorAlert.style.display = 'none';

    if (preview && fileNameSpan && fileSizeSpan) {
      fileNameSpan.textContent = file.name;
      fileSizeSpan.textContent = FileService.formatBytes(file.size);
      preview.classList.add('active');
    }

    if (submitBtn) {
      submitBtn.disabled = false;
    }
  },

  async executeUpload() {
    if (!this.selectedFileForUpload) return;

    const classificationSelect = document.getElementById('uploadClassification');
    const classification = classificationSelect ? classificationSelect.value : 'Internal';

    const submitBtn = document.getElementById('startUploadBtn');
    const cancelBtn = document.getElementById('cancelUploadBtn');
    const progressBox = document.getElementById('uploadProgressBox');
    const progressBar = document.getElementById('uploadProgressBar');
    const progressStatus = document.getElementById('uploadProgressStatus');
    const progressPercent = document.getElementById('uploadProgressPercent');

    if (submitBtn) submitBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;
    if (progressBox) progressBox.style.display = 'block';

    try {
      await FileService.uploadFile(
        this.selectedFileForUpload,
        classification,
        (progress) => {
          if (progressBar) progressBar.style.width = `${progress.percentage}%`;
          if (progressPercent) progressPercent.textContent = `${progress.percentage}%`;
          if (progressStatus) progressStatus.textContent = progress.stage;
        }
      );

      Toast.show(
        'Upload Successful',
        `${this.selectedFileForUpload.name} was encrypted and stored.`,
        'success'
      );

      this.closeUploadModal();
      this.render();
      if (window.App) App.renderDashboard();
    } catch (err) {
      Toast.show('Upload Failed', err.message, 'error');
      if (submitBtn) submitBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
    }
  },

  openDeleteModal(fileId, fileName) {
    this.fileIdToDelete = fileId;
    const modal = document.getElementById('deleteModal');
    const targetName = document.getElementById('deleteTargetFileName');
    if (targetName) targetName.textContent = fileName;
    if (modal) modal.classList.add('active');
  },

  /**
   * Helper to categorize file extensions
   */
  getFileCategory(extension) {
    const ext = (extension || '').toLowerCase();
    if (['pdf'].includes(ext)) return 'pdf';
    if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'document';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet';
    if (['ppt', 'pptx'].includes(ext)) return 'presentation';
    if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) return 'archive';
    if (['txt', 'md', 'json', 'js', 'py', 'html', 'css'].includes(ext)) return 'text';
    return 'other';
  },

  async render() {
    const tableBody = document.getElementById('filesTableBody');
    const emptyState = document.getElementById('filesEmptyState');
    if (!tableBody) return;

    let files = await FileService.listFiles();

    // 1. Search filter
    if (this.searchQuery) {
      files = files.filter(f => f.name.toLowerCase().includes(this.searchQuery));
    }

    // 2. Type category filter
    if (this.currentFilter !== 'all') {
      files = files.filter(f => {
        const cat = this.getFileCategory(f.extension);
        if (this.currentFilter === 'pdf') return cat === 'pdf';
        if (this.currentFilter === 'doc') return cat === 'document' || cat === 'presentation';
        if (this.currentFilter === 'archive') return cat === 'archive';
        if (this.currentFilter === 'text') return cat === 'text';
        return true;
      });
    }

    // 3. Sorting
    files.sort((a, b) => {
      if (this.currentSort === 'name-asc') return a.name.localeCompare(b.name);
      if (this.currentSort === 'name-desc') return b.name.localeCompare(a.name);
      if (this.currentSort === 'size-desc') return b.size - a.size;
      if (this.currentSort === 'size-asc') return a.size - b.size;
      if (this.currentSort === 'date-asc') return new Date(a.uploadDate) - new Date(b.uploadDate);
      // default: date-desc
      return new Date(b.uploadDate) - new Date(a.uploadDate);
    });

    if (files.length === 0) {
      tableBody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    tableBody.innerHTML = files.map(file => {
      const ext = file.extension ? file.extension.toUpperCase() : 'FILE';
      const badgeClass = `badge-${file.classification ? file.classification.toLowerCase() : 'internal'}`;
      
      return `
        <tr>
          <td>
            <div class="file-cell">
              <div class="file-type-icon ${file.extension || 'code'}">${ext.slice(0, 4)}</div>
              <div class="file-name-meta">
                <div class="file-primary-name" title="${file.name}">${file.name}</div>
                <div class="file-secondary-meta">SHA-256: ${file.sha256 ? file.sha256.substring(0, 10) + '...' : 'Verified'}</div>
              </div>
            </div>
          </td>
          <td>${file.sizeFormatted}</td>
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
              ${file.status || 'Encrypted'}
            </span>
          </td>
          <td>
            <div class="action-buttons-group">
              <button class="action-btn" title="Download" onclick="FileManager.triggerDownload('${file.id}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
              <button class="action-btn share" title="Share Secure Link" onclick="SharingManager.openShareModal('${file.id}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              </button>
              <button class="action-btn delete" title="Delete File" onclick="FileManager.openDeleteModal('${file.id}', '${file.name.replace(/'/g, "\\'")}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  async triggerDownload(fileId) {
    try {
      await FileService.downloadFile(fileId);
      Toast.show('Secure Download', 'Download initiated via simulated presigned stream.', 'success');
      if (window.App) App.renderDashboard();
    } catch (err) {
      Toast.show('Download Failed', err.message, 'error');
    }
  }
};

window.FileManager = FileManager;
