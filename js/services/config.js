/**
 * SecureVault - Configuration & Integration Settings
 *
 * Central configuration file for SecureVault.
 * Defines AWS cloud service parameters (API Gateway, Cognito User Pool, S3 Bucket),
 * operational limits, application modes ('live' vs 'mock'), and runtime storage hooks.
 */

(function () {
  'use strict';

  // Safe localStorage helper to prevent unhandled exceptions in sandboxed or private browsing environments
  const hasLocalStorage = typeof localStorage !== 'undefined';
  const SafeStorage = {
    get(key, defaultValue = '') {
      if (!hasLocalStorage) return defaultValue;
      try {
        const val = localStorage.getItem(key);
        return val !== null ? val : defaultValue;
      } catch (e) {
        console.warn(`[Config] Unable to read '${key}' from localStorage:`, e);
        return defaultValue;
      }
    },
    set(key, value) {
      if (!hasLocalStorage) return;
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        console.warn(`[Config] Unable to write '${key}' to localStorage:`, e);
      }
    },
    remove(key) {
      if (!hasLocalStorage) return;
      try {
        localStorage.removeItem(key);
      } catch (e) {
        console.warn(`[Config] Unable to remove '${key}' from localStorage:`, e);
      }
    }
  };

  // Base fallback URL for OAuth redirects (local dev server is on port 5501)
  const defaultBaseUrl =
    typeof window !== 'undefined' && window.location && window.location.origin
      ? window.location.origin + window.location.pathname
      : 'http://127.0.0.1:5501/';

  // Initial AWS Target Defaults
  const DEFAULTS = {
    appMode: 'live',
    aws: {
      // API Gateway base URL for deployed file management API
      apiGatewayUrl: 'https://lm9zrm2hf4.execute-api.ap-south-1.amazonaws.com',

      // AWS Region for Cognito and backend cloud resources
      region: 'ap-south-1',

      // S3 Storage Bucket for encrypted files
      s3BucketName: 'securevault-files-2026-ms-7391',

      // Amazon Cognito User Pool ID (Region: ap-south-1)
      cognitoPoolId: 'ap-south-1_YkzRnrilr',

      // Amazon Cognito App Client ID (Public client without client secret for SPA PKCE)
      cognitoClientId: '1gm4csh6q4shdsv6oilq0k6h3i',

      // Amazon Cognito Hosted UI Domain
      cognitoDomain: 'ap-south-1ykzrnrilr.auth.ap-south-1.amazoncognito.com',

      // OAuth 2.0 PKCE Redirect / Callback URL
      redirectUri: defaultBaseUrl,

      // OAuth 2.0 Sign-out / Logout URL
      logoutUri: defaultBaseUrl,

      // Preferred Token Type for API Gateway Authorizer:
      // 'id_token': Cognito ID Token (Standard for HTTP API JWT Authorizers matching client ID audience)
      // 'access_token': Cognito Access Token (Used if authorizer specifies custom OAuth scopes)
      tokenType: 'id_token'
    },
    limits: {
      maxUploadSizeBytes: 4 * 1024 * 1024, // 4 MiB (API Gateway / Lambda Base64 ceiling)
      maxUploadSizeMB: 4,
      storageQuotaBytes: 100 * 1024 * 1024, // 100 MB quota
      defaultLinkExpiryMinutes: 5 // 5 minutes default presigned link TTL
    }
  };

  // Known obsolete or template placeholder values that should be purged from localStorage
  // so stale demo settings do not silently override the intended live AWS configuration.
  const OBSOLETE_PATTERNS = [
    'kkwjzgxdf9',
    'secure-file-exchange-pk-2026-7391',
    'ap-south-1_XXXXXXXXX',
    'YOUR_COGNITO',
    'YOUR_COGNITO_APP_CLIENT_ID',
    'YOUR_COGNITO_DOMAIN',
    '127.0.0.1:5500'
  ];

  function getCleanStoredValue(key, defaultValue) {
    const val = SafeStorage.get(key, '');
    if (!val) return defaultValue;
    for (const pattern of OBSOLETE_PATTERNS) {
      if (val.includes(pattern)) {
        SafeStorage.remove(key);
        return defaultValue;
      }
    }
    return val;
  }

  const CONFIG = {
    // App operational mode: 'live' connects to real AWS API Gateway & Cognito.
    // 'mock' uses local browser storage for offline/prototype demonstration.
    appMode: SafeStorage.get('sv_app_mode', DEFAULTS.appMode),

    DEFAULTS,

    aws: {
      apiGatewayUrl:
        getCleanStoredValue('sv_aws_api_url', DEFAULTS.aws.apiGatewayUrl),

      region:
        getCleanStoredValue('sv_aws_region', DEFAULTS.aws.region),

      s3BucketName:
        getCleanStoredValue('sv_aws_s3_bucket', DEFAULTS.aws.s3BucketName),

      cognitoPoolId:
        getCleanStoredValue('sv_aws_cognito_pool_id', DEFAULTS.aws.cognitoPoolId),

      cognitoClientId:
        getCleanStoredValue('sv_aws_cognito_client_id', DEFAULTS.aws.cognitoClientId),

      cognitoDomain:
        getCleanStoredValue('sv_aws_cognito_domain', DEFAULTS.aws.cognitoDomain),

      redirectUri:
        getCleanStoredValue('sv_aws_redirect_uri', DEFAULTS.aws.redirectUri),

      logoutUri:
        getCleanStoredValue('sv_aws_logout_uri', DEFAULTS.aws.logoutUri),

      tokenType:
        getCleanStoredValue('sv_aws_token_type', DEFAULTS.aws.tokenType)
    },

    limits: {
      maxUploadSizeBytes: DEFAULTS.limits.maxUploadSizeBytes,
      maxUploadSizeMB: DEFAULTS.limits.maxUploadSizeMB,
      storageQuotaBytes: DEFAULTS.limits.storageQuotaBytes,
      defaultLinkExpiryMinutes: DEFAULTS.limits.defaultLinkExpiryMinutes
    },

    /**
     * Checks if application is running in mock/offline prototype mode
     * @returns {boolean}
     */
    isMockMode() {
      return this.appMode === 'mock';
    },

    /**
     * Set operational mode ('live' | 'mock')
     * @param {'live' | 'mock'} mode
     */
    setAppMode(mode) {
      this.appMode = mode;
      SafeStorage.set('sv_app_mode', mode);
    },

    /**
     * Update AWS configuration settings and persist overrides to localStorage
     * @param {Object} newConfig
     */
    updateAwsConfig(newConfig = {}) {
      if (newConfig.apiGatewayUrl !== undefined) {
        this.aws.apiGatewayUrl = newConfig.apiGatewayUrl.trim().replace(/\/+$/, '');
        SafeStorage.set('sv_aws_api_url', this.aws.apiGatewayUrl);
      }
      if (newConfig.region !== undefined) {
        this.aws.region = newConfig.region.trim();
        SafeStorage.set('sv_aws_region', this.aws.region);
      }
      if (newConfig.s3BucketName !== undefined) {
        this.aws.s3BucketName = newConfig.s3BucketName.trim();
        SafeStorage.set('sv_aws_s3_bucket', this.aws.s3BucketName);
      }
      if (newConfig.cognitoPoolId !== undefined) {
        this.aws.cognitoPoolId = newConfig.cognitoPoolId.trim();
        SafeStorage.set('sv_aws_cognito_pool_id', this.aws.cognitoPoolId);
      }
      if (newConfig.cognitoClientId !== undefined) {
        this.aws.cognitoClientId = newConfig.cognitoClientId.trim();
        SafeStorage.set('sv_aws_cognito_client_id', this.aws.cognitoClientId);
      }
      if (newConfig.cognitoDomain !== undefined) {
        // Strip protocol prefix and trailing slashes if entered by user
        let domain = newConfig.cognitoDomain.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
        this.aws.cognitoDomain = domain;
        SafeStorage.set('sv_aws_cognito_domain', this.aws.cognitoDomain);
      }
      if (newConfig.redirectUri !== undefined) {
        this.aws.redirectUri = newConfig.redirectUri.trim();
        SafeStorage.set('sv_aws_redirect_uri', this.aws.redirectUri);
      }
      if (newConfig.logoutUri !== undefined) {
        this.aws.logoutUri = newConfig.logoutUri.trim();
        SafeStorage.set('sv_aws_logout_uri', this.aws.logoutUri);
      }
      if (newConfig.tokenType !== undefined) {
        this.aws.tokenType = newConfig.tokenType.trim();
        SafeStorage.set('sv_aws_token_type', this.aws.tokenType);
      }
      if (newConfig.appMode !== undefined) {
        this.setAppMode(newConfig.appMode);
      }
    },

    /**
     * Resets all configuration settings and stored overrides back to initial defaults
     */
    resetToDefaults() {
      const keys = [
        'sv_app_mode',
        'sv_aws_api_url',
        'sv_aws_region',
        'sv_aws_s3_bucket',
        'sv_aws_cognito_pool_id',
        'sv_aws_cognito_client_id',
        'sv_aws_cognito_domain',
        'sv_aws_redirect_uri',
        'sv_aws_logout_uri',
        'sv_aws_token_type'
      ];
      keys.forEach((key) => SafeStorage.remove(key));

      this.appMode = DEFAULTS.appMode;
      this.aws = { ...DEFAULTS.aws };
      this.limits = { ...DEFAULTS.limits };
    }
  };

  // Expose globally to window
  if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
  }

  // Export for module/Node test runners if present
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
  }
})();
