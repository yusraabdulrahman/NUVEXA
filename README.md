# Nuvexa 💉

> **A secure, zero-dependency digital immunization registry and pediatric record management system.**

[![Node.js Version](https://img.shields.io/badge/Node.js-%3E%3D18-brightgreen.svg?style=flat-square)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/Database-SQLite--WAL-blue.svg?style=flat-square)](lib/db.js)
[![Standard](https://img.shields.io/badge/Schedule-WHO--Aligned-orange.svg?style=flat-square)](lib/schedule.js)
[![License](https://img.shields.io/badge/License-MIT-lightgrey.svg?style=flat-square)](LICENSE)

---

## 📌 Overview

**Nuvexa** is a lightweight, high-performance pediatric healthcare system designed to modernize and unify newborn immunization tracking. Built for hospitals, health clinics, and public health ministries, Nuvexa solves critical issues surrounding lost paper cards, fragmented medical histories across clinics, missed vaccine intervals, and clinical audit failures.

Nuvexa operates on pure native Node.js with **zero external dependencies** (`node_modules`), eliminating supply-chain vulnerabilities and guaranteeing seamless, instant deployment across any environment.

---

## ✨ Key Features

### 🏥 Cross-Facility Child Health Records
- **Centralized Digital Identity**: Every child is linked to a verified national/birth ID, allowing participating clinics and hospitals to instantly access their immunization history.
- **Duplicate Prevention**: Automated ID checks ensure duplicate records cannot be created for the same infant across different facilities.
- **Printable Certificates**: Parents and guardians can receive verified, clean, printable digital immunization cards directly from the system.

### 📅 Automated Immunization Engine
- **WHO-Aligned Standard Schedule**: Automatically tracks critical newborn and pediatric vaccines, including BCG, Hepatitis B, Oral Polio (OPV), Pentavalent, PCV, Rotavirus, Inactivated Polio (IPV), and Measles/MR.
- **Dynamic Age & Due Tracking**: Real-time evaluation of each dose status (**Given**, **Due Now**, **Overdue**, or **Upcoming**) calculated from the child's exact age in days with configurable grace periods.

### 🛡️ Medical Audit Trail & Immutability
- **Non-Destructive Corrections**: Recorded doses can **never be deleted**. Accidental or incorrect records must be voided with a mandatory justification, preserving a transparent medical trail.
- **Comprehensive Audit Logging**: Every administrative action, child record lookup, dose administration, and status update is immutably timestamped and linked to the provider and facility.

### 📊 Public Health Analytics & Recall Lists
- **Community Coverage Metrics**: Real-time tracking of immunization coverage percentages across facilities.
- **High-Risk Overdue Follow-up**: Dedicated recall lists sorting children with overdue doses, complete with guardian contact numbers for swift outreach.
- **Facility Distribution**: Breakdown of total doses administered today and by individual health facilities.

### 🔐 Role-Based Access Control (RBAC)
- **Multi-Role Permissions**: Tailored views for Healthcare Providers, Clinic Staff, and Health Ministry System Administrators.
- **Medical License Approval**: New provider registrations require professional license submission and manual administrator authorization before system access is granted.

---

## 🛠️ Tech Stack & Architecture

| Layer | Technologies | Highlights |
|---|---|---|
| **Backend** | Node.js (v18+) | Native `http`, `crypto`, `fs`, `path` API server |
| **Frontend** | Vanilla HTML5 / CSS3 / ES6+ | Modern single-page app (SPA), responsive, zero build step |
| **Database** | SQLite Relational Engine | Relational SQL schema, foreign keys, indexes & WAL crash safety (`data/nuvexa.sqlite`) |
| **Security** | `scrypt` hashing & Rate Limiting | Timing-safe auth, session management, brute-force defense |

---

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (version 18 or higher)

### 1. Installation
Clone or download the repository, then install dependencies:
```bash
git clone https://github.com/yusraabdulrahman/nuvexa.git
cd nuvexa
npm install
```

### 2. Start the Server
```bash
node server.js
```
*(Or run `npm start`)*

### 3. Open in Browser
Navigate to:
```text
http://localhost:3000
```

---

## 🔑 Demo Access (Local Environment)

The local development seed provides pre-configured accounts for testing different user workflows:

| Role | Email | Password | Primary Purpose |
|---|---|---|---|
| **System Admin** | `admin@nuvexa.test` | `admin123` | Provider approval, facility oversight, and audit log inspection |
| **Healthcare Provider** | `provider@nuvexa.test` | `provider123` | Child registration, dose administration, and record management |
| **Clinic Staff** | `clinic@nuvexa.test` | `clinic123` | Patient lookup, record updates, and immunization tracking |

---

## 📂 Project Structure

```text
nuvexa/
├── lib/
│   ├── auth.js         # Cryptographic hashing (scrypt), session management & demo seeding
│   ├── db.js           # SQLite relational database engine, schema, and auto-migration
│   ├── idverify.js     # Birth & Government ID verification gateway
│   └── schedule.js     # Immunization schedule definitions and due-date logic
├── public/
│   ├── app.js          # Client-side SPA routing, views, and API client
│   ├── index.html      # Application shell and semantic HTML layout
│   └── style.css       # Clean, modern, responsive design system
├── server.js           # HTTP server, REST API routing, and static file delivery
└── package.json        # Project metadata and run scripts
```

---

## 🔌 API Overview

All API endpoints exchange JSON payloads and require Bearer authentication for protected routes:

| Method | Endpoint | Description | Access |
|---|---|---|---|
| `POST` | `/api/register` | Register a new provider with license details | Public |
| `POST` | `/api/login` | Authenticate and obtain session token | Public |
| `GET` | `/api/me` | Fetch active user profile and permissions | Authenticated |
| `GET` | `/api/children` | Search children by name, ID, or guardian | Providers / Clinics |
| `POST` | `/api/children` | Register a new child with verified ID | Providers / Clinics |
| `GET` | `/api/children/:id` | Retrieve comprehensive child record & schedule | Providers / Clinics |
| `POST` | `/api/children/:id/doses` | Record an administered vaccine dose | Providers / Clinics |
| `POST` | `/api/children/:id/doses/:id/void` | Void an erroneously recorded dose with reason | Providers / Clinics |
| `GET` | `/api/dashboard` | Public health coverage, metrics & recall queue | Providers / Clinics |
| `GET` | `/api/admin/users` | List registered healthcare accounts | Administrator |
| `POST` | `/api/admin/users/:id/approve` | Approve or revoke provider facility access | Administrator |
| `GET` | `/api/admin/audit` | View comprehensive immutable activity audit log | Administrator |

---

## 🔒 Production Readiness Roadmap

Before deploying Nuvexa in an enterprise clinical environment, ensure the following steps are addressed:

1. **Database Adapter**: Replace `lib/db.js` with an enterprise relational database (e.g., PostgreSQL or MySQL) or a HIPAA-compliant cloud database.
2. **Transport Security (HTTPS)**: Terminate TLS/SSL via reverse proxy (Nginx, Caddy, or Cloudflare) or enable HTTPS certificates.
3. **Registry Integration**: Connect `lib/idverify.js` to your jurisdiction's official civil registration and vital statistics (CRVS) API.
4. **Schedule Customization**: Review and configure `lib/schedule.js` against local health ministry guidelines and regional schedules.
5. **Rate Limiting & Headers**: Implement request throttling, CORS restrictions, and security headers (CSP, HSTS).

---

## 👩‍💻 Author & Developer

| Contributor | Role | Focus |
|---|---|---|
| **Yusra Abdulrahman** | **Solo Developer & Software Engineer** | Full-Stack Architecture, Backend APIs, Security & Frontend UI |

Designed and developed independently by **Yusra Abdulrahman**.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
