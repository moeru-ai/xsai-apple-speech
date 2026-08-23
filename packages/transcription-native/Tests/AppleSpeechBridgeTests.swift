import AVFAudio
import CoreMedia
import Foundation
import Testing

@testable import AppleSpeechBridge

private let testConfiguration = NativeTranscriptionConfiguration(
    analysisContext: nil,
    dictation: nil,
    speech: NativeSpeechOptions(
        attributes: NativeAttributeOptions(
            audioTimeRange: true,
            transcriptionConfidence: false
        ),
        reporting: NativeSpeechOptions.Reporting(
            alternativeTranscriptions: false,
            fastResults: true,
            volatileResults: true
        ),
        transcription: NativeSpeechOptions.Transcription(
            etiquetteReplacements: false
        )
    ),
    transcriber: .speech
)

@available(macOS 26.0, *)
private actor FakeStreamSession: AppleSpeechStreamSessionProtocol {
    struct Snapshot: Equatable {
        let appendedByteCounts: [Int]
        let cancelCount: Int
        let finishCount: Int
    }

    private var appendedByteCounts: [Int] = []
    private var cancelCount = 0
    private var finishCount = 0

    func append(_ sampleData: Data) {
        appendedByteCounts.append(sampleData.count)
    }

    func cancel() {
        cancelCount += 1
    }

    func finish() -> NativeTranscriptionResult {
        finishCount += 1
        return NativeTranscriptionResult(locale: "en-US", text: "finished")
    }

    func snapshot() -> Snapshot {
        Snapshot(
            appendedByteCounts: appendedByteCounts,
            cancelCount: cancelCount,
            finishCount: finishCount
        )
    }
}

@available(macOS 26.0, *)
private actor DeferredSessionFactory {
    private var continuation: CheckedContinuation<
        any AppleSpeechStreamSessionProtocol,
        Never
    >?

    func make() async -> any AppleSpeechStreamSessionProtocol {
        await withCheckedContinuation { continuation in
            self.continuation = continuation
        }
    }

    func resolve(with session: any AppleSpeechStreamSessionProtocol) {
        continuation?.resume(returning: session)
        continuation = nil
    }

    func waitUntilRequested() async {
        while continuation == nil {
            await Task.yield()
        }
    }
}

@available(macOS 26.0, *)
private actor FinishingStreamSession: AppleSpeechStreamSessionProtocol {
    private var cancelCount = 0
    private var finishContinuation: CheckedContinuation<
        NativeTranscriptionResult,
        any Error
    >?

    func append(_ sampleData: Data) {}

    func cancel() {
        cancelCount += 1
        finishContinuation?.resume(throwing: CancellationError())
        finishContinuation = nil
    }

    func finish() async throws -> NativeTranscriptionResult {
        try await withCheckedThrowingContinuation { continuation in
            finishContinuation = continuation
        }
    }

    func recordedCancelCount() -> Int {
        cancelCount
    }

    func waitUntilFinishing() async {
        while finishContinuation == nil {
            await Task.yield()
        }
    }
}

@Test func canonicalizesAppleLocaleIdentifiers() {
    #expect(bcp47Identifier(Locale(identifier: "de_AT")) == "de-AT")
    #expect(bcp47Identifier(Locale(identifier: "zh_Hans_CN")) == "zh-CN")
}

@Test func selectsASafeAudioFileExtension() {
    #expect(safeFileExtension(fileName: "voice.m4a", mediaType: nil) == "m4a")
    #expect(safeFileExtension(fileName: "../voice.$$$", mediaType: "audio/mpeg") == "mp3")
    #expect(safeFileExtension(fileName: nil, mediaType: "audio/wav") == "wav")
}

@Test func createsAValidJSONObjectForAnEmptyTranscription() throws {
    // ROOT CAUSE:
    //
    // Batch generation passed NativeTranscriptionResult directly to
    // JSONSerialization. Foundation raises an Objective-C exception because
    // a Swift struct is not a valid top-level JSON object.
    //
    // completeJSON(result, completion: completion)
    //
    // We fixed this by passing the result's dictionary representation.
    // completeJSON(result.jsonObject, completion: completion)
    let result = NativeTranscriptionResult(locale: "en-US", text: "")

    #expect(JSONSerialization.isValidJSONObject(result.jsonObject))
    let data = try JSONSerialization.data(withJSONObject: result.jsonObject)
    let decoded = try #require(
        JSONSerialization.jsonObject(with: data) as? [String: String]
    )
    #expect(decoded == ["locale": "en-US", "text": ""])
}

@Test func decodesAutomaticTranscriberOverrides() throws {
    let configuration = try decodeConfiguration("""
    {
      "analysisContext": {
        "contextualStrings": { "general": ["xsAI", "AIRI"] }
      },
      "dictation": {
        "attributes": {
          "audioTimeRange": true,
          "transcriptionConfidence": false
        },
        "contentHints": {
          "atypicalSpeech": false,
          "farField": true,
          "shortForm": false
        },
        "reporting": {
          "alternativeTranscriptions": false,
          "frequentFinalization": true,
          "volatileResults": true
        },
        "transcription": {
          "emoji": true,
          "etiquetteReplacements": false,
          "punctuation": true
        }
      },
      "speech": {
        "attributes": {
          "audioTimeRange": true,
          "transcriptionConfidence": false
        },
        "reporting": {
          "alternativeTranscriptions": false,
          "fastResults": false,
          "volatileResults": true
        },
        "transcription": { "etiquetteReplacements": false }
      },
      "transcriber": "automatic"
    }
    """)

    #expect(configuration.transcriber == .automatic)
    #expect(configuration.speech?.reporting.fastResults == false)
    #expect(configuration.dictation?.contentHints.farField == true)
    #expect(configuration.dictation?.transcription.emoji == true)
    #expect(configuration.analysisContext?.contextualStrings?.general == [
        "xsAI",
        "AIRI",
    ])
}

