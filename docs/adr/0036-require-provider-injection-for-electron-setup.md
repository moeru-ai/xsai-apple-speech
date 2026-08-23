---
status: accepted
---

# Require Provider injection for Electron setup

The main-process `setupAppleSpeechTranscription` interface requires an Eventa context and an Apple Speech Provider.

The Electron host constructs and owns the Provider. The setup projects the five Eventa invokes onto this Provider interface.

The setup does not create a default native Provider. Thus, the Electron plugin does not import or resolve the native binding.

The setup does not accept separate handler overrides for its five operations. These overrides can split Provider invariants across unrelated seams.

A host can inject another Provider Adapter or wrap a Provider before injection. This seam supports custom behavior without a second handler interface.
