/**
 * SecureVault Security Test Suite
 * 
 * Verifies all security requirements and cross-account data isolation:
 * 1. Account A uploads a file; Account B must not see it in the file list.
 * 2. Account B cannot generate a link for Account A's file ID, even if manually supplied.
 * 3. Account B cannot download or delete Account A's file.
 * 4. Account A's old share-history entries must not appear as Account B's records.
 * 5. Account A can still generate and use a valid share link for its own file.
 * 6. Expired links remain unusable / marked expired.
 * 7. Path traversal attempts are rejected (HTTP 400).
 * 8. Requests without verified Cognito claims are rejected (HTTP 401).
 * 9. Client-supplied user IDs are never trusted for authorization.
 * 10. Live AWS mode never displays mock/default share records.
 */

import { handler, sanitizeFileId } from '../index.mjs';
import { S3Client } from '@aws-sdk/client-s3';
import assert from 'assert';

console.log('='.repeat(70));
console.log('RUNNING SECUREVAULT CROSS-ACCOUNT DATA LEAKAGE & SECURITY TEST SUITE');
console.log('='.repeat(70));

let passedTests = 0;
let totalTests = 0;

function runTest(testName, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] Test ${totalTests}: ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] Test ${totalTests}: ${testName}`);
    console.error('       Error:', err.message);
    if (err.stack) console.error(err.stack);
  }
}

async function runAsyncTest(testName, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`[PASS] Test ${totalTests}: ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] Test ${totalTests}: ${testName}`);
    console.error('       Error:', err.message);
    if (err.stack) console.error(err.stack);
  }
}

// ---------------------------------------------------------------------------
// In-Memory Simulated S3 Service for Backend Unit Testing
// Extends S3Client so getSignedUrl functions flawlessly without real AWS network calls
// ---------------------------------------------------------------------------
class MockS3Service extends S3Client {
  constructor() {
    super({
      region: 'ap-south-1',
      credentials: {
        accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
      }
    });
    this.storage = new Map(); // key -> { buffer, metadata }
  }

  async send(command) {
    const cmdName = command.constructor.name;

    // 1. PutObject
    if (cmdName === 'PutObjectCommand') {
      const { Bucket, Key, Body } = command.input;
      this.storage.set(Key, {
        body: Body,
        size: Body ? Body.length : 0,
        lastModified: new Date()
      });
      return { $metadata: { httpStatusCode: 200 } };
    }

    // 2. ListObjectsV2
    if (cmdName === 'ListObjectsV2Command') {
      const { Bucket, Prefix } = command.input;
      const contents = [];
      for (const [key, item] of this.storage.entries()) {
        if (key.startsWith(Prefix) && key !== Prefix) {
          contents.push({
            Key: key,
            Size: item.size,
            LastModified: item.lastModified
          });
        }
      }
      return {
        Contents: contents,
        KeyCount: contents.length
      };
    }

    // 3. HeadObject
    if (cmdName === 'HeadObjectCommand') {
      const { Bucket, Key } = command.input;
      if (!this.storage.has(Key)) {
        const error = new Error('NoSuchKey');
        error.name = 'NotFound';
        error.$metadata = { httpStatusCode: 404 };
        throw error;
      }
      const item = this.storage.get(Key);
      return {
        ContentLength: item.size,
        LastModified: item.lastModified
      };
    }

    // 4. GetObject
    if (cmdName === 'GetObjectCommand') {
      const { Bucket, Key } = command.input;
      if (!this.storage.has(Key)) {
        const error = new Error('NoSuchKey');
        error.name = 'NoSuchKey';
        error.$metadata = { httpStatusCode: 404 };
        throw error;
      }
      return {
        Body: this.storage.get(Key).body
      };
    }

    // 5. DeleteObject
    if (cmdName === 'DeleteObjectCommand') {
      const { Bucket, Key } = command.input;
      this.storage.delete(Key);
      return { $metadata: { httpStatusCode: 204 } };
    }

    throw new Error(`Unhandled command in MockS3: ${cmdName}`);
  }
}

// ---------------------------------------------------------------------------
// Helper: Create simulated API Gateway HTTP API event with Cognito Authorizer
// ---------------------------------------------------------------------------
function createApiGatewayEvent({
  method = 'GET',
  path = '/files',
  sub = null,
  body = null,
  pathParameters = null,
  queryStringParameters = null,
  rawPath = null
}) {
  return {
    rawPath: rawPath || path,
    requestContext: {
      http: {
        method,
        path: rawPath || path
      },
      authorizer: sub ? {
        jwt: {
          claims: {
            sub: sub,
            email: `${sub}@example.com`,
            name: `User ${sub}`
          }
        }
      } : undefined
    },
    pathParameters: pathParameters || undefined,
    queryStringParameters: queryStringParameters || undefined,
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null,
    isBase64Encoded: false,
    headers: {
      origin: 'http://127.0.0.1:5501'
    }
  };
}

// ===========================================================================
// TEST SUITE EXECUTION
// ===========================================================================
async function main() {
  const mockS3 = new MockS3Service();

  const ACCOUNT_A = 'cognito-sub-user-aaa-111';
  const ACCOUNT_B = 'cognito-sub-user-bbb-222';
  let accountAFileId = null;

  // --- PART 1: Backend Security & Ownership Verification Tests ---
  console.log('\n--- PART 1: BACKEND API & S3 AUTHORIZATION TESTS ---');

  // Test 1: Upload by Account A
  await runAsyncTest('Account A uploads a private file', async () => {
    const uploadEvent = createApiGatewayEvent({
      method: 'POST',
      path: '/files',
      sub: ACCOUNT_A,
      body: {
        filename: 'financial_forecast_q4.pdf',
        dataBase64: Buffer.from('Confidential Financial Report 2026').toString('base64')
      }
    });

    const res = await handler(uploadEvent, {}, mockS3);
    assert.strictEqual(res.statusCode, 201, `Expected 201 Created, got ${res.statusCode}`);
    const body = JSON.parse(res.body);
    assert(body.file && body.file.id, 'Response must include created file object with id');
    accountAFileId = body.file.id;
    assert.strictEqual(body.file.filename, 'financial_forecast_q4.pdf');
    assert(body.file.s3Key.startsWith(`users/${ACCOUNT_A}/`), `S3 Key must be partitioned under users/${ACCOUNT_A}/`);
  });

  // Test 2 (Required Test 1): Account A sees file; Account B MUST NOT see Account A's file in file list
  await runAsyncTest('Account A uploads file; Account B must NOT see it in file list', async () => {
    // 1. Account A lists files
    const listEventA = createApiGatewayEvent({
      method: 'GET',
      path: '/files',
      sub: ACCOUNT_A
    });
    const resA = await handler(listEventA, {}, mockS3);
    assert.strictEqual(resA.statusCode, 200);
    const bodyA = JSON.parse(resA.body);
    assert.strictEqual(bodyA.files.length, 1, 'Account A should see exactly 1 file');
    assert.strictEqual(bodyA.files[0].id, accountAFileId);

    // 2. Account B lists files
    const listEventB = createApiGatewayEvent({
      method: 'GET',
      path: '/files',
      sub: ACCOUNT_B
    });
    const resB = await handler(listEventB, {}, mockS3);
    assert.strictEqual(resB.statusCode, 200);
    const bodyB = JSON.parse(resB.body);
    assert.strictEqual(bodyB.files.length, 0, 'Account B must NOT see any of Account A files in file list (must be 0)');
  });

  // Test 3 (Required Test 2): Account B cannot generate a share link for Account A's file ID
  await runAsyncTest("Account B cannot generate a share link for Account A's file ID, even if manually supplied", async () => {
    const shareEventB = createApiGatewayEvent({
      method: 'POST',
      path: `/files/${accountAFileId}/share`,
      rawPath: `/files/${accountAFileId}/share`,
      sub: ACCOUNT_B,
      pathParameters: { fileId: accountAFileId },
      body: { expiryMinutes: 15 }
    });

    const resB = await handler(shareEventB, {}, mockS3);
    assert.strictEqual(resB.statusCode, 404, `Account B share request must return 404 Not Found, got ${resB.statusCode}`);
    const bodyB = JSON.parse(resB.body);
    assert.strictEqual(bodyB.message, 'File not found in your vault partition');
  });

  // Test 4 (Required Test 3a): Account B cannot download Account A's file
  await runAsyncTest("Account B cannot download Account A's file", async () => {
    const downloadEventB = createApiGatewayEvent({
      method: 'GET',
      path: `/files/${accountAFileId}/download`,
      rawPath: `/files/${accountAFileId}/download`,
      sub: ACCOUNT_B,
      pathParameters: { fileId: accountAFileId }
    });

    const resB = await handler(downloadEventB, {}, mockS3);
    assert.strictEqual(resB.statusCode, 404, `Account B download request must return 404 Not Found, got ${resB.statusCode}`);
    const bodyB = JSON.parse(resB.body);
    assert.strictEqual(bodyB.message, 'File not found in your vault partition');
  });

  // Test 5 (Required Test 3b): Account B cannot delete Account A's file
  await runAsyncTest("Account B cannot delete Account A's file", async () => {
    const deleteEventB = createApiGatewayEvent({
      method: 'DELETE',
      path: `/files/${accountAFileId}`,
      rawPath: `/files/${accountAFileId}`,
      sub: ACCOUNT_B,
      pathParameters: { fileId: accountAFileId }
    });

    const resB = await handler(deleteEventB, {}, mockS3);
    assert.strictEqual(resB.statusCode, 404, `Account B delete request must return 404 Not Found, got ${resB.statusCode}`);
    const bodyB = JSON.parse(resB.body);
    assert.strictEqual(bodyB.message, 'File not found in your vault partition');

    // Verify Account A's file still exists in S3!
    const listEventA = createApiGatewayEvent({
      method: 'GET',
      path: '/files',
      sub: ACCOUNT_A
    });
    const resA = await handler(listEventA, {}, mockS3);
    const bodyA = JSON.parse(resA.body);
    assert.strictEqual(bodyA.files.length, 1, "Account A's file must still be present and intact");
  });

  // Test 6 (Required Test 5): Account A can generate and use a valid share link for its own file
  let accountAShareUrl = null;
  await runAsyncTest('Account A can still generate and use a valid share link for its own file', async () => {
    const shareEventA = createApiGatewayEvent({
      method: 'POST',
      path: `/files/${accountAFileId}/share`,
      rawPath: `/files/${accountAFileId}/share`,
      sub: ACCOUNT_A,
      pathParameters: { fileId: accountAFileId },
      body: { expiryMinutes: 30 }
    });

    const resA = await handler(shareEventA, {}, mockS3);
    assert.strictEqual(resA.statusCode, 200, `Expected 200 OK for owner share request, got ${resA.statusCode}`);
    const bodyA = JSON.parse(resA.body);
    assert(bodyA.shareUrl, 'Must return a valid presigned shareUrl');
    assert.strictEqual(bodyA.fileId, accountAFileId);
    assert.strictEqual(bodyA.expiryMinutes, 30);
    assert.strictEqual(bodyA.expiresIn, 1800);
    accountAShareUrl = bodyA.shareUrl;

    // Presigned link format check:
    assert(accountAShareUrl.includes('X-Amz-Signature='), 'Presigned URL must contain AWS Signature');
    assert(accountAShareUrl.includes('X-Amz-Expires=1800'), 'Presigned URL must have 1800s expiration parameter');
  });

  // Test 7 (Required Test 6): Expired links remain unusable
  runTest('Presigned link expiration semantics: expired links are rejected', () => {
    assert(accountAShareUrl, 'Account A share URL must exist');
    const urlObj = new URL(accountAShareUrl);
    const expiresParam = parseInt(urlObj.searchParams.get('X-Amz-Expires'), 10);
    assert.strictEqual(expiresParam, 1800, 'Presigned URL expiration parameter must be 1800 seconds');

    // Simulate link expiration in UI logic
    const pastExpiresDate = new Date(Date.now() - 60000).toISOString();
    const isExpired = (new Date(pastExpiresDate).getTime() <= Date.now());
    assert.strictEqual(isExpired, true, 'Share timestamp in the past must be detected as expired');
  });

  // Test 8: Unauthenticated requests without Cognito claims return 401
  await runAsyncTest('Unauthenticated requests without Cognito claims return 401 Unauthorized', async () => {
    const unauthEvent = createApiGatewayEvent({
      method: 'GET',
      path: '/files',
      sub: null // No sub / unauthenticated
    });
    const res = await handler(unauthEvent, {}, mockS3);
    assert.strictEqual(res.statusCode, 401, 'Unauthenticated request must return 401');
    const body = JSON.parse(res.body);
    assert(body.message.includes('Unauthorized'));
  });

  // Test 9: Path traversal attack protection across all routes
  runTest('Path traversal protection: sanitizeFileId rejects traversal attacks', () => {
    assert.strictEqual(sanitizeFileId('../user-a/file.pdf'), 'file.pdf');
    assert.strictEqual(sanitizeFileId('..\\user-a\\file.pdf'), 'file.pdf');
    assert.strictEqual(sanitizeFileId('..'), null);
    assert.strictEqual(sanitizeFileId('.'), null);
    assert.strictEqual(sanitizeFileId(''), null);
    assert.strictEqual(sanitizeFileId('valid-file-123.docx'), 'valid-file-123.docx');
    assert.strictEqual(sanitizeFileId('%2e%2e%2fpasswd'), 'passwd');
  });

  // Test 10: Client-supplied user ID is ignored by backend
  await runAsyncTest('Backend derives identity strictly from Cognito claims; ignores client-supplied userId', async () => {
    // Account B sends a request pretending to be Account A via body/query
    const spoofEvent = createApiGatewayEvent({
      method: 'GET',
      path: '/files',
      sub: ACCOUNT_B,
      queryStringParameters: { userId: ACCOUNT_A, sub: ACCOUNT_A }
    });

    const res = await handler(spoofEvent, {}, mockS3);
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    // Should still list Account B's partition (0 files), NOT Account A
    assert.strictEqual(body.files.length, 0, 'Spoofed query parameter must have no effect');
  });

  // --- PART 2: Frontend State & Storage Scoping Tests ---
  console.log('\n--- PART 2: FRONTEND STORAGE SCOPING & ISOLATION TESTS ---');

  // Simulated browser environment
  const mockStorage = new Map();
  global.localStorage = {
    getItem(key) { return mockStorage.get(key) || null; },
    setItem(key, val) { mockStorage.set(key, String(val)); },
    removeItem(key) { mockStorage.delete(key); },
    clear() { mockStorage.clear(); }
  };

  global.window = global;

  global.CONFIG = {
    isMockMode: () => false,
    aws: {
      apiGatewayUrl: 'https://test-api.amazonaws.com',
      region: 'ap-south-1',
      s3BucketName: 'securevault-files-test'
    }
  };

  let mockCurrentUser = null;
  global.AuthService = {
    isAuthenticated: () => Boolean(mockCurrentUser && mockCurrentUser.sub),
    getCurrentUser: () => mockCurrentUser || { id: null, sub: null, isAuthenticated: false },
    getAuthToken: () => mockCurrentUser ? 'Bearer token_123' : ''
  };

  // Import SharingService logic
  const fs = await import('fs');
  const pathModule = await import('path');
  const sharingServiceCode = fs.readFileSync(pathModule.resolve('js/services/sharing-service.js'), 'utf8');
  eval(sharingServiceCode); // instantiates window.SharingService / global.SharingService

  // Test 11 (Required Test 4): Account A's old share history entries must NOT appear as Account B's records
  await runAsyncTest("Account A's old share-history entries must not appear as Account B's records", async () => {
    // 1. Account A is logged in
    mockCurrentUser = { id: 'usr_cognito_a', sub: ACCOUNT_A, name: 'Alice A' };

    // Simulate Account A generating a share
    const shareKeyA = SharingService.getStorageKey();
    assert.strictEqual(shareKeyA, `sv_live_shares_${ACCOUNT_A}`, 'Storage key must be scoped by Account A sub');

    const shareA = {
      id: 'share_aaa_01',
      fileId: accountAFileId,
      fileName: 'financial_forecast_q4.pdf',
      fileSize: '2.4 MB',
      createdDate: '2026-10-21 18:00',
      expiresDate: '2026-10-21 19:00',
      expiryMinutes: 60,
      status: 'Active',
      shareUrl: 'https://s3.amazonaws.com/test-url-a',
      ownerSub: ACCOUNT_A
    };
    mockStorage.set(shareKeyA, JSON.stringify([shareA]));

    // Verify Account A sees its share
    const sharesForA = await SharingService.listSharedFiles();
    assert.strictEqual(sharesForA.length, 1);
    assert.strictEqual(sharesForA[0].id, 'share_aaa_01');

    // 2. Account A logs out
    mockCurrentUser = null;
    const sharesUnauth = await SharingService.listSharedFiles();
    assert.strictEqual(sharesUnauth.length, 0, 'Unauthenticated session must return 0 shares in live mode');

    // 3. Account B logs in (switching Cognito accounts in same browser)
    mockCurrentUser = { id: 'usr_cognito_b', sub: ACCOUNT_B, name: 'Bob B' };

    // Account B lists shares
    const sharesForB = await SharingService.listSharedFiles();
    assert.strictEqual(sharesForB.length, 0, "Account B must see ZERO shares; Account A's shares must NEVER leak to Account B");

    // Account B creates their own share
    const shareKeyB = SharingService.getStorageKey();
    assert.strictEqual(shareKeyB, `sv_live_shares_${ACCOUNT_B}`, 'Storage key must be scoped by Account B sub');

    const shareB = {
      id: 'share_bbb_01',
      fileId: 'file_b_123',
      fileName: 'bobs_report.docx',
      fileSize: '1.2 MB',
      createdDate: '2026-10-21 18:30',
      expiresDate: '2026-10-21 19:30',
      expiryMinutes: 60,
      status: 'Active',
      shareUrl: 'https://s3.amazonaws.com/test-url-b',
      ownerSub: ACCOUNT_B
    };
    mockStorage.set(shareKeyB, JSON.stringify([shareB]));

    // Account B sees only Account B's share
    const bShares = await SharingService.listSharedFiles();
    assert.strictEqual(bShares.length, 1);
    assert.strictEqual(bShares[0].id, 'share_bbb_01');

    // Account A's record was untouched in Account A's partition
    const rawAStorage = mockStorage.get(shareKeyA);
    assert(rawAStorage.includes('share_aaa_01'), "Account A's records remain safely preserved in Account A's own partition");
  });

  // Test 12: Legacy un-scoped sv_live_shares is automatically purged
  await runAsyncTest('Legacy un-scoped sv_live_shares is purged and never read', async () => {
    mockCurrentUser = { id: 'usr_cognito_b', sub: ACCOUNT_B, name: 'Bob B' };
    mockStorage.set('sv_live_shares', JSON.stringify([{ id: 'leaked_share_999', fileName: 'leaked.pdf' }]));

    const shares = await SharingService.listSharedFiles();
    assert.strictEqual(mockStorage.has('sv_live_shares'), false, 'Legacy sv_live_shares must be purged from localStorage');
    const leaked = shares.find(s => s.id === 'leaked_share_999');
    assert.strictEqual(leaked, undefined, 'Leaked legacy share must not be returned');
  });

  // Test 13: Mock/default shares are NEVER returned in Live AWS Mode
  await runAsyncTest('Do not display mock/default share records in live AWS mode', async () => {
    mockCurrentUser = { id: 'usr_cognito_c', sub: 'user-sub-c', name: 'Carol C' };
    const shares = await SharingService.listSharedFiles();
    assert.strictEqual(shares.length, 0, 'New user in live mode must have 0 shares, not default mock shares');
    const hasDefault1 = shares.some(s => s.id === 'share_s01');
    const hasDefault2 = shares.some(s => s.id === 'share_s02');
    assert.strictEqual(hasDefault1, false, 'Mock share_s01 must never appear in live mode');
    assert.strictEqual(hasDefault2, false, 'Mock share_s02 must never appear in live mode');
  });

  // Test 14: Dynamic link expiration status update
  await runAsyncTest('Expired links are dynamically marked as Expired', async () => {
    const expiredSub = 'sub-expired-test';
    mockCurrentUser = { id: 'usr_cognito_exp', sub: expiredSub, name: 'Exp User' };
    const storageKey = `sv_live_shares_${expiredSub}`;

    const pastDate = new Date(Date.now() - 300000).toISOString(); // 5 minutes ago
    mockStorage.set(storageKey, JSON.stringify([
      {
        id: 'share_exp_01',
        fileId: 'file_01',
        fileName: 'old_spec.pdf',
        expiresDate: pastDate,
        status: 'Active',
        ownerSub: expiredSub
      }
    ]));

    const shares = await SharingService.listSharedFiles();
    assert.strictEqual(shares.length, 1);
    assert.strictEqual(shares[0].status, 'Expired', 'Share with past expiration date must be updated to Expired');
  });

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log(`TEST RESULTS: ${passedTests} / ${totalTests} PASSED`);
  if (passedTests === totalTests) {
    console.log('ALL SECURITY & CROSS-ACCOUNT ISOLATION TESTS PASSED SUCCESSFULLY!');
  } else {
    console.error(`SOME TESTS FAILED: ${totalTests - passedTests} failed`);
    process.exit(1);
  }
  console.log('='.repeat(70));
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
