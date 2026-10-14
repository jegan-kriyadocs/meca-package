# MECA Platform — Developer & Deployment Guide

This guide explains how to configure and run the MECA Platform in **Local Development** and **Production Deployment**.

---

## 1. Quick Comparison: Local vs. Production

| Feature | Local Development | Production (AWS ECS / Cloud) |
| :--- | :--- | :--- |
| **Env File** | `.env.local.example` $\rightarrow$ `.env` | `.env.production.example` $\rightarrow$ `.env` |
| **Compose File** | `docker-compose.yml` | `docker-compose.prod.yml` |
| **Database** | Optional (Runs in file-based mode if unset) or local PostgreSQL container | AWS RDS PostgreSQL (`sslmode=require`) |
| **Input Source** | Local disk (`./Input`) | Amazon S3 (`input.provider: S3`) |
| **Output Destination**| Local disk (`./archive_migration_validation`) | Remote SFTP (`output.provider: SFTP`) |
| **AWS Credentials** | Local AWS SSO / Credentials (or mocked) | IAM Task Role (Automatic, no secret keys) |

---

## 2. Local Development

### Option A: Standalone File-Based Mode (Fastest, No Database)
If you do not have PostgreSQL running, the system will **automatically run in file-based mode**. No database errors or connection logs will be triggered.

1. Copy the local template:
   ```bash
   cp .env.local.example .env
   ```
2. Start the web dashboard and backend:
   ```bash
   cd dashboard
   npm run dev
   ```
   * Web UI: `http://localhost:5173`
   * API Server: `http://localhost:4000`

### Option B: Local Mode with Docker & PostgreSQL
To run the full stack locally with PostgreSQL:

1. Copy the local template:
   ```bash
   cp .env.local.example .env
   ```
2. In `.env`, ensure `DATABASE_URL` is uncommented:
   ```env
   DATABASE_URL=postgres://meca_user:meca_password@localhost:5432/meca_db
   ```
3. Start all containers (App + PostgreSQL):
   ```bash
   docker compose up -d
   ```
4. Access the application at `http://localhost:4000`.

---

## 3. Production Deployment (AWS ECS / Fargate)

### Step 1: Prepare Environment Configuration
Copy the production template:
```bash
cp .env.production.example .env
```
Fill in your credentials:
```env
PORT=4000
NODE_ENV=production
MECA_ENGINE_ENVIRONMENT=production

# 1. AWS RDS PostgreSQL (Required in production)
DATABASE_URL=postgresql://<RDS_USER>:<RDS_PASSWORD>@<RDS_HOST>:5432/<DB_NAME>?sslmode=require

# 2. AWS S3 Input Source
AWS_REGION=us-east-1
S3_BUCKET_NAME=your-meca-input-bucket
S3_INPUT_PREFIX=submissions/

# 3. SFTP Output Destination (Port 22 SSH)
SFTP_HOST=your-sftp-host.example.com
SFTP_PORT=22
SFTP_USER=your_sftp_user
SFTP_PASSWORD=your_sftp_password
SFTP_REMOTE_DIR=/sftp/meca
```

> **AWS IAM Note**: When running on AWS ECS, attach an IAM Task Role with `s3:GetObject` and `s3:ListBucket` permissions to your ECS Task Definition. The AWS SDK reads credentials automatically from the container metadata without requiring static `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY`.

### Step 2: Configure Engine Providers
You can configure providers directly in the **Web Dashboard** under the **Configuration** tab (or in `meca-engine/config/runtime.yaml`):
* **Input Provider**: Choose `S3` (to read from S3 bucket) or `LOCAL` (to read from disk).
* **Output Provider**: Choose `SFTP` (to upload certified packages over SSH) or `LOCAL` (to keep in repository).

### Step 3: Initialize Database Schema (First-Time Setup)
When connecting to a new AWS RDS PostgreSQL instance for the first time, sync the Prisma schema:
```bash
npx prisma db push --schema=dashboard/server/prisma/schema.prisma
```

### Step 4: Build & Deploy Docker Image
Build and run with the production compose file:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

---

## 4. Health Checks & Verification
* **API Health Check**: `GET /api/health`
  * When DB is connected: `{"status": "healthy", "database": "connected"}`
  * When DB is disabled: `{"status": "healthy", "database": "disabled (file-based mode)"}`
