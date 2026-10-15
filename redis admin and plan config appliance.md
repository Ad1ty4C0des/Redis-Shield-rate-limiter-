# Redis Shield: Admin and Plan Config Appliance

## 1. Executive Summary

This document explains the architecture, security model, and implementation details of the **Role-Based Access Control (RBAC)** and **Dynamic Plan Configuration Appliance** built for **Redis Shield**.

Prior to this implementation, rate limiting quotas and administrative endpoints were static and decoupled from client identity. The system now enforces a clear architectural separation between:
1. **Security & Authorization (`role`)**: Controls which endpoints a client can invoke (e.g. standard endpoints vs. protected administrative actions like modifying rate limits or unblocking IPs).
2. **Rate Limiting Quotas & Tiers (`plan`)**: Governs the throughput algorithm (Fixed Window, Sliding Window, or Token Bucket) and request quotas dynamically stored in **Redis Hashes**.

---

## 2. Core Personas & Permissions Matrix

All client personas are provisioned on server startup directly inside Redis Hashes under the key pattern `rl:keys:<api_key>`.

| Persona Name | API Key (`x-api-key`) | Role (`role`) | Plan (`plan`) | Engine Algorithm | Default Quota | Admin Mutation Access |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Free Developer** | `free_test_key` | `user` | `free` | Fixed Window Counter | 5 req / 30s | ⛔ **Rejected (`403 FORBIDDEN`)** |
| **Pro Startup** | `pro_test_key` | `user` | `pro` | Sliding Window Sorted Set | 20 req / 30s | ⛔ **Rejected (`403 FORBIDDEN`)** |
| **Enterprise VIP** | `ent_test_key` | `user` | `enterprise` | Token Bucket Hash | 100 req / min | ⛔ **Rejected (`403 FORBIDDEN`)** |
| **DevOps Master Admin** | `adm_test_key` | `admin` | `enterprise` | Token Bucket Hash | 100 req / min | ✅ **Authorized (`200 OK`)** |
| **Anonymous Client** | *(None / IP only)* | `user` | `free` | Fixed Window Counter | 5 req / 30s | ⛔ **Rejected (`403 FORBIDDEN`)** |

> **Crucial Architectural Concept**: Enterprise VIP customers have the highest rate limit capacity (100 req/min), but because their `role` is `user`, they **cannot** perform administrative actions (e.g. flushing IP blocks or changing tier limits). Only `DevOps Master Admin` possesses `role: "admin"`.

---

## 3. Redis Data Structures Utilized

The appliance leverages native Redis data structures to ensure sub-millisecond execution times and zero downtime:

```
                    ┌─────────────────────────────────────────┐
                    │               Redis Server              │
                    └─────────────────────────────────────────┘
                                         │
         ┌───────────────────────────────┼───────────────────────────────┐
         ▼                               ▼                               ▼
 ┌───────────────┐               ┌───────────────┐               ┌───────────────┐
 │ Redis Hashes  │               │ Redis Hashes  │               │  Redis Lists  │
 │  rl:keys:*    │               │  rl:plan:*    │               │ rl:queue:jobs │
 └───────────────┘               └───────────────┘               └───────────────┘
  Client Metadata:                Tier Quotas:                    Async Task Queue:
  - role: admin|user              - maxRequests                   - reset_ip jobs
  - plan: free|pro|ent            - windowMs                      - BRPOP worker
  - name, desc                    - algorithm                     - Non-blocking DEL
```

1. **Redis Hashes (`rl:keys:<api_key>`)**:
   - Structured key-value storage for client credentials and roles.
   - Commands: `HSET`, `HGETALL`, `EXISTS`.
2. **Redis Hashes (`rl:plan:<plan_name>`)**:
   - Stores dynamic limits: `maxRequests`, `windowMs`, and `algorithm`.
   - Live updates via `HSET` immediately adjust rate limiting logic across the cluster without server restarts.
3. **Redis Blocking Lists (`rl:queue:jobs`)**:
   - Used for asynchronous background operations (`LPUSH` to enqueue, `BRPOP` by worker daemon to process IP unblocks without blocking the HTTP event loop).
4. **Redis HyperLogLog (`rl:hll:blocked`) & Sorted Sets (`rl:zset:ip_blocks`)**:
   - Real-time telemetry tracking unique blocked IPs (`PFCOUNT`) and violation counts (`ZINCRBY`).

---

## 4. Backend Implementation Details

### A. Client Identification Middleware (`server/src/middleware/auth.js`)
Runs globally on every inbound request before route handlers:
- Inspects the `x-api-key` header (or `Authorization: Bearer <key>`).
- If an API key is provided, queries Redis via `getKeyData(apiKey)`. If the key is not in Redis, rejects immediately with `401 UNAUTHORIZED`.
- If no key is provided, defaults to an anonymous identity: `{ role: 'user', plan: 'free', key: 'anonymous', id: req.ip }`.
- Attaches the resolved user object to `req.user`.

