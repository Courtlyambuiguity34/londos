"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
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
export function RegistrationForm() {
  const [message, setMessage] = useState(""),
    [email, setEmail] = useState(""),
    [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    const data = fields(event);
    setMessage("");
    if (data.password !== data.confirmPassword) {
      setMessage("The passwords do not match.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          password: data.password,
          acceptTerms: data.acceptTerms === "on",
        }),
      });
      if (!response.ok) {
        const reference = response.headers.get("x-request-id");
        const message =
          response.status === 422
            ? "Check your name, email address, password length and agreement to the terms."
            : response.status === 429
              ? "Too many attempts. Please wait a minute before trying again."
              : response.status === 403
                ? "This page could not verify your request. Reload Londos using its main website address and try again."
                : "Account services are temporarily unavailable. Your details may be correct. Please try again shortly.";
        setMessage(
          message +
            (reference && /^[a-f0-9-]{36}$/.test(reference)
              ? ` Support reference: ${reference}`
              : ""),
        );
        return;
      }
      setEmail(data.email ?? "");
      setMessage(
        "Check your email for the Londos verification link. You cannot sign in until verification succeeds.",
      );
    } catch {
      setMessage("We could not reach Londos. Check your internet connection and try again.");
    } finally {
      setPending(false);
    }
  }
  async function resend() {
    setPending(true);
    try {
      await send("send-verification-email", {
        email,
        callbackURL: `${window.location.origin}/shopkeeper`,
      });
      setMessage("If this address is awaiting verification, a fresh email has been queued.");
    } catch {
      setMessage("A new verification message could not be requested yet. Please wait and retry.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="account-form">
      <form className="account-form" onSubmit={submit}>
        <label htmlFor="register-name">Your name</label>
        <input
          id="register-name"
          name="name"
          autoComplete="name"
          minLength={2}
          maxLength={100}
          required
        />
        <label htmlFor="register-email">Email</label>
        <input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
        />
        <label htmlFor="register-password">Password (at least 12 characters)</label>
        <input
          id="register-password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
        <label htmlFor="register-confirm-password">Confirm password</label>
        <input
          id="register-confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          required
        />
        <label className="checkbox-label">
          <input type="checkbox" name="acceptTerms" required /> I agree to the{" "}
          <Link href="/terms" target="_blank" rel="noopener">
            Terms of use
          </Link>{" "}
          and have read the{" "}
          <Link href="/privacy" target="_blank" rel="noopener">
            Privacy policy
          </Link>{" "}
          (opens in a new tab so your form stays here).
        </label>
        <button className="button" disabled={pending}>
          {pending ? "Creating…" : "Create account and verify email"}
        </button>
      </form>
      {email ? (
        <button
          type="button"
          className="button button--outline"
          disabled={pending}
          onClick={() => void resend()}
        >
          Send verification email again
        </button>
      ) : null}
      <p role="status">{message}</p>
    </div>
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
