# SecureVault — Secure Digital File Exchange Platform (Frontend Prototype)

> **College Capstone Project: Cloud Security & Scalable File Exchange**  
> **Role:** Frontend Development & Cloud Integration Lead  
> **Backend Architecture Target:** Amazon Web Services (S3, Cognito, Lambda, API Gateway, KMS, CloudWatch)

---

## 1. Project Overview

**SecureVault** is a modern, responsive, high-assurance digital file exchange platform designed for enterprise and academic research environments. It allows authenticated users to securely upload, inspect, share via time-limited URLs, download, and delete sensitive files stored in private cloud object storage.

This repository contains the complete **Frontend Client & Integration Layer Prototype**. It operates locally without requiring live AWS credentials or active cloud subscriptions by using a modular, decoupled **Mock Service Layer**. When the other team members finish their backend modules, the frontend seamlessly connects to live AWS API Gateway endpoints and Amazon S3 without needing any UI alterations.

---

## 2. Key Features

- **Pure Light Modern SaaS Interface:** Designed with curated color tokens (`#F7F9FC` page background, `#FFFFFF` cards, `#2563EB` primary blue, `#172033` dark navy text) and the Inter typography family. Strictly free of dark mode, neon artifacts, or distracting gradients.
- **Interactive Dashboard:** Live summary cards for Total Files, Storage Quota Utilization (with animated capacity gauge), Active Shared Links, and Security Audit events.
- **My Files Management:**
  - Dynamic client-side search by filename.
  - Multi-category filtering: All Files, PDF, Documents, Archives, Text/Code.
  - Multi-field sorting: Date (Newest/Oldest), Name (A-Z/Z-A), Size (Largest/Smallest).
  - Security classifications: *Confidential*, *Restricted*, *Internal*, and *Public*.
  - Instant checksum and simulated KMS encryption indicators.
- **Drag-and-Drop Upload System:**
  - Animated dropzone with native file browse dialog.
  - **Strict 10 MB maximum file size client-side validation**.
  - Multi-stage upload simulation displaying realistic pipeline progress:
    1. *Payload validation & SHA-256 hash generation*
    2. *Requesting presigned S3 upload URL*
    3. *Streaming encrypted chunks*
    4. *Applying Server-Side KMS Encryption*
- **Time-Limited Secure Sharing:**
  - Generates simulated presigned S3 URLs with selectable validity periods: **5 minutes**, **15 minutes**, or **1 hour**.
  - One-click clipboard copying with visual confirmation.
  - Clear cryptographic TTL expiration timestamp display.
- **Shared Files Management:**
  - Dedicated table of generated shared links.
  - **Instant Share Revocation:** One-click revocation immediately marks the link as inactive and updates the audit log.
- **Comprehensive Audit Trail & Activity Feed:**
  - Tracks file uploads, downloads, share generation, revocations, deletions, and simulated unauthorized access blocks (e.g. S3 bucket policy denials).
  - Real-time action filtering.
  - **Export to CSV and JSON** for compliance reporting.
- **Security Architecture Explorer:**
  - Detailed breakdown of 6 cloud security pillars: Private S3 Storage, Server-Side KMS Encryption, AWS Cognito Authentication, Temporary Presigned URLs, IAM Least Privilege, and CloudTrail/CloudWatch Audit Logging.
  - Visual 5-step end-to-end architecture dataflow diagram.
- **Teammate Integration Panel (Settings):**
  - Configurable input fields for AWS API Gateway URL, AWS Region, S3 Bucket Name, and Cognito App Client ID.
  - Factory reset button to restore default demo records.
- **Fully Responsive & Accessible:** Fluid drawer sidebar and compact layouts for mobile screens (e.g. 390px iPhone viewport) and desktop displays.

---

## 3. Technology Stack

- **HTML5:** Semantic markup, accessible attributes (`aria-label`, `role`), structured views.
- **CSS3:** Custom properties (design tokens), flexbox and CSS grid layouts, smooth micro-interactions, responsive media queries.
- **Vanilla JavaScript (ES6+):** Modular service architecture, zero framework overhead (No React, Next.js, or TypeScript required).
- **Icons:** Crisp inline SVG icons (Lucide-inspired) ensuring 100% offline reliability.
- **Typography:** Google Fonts Inter (300, 400, 500, 600, 700).

---

## 4. Folder Structure

