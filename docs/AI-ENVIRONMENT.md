# Provider environment preparation

Updated 2026-10-07, Africa/Kampala. **Gemini passed its bounded live contract; OpenAI rejected its supplied credential with HTTP 401 `invalid_api_key`.** Effective settings now include the corrected OpenAI model, and all six mapped key variables are present. [P12 provider evidence](evidence/P12-PROVIDERS.json) supersedes the earlier missing-binding result without changing [R2 evidence](evidence/R2-PROVIDERS.json).

| Setting | Effective value |
|---|---|
| `LONDOS_AI_REMOTE` | `false` |
| `LONDOS_AI_GEMINI_SLOT` | `1` |
| `LONDOS_AI_GEMINI_MODEL` | `gemini-2.5-flash` |
| `LONDOS_AI_OPENAI_MODEL` | `gpt-5.4-mini` |
| Gemini input/output micro-USD per million | `300000` / `2500000` |
| OpenAI input/output micro-USD per million | `750000` / `4500000` |
| `LONDOS_AI_DAILY_COST_MICROUSD` | `1000000` (USD 1 estimate) |
| `LONDOS_AI_AUTH_FAILOVER`, `LONDOS_AI_ALLOW_OPENAI_FALLBACK` | `false`, `false` |
| `NODE_USE_ENV_PROXY` | `1` |

The earlier official [Google pricing](https://ai.google.dev/gemini-api/docs/pricing), [OpenAI pricing](https://developers.openai.com/api/docs/pricing.md) and [GPT-5.4 Mini contract](https://developers.openai.com/api/docs/models/gpt-5.4-mini.md) observations are preserved in R2 evidence. The configured standard text rates exclude other service tiers, tools/taxes and regional/account terms. Estimates are neither bills nor guaranteed provider spending caps. Model settings here are unrelated to the coding assistant's selector.

Gemini originally rejected the deep canonical JSON schema with HTTP 400. The provider now receives a shallow closed transport grammar; strict wire parsing and the original canonical intent/LSS/current-owned-reference checks still enforce every local constraint. One real bounded fictional theme request passed with 426 input/156 output tokens and a configured 518 micro-USD estimate. This establishes transport/shape compatibility, not representative design quality or production terms.

Keep genuine `GEMINI_API_KEY_1` mapped only to `generativelanguage.googleapis.com`, with optional slots 2–5. Replace the rejected **`LONDOS_OPENAI_API_KEY`** securely in environment settings, mapped to `api.openai.com`. The managed platform reserves `OPENAI_API_KEY`; do not use it as a managed binding name. Never put credentials in Git, chat, URLs, `NEXT_PUBLIC_*` or logs. Presence and readiness metadata do not establish validity: the latest cloud metadata reports `unknown`, while the effective process still contains the variables. No secret value is recorded in this packet.

After securely replacing/publishing the OpenAI binding, verify only that provider:

```bash
LONDOS_AI_REMOTE=true npm run ai:verify -- --provider=openai --require-live
```

For Gemini when a changed model/key/adapter requires a new check:

```bash
LONDOS_AI_REMOTE=true npm run ai:verify -- --provider=gemini --require-live
```

Omitting `--provider` checks both. These commands enable only their own bounded verification process, use fictional content/fixed HTTPS endpoints and normal proxy/CA verification, and print redacted outcome/usage metadata. They do not enable the main app. Do not repeat failed credential requests without a relevant change, use spare keys to evade quota, or substitute fixtures for live verification.

Remote AI remains off until the relevant contracts, privacy terms, account access and representative quality/billing are accepted. Each merchant still needs external consent; draft application and public publication remain separate native authorized steps. All tests/recovery drills force remote AI off.

Cloud configuration saving remains separately tracked in [P12 cloud evidence](evidence/P12-CLOUD-CONFIG.json) and the [startup handoff](CLOUD-STARTUP.md). A saved draft is not activated until review/save/publish; a failed save is not persistence. Preserve the effective corrected variables and existing key requirements when updating instructions. No production notification, storage or collection integration is implied by a working Gemini call.
