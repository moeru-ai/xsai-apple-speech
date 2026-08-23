---
status: accepted
---

# Load the native addon lazily

Importing the native package does not load its `.node` file. Creating its Provider also does not load the file.

`isAvailable()` resolves the binding and returns the native framework availability. A native package error passes to the caller without a wrapper.

An unavailable result means that the native framework reports no matching speech transcriber. The other Provider operations use the same binding.

A successful binding stays cached for the Provider lifetime. Node.js also caches the native package.

The Electron plugin setup does not resolve the binding. The first Provider operation reports a native package error.

The Provider does not convert native package errors into availability results.
