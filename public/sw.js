/* Londos deliberately does not cache HTML, API responses, authentication, or private data. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
