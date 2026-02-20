# GreenBranch

> **Autonomous DevOps Agent** — Automatically detect, analyze, and fix failing CI/CD pipelines using AI

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation & Setup](#installation--setup)
- [Environment Configuration](#environment-configuration)
- [Running the Application](#running-the-application)
- [API Endpoints](#api-endpoints)
- [Workflow & Pipeline](#workflow--pipeline)
- [Development Guide](#development-guide)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

**GreenBranch** is an intelligent DevOps assistant that transforms broken CI/CD pipelines into passing ones automatically. It connects to your GitHub repositories, runs your test suite, analyzes failures using advanced LLMs, and applies targeted fixes—all without human intervention.

### Key Benefits
- **🤖 Autonomous** — Runs the complete fix pipeline without manual intervention
- **⚡ Fast** — Iteratively fixes code until tests pass
- **🧠 Intelligent** — Uses LLMs (Groq) to understand and fix issues
- **📊 Detailed Reports** — Comprehensive logs and fix tracking
- **🔄 CI/CD Friendly** — Seamless GitHub integration
- **📈 Iterative Learning** — Improves fixes with each iteration

---

## ✨ Features

### Core Capabilities

| Feature | Description |
|---------|-------------|
| **GitHub Integration** | Connect and authenticate with GitHub repositories |
| **Automated Testing** | Run your project's test suite automatically |
| **Issue Detection** | Parse and understand test failures |
| **AI-Powered Fixes** | Generate fixes using LLM analysis |
| **Iterative Resolution** | Re-run tests until pipeline passes |
| **Branch Management** | Create feature branches with fixes |
| **Pull Requests** | Auto-create PRs with detailed fix information |
| **Real-time Streaming** | WebSocket support for live progress updates |
| **Comprehensive Logging** | Detailed logs of all operations |

---

## 🏗️ Architecture

GreenBranch is a **microservices-based** system with three main components:

![Architecture Diagram](https://github.com/user-attachments/assets/400c4830-450b-4181-8798-b43f0639ae2a)

```
┌─────────────────────────────────────────────────────────────┐
│                      FRONTEND (Next.js)                      │
│  • User Dashboard & Repository Management                   │
│  • Real-time Progress Streaming                             │
│  • GitHub OAuth Authentication                              │
│  • CLI Tool Integration                                     │
└──────────┬──────────────────────────────┬───────────────────┘
           │                              │
           │ HTTP/WebSocket               │ HTTP
           │                              │
    ┌──────▼──────────┐           ┌──────────▼────────────┐
    │   SERVER-AI     │           │   SERVER-EC2         │
    │     (EC2)       │           │      (EC2)           │
    ├─────────────────┤           ├──────────────────────┤
    │ • LangGraph     │           │ • Docker Manager     │
    │ • Groq LLM      │           │ • Test Execution     │
    │ • Fix Logic     │           │ • Git Operations     │
    │ • State Mgmt    │           │ • Redis Sessions     │
    │ • PR Creation   │           │ • File Management    │
    └────────┬────────┘           └──────────┬───────────┘
             │                               │
             └───────────┬───────────────────┘
                         │
              ┌──────────▼──────────┐
              │  External Services  │
              ├─────────────────────┤
              │ • GitHub API        │
              │ • Docker Hub        │
              │ • Groq API          │
              │ • Redis             │
              └─────────────────────┘
```

### Service Responsibilities

**Frontend (Next.js - Vercel)**
- Web interface for users
- Dashboard for repository management
- Real-time progress visualization
- GitHub OAuth authentication
- WebSocket connection for streaming logs

**Server-AI (FastAPI - EC2)**
- Orchestrates the LangGraph healing pipeline
- Analyzes test failures using LLM
- Generates code fixes
- Manages PR creation
- Handles agent run logic

**Server-EC2 (FastAPI - EC2)**
- Executes Docker containers for tests
- Manages Git repository cloning and operations
- Runs test suites
- Handles file operations
- Manages session storage with Redis

---

## 📁 Project Structure

```
green-branch/
├── frontend/                          # Next.js Web Application
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx            # Root layout with providers
│   │   │   ├── page.tsx              # Landing page
│   │   │   ├── api/                  # API routes (auth, GitHub)
│   │   │   ├── dashboard/            # Dashboard page
│   │   │   ├── signin/               # Sign-in page
│   │   │   └── debug/                # Debug utilities page
│   │   ├── components/
│   │   │   ├── header.tsx            # Header component
│   │   │   ├── login.tsx             # Login component
│   │   │   ├── dashboard/            # Dashboard sub-components
│   │   │   ├── theme/                # Theme provider
│   │   │   └── ui/                   # Reusable UI components
│   │   ├── lib/
│   │   │   ├── auth-options.ts       # NextAuth configuration
│   │   │   └── utils.ts              # Utility functions
│   │   └── types/
│   │       └── next-auth.d.ts        # TypeScript definitions
│   ├── public/                        # Static assets
│   ├── package.json                  # Dependencies & scripts
│   ├── tsconfig.json                 # TypeScript config
│   ├── next.config.ts                # Next.js config
│   └── tailwind.config.ts            # Tailwind CSS config
│
├── server-ai/                         # AI Healing Pipeline
│   ├── src/
│   │   ├── app/
│   │   │   ├── app.py                # FastAPI app initialization
│   │   │   ├── api.py                # Main API module
│   │   │   ├── config.py             # Configuration management
│   │   │   └── handlers.py           # Error handlers
│   │   ├── endpoints/
│   │   │   ├── agent.py              # Agent run endpoint
│   │   │   ├── agent_ws.py           # WebSocket endpoint
│   │   │   ├── pr.py                 # PR creation endpoint
│   │   │   └── health.py             # Health check endpoint
│   │   ├── graph/
│   │   │   └── healing_graph.py      # LangGraph pipeline definition
│   │   ├── nodes/
│   │   │   ├── execute_tests.py      # Test execution node
│   │   │   ├── select_error.py       # Error selection node
│   │   │   └── fix_code.py           # Code fixing node
│   │   ├── llm/
│   │   │   └── llm_client.py         # Groq LLM client
│   │   ├── runner/
│   │   │   ├── agent_runner.py       # Main agent orchestration
│   │   │   └── streaming_runner.py   # Streaming runner
│   │   ├── services/
│   │   │   └── ec2_client.py         # EC2 service client
│   │   ├── models/
│   │   │   └── agent.py              # Data models
│   │   ├── state/
│   │   │   └── graph_state.py        # LangGraph state definition
│   │   └── core/
│   │       └── exceptions.py         # Custom exceptions
│   ├── pyproject.toml               # Project config & dependencies
│   ├── settings.toml                # Environment settings
│   └── Dockerfile                   # Docker image config
│
├── server-ec2/                       # Execution & Docker Management
│   ├── src/
│   │   ├── app/
│   │   │   ├── app.py               # FastAPI app initialization
│   │   │   ├── api.py               # Main API module
│   │   │   ├── config.py            # Configuration management
│   │   │   └── handlers.py          # Error handlers
│   │   ├── endpoints/
│   │   │   ├── execution.py         # Test execution endpoint
│   │   │   ├── streaming_execution.py # Streaming execution
│   │   │   ├── session.py           # Session management endpoint
│   │   │   ├── fix.py               # Fix endpoint
│   │   │   ├── files.py             # File operation endpoint
│   │   │   └── health.py            # Health check endpoint
│   │   ├── services/
│   │   │   ├── docker_service.py    # Docker operations
│   │   │   ├── git_service.py       # Git operations
│   │   │   ├── test_runner.py       # Test execution logic
│   │   │   └── session_store.py     # Redis session storage
│   │   ├── models/
│   │   │   ├── execution.py         # Execution models
│   │   │   ├── fix.py               # Fix models
│   │   │   └── session.py           # Session models
│   │   ├── core/
│   │   │   ├── docker_manager.py    # Docker management
│   │   │   └── exceptions.py        # Custom exceptions
│   │   └── utils/
│   │       └── parsers.py           # Utility parsers
│   ├── pyproject.toml              # Project config & dependencies
│   ├── settings.toml               # Environment settings
│   └── Dockerfile                  # Docker image config
│
└── .github/                         # GitHub workflows & config
```

---

## 🛠️ Tech Stack

### Frontend
- **Framework:** Next.js 16.1.6
- **Language:** TypeScript 5
- **UI Components:** Radix UI, shadcn/ui
- **Styling:** Tailwind CSS 4
- **Authentication:** NextAuth.js 4.24
- **HTTP Client:** Axios
- **Animations:** Framer Motion

### Backend - Server-AI
- **Framework:** FastAPI 0.129.0
- **Language:** Python 3.11+
- **Orchestration:** LangGraph 1.0.8
- **LLM Provider:** Groq API
- **Server:** Uvicorn
- **Config:** Pydantic Settings
- **HTTP Client:** httpx

### Backend - Server-EC2
- **Framework:** FastAPI 0.129.0
- **Language:** Python 3.11+
- **Container Management:** Docker
- **Caching:** Redis 5.0
- **Version Control:** GitPython
- **Server:** Uvicorn
- **Config:** Pydantic Settings

### Infrastructure
- **Containerization:** Docker
- **Session Storage:** Redis
- **CORS:** FastAPI CORS Middleware
- **VCS:** Git

---

## 📦 Prerequisites

### System Requirements

- **OS:** Windows, macOS, or Linux
- **Docker:** v7.0+ (for running containers)
- **Node.js:** v18+ (for frontend development)
- **Python:** v3.11+ (for backend services)
- **Git:** v2.30+ (for version control)
- **Redis:** v5.0+ (for session management)

### External Services

1. **GitHub OAuth Application**
   - Create a GitHub OAuth app for authentication
   - Required: Client ID and Client Secret
   - [Create GitHub OAuth App](https://github.com/settings/developers)

2. **Groq API Key**
   - Sign up for Groq LLM access
   - [Get Groq API Key](https://console.groq.com)

### Required Tools

```bash
# Verify installations
node --version        # v18 or higher
npm --version         # 9 or higher
python --version      # 3.11 or higher
docker --version      # 7.0 or higher
redis-cli --version   # 5.0 or higher
git --version         # 2.30 or higher
```

---

## 🚀 Installation & Setup

### Step 1: Clone Repository

```bash
git clone https://github.com/saiabhiramjaini/green-branch.git
cd green-branch
```

### Step 2: Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create .env.local file
cat > .env.local << EOF
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_EC2_API_URL=http://localhost:8001
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=$(openssl rand -base64 32)
GITHUB_ID=your_github_oauth_client_id
GITHUB_SECRET=your_github_oauth_client_secret
EOF

# Build the frontend (optional, dev mode works too)
npm run dev
```

### Step 3: Server-AI Setup

```bash
cd server-ai

./run.bat

# Create .env file
cat > .env << EOF
# App Configuration
APP_NAME=GreenBranch AI
VERSION=1.0.0
DEBUG=false

# EC2 Agent Configuration
EC2_AGENT_URL=http://localhost:8001
EC2_AGENT_TIMEOUT=300

# LLM Configuration
GROQ_API_KEY=your_groq_api_key
LLM_MODEL=mixtral-8x7b-32768

# Agent Configuration
MAX_ITERATIONS=5
TEAM_NAME=GreenBranch

# CORS Configuration
CORS_ALLOW_ORIGINS=http://localhost:3000,http://localhost:8001

# Logging
LOG_LEVEL=INFO
EOF
```

### Step 4: Server-EC2 Setup

```bash
cd server-ec2

./run.bat

# Create .env file
cat > .env << EOF
# App Configuration
APP_NAME=EC2 Agent
VERSION=1.0.0
DEBUG=false

# Server Configuration
PORT=8001

# Docker Configuration
DOCKER_SOCKET_URL=unix:///var/run/docker.sock

# Session Configuration
REDIS_URL=redis://localhost:6379/0
SESSION_TTL=3600

# Repository Configuration
REPOS_BASE_PATH=/tmp/repos

# CORS Configuration
CORS_ALLOW_ORIGINS=http://localhost:3000,http://localhost:8000

# Logging
LOG_LEVEL=INFO
EOF
```

### Step 5: Redis Setup

```bash
# If using Docker for Redis:
docker run -d \
  --name greenbranch-redis \
  -p 6379:6379 \
  redis:7-alpine

# Or if Redis is installed locally, start it:
redis-server
```

---

## ⚙️ Environment Configuration

### Frontend Environment Variables

```env
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_EC2_API_URL=http://localhost:8001
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_securely_generated_secret
GITHUB_ID=your_github_oauth_app_id
GITHUB_SECRET=your_github_oauth_app_secret
```

### Server-AI Environment Variables

```env
# .env or settings.toml
APP_NAME=GreenBranch AI
VERSION=1.0.0
DEBUG=false
PORT=8000

EC2_AGENT_URL=http://localhost:8001
EC2_AGENT_TIMEOUT=300

GROQ_API_KEY=your_groq_api_key
LLM_MODEL=mixtral-8x7b-32768

MAX_ITERATIONS=5
TEAM_NAME=GreenBranch

CORS_ALLOW_ORIGINS=http://localhost:3000,http://localhost:8001
```

### Server-EC2 Environment Variables

```env
# .env or settings.toml
APP_NAME=EC2 Agent
VERSION=1.0.0
DEBUG=false
PORT=8001

DOCKER_SOCKET_URL=unix:///var/run/docker.sock
REDIS_URL=redis://localhost:6379/0
SESSION_TTL=3600
REPOS_BASE_PATH=/tmp/repos

CORS_ALLOW_ORIGINS=http://localhost:3000,http://localhost:8000
```

---

## ▶️ Running the Application

### Option 1: Run All Services Locally (Development)

#### Terminal 1: Frontend
```bash
cd frontend
npm run dev
# Frontend runs at http://localhost:3000
```

#### Terminal 2: Server-AI
```bash
cd server-ai
source venv/bin/activate  # or venv\Scripts\activate on Windows
uvicorn src.app.api:app --reload --host 0.0.0.0 --port 8000
# API docs: http://localhost:8000/docs
```

#### Terminal 3: Server-EC2
```bash
cd server-ec2
source venv/bin/activate  # or venv\Scripts\activate on Windows
uvicorn src.app.api:app --reload --host 0.0.0.0 --port 8001
# API docs: http://localhost:8001/docs
```

#### Terminal 4: Redis (if not using Docker)
```bash
redis-server
```

### Option 2: Run Using Docker Compose

Create a `docker-compose.yml` in the root directory:

```yaml
version: '3.9'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  server-ec2:
    build: ./server-ec2
    ports:
      - "8001:8001"
    environment:
      - APP_NAME=EC2 Agent
      - PORT=8001
      - REDIS_URL=redis://redis:6379/0
      - REPOS_BASE_PATH=/tmp/repos
      - DEBUG=false
    depends_on:
      - redis
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock

  server-ai:
    build: ./server-ai
    ports:
      - "8000:8000"
    environment:
      - APP_NAME=GreenBranch AI
      - PORT=8000
      - EC2_AGENT_URL=http://server-ec2:8001
      - GROQ_API_KEY=${GROQ_API_KEY}
      - LLM_MODEL=mixtral-8x7b-32768
      - DEBUG=false
    depends_on:
      - server-ec2
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://server-ai:8000
      - NEXT_PUBLIC_EC2_API_URL=http://server-ec2:8001
      - NEXTAUTH_URL=http://localhost:3000
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - GITHUB_ID=${GITHUB_ID}
      - GITHUB_SECRET=${GITHUB_SECRET}
    depends_on:
      - server-ai
      - server-ec2

volumes:
  redis_data:
```

Then run:

```bash
docker-compose up -d
```

### Verify Services Are Running

```bash
# Check Frontend
curl http://localhost:3000

# Check Server-AI Health
curl http://localhost:8000/api/v1/health

# Check Server-EC2 Health
curl http://localhost:8001/api/v1/health

# Check Redis
redis-cli ping  # Should return PONG
```

---

## 📡 API Endpoints

### Frontend Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/` | GET | Landing page |
| `/signin` | GET | GitHub OAuth signin page |
| `/dashboard` | GET | Main dashboard |
| `/debug` | GET | Debug utilities page |
| `/api/auth/*` | GET/POST | NextAuth routes |
| `/api/github/repos` | GET | Get GitHub repositories |

### Server-AI Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/health` | GET | Health check |
| `/api/v1/agent/run` | POST | Trigger agent healing pipeline |
| `/api/v1/agent/ws` | WebSocket | Real-time streaming updates |
| `/api/v1/pr/create` | POST | Create pull request with fixes |

### Server-EC2 Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/health` | GET | Health check |
| `/api/v1/session` | POST | Create/manage session |
| `/api/v1/execution/run` | POST | Execute tests |
| `/api/v1/execution/stream` | WebSocket | Stream test output |
| `/api/v1/fix/apply` | POST | Apply code fixes |
| `/api/v1/files` | GET | Get file operations |

---

## 🔄 Workflow & Pipeline

### Complete GreenBranch Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  User connects GitHub repo via Dashboard                    │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 1: Repository Cloning & Setup                         │
│  ├─ Clone repository from GitHub                            │
│  ├─ Checkout specified branch                               │
│  └─ Create isolated environment (Docker)                    │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 2: Dependency Installation                            │
│  ├─ Run install command (npm install, pip install, etc.)   │
│  └─ Prepare environment                                     │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
    ┌────────────────────────────────┐
    │  HEALING LOOP (Max Iterations)  │
    └────────────┬───────────────────┘
                 │
                 ▼
    ┌─────────────────────────────┐
    │ Step 3: Execute Tests       │
    │ ├─ Run test command         │
    │ ├─ Capture output           │
    │ └─ Parse results            │
    └────────┬────────────────────┘
             │
             ├─ All tests pass? ─────YES──> Exit Loop ✓
             │
             NO
             │
             ▼
    ┌─────────────────────────────┐
    │ Step 4: Select Error        │
    │ ├─ Identify failure          │
    │ ├─ Extract error message     │
    │ └─ Get relevant code context │
    └────────┬────────────────────┘
             │
             ▼
    ┌─────────────────────────────┐
    │ Step 5: Generate Fix        │
    │ ├─ Send to Groq LLM         │
    │ ├─ Analyze problem          │
    │ ├─ Generate solution        │
    │ └─ Create patch             │
    └────────┬────────────────────┘
             │
             ▼
    ┌─────────────────────────────┐
    │ Step 6: Apply Fix           │
    │ ├─ Update source code       │
    │ ├─ Validate syntax          │
    │ └─ Commit changes           │
    └────────┬────────────────────┘
             │
             └──────┬─────────────┬──────────────────┘
                    │             │
                    └─── Re-run Tests (Loop back)
                    
                    OR Max iterations reached
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 7: Create Pull Request                                │
│  ├─ Create branch (TEAM_AGENT_Fix)                         │
│  ├─ Push to GitHub                                          │
│  ├─ Create PR with fix details                              │
│  └─ Return results to dashboard                             │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│  Display Results to User                                    │
│  ├─ Summary of fixes applied                                │
│  ├─ Timeline of iterations                                  │
│  ├─ Links to created PR                                     │
│  └─ Detailed execution logs                                 │
└─────────────────────────────────────────────────────────────┘
```

### LangGraph State Machine

The `server-ai` service uses LangGraph to manage the healing pipeline state:

```
Graph Nodes:
┌──────────────────┐
│ execute_tests    │  Runs the test suite and captures results
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ select_error     │  Identifies the current failure
└────────┬─────────┘
         │
         ├─ Tests Passed? ──────────────> END
         │
         ├─ Max Iterations? ────────────> END
         │
         └─ Fix Needed? ──────────────┐
                                      │
                                      ▼
                              ┌──────────────────┐
                              │ fix_code         │
                              └────────┬─────────┘
                                       │
                                       └──> Back to execute_tests
```
