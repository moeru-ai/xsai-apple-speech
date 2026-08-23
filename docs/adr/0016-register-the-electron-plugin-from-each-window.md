---
status: rejected
---

# Register the Electron plugin from each window

This proposal registered one copy of the Apple Speech handlers for each Electron window.

We rejected this proposal because the main process can register the handlers once on a global Eventa context. Each renderer window connects through its own Electron Eventa context.

A global setup keeps one native Provider and one handler set. The raw Eventa sender identifies the renderer that owns each invocation.

The Eventa protocol must be complete before the project accepts the global composition interface.
