FROM ubuntu:24.04

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    python3 \
    python3-pip \
    python3-venv \
    sudo \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# Prepare application directory
WORKDIR /app

# Copy the bridge server files
COPY package.json server.js ./

# Install node-pty dependencies and rebuild
RUN npm install && \
    npm rebuild node-pty

# Set up environment variables
ENV PORT=8080
EXPOSE 8080

# Run the WebSocket bridge
CMD ["node", "server.js"]
