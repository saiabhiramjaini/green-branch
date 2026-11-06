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
- [Deployment (Android phone)](#deployment-android-phone)

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
    │   SERVER-AI     │           │   SERVER-RUNNER      │
    │   (FastAPI)     │           │    (FastAPI)         │
    ├─────────────────┤           ├──────────────────────┤
    │ • Heal loop     │           │ • Executor (local    │
    │                 │           │   or Docker)         │
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
              │ • Cloudflare Tunnel │
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

**Server-AI (FastAPI)**
- Runs the healing loop: test → fix → verify, reverting fixes that don't work
- Analyzes test failures using LLM
- Generates code fixes
- Manages PR creation
- Handles agent run logic

**Server-Runner (FastAPI)**
- Runs install/test commands — directly on the host (`local` executor, used on the phone)
  or inside Docker containers (`docker` executor)
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
│   │   ├── llm/
│   │   │   └── llm_client.py         # Groq LLM client
│   │   ├── runner/
│   │   │   ├── streaming_runner.py   # The pipeline: clone → heal loop → commit → PR
│   │   │   └── fix_engine.py         # One fix: find the code, ask the LLM for edits, apply
│   │   ├── services/
│   │   │   └── runner_client.py      # server-runner client
│   │   ├── models/
│   │   │   └── agent.py              # Data models
│   │   └── core/
│   │       └── exceptions.py         # Custom exceptions
│   ├── pyproject.toml               # Project config & dependencies
│   └── Dockerfile                   # Docker image config
│
├── server-runner/                     # Repo cloning & test execution
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
│   │   │   ├── execution_service.py # Install/test commands
│   │   │   ├── executors.py         # Where commands run: local or Docker
│   │   │   ├── git_service.py       # Git operations
│   │   │   ├── test_runner.py       # Test execution logic
│   │   │   └── session_store.py     # Redis session storage
│   │   ├── models/
│   │   │   ├── execution.py         # Execution models
│   │   │   ├── fix.py               # Fix models
│   │   │   └── session.py           # Session models
│   │   ├── core/
│   │   │   ├── docker_manager.py    # Docker client (docker executor)
│   │   │   └── exceptions.py        # Custom exceptions
│   │   └── utils/
│   │       └── parsers.py           # Utility parsers
│   ├── pyproject.toml              # Project config & dependencies
│   └── Dockerfile                  # Docker image config
│
├── deploy/phone/                    # Running the backends on an Android phone
│   ├── README.md                    # Step-by-step guide
│   ├── setup.sh / setup-debian.sh   # One-time setup (Termux, then Debian)
│   ├── start.sh                     # Start everything (also the boot script)
│   ├── ecosystem.config.js          # PM2 processes
│   └── deploy.sh                    # Deploy a commit, roll back if unhealthy
│
└── .github/workflows/               # phone-deploy.yaml, vercel-deploy.yaml
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
- **LLM Provider:** Groq API
- **Server:** Uvicorn
- **Config:** Pydantic Settings
- **HTTP Client:** httpx

### Backend - Server-Runner
- **Framework:** FastAPI 0.129.0
- **Language:** Python 3.11+
- **Execution:** local subprocesses, or Docker containers
- **Caching:** Redis 5.0
- **Version Control:** GitPython
- **Server:** Uvicorn
- **Config:** Pydantic Settings

### Infrastructure
- **Frontend hosting:** Vercel
- **Backend hosting:** an Android phone — Termux, proot-distro Debian, PM2
- **Public access:** Cloudflare Tunnel (HTTPS, WebSocket, and SSH for deploys)
- **CI/CD:** GitHub Actions
- **Session Storage:** Redis
- **CORS:** FastAPI CORS Middleware
- **VCS:** Git

---

## 📦 Prerequisites

### System Requirements

- **OS:** Windows, macOS, or Linux
- **Docker:** only for Server-Runner's `docker` executor
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
npm install

# Create .env.local (see Environment Configuration below)
cat > .env.local << EOF
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=$(openssl rand -base64 32)
GITHUB_ID=your_github_oauth_client_id
GITHUB_SECRET=your_github_oauth_client_secret
RUNNER_URL=http://localhost:8001
RUNNER_API_KEY=dev-runner-key
AGENT_SERVER_URL=http://localhost:8000
AGENT_SERVER_API_KEY=dev-server-key
NEXT_PUBLIC_SERVER_WS_URL=ws://localhost:8000/api/v1
EOF

npm run dev
```

### Step 3: Server-AI Setup

```bash
cd server-ai

cat > .env << EOF
SERVER_API_KEY=dev-server-key
SERVER_RUNNER_URL=http://localhost:8001
SERVER_RUNNER_API_KEY=dev-runner-key
SERVER_GROQ_API_KEY=your_groq_api_key
EOF

uv sync
uv run python -m src.app.api
```

### Step 4: Server-Runner Setup

Server-Runner runs each repo's install and test commands with one of two executors:

- **`local`** — plain processes on this machine, using its own `node`/`npm`/`python3`.
  There is no sandbox, so it only clones repos whose owner is listed in
  `RUNNER_ALLOWED_REPO_OWNERS`. Simplest for development; it's what the phone uses.
- **`docker`** (default) — inside two long-running executor containers, isolated from
  the host. Use it if GreenBranch should fix repos from anyone.

```bash
cd server-runner

# local executor
cat > .env << EOF
RUNNER_API_KEY=dev-runner-key
RUNNER_REDIS_URL=redis://localhost:6379/0
RUNNER_REPOS_BASE_PATH=/tmp/repos
RUNNER_EXECUTOR=local
RUNNER_ALLOWED_REPO_OWNERS=your-github-username
EOF

uv sync
uv run python -m src.app.api
```

For the `docker` executor, leave out the last two lines and start the executor
containers; both must mount `RUNNER_REPOS_BASE_PATH` at `/repos`:

```bash
mkdir -p /tmp/repos
docker run -d --name python-executor -v /tmp/repos:/repos python:3.11 sleep infinity
docker run -d --name node-executor   -v /tmp/repos:/repos node:22     sleep infinity
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

Both backends **require an API key** (`X-API-Key` header). If none is configured they
reject every request (503), unless `*_DEBUG=true` is set for local development.
The browser never calls the backends directly over HTTP: the Next.js server routes
(`/api/sessions`, `/api/runs`, `/api/pr`) attach the API keys and the user's GitHub
token server-side. The browser only opens the WebSocket, using a single-use `run_id`.

### Frontend (`frontend/.env.local`, Vercel project env)

| Variable | Description |
|----------|-------------|
| `NEXTAUTH_URL` / `NEXTAUTH_SECRET` | NextAuth config |
| `GITHUB_ID` / `GITHUB_SECRET` | GitHub OAuth app (scope `repo workflow read:user`) |
| `RUNNER_URL` / `RUNNER_API_KEY` | Server-Runner base URL and API key (server-side only) |
| `AGENT_SERVER_URL` / `AGENT_SERVER_API_KEY` | Server-AI base URL and API key (server-side only) |
| `NEXT_PUBLIC_SERVER_WS_URL` | Public WebSocket base, e.g. `wss://api.example.com/api/v1` |

### Server-AI (`server-ai/.env`, prefix `SERVER_`)

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_API_KEY` | — | Required key for `/agent/run`, `/agent/runs`, `/pr` |
| `SERVER_RUNNER_URL` | `http://localhost:8001` | Server-Runner base URL |
| `SERVER_RUNNER_API_KEY` | — | Must equal Server-Runner's `RUNNER_API_KEY` |
| `SERVER_RUNNER_TIMEOUT` | `900` | Seconds to wait on Server-Runner (covers an install plus a test run) |
| `SERVER_GROQ_API_KEY` | — | Groq API key |
| `SERVER_LLM_MODEL` | `openai/gpt-oss-120b` | Groq model |
| `SERVER_LLM_MAX_TOKENS` | `8192` | Max tokens per LLM call, including the model's reasoning |
| `SERVER_MAX_ITERATIONS` | `5` | Test runs per pipeline |
| `SERVER_RUN_TICKET_TTL` | `120` | Seconds a `run_id` stays valid |
| `SERVER_CORS_ALLOW_ORIGINS` | `[]` | JSON list; not needed for the WebSocket |
| `SERVER_DEBUG` | `false` | Allows running without `SERVER_API_KEY` |

Run tickets are held in memory, so keep `SERVER_UVICORN_WORKERS=1`.

### Server-Runner (`server-runner/.env`, prefix `RUNNER_`)

| Variable | Default | Description |
|----------|---------|-------------|
| `RUNNER_API_KEY` | — | Required key for every endpoint except `/health` |
| `RUNNER_EXECUTOR` | `docker` | `local` (plain processes on this machine) or `docker` (executor containers) |
| `RUNNER_ALLOWED_REPO_OWNERS` | — | Comma-separated GitHub users/orgs whose repos may be cloned. Required with `local`; empty = anyone (docker only) |
| `RUNNER_INSTALL_TIMEOUT` / `RUNNER_TEST_TIMEOUT` | `600` / `300` | Seconds before an install or test run is stopped |
| `RUNNER_REDIS_URL` | `redis://localhost:6379/0` | Session store |
| `RUNNER_SESSION_TTL` | `7200` | Session lifetime (seconds) |
| `RUNNER_REPOS_BASE_PATH` | `/home/ubuntu/repos` | Where repos are cloned (host side) |
| `RUNNER_COMMIT_AUTHOR_NAME` / `RUNNER_COMMIT_AUTHOR_EMAIL` | `GreenBranch` / `greenbranch@users.noreply.github.com` | Author of fix commits |
| `RUNNER_CONTAINER_REPOS_PATH` | `/repos` | Docker executor: the repos directory inside the containers |
| `RUNNER_PYTHON_CONTAINER` / `RUNNER_NODE_CONTAINER` | `python-executor` / `node-executor` | Docker executor: container names |
| `RUNNER_CLEANUP_INTERVAL` | `600` | Seconds between sweeps that delete repos of expired sessions |
| `RUNNER_DEBUG` | `false` | Allows running without `RUNNER_API_KEY` |

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
uv run python -m src.app.api
# API docs: http://localhost:8000/docs
```

#### Terminal 3: Server-Runner
```bash
cd server-runner
uv run python -m src.app.api
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

  server-runner:
    build: ./server-runner
    ports:
      - "8001:8001"
    environment:
      - RUNNER_API_KEY=${RUNNER_API_KEY}
      - RUNNER_REDIS_URL=redis://redis:6379/0
      - RUNNER_REPOS_BASE_PATH=/home/ubuntu/repos
    depends_on:
      - redis
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - /home/ubuntu/repos:/home/ubuntu/repos

  server-ai:
    build: ./server-ai
    ports:
      - "8000:8000"
    environment:
      - SERVER_API_KEY=${SERVER_API_KEY}
      - SERVER_RUNNER_URL=http://server-runner:8001
      - SERVER_RUNNER_API_KEY=${RUNNER_API_KEY}
      - SERVER_GROQ_API_KEY=${GROQ_API_KEY}
    depends_on:
      - server-runner

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - RUNNER_URL=http://server-runner:8001
      - RUNNER_API_KEY=${RUNNER_API_KEY}
      - AGENT_SERVER_URL=http://server-ai:8000
      - AGENT_SERVER_API_KEY=${SERVER_API_KEY}
      - NEXT_PUBLIC_SERVER_WS_URL=ws://localhost:8000/api/v1
      - NEXTAUTH_URL=http://localhost:3000
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - GITHUB_ID=${GITHUB_ID}
      - GITHUB_SECRET=${GITHUB_SECRET}
    depends_on:
      - server-ai
      - server-runner

volumes:
  redis_data:
```

The `python-executor` and `node-executor` containers from Step 4 must also be running (mounting `/home/ubuntu/repos` at `/repos`). Then run:

```bash
docker-compose up -d
```

### Verify Services Are Running

```bash
# Check Frontend
curl http://localhost:3000

# Check Server-AI Health
curl http://localhost:8000/api/v1/health

# Check Server-Runner Health
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
| `/api/auth/*` | GET/POST | NextAuth routes |
| `/api/github/repos` | GET | List the user's GitHub repositories |
| `/api/sessions` | POST | Clone a repo (proxies Server-Runner `POST /sessions`) |
| `/api/runs` | POST | Register a run (proxies Server-AI `POST /agent/runs`), returns `run_id` |
| `/api/pr` | POST | Open a pull request as the signed-in user |

### Server-AI Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/v1/health` | GET | — | Health check |
| `/api/v1/agent/runs` | POST | API key | Register a streaming run, returns a single-use `run_id` |
| `/api/v1/agent/ws?run_id=…` | WebSocket | `run_id` | Real-time pipeline stream |
| `/api/v1/agent/run` | POST | API key | Run the same pipeline without streaming and return the full report (for scripts) |
| `/api/v1/pr` | POST | API key | Create a pull request |

### Server-Runner Endpoints

All endpoints except `/health` require the API key.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/health`, `/api/v1/health/executor` | GET | Health checks (the second checks Docker or the local tools) |
| `/api/v1/sessions` | POST | Clone a GitHub repo (default branch unless `branch` given) |
| `/api/v1/sessions[/{id}]` | GET / DELETE | Inspect or delete sessions (DELETE removes the clone) |
| `/api/v1/execute` | POST | Install + run tests |
| `/api/v1/execute/stream` | POST (SSE) | Install + run tests, streaming output |
| `/api/v1/fix` | POST | Write a file (optionally run tests with `run_tests`) |
| `/api/v1/commit` | POST | Commit a file to a branch and push |
| `/api/v1/files` | GET | Read a file from a session repo |

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
│  └─ Prepare the executor (local process or Docker)          │
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
│  ├─ Create branch (greenbranch/fix-<repo>-<timestamp>)      │
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

### How a fix is made

`server-ai/src/runner/fix_engine.py` handles one failing test at a time:

1. **Find the code.** If the failure is in a test file, follow the test's imports (JS/TS
   relative imports, Python `from x import y`) and its name (`test_calc.py` → `calc.py`)
   to the implementation it exercises.
2. **Ask for edits, not files.** The LLM sees the error, the test output and the files, and
   answers with small `SEARCH/REPLACE` blocks. Only changed lines come back, so long files
   can be fixed. An answer cut off at the token limit is rejected.
3. **Apply exactly.** Each block must match the file exactly once (trailing whitespace and
   CRLF line endings are tolerated). Edits that don't apply, or that change a test's
   assertions instead of the code, count as a failed attempt.
4. **Verify.** The next test run decides: if the error is gone the fix is kept and explained,
   otherwise the file is reverted. Each error gets at most two attempts.

---

## 📱 Deployment (Android phone)

The backends run on an old Android phone instead of a cloud server; the frontend stays on
Vercel. Everything runs under PM2 inside Debian (proot-distro) in Termux, and a Cloudflare
Tunnel gives it public HTTPS URLs without opening ports on the router:

```
Vercel (frontend) ──HTTPS / WSS──▶ Cloudflare Tunnel ──▶ phone
                                                         ├─ server-ai   :8000
                                                         ├─ server-runner  :8001  (local executor)
                                                         ├─ redis       :6379
                                                         └─ sshd        :8022  (deploys only)
```

Pushes to `main` that touch the backends run `.github/workflows/phone-deploy.yaml`, which
checks both apps, then deploys over SSH through the tunnel and rolls back automatically if
the new version isn't healthy.

The full setup — phone, Cloudflare, GitHub secrets, Vercel — is in
[`deploy/phone/README.md`](deploy/phone/README.md).
