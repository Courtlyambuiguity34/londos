# Automation & Landlord Operations

## Goal

Operate thousands of tenants without requiring thousands of manual relationships.

Automation should remove repetitive work while keeping consequential decisions reviewable and auditable.

## Merchant onboarding

### Automated
- application completeness checks;
- duplicate signals;
- phone/email verification;
- prohibited-content screening;
- risk flags;
- application status notifications;
- guided shop setup.

### Human review
- ambiguous identity/business evidence;
- suspected impersonation;
- high-risk categories;
- conflicting information;
- appeals.

Automation may recommend; policy determines when a human must decide.

## Rent operations

System responsibilities:
- create rent obligation/invoice;
- generate unique reference;
- record payment event;
- reconcile provider/reference;
- advance tenancy state;
- schedule reminders;
- enter grace according to policy;
- close temporarily after policy threshold;
- reopen automatically/safely after verified payment;
- escalate anomalies.

All scheduled transitions must be idempotent.

## Merchant support

Use layered support:

```text
Self-service guidance
→ contextual automated assistant
→ structured support request
→ human support for unresolved/high-risk cases
```

The assistant should know shop state and relevant documentation where authorized, but must not make irreversible landlord decisions without permission.

## Moderation

### Automated triage
- obvious prohibited terms/media signals;
- duplicate scam patterns;
- unusual contact/payment changes;
- abnormal report volume;
- spam catalogue behavior.

### Human decision
- suspension in ambiguous cases;
- fraud investigations;
- appeals;
- legal/safety escalation.

## Shop design automation

Conversational design should operate against a constrained design schema:
1. interpret merchant intent;
2. propose structured changes;
3. validate;
4. preview;
5. merchant confirms/publishes;
6. preserve prior version.

No generated code is executed merely because an AI produced it.

## Operational queues

Landlord should have prioritized queues:
- critical security;
- fraud/safety;
- account recovery;
- payment exceptions;
- verification;
- moderation;
- ordinary support.

Do not mix a password takeover with “how do I change my banner?” in one undifferentiated inbox.

## Service-level measurements

Measure:
- median/95th-percentile application review time;
- automated approval/triage rate;
- support contacts per shop;
- first-response time;
- resolution time;
- payment reconciliation exceptions;
- moderation backlog;
- false-positive moderation rate;
- account recovery time.

## Human override

Every consequential automation needs:
- understandable reason/status;
- safe operator override;
- audit event;
- no silent history rewriting.
