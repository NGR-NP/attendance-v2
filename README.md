# Attendance

Attendance is a Cloudflare Workers app for QR-based class attendance. It lets a teacher sign in, choose one of their classes, start a live attendance session, and show a rotating QR code. Students scan the QR from their own browser, and the app records them present only when their saved student access token is valid for that class.

The project currently includes a dummy external system in a second D1 database so the full flow can be tested locally before connecting a real school or LMS API.

## What It Does

- Teacher login using records from `DB_lunar_attendance`.
- Teacher class dashboard from the external dummy class roster.
- Student list for each class, including students enrolled in multiple classes.
- One-time student access QR generation.
- Student access token claim flow. The claimed token is saved in the student's browser `localStorage`, expires at the course end date or after 7 idle days, and rotates after each attendance scan.
- Live attendance session per teacher, class, and local day.
- Rotating attendance QR codes managed by a Durable Object.
- WebSocket updates from the Durable Object to the teacher's live attendance screen.
- Student attendance submission with class enrollment verification.
- Attendance scan audit metadata, including IP, user agent/device type, country, timezone, language, platform, and screen size when available.
- Security headers, same-origin POST checks, teacher PIN step-up checks, and KV-backed rate limits around login, PIN verification, access claiming, session creation, and attendance submission.
- Same student can attend multiple classes, but only once per class per day.
- Attendance overview by date, roster size, and session count.
- Per-class and per-student attendance history.
- Admin dashboard with real-time system metrics (Total Teachers, Students, Classes, Records).
- Administrative search for teachers and students.
- Admin-managed Wi-Fi public IP allowlist for attendance scan restrictions.
- System-wide attendance audit log with metadata (Device, IP, Location).
- CSV export for full attendance history.
- Administrative control to delete erroneous attendance records.

## How It Works

The app uses `DB_lunar_attendance` as the source of truth for teachers, classes, class membership, students, teacher sessions, student sessions, student access grants, student access tokens, attendance records, and live attendance session metadata.

The live attendance state lives in the `lunarAttendance` Durable Object. The Durable Object owns the current QR token, rotates it, checks expiry, accepts student submissions, writes attendance records to the external source of truth, and broadcasts updates to the teacher screen over WebSocket.

The current flow is:

1. A teacher signs in at `/teacher/class`.
2. The app creates an HTTP-only `teacher_session` cookie from `DB_lunar_attendance`.
3. The teacher opens a class and can view students, attendance history, or start attendance.
4. For student access, the teacher opens a student access QR page. That QR can be claimed once.
5. When the student scans the access QR, `/student/access` asks them to confirm, then stores a course-bound access token in the student's browser.
6. When attendance starts, `/api/sessions` creates or reuses today's active session for that teacher and class.
7. The Durable Object generates a short-lived QR URL like `/attend?s=<sessionId>&q=<qrToken>`.
8. The teacher screen receives QR updates over `/api/sessions/:id/ws`.
9. A student scans the attendance QR. The browser sends the session ID, QR token, and saved access token to `/api/attend`.
10. The Durable Object verifies the QR token, verifies the student is enrolled in that class through `DB_lunar_attendance`, records attendance in `DB_lunar_attendance`, and returns a rotated student access token to the browser.

Dates are grouped using the local app timezone in `src/lib/date.ts` (`Asia/Kathmandu`).

## Main Routes

Teacher routes:

- `/teacher/class` - login page or class dashboard.
- `/teacher/class/:classId/student` - class roster.
- `/teacher/class/:classId/attendance` - attendance overview.
- `/teacher/class/:classId/attendance/start` - live QR attendance screen.
- `/teacher/class/:classId/student/attendance` - attendance summary for students in the class.
- `/teacher/class/:classId/student/:studentId/attendance` - one student's attendance history.
- `/teacher/class/:classId/student/:studentId/access` - one-time student access QR.

Student routes:

- `/student/access?t=<grantToken>` - open the one-time access QR confirmation page.
- `/attend?s=<sessionId>&q=<qrToken>` - mark attendance from a live QR.
- `/student/enroll` - compatibility redirect for older access links.

API and dummy external routes:

- `POST /api/sessions` - create or reuse today's attendance session.
- `GET /api/sessions/:id/ws` - teacher WebSocket for live QR updates.
- `POST /api/attend` - student attendance submission.
- `POST /external/dev/setup` - create and seed dummy external tables.
- `POST /external/student/access/claim` - dummy external access-claim endpoint.
- `POST /external/attendance/mark` - dummy external attendance mark endpoint.

Admin routes (Protected by `ADMIN_SECRET`):