```
AWS project/
├── index.html                   # Master single-page application shell
├── README.md                    # Project documentation & integration guide
├── css/
│   └── style.css                # Pure light theme design system & component styles
├── js/
│   ├── app.js                   # Application coordinator, toasts, dashboard metrics
│   ├── navigation.js            # View routing, hash navigation, mobile drawer
│   ├── file-manager.js          # File table, search, filters, sorting, upload/delete modals
│   ├── sharing.js               # Sharing modal, link generation, shared files table
│   ├── activity.js              # Audit trail table, action filters, log export
│   └── services/
│       ├── config.js            # Central integration configuration & AWS endpoints
│       ├── auth-service.js      # User profile, session handling, Cognito JWT hooks
│       ├── file-service.js      # File listing, simulated upload, delete, download
│       ├── sharing-service.js   # Presigned URL generation, revocation logic
│       └── audit-service.js     # Activity logger, compliance tracking, data export
└── assets/
    └── icons/
        └── shield-lock.svg      # Platform brand icon asset
```

---

## 5. Instructions for Running Locally

The project is built entirely with standard web technologies and requires no compilation or package installs.

### Option A: VS Code Live Server (Recommended)
1. Open the project folder in **Visual Studio Code**:
   ```bash
   code .
   ```
2. Install the **Live Server** extension (by Ritwick Dey).
3. Right-click on `index.html` and select **"Open with Live Server"**.
4. The application will launch in your browser at `http://127.0.0.1:5500`.

