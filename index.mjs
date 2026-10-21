/**
 * SecureVault - AWS Lambda Backend Handler (SecureVaultBackend)
 * 
 * Handles API Gateway HTTP API (SecureVaultAPI) routes:
 * 1. GET /files                 - List files strictly for the authenticated Cognito user
 * 2. POST /files                - Upload file to user's private S3 partition (Base64 payload, max 4 MiB)
 * 3. GET /files/{fileId}/download - Generate time-limited S3 presigned GET URL for authenticated download
 * 4. POST /files/{fileId}/share   - Generate time-limited S3 presigned GET URL for secure sharing (configurable TTL)
 * 5. DELETE /files/{fileId}     - Delete file strictly belonging to the authenticated Cognito user
 * 
 * Security:
 * - Derives user identity strictly from verified Cognito JWT claims (sub).
 * - Never trusts client-supplied user IDs or full S3 paths for authorization.
 * - Confines all S3 operations to the authenticated user's prefix: users/{userId}/.
 * - Verifies file ownership and existence strictly via HeadObject prior to generating download/share links or deleting.
 * - Prevents path traversal vulnerabilities using robust sanitization across Windows and POSIX separators.
 * - Generates globally unique file IDs incorporating timestamp and cryptographic entropy.
 * - S3 bucket remains strictly private; downloads and shares use temporary presigned URLs.
 */

import { S3Client, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import path from 'path';
import crypto from 'crypto';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'securevault-files-2026-ms-7391';

const DEFAULT_CORS_ORIGIN = 'http://127.0.0.1:5501';

function getCorsHeaders(event) {
  const reqOrigin = event?.headers?.origin || event?.headers?.Origin;
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': reqOrigin || DEFAULT_CORS_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type'
  };
}

/**
 * Sanitizes a client-supplied file identifier to prevent path traversal and ensure a single clean segment.
 * Rejects traversal characters ('..', '/', '\\') and empty values.
 */
function sanitizeFileId(rawFileId) {
  if (!rawFileId || typeof rawFileId !== 'string') return null;
  const decoded = decodeURIComponent(rawFileId);
  // Normalize both POSIX and Windows path separators before extracting the basename
  const clean = path.basename(decoded.replace(/\\/g, '/')).trim();
  if (!clean || clean === '.' || clean === '..' || clean.includes('/') || clean.includes('\\')) {
    return null;
  }
  return clean;
}

/**
 * Verifies that a file exists strictly within the authenticated user's private S3 partition.
 */
async function verifyFileOwnership(s3Client, bucket, userId, cleanFileId) {
  const s3Key = `users/${userId}/${cleanFileId}`;
  try {
    const headCmd = new HeadObjectCommand({
      Bucket: bucket,
      Key: s3Key
    });
    await s3Client.send(headCmd);
    return { exists: true, s3Key };
  } catch (err) {
    return { exists: false, s3Key, error: err };
  }
}

