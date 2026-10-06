# Provider environment preparation

The owner authorized configuration and bounded key checks on 2026-10-06. The selected starting models are **`gemini-2.5-flash`** for design and **`gpt-5-mini`** for selective review. These are candidate model IDs, pending current account availability and live contract verification. Assistant orchestration remains the owner-confirmed **Sol 6.1 Extra High**; app provider models do not change the coding assistant setting.

| Setting | Prepared value |
|---|---|
| `LONDOS_AI_REMOTE` | `false` until account/model/rate checks succeed |
| `LONDOS_AI_GEMINI_SLOT` | `1` |
| `LONDOS_AI_GEMINI_MODEL` | `gemini-2.5-flash` |
| `LONDOS_AI_OPENAI_MODEL` | `gpt-5-mini` |
| `LONDOS_AI_DAILY_COST_MICROUSD` | `1000000` (USD 1 configured daily reservation estimate) |
| `LONDOS_AI_AUTH_FAILOVER` | `false` |
| `LONDOS_AI_ALLOW_OPENAI_FALLBACK` | `false` |
| `NODE_USE_ENV_PROXY` | `1` in this proxy environment |

Settings were added to the ignored local configuration only when absent, preserving existing values and credentials, and saved as nonsecret cloud draft suggestions. Keys must use the secure **`GEMINI_API_KEY_1`** and **`LONDOS_OPENAI_API_KEY`** bindings. Optional Gemini slots 2–5 are retained. The platform reserves `OPENAI_API_KEY`; its mapped Londos name is required here. Do not paste key values into source, docs, chat, `NEXT_PUBLIC_*`, URLs or logs.

Four integer price settings remain required for remote admission: `LONDOS_AI_GEMINI_INPUT_MICROUSD_PER_MILLION`, `LONDOS_AI_GEMINI_OUTPUT_MICROUSD_PER_MILLION`, `LONDOS_AI_OPENAI_INPUT_MICROUSD_PER_MILLION`, `LONDOS_AI_OPENAI_OUTPUT_MICROUSD_PER_MILLION`. Verify the selected models' applicable noncached input and complete output/thinking/reasoning prices against [Google pricing](https://ai.google.dev/gemini-api/docs/pricing) and [OpenAI pricing](https://developers.openai.com/api/docs/pricing). Multiply USD per million tokens by **1,000,000** for these settings. Do not use guessed or zero placeholder rates. Estimates are neither actual bills nor a provider spending guarantee.

The saved draft adds `ai.google.dev`, `developers.openai.com` and `platform.openai.com` to the previously declared provider API domains. **Saving a draft does not apply or publish it.** Review/save the environment settings, bind the two keys there, and publish/reconnect the environment. The observed active runtime still has no provider secret bindings or provider egress; official pricing requests receive proxy CONNECT 403. This is an observed configuration gap, not an invalid-key conclusion.

Run `LONDOS_AI_REMOTE=true npm run ai:verify` for redacted checks without enabling the main application. `LONDOS_AI_REMOTE=true npm run ai:verify -- --require-live` must exit successfully with both provider observations `passed` before claiming live verification. The check uses fictional data, one bounded call per provider, normal HTTPS/proxy/CA and no database merchant data. Current [provider observations](evidence/X2-P11-PROVIDERS.json) report unavailable keys and zero live calls. Once models and applicable rates are verified, remote app processing may be enabled through its explicit setting and still requires each merchant's consent. Tests/benchmark force remote processing off regardless of ambient keys.

No secrets are invented or copied into the repository. Credentials for production notifications, remote object storage, live collection and other unconfigured capabilities require genuine provider accounts and approved production policy; local development adapters remain labelled and disabled live flags stay accurate.
