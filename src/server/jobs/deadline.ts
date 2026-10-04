export async function withinDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  let abort: () => void = () => {};
  const canceled = new Promise<never>((_, reject) => {
    abort = () => reject(signal.reason ?? new Error("timeout"));
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([work(signal), canceled]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