export const handler = async (event, context = {}, clientOverride = null) => {
  const CORS_HEADERS = getCorsHeaders(event);
  const method = event.requestContext?.http?.method || event.httpMethod;
  const activeS3 = clientOverride || s3;

  // 1. CORS Preflight
  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: CORS_HEADERS
    };
  }

  // 2. Authenticated Identity Verification
  // Extract user ID (sub) strictly from verified Cognito JWT claims
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  const userId = claims?.sub;

  if (!userId) {
    return {
      statusCode: 401,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: 'Unauthorized: Missing or invalid Cognito JWT claims' })
    };
  }

  const rawPath = event.requestContext?.http?.path || event.rawPath || event.path || '';

  try {
    // -------------------------------------------------------------
    // Route 1: GET /files - List files belonging to the authenticated user
    // -------------------------------------------------------------
    if (method === 'GET' && (rawPath === '/files' || rawPath === '/files/')) {
      const prefix = `users/${userId}/`;
      const listCmd = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix
      });

      const s3Response = await activeS3.send(listCmd);
      const objects = s3Response.Contents || [];

      const files = objects
        .filter((obj) => obj.Key && obj.Key !== prefix && !obj.Key.endsWith('/'))
        .map((obj) => {
          // File identifier is the single path segment within the user's partition
          const fileId = obj.Key.split('/').pop() || 'Untitled';
          const displayName = fileId.replace(/^\d+-(?:[a-f0-9]+-)?/, '');

          return {
            id: fileId,
            fileId: fileId,
            name: displayName,
            filename: displayName,
            size: obj.Size,
            sizeBytes: obj.Size,
            uploadedAt: obj.LastModified ? obj.LastModified.toISOString() : new Date().toISOString(),
            s3Key: obj.Key
          };
        });

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ files })
      };
    }

    // ----------------------------------------------------------------------------------
    // Route 2: GET /files/{fileId}/download - Generate short-lived S3 presigned GET URL
    // ----------------------------------------------------------------------------------
    if (method === 'GET' && (rawPath.endsWith('/download') || event.routeKey === 'GET /files/{fileId}/download')) {
      let rawFileId = event.pathParameters?.fileId;
      if (!rawFileId) {
        // Fallback: extract from URL path /files/{fileId}/download
        const match = rawPath.match(/^\/files\/([^/]+)\/download$/);
        if (match) rawFileId = match[1];
      }

      const cleanFileId = sanitizeFileId(rawFileId);
      if (!cleanFileId) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: 'Invalid or missing fileId parameter' })
        };
      }

      // Verify file ownership and existence strictly within the authenticated user's partition
      const { exists, s3Key } = await verifyFileOwnership(activeS3, BUCKET_NAME, userId, cleanFileId);
      if (!exists) {
        return {
          statusCode: 404,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: 'File not found in your vault partition' })
        };
      }

      const downloadFilename = cleanFileId.replace(/^\d+-(?:[a-f0-9]+-)?/, '');

      // Generate a short-lived presigned GET URL (300 seconds = 5 minutes)
      const getCmd = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        ResponseContentDisposition: `attachment; filename="${downloadFilename}"`
      });

      const downloadUrl = await getSignedUrl(activeS3, getCmd, { expiresIn: 300 });

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          downloadUrl,
          fileId: cleanFileId,
          filename: downloadFilename,
          expiresIn: 300
        })
      };
    }

    // ----------------------------------------------------------------------------------
    // Route 3: POST /files/{fileId}/share (and GET /files/{fileId}/share)
    // Generate time-limited S3 presigned GET URL for secure file sharing
    // ----------------------------------------------------------------------------------
    if ((method === 'POST' || method === 'GET') && (rawPath.endsWith('/share') || event.routeKey?.includes('/share'))) {
      let rawFileId = event.pathParameters?.fileId;
      if (!rawFileId) {
        // Fallback: extract from URL path /files/{fileId}/share
        const match = rawPath.match(/^\/files\/([^/]+)\/share$/);
        if (match) rawFileId = match[1];
      }

      const cleanFileId = sanitizeFileId(rawFileId);
      if (!cleanFileId) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: 'Invalid or missing fileId parameter' })
        };
      }

      // Verify file ownership and existence strictly within the authenticated user's partition
      const { exists, s3Key } = await verifyFileOwnership(activeS3, BUCKET_NAME, userId, cleanFileId);
      if (!exists) {
        return {
          statusCode: 404,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: 'File not found in your vault partition' })
        };
      }

      const downloadFilename = cleanFileId.replace(/^\d+-(?:[a-f0-9]+-)?/, '');

      // Parse and validate requested validity period
      let body = {};
      if (event.body) {
        try {
          body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
        } catch (e) {}
      }

      // Determine requested expiry in seconds
      // Safe boundaries: Minimum: 60s (1m), Maximum: 86400s (24h), Default: 900s (15m)
      const MIN_EXPIRY_SECONDS = 60;
      const MAX_EXPIRY_SECONDS = 86400;
      const DEFAULT_EXPIRY_SECONDS = 900;

      let expirySeconds = DEFAULT_EXPIRY_SECONDS;
      const queryExpiryMinutes = event.queryStringParameters?.expiryMinutes;
      const queryExpiresIn = event.queryStringParameters?.expiresIn;

      if (body.expiresIn !== undefined) {
        const parsed = parseInt(body.expiresIn, 10);
        if (!isNaN(parsed)) expirySeconds = parsed;
      } else if (body.expiryMinutes !== undefined) {
        const parsed = parseInt(body.expiryMinutes, 10);
        if (!isNaN(parsed)) expirySeconds = parsed * 60;
      } else if (queryExpiresIn !== undefined) {
        const parsed = parseInt(queryExpiresIn, 10);
        if (!isNaN(parsed)) expirySeconds = parsed;
      } else if (queryExpiryMinutes !== undefined) {
        const parsed = parseInt(queryExpiryMinutes, 10);
        if (!isNaN(parsed)) expirySeconds = parsed * 60;
      }

      // Handle invalid or out-of-range values safely
      if (isNaN(expirySeconds) || expirySeconds < MIN_EXPIRY_SECONDS) {
        expirySeconds = DEFAULT_EXPIRY_SECONDS;
      } else if (expirySeconds > MAX_EXPIRY_SECONDS) {
        expirySeconds = MAX_EXPIRY_SECONDS;
      }

      // Generate the time-limited presigned S3 GET URL
      const getCmd = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        ResponseContentDisposition: `inline; filename="${downloadFilename}"`
      });

      const shareUrl = await getSignedUrl(activeS3, getCmd, { expiresIn: expirySeconds });
      const expiresDate = new Date(Date.now() + expirySeconds * 1000).toISOString();

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          shareUrl,
          downloadUrl: shareUrl,
          fileId: cleanFileId,
          filename: downloadFilename,
          expiresIn: expirySeconds,
          expiresDate,
          expiryMinutes: Math.round(expirySeconds / 60)
        })
      };
    }

    // -------------------------------------------------------------
    // Route 4: POST /files - Upload file to user's private S3 partition
    // -------------------------------------------------------------
    if (method === 'POST' && (rawPath === '/files' || rawPath === '/files/')) {
      if (!event.body) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: 'Missing request body' })
        };
      }

      const body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
      const rawFilename = path.basename((body.filename || 'upload.bin').replace(/\\/g, '/')).trim();
      const dataBase64 = body.dataBase64;

      if (!dataBase64) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: 'dataBase64 payload is required' })
        };
      }

      const buffer = Buffer.from(dataBase64, 'base64');
      const MAX_UPLOAD_SIZE = 4 * 1024 * 1024; // 4 MiB limit
      if (buffer.length > MAX_UPLOAD_SIZE) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: `File size exceeds 4 MiB ceiling (${buffer.length} bytes)` })
        };
      }

      // Globally unique file ID: timestamp + cryptographically random UUID entropy + sanitized filename
      const uniqueEntropy = crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).substring(2, 10);
      const fileId = `${Date.now()}-${uniqueEntropy}-${rawFilename}`;
      const s3Key = `users/${userId}/${fileId}`;

      const putCmd = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: buffer,
        ServerSideEncryption: 'AES256'
      });

      await activeS3.send(putCmd);

      return {
        statusCode: 201,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          message: 'File uploaded successfully',
          file: {
            id: fileId,
            fileId: fileId,
            name: rawFilename,
            filename: rawFilename,
            size: buffer.length,
            sizeBytes: buffer.length,
            uploadedAt: new Date().toISOString(),
            s3Key: s3Key
          }
        })
      };
    }

    // ----------------------------------------------------------------------------------
    // Route 5: DELETE /files/{fileId} - Delete file strictly within user's S3 partition
    // ----------------------------------------------------------------------------------
    if (method === 'DELETE' && (rawPath.startsWith('/files/') || event.pathParameters?.fileId)) {
      // Extract file identifier from pathParameters or body
      let rawFileId = event.pathParameters?.fileId;
      if (!rawFileId && event.body) {
        try {
          const parsed = JSON.parse(event.body);
          rawFileId = parsed.fileId || parsed.key;
        } catch (e) {}
      }

      const cleanFileId = sanitizeFileId(rawFileId);
      if (!cleanFileId) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: 'Invalid or missing fileId parameter' })
        };
      }

      // Verify file ownership and existence strictly within the authenticated user's partition
      const { exists, s3Key } = await verifyFileOwnership(activeS3, BUCKET_NAME, userId, cleanFileId);
      if (!exists) {
        return {
          statusCode: 404,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: 'File not found in your vault partition' })
        };
      }

      const deleteCmd = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key
      });

      await activeS3.send(deleteCmd);

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          message: 'File deleted successfully',
          fileId: cleanFileId,
          key: s3Key
        })
      };
    }

    return {
      statusCode: 404,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: `Route not found: ${method} ${rawPath}` })
    };
  } catch (error) {
    console.error('Lambda handler error:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        message: 'Internal server error processing file operation',
        error: error.message
      })
    };
  }
};

export { sanitizeFileId, verifyFileOwnership, s3 };
