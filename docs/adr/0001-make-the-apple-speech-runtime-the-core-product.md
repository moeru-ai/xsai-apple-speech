---
status: superseded by ADR-0004
---

# Make the Apple Speech Runtime the core product

The repository exposes a general Apple Speech Runtime as its core product. The xsAI Adapter depends on this runtime instead of defining it. This boundary permits direct use without xsAI and keeps Electron concerns in a separate adapter. We rejected an xsAI-first runtime because it would make a general Apple capability depend on one request interface.