### B. RBAC Gatekeeper Middleware (`server/src/middleware/auth.js`)
Guards administrative mutation routes:
- Checks if `req.user.role === 'admin'` or if a valid master secret (`x-admin-key`) was provided.
- If the caller is a standard user (`role: 'user'`), aborts execution and responds with:
  ```json
  {
    "error": "FORBIDDEN",
    "message": "Administrative privileges required. Provide adm_test_key via x-api-key or valid x-admin-key.",
    "userRole": "user"
  }
  ```

### C. Protected Administrative Endpoints (`server/src/server.js`)
- `PATCH /api/admin/plans/:name`:
  - Enforces `requireAdmin`.
  - Validates inputs (`maxRequests > 0`, valid algorithm).
  - Updates Redis Hash `rl:plan:<name>`.
- `POST /api/admin/reset-ip`:
  - Enforces `requireAdmin`.
  - Enqueues IP/Key unblock task via `enqueueJob('reset_ip', { ip })` to `rl:queue:jobs`.

### D. Dynamic Rate Limiting Middleware (`server/src/middleware/rateLimiter.js`)
- Reads `req.user.plan` (e.g. `'free'`, `'pro'`, `'enterprise'`).
- Calls `getPlan(clientPlanName)` to read the live quota from Redis Hashes `rl:plan:<name>`.
- Identifies the client bucket using `req.user.id` (`api_key` for authenticated clients, `ip` for anonymous).
- Executes the appropriate algorithm:
  - **Fixed Window** (`rl:fw:<id>:<window>`) using `MULTI / INCR / PEXPIRE`.
  - **Sliding Window** (`rl:sw:<id>`) using Redis Sorted Sets and Lua script.
  - **Token Bucket** (`rl:tb:<id>`) using Redis Hashes and Lua script.
### E. CORS Header Visibility & Telemetry Resolution
- **Browser Fetch CORS Security**:
  - By default, standard browser cross-origin requests hide custom HTTP headers (`X-RateLimit-*`, `X-Client-*`, `Retry-After`) from JavaScript's `fetch()` API.
  - The Express backend explicitly configures CORS with `exposedHeaders`:
    ```javascript
    app.use(cors({
      origin: '*',
      exposedHeaders: [
        'X-Client-Role',
        'X-Client-Plan',
        'X-Client-Key',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Latency-Ms',
        'X-Redis-Algorithm',
        'Retry-After'
      ]
    }));
    ```
  - **Dual-Channel Telemetry**:
    - Response headers (`X-RateLimit-Remaining`, `X-RateLimit-Limit`) provide IETF-standard rate limit inspection.
    - JSON payload bodies (`data.rateLimit = { limit, remaining, latencyMs }`) provide a resilient fallback channel ensuring the frontend never misinterprets remaining quota as `0` while requests are still allowed.

---

## 5. Frontend Dashboard Integration

### A. Top Global Navbar
- Includes a live **Client Persona Switcher** dropdown.
- Displays the active persona's name and an illuminated `[USER]` or `[ADMIN]` status badge visible from every dashboard view.

### B. API Playground (`Interactive Probe & Rate Test`)
- **Persona Matrix**: 4 interactive cards allowing instant switching between Free, Pro, Enterprise, and Admin personas.
- **Probe & Burst Blaster**: All outbound requests (`fetch`) automatically attach `x-api-key: <active_key>`.
- **Response Inspector Drawer**: Shows the verified response headers returned by the server, proving dynamic tier application in real time.

### C. Rate Limit Rules (`Dynamic Tier Manager`)
- Displays live tier configurations for **Free Tier**, **Pro Tier**, and **Enterprise Tier**.
- **RBAC Security Guard Banner**:
  - Displays an amber warning banner when the active persona is a standard user (`role: user`), alerting that saving will trigger an RBAC rejection.
  - Displays a green verified banner when `DevOps Master Admin` (`role: admin`) is active.
  - Provides a 1-click **"Switch to Master Admin"** button.
  - Clicking "Save HSET" under a non-admin persona fires an immediate `403 Forbidden` notification toast.

### D. Security Mitigation (`Emergency IP Flush & Unblock`)
- Guards `LPUSH unblock_queue` with RBAC authorization.
- Displays authorization status banner and blocks unauthorized unblock attempts.

---

## 6. Verification Summary

The appliance was verified through both automated testing and end-to-end browser execution:

1. **RBAC Protection**:
   - `Invoke-RestMethod` to `POST /api/admin/reset-ip` using `free_test_key` returned `403 Forbidden`.
   - `Invoke-RestMethod` using `adm_test_key` returned `200 OK` ("Reset job enqueued").
   - `PATCH /api/admin/plans/pro` using `ent_test_key` returned `403 Forbidden`.
   - `PATCH /api/admin/plans/pro` using `adm_test_key` successfully updated Redis Hash `rl:plan:pro`.
2. **Dynamic Quota Adjustment**:
   - Rate limit changes committed to Redis Hashes immediately applied to client calls without restarting the Express server.
3. **Browser Automation**:
   - Verified active persona switcher in navbar.
   - Tested probe and burst blasting across different personas.
   - Verified 403 Forbidden error toasts and Master Admin success toasts.
