# TalentAI — Email Delivery Setup

## Overview

TalentAI sends transactional email using **Nodemailer** with a configurable SMTP transport. The email service (`backend/src/modules/email/email.service.ts`) and its BullMQ worker (`email.worker.ts`) handle all outbound messages.

Emails sent by the platform include:
- Account verification and password reset
- Team member invitation
- AI interview invitations (with access code)
- Assessment assignments (with access code)
- Application received / stage change notifications
- Interview scheduled, rescheduled, cancelled, completed, reminder
- Offer sent

## Environment Variables

All email configuration is read from environment variables by `backend/src/config/loaders/email.config.ts`.

| Variable | Default | Description |
|---|---|---|
| `SMTP_HOST` | `localhost` | SMTP server hostname |
| `SMTP_PORT` | `1025` | SMTP server port |
| `SMTP_SECURE` | `false` | `true` for TLS (port 465); `false` for STARTTLS or plain |
| `SMTP_USER` | _(empty)_ | SMTP auth username — leave blank when no auth is required |
| `SMTP_PASS` | _(empty)_ | SMTP auth password — **never commit this value** |
| `EMAIL_FROM` | `noreply@ai-recruiter.com` | The `From:` address shown to recipients |

`backend/.env.example` contains a documented template for these variables.

## Local Development: MailHog

MailHog is a dev-only SMTP server that accepts all messages and exposes a web UI. No messages are delivered to real recipients.

### Start MailHog with Docker (recommended)

```powershell
docker run -d --name mailhog -p 1025:1025 -p 8025:8025 mailhog/mailhog
```

### Start MailHog binary (alternative)

Download from https://github.com/mailhog/MailHog/releases and run:

```powershell
.\MailHog_windows_amd64.exe
```

### Inspect captured email

Open http://localhost:8025 in your browser. All email sent by the backend while MailHog is running appears there.

### Verify MailHog is reachable

```powershell
(New-Object System.Net.Sockets.TcpClient).ConnectAsync('127.0.0.1', 1025).Wait(2000)
# Returns True if MailHog SMTP port is listening
```

## Required `.env` settings for local development

```env
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=noreply@ai-recruiter.com
```

## AI Interview Invitations

The AI interview invitation flow calls `sendAiInterviewInvitationEmail` **synchronously** (not via the BullMQ queue) inside `AiInterviewsService.sendInvitation`. If SMTP delivery fails:

- The service throws `BadRequestException` with code `EMAIL_SEND_FAILED`
- The interview status is **not** updated — the record remains in its previous state
- The recruiter sees an inline error: "Failed to send invitation email. The interview record has been preserved. Please try again."
- The BullMQ worker (`recruitment.ai-interview-invitation` job) handles the *async* email path for other email types (e.g. when queued from the application notification flow)

**Important**: The invitation code is never persisted in cleartext — only a hash is stored. If the SMTP server rejects the email, the recruiter can retry via the "Resend invitation" button in the workspace. If the code has been regenerated since the last attempt, the new code is used automatically.

## Staging and Production Configuration

Replace MailHog with a real SMTP provider:

### SendGrid
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=SG.<your-api-key>     # Never commit; inject via your deployment secrets manager
EMAIL_FROM=noreply@yourcompany.com
```

### Postmark
```env
SMTP_HOST=smtp.postmarkapp.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<postmark-server-token>
SMTP_PASS=<postmark-server-token>
EMAIL_FROM=noreply@yourcompany.com
```

### AWS SES (SMTP relay)
```env
SMTP_HOST=email-smtp.<region>.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<ses-smtp-username>
SMTP_PASS=<ses-smtp-password>   # Never commit; use IAM secrets
EMAIL_FROM=noreply@yourcompany.com
```

## Tests

All email functionality is covered by **mocked** unit tests (nodemailer's `createTransport` is mocked; no real SMTP connection is made):

```powershell
cd backend
npx jest "src/modules/email" --no-coverage
# Expected: 43 tests pass across email.service.spec.ts and email.worker.spec.ts
```

These tests verify template content, correct argument passing, error propagation, and the new AI interview invitation path added in ENG-015.

## Verification Levels

| Level | What is confirmed |
|---|---|
| Unit tests (mocked SMTP) | Template content, correct args, error propagation — **confirmed** |
| Local SMTP submission | MailHog receives the message — **not confirmed** (MailHog not running in this environment) |
| Staging delivery | Message arrives in a real inbox — **not confirmed** |
| Production delivery | Live deliverability — **not confirmed** |

The gap between "unit tests pass" and "MailHog receives message" requires:
1. Starting MailHog locally (see above)
2. Creating a test AI interview invitation through the recruiter UI
3. Clicking "Send invitation"
4. Verifying the message appears at http://localhost:8025

## Current Environment Status (verified 2026-10-27)

- Port 1025 (SMTP): **not listening** — MailHog is not running
- Port 8025 (MailHog web UI): **not listening**
- `.env.example`: SMTP section **added** as part of ENG-015
- Unit tests: **43/43 passing** (all mocked)
