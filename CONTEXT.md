# Apple Speech Transcription

This context defines the language for on-device Apple Speech transcription and its adapters.

## Language

**Apple Speech Provider**:
An xsAI-compatible provider for batch and live Apple Speech transcription. Native and Electron packages provide different implementations of the same interface.
_Avoid_: Runtime, Transport, Client

**Locale**:
The canonical BCP 47 identifier that selects Apple Speech language behavior and system assets. The Provider requires an exact supported identifier.
_Avoid_: Model, language model

**Partial Transcript**:
The current complete but unfinished transcript for a live session. Each new value replaces the previous value.
_Avoid_: Chunk, Snapshot, Delta

**Result Range**:
The audio-time range that caused a Partial Transcript update. Its final state applies only to this range, not to the live session.
_Avoid_: Session range, transcript range

**Transcription Session**:
One isolated batch or live transcription operation from its creation until completion or disposal.
_Avoid_: Provider, stream
