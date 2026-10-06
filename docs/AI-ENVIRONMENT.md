# Provider environment preparation

Updated **2026-10-06** after the owner saved variables and confirmed **6 Astra Extra High** for R2. App provider models are separate from the coding assistant setting. **All 12 nonsecret settings below are injected, but neither secure provider key is available.** [R2 observations](evidence/R2-PROVIDERS.json) supersede the historical P11 configuration gap without rewriting that evidence.

| Setting | Current injected value | Recommendation |
|---|---|---|
| `LONDOS_AI_REMOTE` | `false` | Keep off until live verification succeeds |
| `LONDOS_AI_GEMINI_SLOT` | `1` | Retain |
| `LONDOS_AI_GEMINI_MODEL` | `gemini-2.5-flash` | Retain for bounded live evaluation |
| `LONDOS_AI_OPENAI_MODEL` | `gpt-5-mini` | Change saved value to **`gpt-5.4-mini`** to match saved prices and documented Responses/structured-output support; verify actual account access |
| `LONDOS_AI_GEMINI_INPUT_MICROUSD_PER_MILLION` | `300000` | Matches published standard text input USD 0.30/1M |
| `LONDOS_AI_GEMINI_OUTPUT_MICROUSD_PER_MILLION` | `2500000` | Matches published output including thinking USD 2.50/1M |
| `LONDOS_AI_OPENAI_INPUT_MICROUSD_PER_MILLION` | `750000` | Matches `gpt-5.4-mini` standard noncached input USD 0.75/1M |
| `LONDOS_AI_OPENAI_OUTPUT_MICROUSD_PER_MILLION` | `4500000` | Matches `gpt-5.4-mini` output USD 4.50/1M |
| `LONDOS_AI_DAILY_COST_MICROUSD` | `1000000` | USD 1 daily reservation estimate; retain |
| `LONDOS_AI_AUTH_FAILOVER` | `false` | Retain |
| `LONDOS_AI_ALLOW_OPENAI_FALLBACK` | `false` | Retain |
| `NODE_USE_ENV_PROXY` | `1` | Retain normal managed HTTPS proxy/CA trust |

Official [Google pricing](https://ai.google.dev/gemini-api/docs/pricing), [OpenAI pricing](https://developers.openai.com/api/docs/pricing.md) and the [GPT-5.4 Mini model contract](https://developers.openai.com/api/docs/models/gpt-5.4-mini.md) were successfully retrieved through normal HTTPS. Retrieval times and content hashes are recorded in R2 evidence. Rates above concern standard text input and complete output; batch/flex/priority, regional uplift, caching, tools and taxes have different terms. Multiply USD per million by **1,000,000** for the integer micro-USD settings. These configured estimates are neither actual bills nor guaranteed provider spending limits. Review account tier and applicable terms before enabling remote processing.

The still-selected `gpt-5-mini` publishes standard input/output USD **0.25/2.00** per million, which does **not** match its current saved 750000/4500000 settings. R2 recommends `gpt-5.4-mini` with the existing prices. The environment tool can save this as a nonsecret suggestion; **it leaves an existing saved value unchanged**. The owner must edit that saved model value in environment settings before activation. No local override is presented as an applied cloud correction.

Bind genuine keys securely as **`GEMINI_API_KEY_1`** (destination `generativelanguage.googleapis.com`) and **`LONDOS_OPENAI_API_KEY`** (destination `api.openai.com`). Optional Gemini slots 2–5 are retained. The managed platform reserves `OPENAI_API_KEY`, so the mapped Londos name is required here. Do not paste key values into chat, source, documents, `NEXT_PUBLIC_*`, URLs or logs. Saved requirement metadata currently reports no bound values; all seven supported key names are absent from the effective process, including ignored local configuration. This is an unavailable-binding result, not proof of invalid credentials.

The cloud metadata's latest direct-variable/network readiness is `unknown`; actual process inspection confirms all 12 values, and the official HTTPS requests succeeded. The currently declared restricted policy includes API and pricing hosts. Do not infer global unrestricted egress from those requests.

The cloud draft service returned `INVALID_ARGUMENT` for full, repository-only and startup-only updates; readback retained the previous P11 configuration. **Draft persistence is unconfirmed.** The proposed [startup instructions](CLOUD-STARTUP.md) and [failure evidence](evidence/R2-CLOUD-CONFIG.json) are saved in Git. No existing saved model value changed.

Save the model correction and secure keys in environment settings, then publish/reconnect. **A successfully saved draft does not apply or publish configuration.** Saved startup instructions and a repository pin also need activation; a connected workspace restore does not establish general Docker-volume durability or physical disaster recovery.

Run `LONDOS_AI_REMOTE=true npm run ai:verify -- --require-live` after the effective keys/model/rates are ready. This command enables only its own bounded verification process, not the main app. It uses fictional data, one call per provider, fixed HTTPS endpoints and normal proxy/CA trust; it sends no database merchant records. The current check exits **1**, reports `credentials_unavailable` for both providers, and makes **zero live requests**. Both observations must be `passed` before claiming live contract verification; representative design quality, billing and privacy terms need separate assessment. Fixtures are labelled and cannot substitute for live evidence.

Main remote AI remains off; enabling it later still requires each merchant's explicit consent and separate draft application/publication. Tests and benchmarks force remote processing off regardless of ambient credentials. Production notifications, storage and collection need genuine service accounts and their own verified policy/contracts; development adapters and disabled live flags remain honest.
