// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "AppleSpeechBridge",
    platforms: [.macOS(.v26)],
    products: [
        .library(name: "AppleSpeechBridge", targets: ["AppleSpeechBridge"]),
    ],
    targets: [
        .target(
            name: "AppleSpeechBridge",
            path: "Sources"
        ),
        .testTarget(
            name: "AppleSpeechBridgeTests",
            dependencies: ["AppleSpeechBridge"],
            path: "Tests"
        ),
    ]
)
