/**
 * SecureVault - AWS Lambda Backend Handler (SecureVaultBackend)
 * 
 * Handles API Gateway HTTP API (SecureVaultAPI) routes:
 * 1. GET /files                 - List files strictly for the authenticated Cognito user
 * 2. POST /files                - Upload file to user's private S3 partition (Base64 payload, max 4 MiB)
 * 3. GET /files/{fileId}/download - Generate time-limited S3 presigned GET URL for authenticated download
 * 4. DELETE /files/{fileId}     - Delete file strictly belonging to the authenticated Cognito user
 * 
 * Security:
 * - Derives user identity strictly from verified Cognito JWT claims (sub).
 * - Never trusts client-supplied user IDs or full S3 paths for authorization.
 * - Confines all S3 operations to the authenticated user's prefix: users/{userId}/.
 * - Prevents path traversal vulnerabilities using path.basename.
 * - S3 bucket remains strictly private; downloads use temporary (300s) presigned URLs.
 */

import { S3Client, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import path from 'path';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'securevault-files-2026-ms-7391';

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': 'http://127.0.0.1:5501',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type'
};

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod;

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

      const s3Response = await s3.send(listCmd);
      const objects = s3Response.Contents || [];

      const files = objects
        .filter((obj) => obj.Key && obj.Key !== prefix && !obj.Key.endsWith('/'))
        .map((obj) => {
          // File identifier is the single path segment within the user's partition
          const fileId = obj.Key.split('/').pop() || 'Untitled';
          const displayName = fileId.replace(/^\d+-/, '');

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

      if (!rawFileId) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: 'fileId parameter is required' })
        };
      }

      // Sanitize: decode percent-encoding and strip directory path traversal
      const decoded = decodeURIComponent(rawFileId);
      const cleanFileId = path.basename(decoded);

      if (!cleanFileId || cleanFileId === '.' || cleanFileId === '..') {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: 'Invalid fileId' })
        };
      }

      // Construct S3 key strictly locked to authenticated user partition
      const s3Key = `users/${userId}/${cleanFileId}`;
      const downloadFilename = cleanFileId.replace(/^\d+-/, '');

      // Generate a short-lived presigned GET URL (300 seconds = 5 minutes)
      const getCmd = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        ResponseContentDisposition: `attachment; filename="${downloadFilename}"`
      });

      const downloadUrl = await getSignedUrl(s3, getCmd, { expiresIn: 300 });

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

    // -------------------------------------------------------------
    // Route 3: POST /files - Upload file to user's private S3 partition
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
      const rawFilename = path.basename(body.filename || 'upload.bin');
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

      const fileId = `${Date.now()}-${rawFilename}`;
      const s3Key = `users/${userId}/${fileId}`;

      const putCmd = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: buffer,
        ServerSideEncryption: 'AES256'
      });

      await s3.send(putCmd);

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
    // Route 4: DELETE /files/{fileId} - Delete file strictly within user's S3 partition
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

      if (!rawFileId) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: 'fileId path parameter is required' })
        };
      }

      // Sanitize: decode percent-encoding and strip directory path traversal
      const decoded = decodeURIComponent(rawFileId);
      const cleanFileId = path.basename(decoded);

      if (!cleanFileId || cleanFileId === '.' || cleanFileId === '..') {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: 'Invalid fileId' })
        };
      }

      // Enforce authorization: lock S3 key strictly to authenticated user partition
      const s3Key = `users/${userId}/${cleanFileId}`;

      const deleteCmd = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key
      });

      await s3.send(deleteCmd);

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
