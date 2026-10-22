# Brevo live test and UUID contract correction — 22 October 2026

## Live results

After the owner changed Brevo IP settings, a read-only account check succeeded with HTTP
200. The sender-list endpoint returned HTTP 403, so the read-only `npm run email:verify`
preflight still failed. That result alone did not establish whether sending was permitted.

One requested test message used Londos's existing campaign renderer, the configured sender
and the owner's previously supplied recipient address. The first send was explicitly
rejected with HTTP 400 `out_of_range` while using a prefixed idempotency key. A retry after
that explicit rejection omitted the invalid key and was accepted with HTTP 201 and a
message ID. Exactly one test request was accepted. No retry followed acceptance or an
uncertain network outcome. No verification token, password reset or account modification
was included. Inbox delivery is not independently confirmed.

The first diagnostic detected a limit-related word in the provider response; that was not
enough to establish a quota shortage. A subsequent account check reported a free plan with
a 300 send limit and enabled SMTP relay, not a measured remaining allowance. The accepted
send establishes that sending was permitted at the time of the test.

## Implementation defect and correction

[Brevo's official idempotency documentation](https://developers.brevo.com/docs/heterogenous-versions-batch-emails),
checked 22 October 2026, requires `headers.idempotencyKey` to be a UUID. The adapter used
`londos-` followed by the job UUID. This is not a UUID, regardless of the valid job identity.

- `src/server/jobs/brevo.ts`: send the validated bare job UUID as the provider key.
- `tests/integration/p13.test.ts`: provider transport rejects a non-UUID key with HTTP 400
  before accepting; verifies the durable job identity and no resend after acceptance.
- `docs/HOSTED-ACCOUNTS.md`: document the provider contract and fresh-link deployment step.
- This evidence file records the real checks and their limits.

The durable delivery record, lease ownership, payload fingerprint, quotas, and prohibition
on automatically retrying rejected/uncertain attempts remain enforced. Old records are not
cleared or rewritten. After deployment request one fresh link rather than replaying an old
job. No schema migration or credential change is required by this code correction.

## Executed verification

- `npm run test:integration -- tests/integration/p13.test.ts`: **25 passed**, disposable
  PostgreSQL and mocked provider transports, including UUID contract and delivery safety.
- `npm run build`: **passed**, including TypeScript and web/worker bundles.
- `npm run lint`: **passed**.
- Documentation links and `git diff --check`: **passed**.
- Real sending endpoint: **one test accepted, HTTP 201**. This direct test reused the
  renderer but did not exercise the corrected full worker against the live provider; the
  adapter correction was verified with the provider contract mock. No second live message
  was sent to prove the new header and no hosted verification delivery is claimed.

No credentials, raw provider responses, recipient addresses, message IDs, or action URLs
were saved in this evidence. No production database or delivery history was modified. No
unrelated recovery drills or full Docker image rebuild were repeated.
