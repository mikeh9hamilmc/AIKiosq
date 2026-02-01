# Stage 1: Build the React application
FROM node:20-alpine as build

WORKDIR /app

# Accept API Key as a build argument
ARG GEMINI_API_KEY
# Set it as an environment variable so Vite can read it during build
ENV GEMINI_API_KEY=$GEMINI_API_KEY

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Copy Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Validates that the container is listening on the expected port (8080 for Cloud Run)
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