### Option B: Python Simple HTTP Server
If Python is installed on your system, run:
```bash
python -m http.server 8080
```
Then navigate to [http://localhost:8080](http://localhost:8080) in any web browser.

### Option C: Node.js `serve` or `http-server`
```bash
npx -y serve -l 3000
```
Then navigate to [http://localhost:3000](http://localhost:3000).

---

## 6. Explanation of Demo Mode

Because real AWS credentials must never be committed to source control or exposed in browser JavaScript, SecureVault operates in **Demo Mode** by default:
- **Local Persistence:** Demo files, shares, and activity records are stored in browser `localStorage`.
- **Zero Sensitive Data:** No real private files, AWS access keys, or secret keys are stored in `localStorage`.
- **Default Sample Data:** Includes realistic dummy records:
  - `research_report.pdf` (2.4 MB, Confidential)
  - `project_proposal.docx` (1.1 MB, Internal)
  - `presentation.pptx` (4.8 MB, Restricted)
  - `dataset.zip` (8.5 MB, Confidential)
  - `meeting_notes.txt` (14 KB, Public)
- **Safe Simulated Downloads:** Clicking Download generates a local structured demonstration text file confirming file metadata without calling external services.
- **Factory Reset:** Navigating to **Settings** and clicking **"Reset Demo Data to Defaults"** restores the initial sample state at any time.

---

## 7. Service Layer API Reference

The service layer is located under `js/services/`. Every service function returns a standard JavaScript `Promise` and contains clear hooks where `fetch()` requests will be plugged in.

### 1. `FileService` (`js/services/file-service.js`)
| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `listFiles()` | None | `Promise<Array<FileObject>>` | Retrieves all files in user storage |
| `uploadFile(file, classification, onProgress)` | `File`, `string`, `function` | `Promise<FileObject>` | Validates size (<=10 MB), simulates upload stages, records file |
| `downloadFile(fileId)` | `string` | `Promise<Object>` | Triggers simulated presigned stream download |
| `deleteFile(fileId)` | `string` | `Promise<boolean>` | Deletes file record and updates audit trail |

### 2. `SharingService` (`js/services/sharing-service.js`)
| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `listSharedFiles()` | None | `Promise<Array<ShareObject>>` | Retrieves list of all active and expired shared links |
| `generateSecureLink(fileId, expiryMinutes)` | `string`, `number` (5, 15, or 60) | `Promise<ShareObject>` | Generates a time-limited secure link record |
| `revokeShare(shareId)` | `string` | `Promise<boolean>` | Invalidates an active link immediately |

### 3. `AuthService` (`js/services/auth-service.js`)
| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `getCurrentUser()` | None | `Object` | Returns active user profile |
| `getAuthToken()` | None | `string` | Returns Bearer token for API Gateway authorization |
| `login(username, password)` | `string`, `string` | `Promise<Object>` | Authenticates user credentials |
| `logout()` | None | `Promise<Object>` | Terminates current session |

### 4. `AuditService` (`js/services/audit-service.js`)
| Method | Parameters | Return Type | Description |
|---|---|---|---|
| `getAuditLogs()` | None | `Promise<Array<LogObject>>` | Retrieves chronological audit events |
| `logActivity(action, fileName, details, status)` | `string`, `string`, `string`, `string` | `Promise<LogObject>` | Appends a new event to the audit trail |
| `exportLogs(format)` | `'csv'` or `'json'` | `Promise<void>` | Downloads formatted audit logs file |

---

## 8. Planned AWS Integration Points & Handoff Guide

When teammates complete the backend services, follow this checklist to switch from Mock Mode to Live AWS Mode:

### Step 1: Teammate Configuration
Open **Settings** in the SecureVault UI (or edit `js/services/config.js`):
1. Enter the deployed **API Gateway Base URL** (e.g. `https://xyz123.execute-api.us-east-1.amazonaws.com/prod`).
2. Set the **AWS Region** (e.g. `us-east-1`).
3. Set the **S3 Bucket Name** (e.g. `securevault-production-storage`).
4. Set the **Cognito App Client ID**.

### Step 2: Replacing Mock File Uploads with 2-Step S3 Presigned PUT
In `js/services/file-service.js`, uncomment the live AWS block in `uploadFile`:
```javascript
// 1. Request presigned PUT URL from API Gateway
const presignRes = await fetch(`${CONFIG.aws.apiGatewayUrl}/files/presign-upload`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: AuthService.getAuthToken()
  },
  body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, classification })
});
const { uploadUrl, fileId, s3Key } = await presignRes.json();

// 2. Stream directly to S3 via PUT (zero backend bottleneck)
const xhr = new XMLHttpRequest();
xhr.open('PUT', uploadUrl, true);
xhr.setRequestHeader('Content-Type', file.type);
xhr.upload.onprogress = (e) => {
  if (e.lengthComputable) {
    onProgress({ percentage: Math.round((e.loaded / e.total) * 100), stage: 'Uploading to S3...' });
  }
};
xhr.onload = async () => {
  if (xhr.status === 200) {
    // 3. Confirm upload with API Gateway to persist metadata
    await fetch(`${CONFIG.aws.apiGatewayUrl}/files/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: AuthService.getAuthToken() },
      body: JSON.stringify({ fileId, s3Key, filename: file.name })
    });
  }
};
xhr.send(file);
```

### Step 3: Integrating AWS Cognito Authentication
In `js/services/auth-service.js`, connect the Amazon Cognito Identity SDK or AWS Amplify Auth:
```javascript
getAuthToken() {
  // Returns current Cognito User JWT ID Token
  return `Bearer ${session.getIdToken().getJwtToken()}`;
}
```

### Step 4: Connecting AWS CloudWatch Audit Logs
In `js/services/audit-service.js`, redirect `getAuditLogs()` to:
```javascript
const res = await fetch(`${CONFIG.aws.apiGatewayUrl}/audit-logs`, {
  headers: { Authorization: AuthService.getAuthToken() }
});
return await res.json();
```

---

## 9. Team Responsibilities Matrix

| Module | Team Member | Primary Deliverables | Status |
|---|---|---|---|
| **Frontend UI & Integration** | **You (This Prototype)** | Single-page UI, responsive light theme, mock service layer, upload/share modals, audit export, configuration panel | **Complete & Verified** |
| **File Management Backend** | **Teammate 1** | API Gateway REST endpoints, Lambda functions (`presign-upload`, `confirm`, `download-url`, `delete`), S3 Bucket lifecycle rules | Independent Development |
| **Cloud Security & Identity** | **Teammate 2** | AWS Cognito User Pools & MFA, IAM Least Privilege execution roles, KMS Key creation & rotation policy, CloudWatch/CloudTrail audit logging | Independent Development |

---

## 10. Security Limitations of the Prototype

1. **Client-Side Simulation:** In this prototype stage, file encryption, link expiration, and access restrictions are simulated client-side for UX testing. **Real security guarantees exist only after AWS backend integration.**
2. **No Real AWS Secrets:** Browser JavaScript intentionally contains **zero AWS Access Keys, Secret Keys, or session credentials**.
3. **Data Scope:** Uploaded files in demo mode are processed locally in browser memory; no real binary files are stored on remote servers until the S3 backend is connected.
4. **Authoritative Enforcement:** Once integrated, all authorization checks, file-size limits, and link expirations must be enforced server-side by AWS Lambda and Amazon S3 bucket policies.
#   s e c u r e - d i g i t a l - f i l e - e x c h a n g e  
 