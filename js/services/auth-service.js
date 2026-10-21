/**
 * SecureVault - Authentication Service (AWS Cognito OAuth 2.0 PKCE & Session Management)
 * 
 * Implements standard OAuth 2.0 Authorization Code flow with PKCE (RFC 7636)
 * for Amazon Cognito User Pools (Region: ap-south-1).
 * 
 * Features:
 * - Pure browser Web Crypto API implementation (zero external dependencies)
 * - Cryptographic code_verifier and code_challenge (S256) generation
 * - Authorization code exchange for ID, Access, and Refresh tokens
 * - Token storage, expiration detection, and refresh handling
 * - JWT claims extraction for authenticated user identity
 * - Strict authentication verification (never treats missing tokens as authenticated)
 * - Configurable token type (ID Token vs Access Token) for API Gateway Authorizer
 */

const AuthService = {
  // Mock user profile strictly for 'mock' demo mode
  _mockUser: {
    id: "usr_8921a9c4",
    name: "Alex Mercer",
    email: "alex.mercer@cyberlab.edu",
    role: "Lead Research Associate",
    department: "Information Security & Cloud Computing",
    mfaEnabled: true,
    avatarUrl: null,
    lastLogin: "2026-10-18 20:30 UTC"
  },

  /**
   * Initialize authentication service on page load:
   * Inspects URL for OAuth 2.0 authorization code callback (?code=...&state=...)
   */
  async init() {
    if (CONFIG.isMockMode()) {
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const error = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');

    if (error) {
      console.error('Cognito OAuth error received:', error, errorDescription);
      this.clearOAuthUrlParams();
      if (window.Toast) {
        Toast.show('Authentication Error', errorDescription || error, 'error', 6000);
      }
      return;
    }

    if (code) {
      await this.handleAuthCallback(code, state);
    } else {
      // Check existing session validity
      await this.validateExistingSession();
    }
  },

  /**
   * Helper: Generate cryptographically random string (for PKCE verifier and state)
   */
  generateRandomString(length = 64) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const randomValues = new Uint8Array(length);
    window.crypto.getRandomValues(randomValues);
    return Array.from(randomValues, byte => charset[byte % charset.length]).join('');
  },

  /**
   * Helper: Generate SHA-256 base64url-encoded code challenge for PKCE
   */
  async generateCodeChallenge(verifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    const bytes = new Uint8Array(digest);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  },

  /**
   * Helper: Decode JWT payload without external libraries
   */
  parseJwt(token) {
    if (!token || typeof token !== 'string') return null;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (e) {
      console.error('Failed to parse JWT payload', e);
      return null;
    }
  },

  /**
   * Cleans code/state/error query params from browser URL after processing
   */
  clearOAuthUrlParams() {
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, cleanUrl);
  },

  /**
   * Handles OAuth 2.0 authorization code exchange
   */
  async handleAuthCallback(code, state) {
    const savedState = sessionStorage.getItem('sv_oauth_state');
    const codeVerifier = sessionStorage.getItem('sv_oauth_verifier');
    const savedRedirectUri = sessionStorage.getItem('sv_oauth_redirect_uri');

    // Clean URL immediately to prevent replay on reload
    this.clearOAuthUrlParams();

    if (!savedState || state !== savedState) {
      const msg = 'OAuth State validation failed. Possible CSRF attack or expired session.';
      console.error(msg, { state, savedState });
      if (window.Toast) Toast.show('Login Failed', msg, 'error', 6000);
      sessionStorage.removeItem('sv_oauth_state');
      sessionStorage.removeItem('sv_oauth_verifier');
      sessionStorage.removeItem('sv_oauth_redirect_uri');
      return;
    }

    if (!codeVerifier) {
      const msg = 'PKCE code verifier not found in session. Please initiate login again.';
      console.error(msg);
      if (window.Toast) Toast.show('Login Failed', msg, 'error', 6000);
      return;
    }

    const domain = CONFIG.aws.cognitoDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const tokenEndpoint = `https://${domain}/oauth2/token`;
    const effectiveRedirectUri = savedRedirectUri || CONFIG.aws.redirectUri;

    const bodyParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CONFIG.aws.cognitoClientId,
      code: code,
      redirect_uri: effectiveRedirectUri,
      code_verifier: codeVerifier
    });

    try {
      if (window.Toast) Toast.show('Authenticating', 'Exchanging authorization code with Cognito...', 'info', 2000);

      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: bodyParams.toString()
      });

      if (!response.ok) {
        let errorMsg = `Cognito token exchange failed (${response.status})`;
        try {
          const errJson = await response.json();
          if (errJson.error_description) {
            errorMsg = errJson.error_description;
          } else if (errJson.error) {
            errorMsg = `Cognito Error: ${errJson.error}`;
          }
        } catch (e) {
          const errorText = await response.text().catch(() => '');
          if (errorText) errorMsg += `: ${errorText}`;
        }
        sessionStorage.removeItem('sv_oauth_state');
        sessionStorage.removeItem('sv_oauth_verifier');
        sessionStorage.removeItem('sv_oauth_redirect_uri');
        throw new Error(errorMsg);
      }

      const tokens = await response.json();

      // Store tokens
      if (tokens.id_token) localStorage.setItem('sv_id_token', tokens.id_token);
      if (tokens.access_token) localStorage.setItem('sv_access_token', tokens.access_token);
      if (tokens.refresh_token) localStorage.setItem('sv_refresh_token', tokens.refresh_token);

      const expiresInSec = tokens.expires_in || 3600;
      const expiresAt = Date.now() + (expiresInSec * 1000);
      localStorage.setItem('sv_token_expires_at', expiresAt.toString());

      // Parse user claims from ID token
      const claims = this.parseJwt(tokens.id_token) || {};
      const userProfile = {
        id: claims.sub || 'usr_cognito',
        name: claims.name || claims['cognito:username'] || claims.email || 'Cognito User',
        email: claims.email || '',
        role: 'Authenticated Research Member',
        department: 'Cloud Security Lab',
        mfaEnabled: true,
        sub: claims.sub,
        lastLogin: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
      };
      localStorage.setItem('sv_cognito_user', JSON.stringify(userProfile));

      // Cleanup PKCE state
      sessionStorage.removeItem('sv_oauth_state');
      sessionStorage.removeItem('sv_oauth_verifier');
      sessionStorage.removeItem('sv_oauth_redirect_uri');

      if (window.Toast) {
        Toast.show('Login Successful', `Authenticated as ${userProfile.name || userProfile.email}`, 'success');
      }

      // Clear any prior account-specific in-memory state
      if (window.FileManager) {
        FileManager.fileIdToDelete = null;
        FileManager.selectedFileForUpload = null;
      }
      if (window.SharingManager) {
        SharingManager.currentFileIdToShare = null;
      }

      // Re-render UI across all modules
      if (window.App) {
        App.renderUserProfile();
        App.renderDashboard();
      }
      if (window.FileManager) FileManager.render();
      if (window.SharingManager) SharingManager.render();
      if (window.ActivityManager) {
        ActivityManager.render();
        AuditService.logActivity('Login', 'Session Started', `User ${userProfile.email} authenticated via Cognito PKCE`, 'Success');
      }
    } catch (err) {
      console.error('Error exchanging token:', err);
      if (window.Toast) {
        Toast.show('Authentication Error', err.message, 'error', 6000);
      }
    }
  },

  /**
   * Validates existing stored session; attempts token refresh if expired
   */
  async validateExistingSession() {
    if (!this.hasTokens()) return;

    const expiresAt = parseInt(localStorage.getItem('sv_token_expires_at') || '0', 10);
    // If expired or expiring within 60 seconds
    if (Date.now() >= (expiresAt - 60000)) {
      const refreshed = await this.refreshToken();
      if (!refreshed) {
        console.warn('Session expired and token refresh failed.');
        this.clearSession();
      }
    }
  },

  /**
   * Refreshes Cognito tokens using stored refresh_token
   */
  async refreshToken() {
    const refreshToken = localStorage.getItem('sv_refresh_token');
    if (!refreshToken) return false;

    const domain = CONFIG.aws.cognitoDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (!domain || domain.includes('YOUR_COGNITO')) return false;

    const tokenEndpoint = `https://${domain}/oauth2/token`;
    const bodyParams = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CONFIG.aws.cognitoClientId,
      refresh_token: refreshToken
    });

    try {
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: bodyParams.toString()
      });

      if (!response.ok) {
        console.warn('Refresh token rejected by Cognito', response.status);
        return false;
      }

      const tokens = await response.json();
      if (tokens.id_token) localStorage.setItem('sv_id_token', tokens.id_token);
      if (tokens.access_token) localStorage.setItem('sv_access_token', tokens.access_token);
      const expiresInSec = tokens.expires_in || 3600;
      localStorage.setItem('sv_token_expires_at', (Date.now() + expiresInSec * 1000).toString());
      return true;
    } catch (e) {
      console.error('Error refreshing token', e);
      return false;
    }
  },

  /**
   * Checks if token strings exist in storage
   */
  hasTokens() {
    return Boolean(localStorage.getItem('sv_id_token') || localStorage.getItem('sv_access_token'));
  },

  /**
   * Checks if user has an active authenticated session.
   * Strictly returns false in live mode if no valid token exists.
   * @returns {boolean}
   */
  isAuthenticated() {
    if (CONFIG.isMockMode()) {
      return true;
    }
    if (!this.hasTokens()) {
      return false;
    }
    const expiresAt = parseInt(localStorage.getItem('sv_token_expires_at') || '0', 10);
    return Date.now() < expiresAt;
  },

  /**
   * Returns current active user profile.
   * In Live mode: extracts claims from Cognito JWT or stored profile.
   * @returns {Object}
   */
  getCurrentUser() {
    if (CONFIG.isMockMode()) {
      const stored = localStorage.getItem('sv_mock_user');
      if (stored) {
        try { return JSON.parse(stored); } catch (e) { }
      }
      return { ...this._mockUser };
    }

    if (!this.isAuthenticated()) {
      return {
        id: null,
        name: 'Guest / Signed Out',
        email: 'Unauthenticated Session',
        role: 'Cognito Authentication Required',
        department: 'AWS ap-south-1',
        mfaEnabled: false,
        isAuthenticated: false
      };
    }

    const storedCognito = localStorage.getItem('sv_cognito_user');
    if (storedCognito) {
      try {
        return JSON.parse(storedCognito);
      } catch (e) { }
    }

    const rawToken = this.getRawToken();
    const claims = this.parseJwt(rawToken) || {};
    return {
      id: claims.sub || 'usr_cognito',
      name: claims.name || claims['cognito:username'] || claims.email || 'Cognito User',
      email: claims.email || '',
      role: 'Authenticated Research Member',
      department: 'Cloud Security Lab',
      mfaEnabled: true,
      sub: claims.sub,
      isAuthenticated: true
    };
  },

  /**
   * Retrieves the raw token string (either ID token or Access token according to configuration)
   */
  getRawToken() {
    const preferAccess = CONFIG.aws.tokenType === 'access_token';
    const primary = preferAccess ? localStorage.getItem('sv_access_token') : localStorage.getItem('sv_id_token');
    const fallback = preferAccess ? localStorage.getItem('sv_id_token') : localStorage.getItem('sv_access_token');
    return primary || fallback || '';
  },

  /**
   * Returns current auth token formatted as Bearer header.
   * Never treats a missing token as authenticated.
   * @returns {string} Bearer token or empty string
   */
  getAuthToken() {
    if (CONFIG.isMockMode()) {
      return "Bearer mock_cognito_jwt_eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.demo_token";
    }

    const rawToken = this.getRawToken();
    if (!rawToken || !this.isAuthenticated()) {
      return "";
    }
    return `Bearer ${rawToken}`;
  },

  /**
   * Initiates Cognito Hosted UI login with PKCE flow
   */
  async login() {
    if (CONFIG.isMockMode()) {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            success: true,
            user: this.getCurrentUser(),
            message: "Demo authentication successful"
          });
        }, 300);
      });
    }

    // Verify required Cognito configuration
    const clientId = CONFIG.aws.cognitoClientId;
    const domain = CONFIG.aws.cognitoDomain ? CONFIG.aws.cognitoDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '') : '';
    const redirectUri = CONFIG.aws.redirectUri;

    const isPlaceholder = !clientId ||
      clientId.includes('YOUR_COGNITO') ||
      !domain ||
      domain.includes('YOUR_COGNITO');

    if (isPlaceholder) {
      if (window.Toast) {
        Toast.show(
          'Cognito Configuration Required',
          'Please set your Cognito App Client ID and Hosted UI Domain in Settings before logging in.',
          'warning',
          6000
        );
      }
      if (window.Navigation) {
        Navigation.switchView('settings');
      }
      return;
    }

    // Generate PKCE code verifier and code challenge
    const codeVerifier = this.generateRandomString(64);
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    const state = this.generateRandomString(32);

    sessionStorage.setItem('sv_oauth_verifier', codeVerifier);
    sessionStorage.setItem('sv_oauth_state', state);
    sessionStorage.setItem('sv_oauth_redirect_uri', redirectUri);

    // Build authorization URL

    const authUrl = `https://${domain}/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&response_type=code&scope=email+openid&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256&state=${encodeURIComponent(state)}`;

    if (window.Toast) {
      Toast.show('Redirecting', 'Navigating to Cognito Hosted UI...', 'info', 2000);
    }

    window.location.href = authUrl;
  },

  /**
   * Logs out user: clears local session and redirects to Cognito logout if configured
   */
  async logout() {
    if (CONFIG.isMockMode()) {
      if (window.Toast) {
        Toast.show('Demo Logout', 'Signed out from simulated demo session.', 'info');
      }
      return;
    }

    const domain = CONFIG.aws.cognitoDomain ? CONFIG.aws.cognitoDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '') : '';
    const clientId = CONFIG.aws.cognitoClientId;
    const logoutUri = CONFIG.aws.logoutUri;

    this.clearSession();

    if (window.AuditService) {
      AuditService.logActivity('Logout', 'Session Terminated', 'User logged out', 'Success');
    }

    const isPlaceholder = !clientId || clientId.includes('YOUR_COGNITO') || !domain || domain.includes('YOUR_COGNITO');
    if (!isPlaceholder && logoutUri) {
      const cognitoLogoutUrl = `https://${domain}/logout?client_id=${encodeURIComponent(clientId)}&logout_uri=${encodeURIComponent(logoutUri)}`;
      window.location.href = cognitoLogoutUrl;
      return;
    }

    if (window.Toast) {
      Toast.show('Signed Out', 'You have been signed out of SecureVault.', 'info');
    }
    if (window.App) {
      App.renderUserProfile();
      App.renderDashboard();
    }
    if (window.FileManager) FileManager.render();
    if (window.SharingManager) SharingManager.render();
    if (window.ActivityManager) ActivityManager.render();
  },

  /**
   * Clears tokens, cached user claims, and account-specific in-memory state
   */
  clearSession() {
    localStorage.removeItem('sv_id_token');
    localStorage.removeItem('sv_access_token');
    localStorage.removeItem('sv_refresh_token');
    localStorage.removeItem('sv_token_expires_at');
    localStorage.removeItem('sv_cognito_user');
    try {
      localStorage.removeItem('sv_live_shares');
    } catch (e) {}

    // Clear account-specific in-memory UI state
    if (window.FileManager) {
      FileManager.fileIdToDelete = null;
      FileManager.selectedFileForUpload = null;
    }
    if (window.SharingManager) {
      SharingManager.currentFileIdToShare = null;
    }
  },

  /**
   * Handles HTTP 401 Unauthorized responses from backend API
   */
  handleUnauthorized() {
    if (CONFIG.isMockMode()) return;
    this.clearSession();
    if (window.Toast) {
      Toast.show(
        'Session Expired / Unauthorized',
        'Your Cognito session is invalid or expired (HTTP 401). Please sign in again.',
        'warning',
        5000
      );
    }
    if (window.App) {
      App.renderUserProfile();
      App.renderDashboard();
    }
    if (window.FileManager) FileManager.render();
    if (window.SharingManager) SharingManager.render();
    if (window.ActivityManager) ActivityManager.render();
  },

  /**
   * Updates mock user profile preferences (stored in localStorage)
   * @param {Object} updates 
   */
  updateProfile(updates) {
    if (CONFIG.isMockMode()) {
      const current = this.getCurrentUser();
      const updated = { ...current, ...updates };
      localStorage.setItem('sv_mock_user', JSON.stringify(updated));
      return updated;
    }
    const current = this.getCurrentUser();
    const updated = { ...current, ...updates };
    localStorage.setItem('sv_cognito_user', JSON.stringify(updated));
    return updated;
  }
};

window.AuthService = AuthService;
