# ==============================================================================
# STAGE 1: Build the React Web UI
# ==============================================================================
# 1. Start from a lightweight Linux with Node 20
FROM node:20-alpine AS web-builder

# 2. Set the working directory inside this temporary container
WORKDIR /build/web

# 3. Copy only package.json and package-lock.json first
COPY dashboard/web/package*.json ./

# 4. Install npm dependencies
RUN npm install

# 5. Copy the source code of the web dashboard
COPY dashboard/web/ ./

# 6. Run the build (Vite + TypeScript) -> creates /build/web/dist
RUN npm run build


# ==============================================================================
# STAGE 2: Build the Node.js Server
# ==============================================================================
# 7. Start another temporary Node 20 container to build the server
FROM node:20-alpine AS server-builder

WORKDIR /build/server

# 8. Copy server package files
COPY dashboard/server/package*.json ./

# 9. Install server dependencies (including typescript)
RUN npm install

# 10. Copy server source code and prisma schema
COPY dashboard/server/ ./

# 11. Generate Prisma Client and compile TypeScript to JavaScript -> creates /build/server/dist
RUN npx prisma generate && npm run build


# ==============================================================================
# STAGE 3: Final Production Runtime (Python 3.11 + Node.js)
# ==============================================================================
# 12. Start our real, final container using Python 3.11 on Debian Linux
FROM python:3.12-slim

# 13. Install system C libraries needed by Python's lxml package
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libxml2 \
    libxslt1.1 \
    libxml2-dev \
    libxslt1-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 14. Install Node.js 20 inside this Python container
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# 15. Create our main app directory inside the container
WORKDIR /app

# 16. Copy the Python meca-engine code from your Mac into /app/meca-engine
COPY meca-engine/ /app/meca-engine/

# 17. Install meca-engine and its AWS + SFTP dependencies into the container's Python
RUN pip install --no-cache-dir -e "/app/meca-engine[aws,sftp]"

# 18. Switch into the server directory
WORKDIR /app/dashboard/server

# 19. Copy package.json, prisma schema, and install runtime packages + generate client
COPY dashboard/server/package*.json ./
COPY dashboard/server/prisma ./prisma
RUN npm install --omit=dev && npx prisma generate

# 20. Copy the compiled server JS from STAGE 2 into here
COPY --from=server-builder /build/server/dist ./dist

# 21. Copy the compiled React UI from STAGE 1 into /app/dashboard/web/dist
COPY --from=web-builder /build/web/dist /app/dashboard/web/dist

# 22. Dynamic Port & Runtime Environment variables
# Can be overridden during build (--build-arg PORT=...) or runtime (-e PORT=...)
ARG PORT=4000
ENV PORT=${PORT}
ENV NODE_ENV=production
ENV DASHBOARD_PYTHON_BIN=python3
ENV DASHBOARD_PYTHONPATH_EXTRA=/app/meca-engine/src

# 23. Expose the configured port dynamically
EXPOSE ${PORT}

# 24. The default command executed when the container starts
CMD ["node", "dist/index.js"]