---
status: accepted
---

# Use a raw Node-API bridge

The native package uses this call path:

```text
TypeScript Provider
  -> Node-API addon
    -> Objective-C++ adapter
      -> Swift module
        -> Apple Speech and AVFoundation
```

The first release does not use napi-rs or Rust. It also does not use a separate native process.

The Swift module owns speech policy, session state, concurrency, audio conversion, and cleanup. Its interface hides the Apple framework details.

The Objective-C++ adapter owns Node-API conversion and callback delivery. It does not duplicate the speech policy or session state.

The TypeScript Provider owns the public Provider interface, native addon loading, error conversion, and Web Streams integration.

This design uses one foreign-function seam between Objective-C++ and Swift. A Rust bridge adds another seam without adding speech behavior.

The repository uses AUV as a reference for platform package topology, CI matrices, release automation, and clean-install verification.

The repository does not copy the generated napi-rs loader. The Provider imports its architecture package directly.

The project accepts the cost of custom type declarations, build scripts, addon loading, and artifact staging.
