# Foundational Tech Stack Manifest

This document explicitly defines the core technologies underpinning the Red Planet Core (Z-Cortex) and the Hermes Agent ecosystem. 

Before hallucinating syntax or guessing API versions, the Antigravity Agent and the Hermes Agent must check these exact URLs to ensure context accuracy.

## 1. Model Context Protocol (MCP)
- **Role**: The standard protocol for connecting AI models to data sources and tools.
- **Specification URL**: https://raw.githubusercontent.com/modelcontextprotocol/specification/main/schema/schema.json
- **Documentation**: https://modelcontextprotocol.io/docs
- **GitHub Repository**: https://github.com/modelcontextprotocol

## 2. PostgreSQL & pgvector
- **Role**: The core relational and vector database driving Z-Cortex and OpenBrain.
- **pgvector Documentation**: https://github.com/pgvector/pgvector

## 3. Node.js & Express
- **Role**: The high-performance API routing layer for Z-Cortex tools and HTTP endpoints.
- **Node.js Documentation**: https://nodejs.org/docs/latest-v20.x/api/
- **Express Documentation**: https://expressjs.com/en/5x/api.html

## 4. Hermes Agent
- **Role**: The autonomous agent running locally to interact with Z-Cortex.
- **GitHub Repository**: https://github.com/NousResearch/hermes-agent
- **Configuration**: Managed natively via `config.yaml` using `@modelcontextprotocol` dependencies.

## 5. Google Gemini (Generative AI API)
- **Role**: Used internally by OpenBrain for generating 768-dimensional embeddings and structural reasoning.
- **Node.js SDK**: https://github.com/google-gemini/generative-ai-js
- **Model**: text-embedding-004

*(Note: Payload CMS is deliberately excluded from this core OS manifest. Payload integration is handled downstream in the web presentation layer.)*
