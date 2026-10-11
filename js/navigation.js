/**
 * SecureVault - Navigation & View Routing Module
 * 
 * Handles switching between dashboard, files, shared, activity, security, and settings views.
 * Supports URL hash navigation, mobile sidebar drawer, and breadcrumbs.
 */

const Navigation = {
  activeView: 'dashboard',

  viewTitles: {
    dashboard: 'Dashboard Overview',
    files: 'My Files & Storage',
    shared: 'Shared Files & Links',
    activity: 'Recent Activity & Audit',
    security: 'Security Architecture',
    settings: 'Settings & Integration'
  },

  init() {
    this.bindEvents();
    
    // Support initial hash routing
    const initialHash = window.location.hash.replace('#', '');
    if (initialHash && this.viewTitles[initialHash]) {
      this.switchView(initialHash);
    } else {
      this.switchView('dashboard');
    }

    // Handle browser back/forward
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && this.viewTitles[hash] && hash !== this.activeView) {
        this.switchView(hash, false);
      }
    });
  },

  bindEvents() {
    // Nav items click handler
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const targetView = item.getAttribute('data-view');
        if (targetView) {
          this.switchView(targetView);
          this.closeMobileSidebar();
        }
      });
    });

    // Mobile menu toggle
    const toggleBtn = document.getElementById('mobileMenuToggle');
    const sidebar = document.getElementById('appSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');

    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
        if (backdrop) backdrop.classList.toggle('active');
      });
    }

    if (backdrop) {
      backdrop.addEventListener('click', () => {
        this.closeMobileSidebar();
      });
    }

    // Topbar search input focus jump to files
    const topbarSearch = document.getElementById('topbarSearchInput');
    if (topbarSearch) {
      topbarSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = topbarSearch.value.trim();
          this.switchView('files');
          const fileSearchInput = document.getElementById('fileSearchInput');
          if (fileSearchInput) {
            fileSearchInput.value = val;
            fileSearchInput.dispatchEvent(new Event('input'));
          }
        }
      });
    }
  },

  closeMobileSidebar() {
    const sidebar = document.getElementById('appSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    if (sidebar) sidebar.classList.remove('mobile-open');
    if (backdrop) backdrop.classList.remove('active');
  },

  /**
   * Switches to a designated view section
   * @param {string} viewId 
   * @param {boolean} updateHash 
   */
  switchView(viewId, updateHash = true) {
    if (!this.viewTitles[viewId]) return;

    this.activeView = viewId;

    if (updateHash) {
      window.location.hash = viewId;
    }

    // Update active state in sidebar
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.getAttribute('data-view') === viewId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Toggle active view container
    document.querySelectorAll('.view-section').forEach(section => {
      if (section.id === `view-${viewId}`) {
        section.classList.add('active');
      } else {
        section.classList.remove('active');
      }
    });

    // Update Topbar Breadcrumb
    const breadcrumbElem = document.getElementById('breadcrumbCurrent');
    if (breadcrumbElem) {
      breadcrumbElem.textContent = this.viewTitles[viewId];
    }

    // Notify listeners or view modules to refresh their respective contents
    if (viewId === 'dashboard' && window.App) App.renderDashboard();
    if (viewId === 'files' && window.FileManager) FileManager.render();
    if (viewId === 'shared' && window.SharingManager) SharingManager.render();
    if (viewId === 'activity' && window.ActivityManager) ActivityManager.render();
  }
};

window.Navigation = Navigation;
