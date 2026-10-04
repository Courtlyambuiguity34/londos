"use client";
import { useState, type FormEvent } from "react";
async function send(path: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Too many attempts. Wait a minute before trying again."
        : "The request could not be completed. Check your details and try again.",
    );
  return data;
}
function fields(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  return Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
}

export function SignInForm({
  destination,
}: {
  destination: "/shopkeeper" | "/landlord" | "/security";
}) {
  const [challenge, setChallenge] = useState(false),
    [backup, setBackup] = useState(false),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    const data = fields(event);
    setError("");
    setPending(true);
    try {
      const result = await send(
        challenge ? `two-factor/${backup ? "verify-backup-code" : "verify-totp"}` : "sign-in/email",
        challenge
          ? { code: data.code, trustDevice: false }
          : { email: data.email, password: data.password },
      );
      if (result.twoFactorRedirect === true) {
        setChallenge(true);
        return;
      }
      window.location.assign(destination);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="account-form" onSubmit={submit}>
      {challenge ? (
        <>
          <p>
            Enter {backup ? "one unused recovery code" : "the code from your authenticator app"} to
            complete sign-in.
          </p>
          <label htmlFor="code">{backup ? "Recovery code" : "Authenticator code"}</label>
          <input
            id="code"
            name="code"
            autoComplete="one-time-code"
            inputMode={backup ? "text" : "numeric"}
            required
            maxLength={64}
          />
          <button type="button" className="text-button" onClick={() => setBackup(!backup)}>
            {backup ? "Use authenticator code" : "Use a recovery code"}
          </button>
        </>
      ) : (
        <>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
        </>
      )}
      {error ? <p role="alert">{error}</p> : null}
      <button className="button" disabled={pending}>
        {pending ? "Checking…" : challenge ? "Verify and sign in" : "Sign in"}
      </button>
    </form>
  );
}
export function SignOutButton() {
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="button button-secondary"
        onClick={() => {
          void send("sign-out", {})
            .then(() => window.location.assign("/sign-in"))
            .catch(() => setError("Sign-out failed. Try again."));
        }}
      >
        Sign out
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </>
  );
}
export function RecoveryForm({ token }: { token?: string }) {
  const [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    const data = fields(event);
    setPending(true);
    setMessage("");
    try {
      await send(
        token ? "reset-password" : "request-password-reset",
        token
          ? { token, newPassword: data.password }
          : { email: data.email, redirectTo: `${window.location.origin}/recover` },
      );
      setMessage(
        token
          ? "Password updated. Sign in with your new password."
          : "If this account can recover, instructions will be sent. This development environment uses a private local notification sink.",
      );
    } catch {
      setMessage("The request could not be completed. Recovery links expire and can be used once.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="account-form" onSubmit={submit}>
      {token ? (
        <>
          <label htmlFor="password">New password (at least 12 characters)</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </>
      ) : (
        <>
          <label htmlFor="email">Account email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </>
      )}
      <button className="button" disabled={pending}>
        {pending ? "Sending…" : token ? "Update password" : "Request recovery"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
export function MfaControls({ enabled }: { enabled: boolean }) {
  const [setup, setSetup] = useState<{ uri: string; codes: string[] } | null>(null),
    [message, setMessage] = useState(""),
    [pending, setPending] = useState(false);
  async function enroll(event: FormEvent<HTMLFormElement>) {
    const data = fields(event);
    setPending(true);
    setMessage("");
    try {
      const result = await send("two-factor/enable", { password: data.password, method: "totp" });
      setSetup({ uri: String(result.totpURI), codes: result.backupCodes as string[] });
    } catch {
      setMessage("Enrollment failed. Check your password and try again.");
    } finally {
      setPending(false);
    }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    const data = fields(event);
    setPending(true);
    setMessage("");
    try {
      await send("two-factor/verify-totp", { code: data.code, trustDevice: false });
      setSetup(null);
      window.location.assign("/security?verified=1");
    } catch {
      setMessage("The code was not accepted. Check your authenticator and try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="account-form">
      <p>
        {enabled
          ? "Authenticator MFA is enrolled. Verify a current code here before a sensitive action."
          : "Set up an authenticator app. Landlord access requires MFA verification for the current session."}
      </p>
      {!enabled && !setup ? (
        <form className="account-form" onSubmit={enroll}>
          <label htmlFor="enroll-password">Confirm your password</label>
          <input
            id="enroll-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
          <button className="button" disabled={pending}>
            Set up MFA
          </button>
        </form>
      ) : null}
      {setup ? (
        <div className="secret-panel">
          <h2>Save your recovery codes</h2>
          <p>
            Keep these offline. They will not appear again here. Add the setup URI to your
            authenticator, then verify its code.
          </p>
          <p>
            For manual setup, add a time-based account named Londos with this key, six digits and a
            30-second period.
          </p>
          <label htmlFor="setup-key">Authenticator setup key</label>
          <input
            id="setup-key"
            readOnly
            autoComplete="off"
            value={new URL(setup.uri).searchParams.get("secret") ?? ""}
          />
          <label htmlFor="setup-uri">Authenticator setup URI</label>
          <textarea id="setup-uri" readOnly value={setup.uri} rows={4} />
          <ul>
            {setup.codes.map((code) => (
              <li key={code}>
                <code>{code}</code>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {enabled || setup ? (
        <form className="account-form" onSubmit={verify}>
          <label htmlFor="mfa-code">Authenticator code</label>
          <input
            id="mfa-code"
            name="code"
            autoComplete="one-time-code"
            inputMode="numeric"
            required
            maxLength={6}
          />
          <button className="button" disabled={pending}>
            Verify MFA
          </button>
        </form>
      ) : null}
      <p role="status">{message}</p>
    </div>
  );
}
