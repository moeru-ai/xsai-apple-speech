---
status: accepted
---

# Expose partial and done events

`fullStream` emits `transcript.text.partial` and `transcript.text.done` events. A partial event contains the current Partial Transcript and its triggering Result Range. The range has its own final state because this state does not complete the session. Only the done event completes the session.