- `/admin` - System dashboard with real-time stats.
- `/admin/teachers` - Manage teachers with search filtering.
- `/admin/students` - Manage students with search filtering.
- `/admin/wifi` - Manage public IP addresses allowed to submit attendance scans.
- `/admin/attendance` - System-wide audit log of all scans.
- `/admin/attendance/export` - Download full attendance history as CSV.

Note: The application previously used the misspelled `attendance` in several teacher URLs. Redirects have been implemented to ensure backward compatibility while standardizing on `attendance`.

## Local Setup

Install dependencies:

```txt
pnpm install
```

Create local D1 tables:

```txt
pnpm exec wrangler d1 execute DB_lunar_attendance --local --file=schema.sql
pnpm exec wrangler d1 execute DB_lunar_attendance --local --file=local_data-external-db.sql
pnpm exec wrangler d1 execute DB_lunar_attendance --local --file=local_data.sql
```

`schema.sql` is non-destructive and creates missing tables/indexes. The two data files seed teachers, classes, students, enrollments, access tokens, attendance records, and live sessions.

Apply the same setup to the remote D1 database:

```txt
pnpm exec wrangler d1 migrations apply lunar-attendance --remote
pnpm exec wrangler d1 execute lunar-attendance --remote --file=local_data-external-db.sql
pnpm exec wrangler d1 execute lunar-attendance --remote --file=local_data.sql
```

Start the Worker:

```txt
pnpm run dev
```

Open:

```txt
http://localhost:8787/teacher/class
```

Dummy teacher accounts:

```txt
teacher@example.com / 1234
science@example.com / 1234
```

Admin credentials:

- Path: `/admin`
- Secret: `supersecurepassword-` (Configured via `ADMIN_SECRET` in `wrangler.jsonc`)

Seeded classes and students:

- `CS101` - Computer Science 101.
- `MATH201` - Discrete Mathematics.
- `PHY150` - Applied Physics.
- `student_1` belongs to `CS101` and `MATH201`.
- `student_2` belongs to `CS101`.
- `student_3` belongs to `MATH201`.

The seed data is explicit SQL, so a fresh remote database must have migrations and the data files applied before deployment.

## Useful Commands

Run the dev server:

```txt
pnpm run dev
```

Type-check:

```txt
pnpm run type-check
```

Generate Cloudflare binding types:

```txt
pnpm run cf-typegen
```

Deploy:

```txt
pnpm run deploy
```

Dry-run deploy check:

```txt
pnpm exec wrangler deploy --dry-run
```

## Security Notes

- The `/external/*` routes are a dummy compatibility API. If `EXTERNAL_API_SECRET` is configured as a Worker secret, those routes require either `Authorization: Bearer <secret>` or `x-api-key: <secret>`.
- Student tokens are still stored in `localStorage` for the prototype, but the server now limits them to the enrolled course end date, expires them after 7 days without a scan, and revokes/replaces the token after each scan.
- Teacher sessions use an HTTP-only cookie. Sensitive attendance actions require a fresh teacher PIN check, currently valid for 10 minutes.
- KV rate limiting is best effort because KV updates are not atomic. For production, pair it with Cloudflare WAF/rate limiting or a Durable Object-backed limiter for high-risk endpoints.
- Attendance scan Wi-Fi enforcement uses admin-managed public IP addresses from `allowed_wifi_ips`. If no enabled IPs exist, the app falls back to matching the student's IP against the teacher session IP.
- Device metadata helps investigations, but browser-supplied fields can be spoofed. Treat IP and Cloudflare-derived country as stronger signals than client timezone, platform, or screen size.
- The Admin Portal is protected by a simple shared secret (`ADMIN_SECRET`). For production, this should be replaced by a robust RBAC system.
- The current CSP still allows inline scripts and the QR code CDN because the prototype renders inline page scripts. A production pass should move scripts to static files or nonces and self-host third-party assets.

## Current Limitations

- `DB_lunar_attendance` currently stores both roster data and attendance data until a real external API is integrated.
- Teacher PINs in the dummy DB are plaintext for testing.
- Student access tokens are stored in browser `localStorage`, which is convenient for a prototype but should be revisited before production.
- The QR code library is loaded from a CDN on the teacher pages.
- Automated tests for the QR lifecycle, duplicate scans, and complex reporting queries are still pending.

## Future Plan

- Replace the direct dummy D1 calls with a real external API integration.
- Add proper teacher authentication, hashed credentials, and environment-specific secrets.
- Move student token storage to a safer production-ready approach (e.g., HTTP-only cookies).
- Implement a robust Role-Based Access Control (RBAC) system for the Admin Portal.
- Add explicit student token revocation and session management UI.
- Unified routing to correct the `attendance` spelling throughout the app.
- Add automated tests for session creation, QR expiry, duplicate scans, multi-class students, and attendance summaries.
- Add deployment docs for remote D1 migrations and production Cloudflare configuration.
