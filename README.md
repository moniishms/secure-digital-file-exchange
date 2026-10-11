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

This project has no build step and requires no package installation.

### Option 1: VS Code Live Server

1. Open the project folder in Visual Studio Code:

```bash
code .
```

2. Install the Live Server extension.
3. Right-click `index.html` and select "Open with Live Server".
4. The app will open locally at `http://127.0.0.1:5500`.

### Option 2: Python HTTP Server

```bash
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

### Option 3: Node.js local server

```bash
npx -y serve -l 3000
```

Then open:

```text
http://localhost:3000
```

---

## Demo Mode

SecureVault uses demo mode by default because real AWS credentials should never be committed to source control or exposed in browser JavaScript.

Behavior in demo mode:

- files, shares, and audit records are stored in browser `localStorage`
- no actual AWS credentials or secret keys are stored in the frontend
- default sample records are preloaded for testing UX and workflows
- downloads generate structured demo files instead of real remote content
- settings include a reset option to restore default sample data

Sample demo files include:

- `research_report.pdf`
- `project_proposal.docx`
- `presentation.pptx`
- `dataset.zip`
- `meeting_notes.txt`

---

## Service Layer Overview

The logic is defined in `js/services/` and is structured for easy backend replacement.

### FileService

| Method | Description |
|---|---|
| `listFiles()` | Retrieves files from the current demo storage |
| `uploadFile(file, classification, onProgress)` | Validates upload size and simulates the upload process |
| `downloadFile(fileId)` | Creates a mock download response |
| `deleteFile(fileId)` | Removes the file and updates audit history |

### SharingService

| Method | Description |
|---|---|
| `listSharedFiles()` | Lists active and expired share links |
| `generateSecureLink(fileId, expiryMinutes)` | Creates a time-limited share record |
| `revokeShare(shareId)` | Immediately invalidates a share |

### AuthService

| Method | Description |
|---|---|
| `getCurrentUser()` | Returns the active mock user |
| `getAuthToken()` | Returns the bearer token for mock API requests |
| `login(username, password)` | Authenticates a user in demo mode |
| `logout()` | Clears the current session |

### AuditService

| Method | Description |
|---|---|
| `getAuditLogs()` | Fetches audit events |
| `logActivity(action, fileName, details, status)` | Records a new system event |
| `exportLogs(format)` | Exports logs as CSV or JSON |

---

## AWS Integration Handoff Guide

When the backend team is ready, the frontend can be connected to live AWS services.

### Step 1: Configure environment values

Set the following within the settings panel or the config module:

- API Gateway base URL
- AWS region
- S3 bucket name
- Cognito app client ID

### Step 2: Replace mock upload logic with presigned URL flow

The frontend is already structured for a production handoff using a presigned upload flow:

```javascript
const presignRes = await fetch(`${CONFIG.aws.apiGatewayUrl}/files/presign-upload`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: AuthService.getAuthToken()
  },
  body: JSON.stringify({
    filename: file.name,
    contentType: file.type,
    size: file.size,
    classification
  })
});

const { uploadUrl, fileId, s3Key } = await presignRes.json();

const xhr = new XMLHttpRequest();
xhr.open('PUT', uploadUrl, true);
xhr.setRequestHeader('Content-Type', file.type);
xhr.upload.onprogress = (e) => {
  if (e.lengthComputable) {
    onProgress({
      percentage: Math.round((e.loaded / e.total) * 100),
      stage: 'Uploading to S3...'
    });
  }
};

xhr.onload = async () => {
  if (xhr.status === 200) {
    await fetch(`${CONFIG.aws.apiGatewayUrl}/files/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: AuthService.getAuthToken()
      },
      body: JSON.stringify({ fileId, s3Key, filename: file.name })
    });
  }
};

xhr.send(file);
```

### Step 3: Connect Cognito authentication

```javascript
getAuthToken() {
  return `Bearer ${session.getIdToken().getJwtToken()}`;
}
```

### Step 4: Connect audit log API

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
