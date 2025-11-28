# Antigravity Gateway

<div align="center">
  <img src="client/public/rocket.svg" width="120" alt="Antigravity Logo" />
  <h3>Google Antigravity API to OpenAI Proxy</h3>
  <p>
    A high-performance gateway that converts Google Antigravity API to OpenAI-compatible format.
    <br />
    Features a modern admin dashboard with multi-account rotation, automatic token refresh, API key management, and real-time monitoring.
  </p>
  <p>
    <a href="https://github.com/liuw1535/antigravity2api-nodejs">
      <img src="https://img.shields.io/badge/Original_Project-liuw1535/antigravity2api--nodejs-blue?style=flat-square&logo=github" alt="Original Project" />
    </a>
  </p>
</div>

> [!NOTE]
> This project is based on [liuw1535/antigravity2api-nodejs](https://github.com/liuw1535/antigravity2api-nodejs) with additional development and optimizations.

---

## ⚠️ Important Notice

> [!WARNING]
> **Usage Risk Warning**
> - This project is for learning and technical research only. Do not use for commercial purposes or scenarios that violate terms of service
> - Using this project may violate Google's Terms of Service and carries the risk of account suspension
> - Keep your `data/accounts.json` file secure as it contains sensitive access credentials
> - Do not commit account data files to version control or share them publicly
> - Users assume all responsibility for any consequences arising from the use of this project

---

## ✨ Features

### Core Features
- **OpenAI Compatible**: Fully compatible with OpenAI Chat Completions API format, seamlessly integrating with existing ecosystems
- **Streaming Response**: Supports SSE (Server-Sent Events) streaming output for a smooth experience
- **Multimodal Support**: Supports text and Base64-encoded image input (GPT-4 Vision compatible)
- **Tool Calling**: Supports Function Calling to extend model capabilities

### Enhanced Features
- **Multi-Account Pool**: Configure multiple Google accounts with automatic load balancing and rotation
- **Automatic Token Refresh**: Built-in token refresh mechanism that automatically handles expiration and 403 errors
- **High Concurrency Support**: Optimized request processing queue for high-concurrency scenarios

### Admin Dashboard
- **Modern UI**: Minimalist design built with React + Tailwind CSS
- **Key Management**: Create, delete, and disable API keys with quota and expiration settings
- **Token Management**: Visual management of Google accounts with real-time token status
- **System Monitoring**: Real-time monitoring of CPU, memory, request count, and response time
- **Online Testing**: Built-in chat debugging interface for testing model performance
- **Log Auditing**: Complete request logging and querying

## 🛠️ Tech Stack

- **Backend**: Node.js (Express), Native Fetch
- **Frontend**: React, Vite, Tailwind CSS, Framer Motion, Lucide React
- **Data Storage**: Local JSON file storage (lightweight, no external database dependency)

## 🚀 Quick Start

### Requirements
- Node.js >= 18.0.0

### 1. Installation and Build

```bash
# Install project dependencies
npm install

# Build frontend assets
npm run build
```

### 2. Configuration

Edit the `config.json` file in the root directory:

```json
{
  "server": {
    "port": 8045,           // Server port
    "host": "0.0.0.0"       // Listen address
  },
  "security": {
    "apiKey": "sk-admin",   // Admin/default API Key
    "maxRequestSize": "50mb" // Maximum request body size
  },
  "defaults": {
    "model": "gemini-2.0-flash-exp" // Default model
  }
}
```

### 3. Add Google Account

Run the OAuth login script to obtain an Access Token:

```bash
npm run login
```

Follow the prompts to authorize in your browser. The obtained token will be automatically saved to `data/accounts.json`.

> [!CAUTION]
> **Data Security Warning**
> - The `data/accounts.json` file contains your Google account access tokens and is highly sensitive
> - Ensure proper file permissions (recommended: chmod 600), readable/writable only by owner
> - **Never** upload this file to public repositories like GitHub or Gitee
> - **Never** share this file with others or expose it to public networks
> - Regularly check your `.gitignore` file to ensure the `data/` directory is excluded
> - If token leakage is discovered, immediately revoke the application permissions in your Google account settings

### 4. Start the Service

```bash
# Production mode
npm start

# Development mode (with hot reload)
npm run dev
```

After starting, visit `http://localhost:8045` to access the admin dashboard.

> [!TIP]
> **First Login**
> - Default admin password: `admin123`
> - Please change the password in the settings page after login to ensure security

## 🔌 API Usage Guide

### Base URL
`http://localhost:8045`

### Authentication
All requests require an API Key in the header:
`Authorization: Bearer <YOUR_API_KEY>`

### 1. Get Model List
`GET /v1/models`

### 2. Chat Completions
`POST /v1/chat/completions`

**Request Example:**
```bash
curl http://localhost:8045/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-admin" \
  -d '{
    "model": "gemini-2.0-flash-exp",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

## 📂 Project Structure

```
.
├── client/                 # Frontend React project
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── pages/          # Page components
│   │   └── ...
│   └── ...
├── data/                   # Data storage directory
│   ├── accounts.json       # Google account data
│   ├── keys.json           # API Key data
│   └── ...
├── src/                    # Backend source code
│   ├── server/             # Server entry point
│   ├── api/                # API route handlers
│   ├── auth/               # Authentication & token management
│   └── ...
├── scripts/                # Utility scripts
├── config.json             # Configuration file
└── package.json
```

## ⚖️ Disclaimer

This project (Antigravity Gateway) is for technical learning, research, and educational purposes only. The developers are not responsible for any consequences arising from the use of this project.

### Terms of Use

1. **Use at Your Own Risk**: Users must fully understand and accept the associated risks when using this project, including but not limited to:
   - Google account suspension, banning, or access restrictions
   - Legal liability from violating Google's Terms of Service
   - Security risks such as data leaks and privacy breaches
   - Technical issues such as service instability and data loss

2. **No Commercial Use**: This project is strictly prohibited for any commercial purposes, including but not limited to:
   - Providing paid API proxy services
   - Using as a component in commercial products
   - Any form of profit-generating activities

3. **Compliant Use**: Users must ensure:
   - Compliance with local laws and regulations
   - Compliance with Google and related service terms of use
   - No use of this project for illegal or infringing activities

4. **Data Security**: Users should:
   - Properly safeguard account credentials and sensitive data
   - Take appropriate security measures to prevent data leaks
   - Take responsibility for security issues caused by negligence

5. **No Warranty**: This project is provided "as is" without any express or implied warranties, including but not limited to:
   - Warranty of merchantability
   - Warranty of fitness for a particular purpose
   - Warranty of non-infringement
   - Warranty of service quality or reliability

### Limitation of Liability

Under no circumstances shall the developers, contributors, or related parties of this project be liable for:
- Any direct, indirect, incidental, special, or consequential damages arising from the use or inability to use this project
- Data loss, business interruption, loss of profits, or other economic losses
- Any third-party claims or lawsuits

**By using this project, you acknowledge that you have fully understood and accepted all of the above terms. If you do not agree, please do not use this project.**

---

## 📝 License

MIT License

The rights and obligations granted by this license do not affect the validity of the above disclaimer.
