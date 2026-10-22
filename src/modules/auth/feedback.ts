// Only known codes and locally written text reach the UI. Never display raw
// provider/library messages, response bodies, URLs or verification tokens.
export function authenticationFeedback(status: number, body: unknown) {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const code = typeof value.code === "string" ? value.code : value.error;
  if (status === 429)
    return {
      verificationRequired: false,
      message: "Too many attempts. Please wait a minute before trying again.",
    };
  if (status >= 500)
    return {
      verificationRequired: false,
      message:
        "Account services are temporarily unavailable. Your password may be correct. Please try again shortly.",
    };
  if (status === 403 && code === "EMAIL_NOT_VERIFIED")
    return {
      verificationRequired: true,
      message:
        "Verify your email before signing in. Open the Londos verification email, or request a new link below.",
    };
  if (status === 401 && code === "INVALID_EMAIL_OR_PASSWORD")
    return {
      verificationRequired: false,
      message:
        "The email or password does not match. Try again or use Recover your account to reset your password.",
    };
  if (status === 403)
    return {
      verificationRequired: false,
      message:
        "This sign-in request was not accepted. Open Londos at its main website address, refresh the page and try again.",
    };
  if (code === "INVALID_TWO_FACTOR_COOKIE" || code === "INVALID_TWO_FACTOR_CHALLENGE")
    return {
      verificationRequired: false,
      message: "Your sign-in challenge expired. Reload this page and sign in again.",
    };
  if (code === "INVALID_CODE" || code === "MFA_CODE_REUSED")
    return {
      verificationRequired: false,
      message: "Use a new code from your authenticator, or an unused recovery code.",
    };
  return {
    verificationRequired: false,
    message: "The request could not be completed. Check your details and try again.",
  };
}
