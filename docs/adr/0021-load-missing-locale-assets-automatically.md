---
status: accepted
---

# Load missing locale assets automatically

The `generate` and `stream` operations use an internal `ensureLoaded(locale)` operation before transcription starts.

When the locale assets are ready, the operation returns immediately. When the assets are missing, the operation installs them.

The public `load` method remains available for preload flows and progress interfaces. Callers do not need to call it before transcription.

An automatic load does not expose progress through `generate` or `stream`. If a caller needs progress, it uses the public `load` method.

The transcription operation waits for the automatic load. A load error uses the error path of the transcription operation.

Cancellation during an automatic load uses the cancellation scope of the owning transcription operation.

This behavior matches xsai-transformers. If the caller does not preload the selected model, its transcription operation loads the model.
