/**
 * SecureVault - Authentication Service (Mock / Integration Ready)
 * 
 * Provides user identity and session management.
 * In prototype mode, simulates an authenticated session with a realistic fictional user.
 * 
 * AWS Integration Target:
 * - Replace mock state with AWS Cognito Identity SDK or AWS Amplify Auth.
 * - Retrieve real JWT (ID Token / Access Token) to pass in `Authorization: Bearer <token>`
 *   headers for all API Gateway requests.
 */

const AuthService = {
  // Default mock user profile (Fictional, no real credentials)
  _currentUser: {
    id: "usr_8921a9c4",
    name: "Alex Mercer",
    email: "alex.mercer@cyberlab.edu",
    role: "Lead Research Associate",
    department: "Information Security & Cloud Computing",
    mfaEnabled: true,
    avatarUrl: null, // UI will render modern initials avatar
    lastLogin: "2026-10-11 09:42 UTC"
  },

  /**
   * Retrieves the currently active user profile.
   * In AWS integration: Extracts user claims from decoded Cognito ID Token.
   * @returns {Object} User details
   */
  getCurrentUser() {
    const stored = localStorage.getItem('sv_mock_user');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        // Fallback to default
      }
    }
    return { ...this._currentUser };
  },

  /**
   * Checks if user has an active session.
   * In AWS integration: Checks Cognito session validity and refresh token expiration.
   * @returns {boolean}
   */
  isAuthenticated() {
    return true; // Always authenticated in demo prototype
  },

  /**
   * Returns current auth token for API Gateway authorization.
   * In prototype: Returns a formatted mock Bearer token.
   * In AWS integration: Call `cognitoUser.getSession()` to retrieve valid JWT.
   * @returns {string} Bearer token
   */
  getAuthToken() {
    if (CONFIG.isMockMode()) {
      return "Bearer mock_cognito_jwt_eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.demo_token";
    }
    return localStorage.getItem('sv_cognito_token') || "";
  },

  /**
   * Simulates user login.
   * @param {string} username 
   * @param {string} password 
   * @returns {Promise<Object>}
   */
  async login(username, password) {
    if (CONFIG.isMockMode()) {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            success: true,
            user: this.getCurrentUser(),
            message: "Demo authentication successful"
          });
        }, 500);
      });
    }

    // AWS Integration:
    // return cognitoAuth.signIn(username, password);
    throw new Error("AWS Cognito live authentication is not yet configured.");
  },

  /**
   * Simulates user logout.
   * In prototype: Clears session state and triggers UI notification.
   */
  async logout() {
    if (CONFIG.isMockMode()) {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ success: true, message: "Logged out from demo session" });
        }, 300);
      });
    }

    // AWS Integration:
    // return cognitoAuth.signOut();
  },

  /**
   * Updates mock user profile preferences (stored in localStorage)
   * @param {Object} updates 
   */
  updateProfile(updates) {
    const current = this.getCurrentUser();
    const updated = { ...current, ...updates };
    localStorage.setItem('sv_mock_user', JSON.stringify(updated));
    return updated;
  }
};

window.AuthService = AuthService;