@available(macOS 26.0, *)
@Test func encodesNativeResultMetadata() throws {
    let detail = NativeTranscriptionDetail(
        alternatives: ["hello", "yellow"],
        attributes: [
            NativeTranscriptionTextAttribute(
                audioTimeRange: CMTimeRange(
                    start: CMTime(seconds: 0.2, preferredTimescale: 1_000),
                    duration: CMTime(seconds: 0.4, preferredTimescale: 1_000)
                ),
                text: "hello",
                transcriptionConfidence: 0.8
            ),
        ],
        isFinal: true,
        range: CMTimeRange(
            start: .zero,
            duration: CMTime(seconds: 1, preferredTimescale: 1_000)
        ),
        text: "hello"
    )
    let result = NativeTranscriptionResult(
        locale: "en-US",
        results: [detail],
        text: "hello"
    )

    #expect(JSONSerialization.isValidJSONObject(result.jsonObject))
    let results = try #require(result.jsonObject["results"] as? [[String: Any]])
    #expect(results[0]["alternatives"] as? [String] == ["hello", "yellow"])
    let attributes = try #require(results[0]["attributes"] as? [[String: Any]])
    #expect(attributes[0]["transcriptionConfidence"] as? Double == 0.8)
}

@available(macOS 26.0, *)
@Test func streamRegistryStartsWritesFinishesAndReleasesSessions() async throws {
    let session = FakeStreamSession()
    let registry = AppleSpeechStreamRegistry { _, _, _, _ in session }

    try await registry.start(
        identifier: "session",
        localeIdentifier: "en-US",
        sampleRate: 48_000,
        configuration: testConfiguration,
        partial: { _ in }
    )
    try await registry.append(identifier: "session", samples: Data(count: 16))
    let result = try await registry.finish(identifier: "session")

    #expect(result.locale == "en-US")
    #expect(result.text == "finished")
    #expect(await session.snapshot() == FakeStreamSession.Snapshot(
        appendedByteCounts: [16],
        cancelCount: 0,
        finishCount: 1
    ))
    await #expect(throws: (any Error).self) {
        try await registry.append(identifier: "session", samples: Data())
    }
}

@available(macOS 26.0, *)
@Test func streamRegistryCancelsAStartingSessionAndCleansLateResources() async {
    let factory = DeferredSessionFactory()
    let session = FakeStreamSession()
    let registry = AppleSpeechStreamRegistry { _, _, _, _ in
        await factory.make()
    }
    let startup = Task {
        try await registry.start(
            identifier: "session",
            localeIdentifier: "en-US",
            sampleRate: 48_000,
            configuration: testConfiguration,
            partial: { _ in }
        )
    }

    await factory.waitUntilRequested()
    await registry.cancel(identifier: "session", expectStart: true)
    await factory.resolve(with: session)

    await #expect(throws: (any Error).self) {
        try await startup.value
    }
    #expect(await session.snapshot().cancelCount == 1)
}

@available(macOS 26.0, *)
@Test func streamRegistryCancelsAnActiveSession() async throws {
    let session = FakeStreamSession()
    let registry = AppleSpeechStreamRegistry { _, _, _, _ in session }
    try await registry.start(
        identifier: "session",
        localeIdentifier: "en-US",
        sampleRate: 48_000,
        configuration: testConfiguration,
        partial: { _ in }
    )

    await registry.cancel(identifier: "session")

    #expect(await session.snapshot().cancelCount == 1)
}

@available(macOS 26.0, *)
@Test func streamRegistryKeepsFinishingSessionsCancelable() async throws {
    let session = FinishingStreamSession()
    let registry = AppleSpeechStreamRegistry { _, _, _, _ in session }
    try await registry.start(
        identifier: "session",
        localeIdentifier: "en-US",
        sampleRate: 48_000,
        configuration: testConfiguration,
        partial: { _ in }
    )
    let finishing = Task {
        try await registry.finish(identifier: "session")
    }

    await session.waitUntilFinishing()
    await registry.cancel(identifier: "session")

    await #expect(throws: (any Error).self) {
        try await finishing.value
    }
    #expect(await session.recordedCancelCount() == 1)
}

@Test func identifiesWhenStreamingAudioNeedsConversion() throws {
    let source = try #require(AVAudioFormat(
        commonFormat: .pcmFormatFloat32,
        sampleRate: 48_000,
        channels: 1,
        interleaved: false
    ))
    let destination = try #require(AVAudioFormat(
        commonFormat: .pcmFormatFloat32,
        sampleRate: 16_000,
        channels: 1,
        interleaved: false
    ))

    #expect(!audioFormatsMatch(source, destination))
    #expect(AVAudioConverter(from: source, to: destination) != nil)
}
