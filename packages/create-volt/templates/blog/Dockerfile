# Volt app — production container. Runs on Render, Fly.io, Railway, DO App
# Platform, and any container host. They handle the server, DNS, and TLS; you
# just set config as env vars.
#
# Configure via the platform's env vars (NOT a committed .env):
#   VOLT_ADDONS=db,auth,...      DB_DRIVER=...   MONGODB_URI / DATABASE_URL
#   MEDIA_DRIVER=s3   S3_ENDPOINT/S3_REGION/S3_BUCKET/S3_KEY/S3_SECRET   etc.
#
# Tip: run the local wizard first (`npm run dev`) so the add-on packages are
# saved into package.json; commit package.json, then deploy and set the same
# config as env vars here. NODE_ENV=production makes the app boot straight up
# (no setup wizard).
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
