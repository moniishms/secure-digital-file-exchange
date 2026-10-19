# SecureVault — Secure Digital File Exchange Platform

> College Capstone Project: Cloud Security & Scalable File Exchange  
> Role: Frontend Development & Cloud Integration Lead  
> Target Architecture: AWS S3, Cognito, Lambda, API Gateway, KMS, and CloudWatch

SecureVault is a responsive, browser-based file exchange prototype designed for enterprise and academic environments. It demonstrates a secure digital file workflow with a modern SaaS interface, simulated cloud integration, and an interactive audit experience.

This repository contains the frontend client and integration layer for the prototype. It runs locally without real AWS credentials and uses demo data to simulate secure uploads, file sharing, access control, and audit logging.

---

## Project Overview

SecureVault allows authenticated users to:

- upload files with client-side validation
- organize and sort file records
- generate time-limited sharing links
- revoke shared links instantly
- review audit activity and export reporting logs
- explore the proposed AWS security architecture

The app is intentionally designed as a frontend prototype, focusing on user experience, security workflow simulation, and cloud-ready integration patterns without exposing production credentials.

---

## Key Features

- Modern light SaaS interface with structured dashboard cards and responsive layouts
- Interactive file management dashboard with search, sorting, filtering, and classification tags
- Drag-and-drop upload experience with a strict 10 MB client-side validation limit
- Multi-stage upload simulation that mirrors a production cloud pipeline
- Time-limited secure sharing links with expiry controls and clipboard copy actions
- Shared file revocation logic with immediate activity tracking
- Audit trail and compliance reporting export tools
- Security architecture explorer for AWS design review
- Settings panel for mock cloud configuration and demo reset
- Fully responsive and accessible UI optimized for desktop and mobile screens

---

## Technology Stack

- HTML5 for semantic app structure
- CSS3 for design tokens, responsive layouts, and visual polish
- Vanilla JavaScript (ES6+) for modular frontend logic
- Inline SVG icons for offline reliability
- Google Fonts Inter for clean modern UI styling

---

## Project Structure

```text
secure-digital-file-exchange/
├── index.html                  # Application shell
├── README.md                   # Project documentation
├── css/
│   └── style.css               # Design system and responsive styling
├── js/
│   ├── app.js                  # Main app coordination and dashboard updates
│   ├── navigation.js           # View routing and drawer navigation
│   ├── file-manager.js         # File list, sorting, filtering, upload and deletion UI
│   ├── sharing.js              # Sharing modal and shared link management
│   ├── activity.js             # Audit activity and export features
│   └── services/
│       ├── config.js           # Integration settings and AWS endpoint config
│       ├── auth-service.js     # Mock authentication and user session logic
│       ├── file-service.js     # File listing, upload, download, and delete logic
│       ├── sharing-service.js   # Share creation and revocation logic
│       └── audit-service.js    # Activity logging and compliance exports
├── assets/
│   └── icons/
│       └── shield-lock.svg    # Platform brand icon
└── .gitignore
```

---

## Running Locally

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
python -m http.server 5501 --bind 127.0.0.1
```
Then navigate to [http://localhost:8080](http://localhost:8080) in any web browser.

### Option 3: Node.js local server

```bash
npx -y serve -l 5501
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

## Team Responsibilities

| Module | Team Member | Status |
|---|---|---|
| Frontend UI & Integration | This prototype | Complete |
| File Management Backend | Teammate 1 | Pending |
| Cloud Security & Identity | Teammate 2 | Pending |

---

## Security Limitations of the Prototype

1. This is a frontend simulation for UX and workflow validation, not a production security system.
2. File encryption, sharing expiration, and access enforcement are simulated client-side only.
3. No real AWS access keys or secret values are embedded in browser code.
4. Actual authorization, encryption, bucket policy enforcement, and validation must be implemented server-side in Lambda and S3.

---

## Summary

SecureVault demonstrates a real-world digital file exchange experience using a clean frontend prototype, AWS-oriented architecture, and security-first design language. It provides a strong foundation for future backend implementation, live cloud integration, and secure enterprise deployment.

If you'd like, I can also clean up the README further into a more polished GitHub-style version with badges, screenshots, and a stronger project summary.
