/**
 * SecureVault - Configuration & Integration Settings
 * 
 * This file centralizes all backend API endpoints and configuration flags.
 * Teammates implementing the AWS backend can adjust the values here or
 * configure them directly through the Settings UI without modifying UI components.
 */

const CONFIG = {
  // Application Mode: 'mock' (default for prototype) or 'aws-live'
  appMode: localStorage.getItem('sv_app_mode') || 'mock',

  // AWS Integration Settings (Configurable for teammates)
  aws: {
    // API Gateway Base URL (e.g., https://xyz123.execute-api.us-east-1.amazonaws.com/prod)
    apiGatewayUrl: localStorage.getItem('sv_aws_api_url') || '',
    
    // AWS Region where resources are deployed (e.g., 'us-east-1')
    region: localStorage.getItem('sv_aws_region') || 'us-east-1',
    
    // Amazon S3 Bucket Name
    s3BucketName: localStorage.getItem('sv_aws_s3_bucket') || 'securevault-demo-bucket',
    
    // AWS Cognito User Pool Client ID
    cognitoClientId: localStorage.getItem('sv_aws_cognito_client_id') || '',
    
    // AWS Cognito User Pool ID
    cognitoPoolId: localStorage.getItem('sv_aws_cognito_pool_id') || ''
  },

  // Prototype constraints & defaults
  limits: {
    maxUploadSizeBytes: 10 * 1024 * 1024, // 10 MB strict validation
    maxUploadSizeMB: 10,
    storageQuotaBytes: 100 * 1024 * 1024,  // 100 MB demo quota
    defaultLinkExpiryMinutes: 15
  },

  // Helper method to check if running in mock mode
  isMockMode() {
    return this.appMode === 'mock';
  },

  // Update AWS configuration settings
  updateAwsConfig(newConfig) {
    if (newConfig.apiGatewayUrl !== undefined) {
      this.aws.apiGatewayUrl = newConfig.apiGatewayUrl;
      localStorage.setItem('sv_aws_api_url', newConfig.apiGatewayUrl);
    }
    if (newConfig.region !== undefined) {
      this.aws.region = newConfig.region;
      localStorage.setItem('sv_aws_region', newConfig.region);
    }
    if (newConfig.s3BucketName !== undefined) {
      this.aws.s3BucketName = newConfig.s3BucketName;
      localStorage.setItem('sv_aws_s3_bucket', newConfig.s3BucketName);
    }
    if (newConfig.cognitoClientId !== undefined) {
      this.aws.cognitoClientId = newConfig.cognitoClientId;
      localStorage.setItem('sv_aws_cognito_client_id', newConfig.cognitoClientId);
    }
  }
};

window.CONFIG = CONFIG;
