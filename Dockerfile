# The Project Analyst Co. — backend container
# No external npm packages are needed (server.js only uses Node built-ins),
# so this Dockerfile is intentionally minimal.

FROM node:20-alpine

WORKDIR /app

# Copy package files first (better layer caching if you add dependencies later)
COPY package.json ./

# Copy the rest of the app
COPY . .

# Back4app (and most hosts) inject their own PORT env variable at runtime.
# server.js already reads process.env.PORT, so this EXPOSE is just documentation.
EXPOSE 3000

CMD ["node", "server.js"]
