@preconcurrency import AVFAudio
import CoreMedia
import Foundation
import Speech

public typealias AppleSpeechJSONCallback = @Sendable (NSString?, NSString?) -> Void
public typealias AppleSpeechValueCallback = @Sendable (NSString) -> Void

struct NativeTranscriptionTextAttribute: Sendable {
    let audioTimeRange: CMTimeRange?
    let text: String
    let transcriptionConfidence: Double?

    var jsonObject: [String: Any] {
        var object: [String: Any] = ["text": text]
        if let audioTimeRange {
            object["audioTimeRange"] = [
                "durationMilliseconds": milliseconds(audioTimeRange.duration),
                "startMilliseconds": milliseconds(audioTimeRange.start),
            ]
        }
        if let transcriptionConfidence {
            object["transcriptionConfidence"] = transcriptionConfidence
        }
        return object
    }
}

@available(macOS 26.0, *)
struct NativeTranscriptionDetail: Sendable {
    let alternatives: [String]
    let attributes: [NativeTranscriptionTextAttribute]
    let isFinal: Bool
    let range: CMTimeRange
    let text: String

    init(
        alternatives: [String],
        attributes: [NativeTranscriptionTextAttribute],
        isFinal: Bool,
        range: CMTimeRange,
        text: String
    ) {
        self.alternatives = alternatives
        self.attributes = attributes
        self.isFinal = isFinal
        self.range = range
        self.text = text
    }

    init(_ result: SpeechTranscriber.Result) {
        alternatives = result.alternatives.map { String($0.characters) }
        attributes = Self.textAttributes(result.text)
        isFinal = result.isFinal
        range = result.range
        text = String(result.text.characters)
    }

    init(_ result: DictationTranscriber.Result) {
        alternatives = result.alternatives.map { String($0.characters) }
        attributes = Self.textAttributes(result.text)
        isFinal = result.isFinal
        range = result.range
        text = String(result.text.characters)
    }

    var jsonObject: [String: Any] {
        var object: [String: Any] = [
            "range": [
                "durationMilliseconds": milliseconds(range.duration),
                "isFinal": isFinal,
                "startMilliseconds": milliseconds(range.start),
            ],
            "text": text,
        ]
        if !alternatives.isEmpty {
            object["alternatives"] = alternatives
        }
        if !attributes.isEmpty {
            object["attributes"] = attributes.map(\.jsonObject)
        }
        return object
    }

    private static func textAttributes(
        _ text: AttributedString
    ) -> [NativeTranscriptionTextAttribute] {
        text.runs.compactMap { run in
            let audioTimeRange = run.audioTimeRange
            let confidence = run.transcriptionConfidence
            if audioTimeRange == nil, confidence == nil {
                return nil
            }
            return NativeTranscriptionTextAttribute(
                audioTimeRange: audioTimeRange,
                text: String(text[run.range].characters),
                transcriptionConfidence: confidence
            )
        }
    }
}

struct NativeTranscriptionResult: Sendable {
    let locale: String
    let results: [NativeTranscriptionDetail]
    let text: String

    init(
        locale: String,
        results: [NativeTranscriptionDetail] = [],
        text: String
    ) {
        self.locale = locale
        self.results = results
        self.text = text
    }

    var jsonObject: [String: Any] {
        var object: [String: Any] = ["locale": locale, "text": text]
        if !results.isEmpty {
            object["results"] = results.map(\.jsonObject)
        }
        return object
    }
}

enum NativeTranscriber: String, Codable, Sendable {
    case automatic
    case dictation
    case speech
}

struct NativeAttributeOptions: Codable, Sendable {
    let audioTimeRange: Bool
    let transcriptionConfidence: Bool
}

struct NativeSpeechOptions: Codable, Sendable {
    struct Reporting: Codable, Sendable {
        let alternativeTranscriptions: Bool
        let fastResults: Bool
        let volatileResults: Bool
    }

    struct Transcription: Codable, Sendable {
        let etiquetteReplacements: Bool
    }

    let attributes: NativeAttributeOptions
    let reporting: Reporting
    let transcription: Transcription
}

struct NativeDictationOptions: Codable, Sendable {
    struct ModelConfiguration: Codable, Sendable {
        let languageModel: String
        let vocabulary: String?
        let weight: Double?
    }

    struct CustomizedLanguage: Codable, Sendable {
        let modelConfiguration: ModelConfiguration
    }

    struct ContentHints: Codable, Sendable {
        let atypicalSpeech: Bool
        let customizedLanguage: CustomizedLanguage?
        let farField: Bool
        let shortForm: Bool
    }

    struct Reporting: Codable, Sendable {
        let alternativeTranscriptions: Bool
        let frequentFinalization: Bool
        let volatileResults: Bool
    }

    struct Transcription: Codable, Sendable {
        let emoji: Bool
        let etiquetteReplacements: Bool
        let punctuation: Bool
    }

    let attributes: NativeAttributeOptions
    let contentHints: ContentHints
    let reporting: Reporting
    let transcription: Transcription
}

struct NativeAnalysisContextOptions: Codable, Sendable {
    struct ContextualStrings: Codable, Sendable {
        let general: [String]?
    }

    let contextualStrings: ContextualStrings?
}

struct NativeTranscriptionConfiguration: Codable, Sendable {
    let analysisContext: NativeAnalysisContextOptions?
    let dictation: NativeDictationOptions?
    let speech: NativeSpeechOptions?
    let transcriber: NativeTranscriber
}

@available(macOS 26.0, *)
private enum ConfiguredTranscriber: Sendable {
    case dictation(Locale, DictationTranscriber)
    case speech(Locale, SpeechTranscriber)

    var locale: Locale {
        switch self {
        case let .dictation(locale, _), let .speech(locale, _):
            return locale
        }
    }

    var module: any SpeechModule {
        switch self {
        case let .dictation(_, transcriber):
            return transcriber
        case let .speech(_, transcriber):
            return transcriber
        }
    }
}

private final class ConverterInputState: @unchecked Sendable {
    let buffer: AVAudioPCMBuffer?
    var supplied = false

    init(buffer: AVAudioPCMBuffer?) {
        self.buffer = buffer
    }
}

@available(macOS 26.0, *)
private actor AppleSpeechTaskRegistry {
    private struct Entry {
        let task: Task<Void, Never>
        let token: UUID
    }

    private var canceledBeforeLaunch = Set<String>()
    private var entries: [String: Entry] = [:]

    func launch(
        identifier: String,
        retainAfterCompletion: Bool = false,
        operation: @escaping @Sendable () async -> Void
    ) {
        let token = UUID()
        let wasCanceledBeforeLaunch = canceledBeforeLaunch.remove(identifier) != nil
        let retainCompletedEntry = retainAfterCompletion && !wasCanceledBeforeLaunch
        let task = Task {
            await operation()
            self.complete(
                identifier: identifier,
                token: token,
                retainEntry: retainCompletedEntry
            )
        }
        entries[identifier] = Entry(task: task, token: token)

        if wasCanceledBeforeLaunch {
            task.cancel()
        }
    }

    func cancelAndWait(identifier: String) async -> Bool {
        guard let entry = entries.removeValue(forKey: identifier) else {
            canceledBeforeLaunch.insert(identifier)
            return false
        }

        entry.task.cancel()
        await entry.task.value
        return true
    }

    func forget(identifier: String) {
        entries.removeValue(forKey: identifier)
        canceledBeforeLaunch.remove(identifier)
    }

    private func complete(identifier: String, token: UUID, retainEntry: Bool) {
        guard entries[identifier]?.token == token else {
            return
        }
        if !retainEntry {
            entries.removeValue(forKey: identifier)
        }
    }
}

@available(macOS 26.0, *)
protocol AppleSpeechStreamSessionProtocol: AnyObject, Sendable {
    func append(_ sampleData: Data) async throws
    func cancel() async
    func finish() async throws -> NativeTranscriptionResult
}

@available(macOS 26.0, *)
typealias AppleSpeechStreamSessionFactory = @Sendable (
    _ localeIdentifier: String,
    _ sampleRate: Double,
    _ configuration: NativeTranscriptionConfiguration,
    _ partial: @escaping AppleSpeechValueCallback
) async throws -> any AppleSpeechStreamSessionProtocol

@available(macOS 26.0, *)
actor AppleSpeechStreamRegistry {
    private var canceledBeforeStart = Set<String>()
    private let makeSession: AppleSpeechStreamSessionFactory
    private var sessions: [String: any AppleSpeechStreamSessionProtocol] = [:]

    init(makeSession: @escaping AppleSpeechStreamSessionFactory = {
        try await AppleSpeechStreamSession(
            localeIdentifier: $0,
            sampleRate: $1,
            configuration: $2,
            partial: $3
        )
    }) {
        self.makeSession = makeSession
    }

    func start(
        identifier: String,
        localeIdentifier: String,
        sampleRate: Double,
        configuration: NativeTranscriptionConfiguration,
        partial: @escaping AppleSpeechValueCallback
    ) async throws {
        let session = try await makeSession(
            localeIdentifier,
            sampleRate,
            configuration,
            partial
        )

        if canceledBeforeStart.remove(identifier) != nil {
            await session.cancel()
            throw CancellationError()
        }

        do {
            try Task.checkCancellation()
        } catch {
            await session.cancel()
            throw error
        }
        sessions[identifier] = session
    }

    func append(identifier: String, samples: Data) async throws {
        guard let session = sessions[identifier] else {
            throw AppleSpeechError.unknownStream(identifier)
        }
        try await session.append(samples)
    }

    func finish(identifier: String) async throws -> NativeTranscriptionResult {
        guard let session = sessions[identifier] else {
            throw AppleSpeechError.unknownStream(identifier)
        }
        do {
            let result = try await session.finish()
            if sessions[identifier] === session {
                sessions.removeValue(forKey: identifier)
            }
            return result
        } catch {
            if sessions[identifier] === session {
                sessions.removeValue(forKey: identifier)
            }
            throw error
        }
    }

    func cancel(identifier: String, expectStart: Bool = false) async {
        guard let session = sessions.removeValue(forKey: identifier) else {
            if expectStart {
                canceledBeforeStart.insert(identifier)
            }
            return
        }
        await session.cancel()
    }
}

@available(macOS 26.0, *)
private actor AppleSpeechStreamSession: AppleSpeechStreamSessionProtocol {
    private enum State {
        case active
        case completed
        case disposed
        case finishing
    }

    private struct Segment {
        let detail: NativeTranscriptionDetail
        let isFinal: Bool
        let range: CMTimeRange
        let text: String
    }

    private let analyzer: SpeechAnalyzer
    private let analyzerFormat: AVAudioFormat
    private let converter: AVAudioConverter?
    private let inputContinuation: AsyncStream<AnalyzerInput>.Continuation
    private let inputSequence: AsyncStream<AnalyzerInput>
    private let locale: Locale
    private let partial: AppleSpeechValueCallback
    private let sourceFormat: AVAudioFormat
    private let transcriber: ConfiguredTranscriber

    private var resultTask: Task<Void, Error>?
    private var segments: [Segment] = []
    private var state = State.active

    init(
        localeIdentifier: String,
        sampleRate: Double,
        configuration: NativeTranscriptionConfiguration,
        partial: @escaping AppleSpeechValueCallback
    ) async throws {
        guard sampleRate.isFinite, sampleRate > 0 else {
            throw AppleSpeechError.invalidSampleRate(sampleRate)
        }

        let transcriber = try await makeTranscriber(
            localeIdentifier: localeIdentifier,
            configuration: configuration
        )
        try await installAssets(for: transcriber)
        guard let sourceFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: sampleRate,
            channels: 1,
            interleaved: false
        ) else {
            throw AppleSpeechError.invalidSampleRate(sampleRate)
        }
        guard let analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(
            compatibleWith: [transcriber.module],
            considering: sourceFormat
        ) else {
            throw AppleSpeechError.noCompatibleAudioFormat
        }

        let converter: AVAudioConverter?
        if audioFormatsMatch(sourceFormat, analyzerFormat) {
            converter = nil
        } else {
            guard let audioConverter = AVAudioConverter(
                from: sourceFormat,
                to: analyzerFormat
            ) else {
                throw AppleSpeechError.cannotCreateAudioConverter
            }
            converter = audioConverter
        }

        let input = AsyncStream<AnalyzerInput>.makeStream()
        self.analyzer = SpeechAnalyzer(modules: [transcriber.module])
        self.analyzerFormat = analyzerFormat
        self.converter = converter
        self.inputContinuation = input.continuation
        self.inputSequence = input.stream
        self.locale = transcriber.locale
        self.partial = partial
        self.sourceFormat = sourceFormat
        self.transcriber = transcriber

        try await analyzer.setContext(try analysisContext(configuration.analysisContext))
        try await analyzer.prepareToAnalyze(in: analyzerFormat)
        switch transcriber {
        case let .speech(_, speechTranscriber):
            resultTask = Task { [weak self, speechTranscriber] in
                for try await result in speechTranscriber.results {
                    try Task.checkCancellation()
                    await self?.accept(NativeTranscriptionDetail(result))
                }
            }
        case let .dictation(_, dictationTranscriber):
            resultTask = Task { [weak self, dictationTranscriber] in
                for try await result in dictationTranscriber.results {
                    try Task.checkCancellation()
                    await self?.accept(NativeTranscriptionDetail(result))
                }
            }
        }
        do {
            try await analyzer.start(inputSequence: inputSequence)
        } catch {
            inputContinuation.finish()
            resultTask?.cancel()
            await analyzer.cancelAndFinishNow()
            throw error
        }
    }

    func append(_ sampleData: Data) throws {
        guard state == .active else {
            throw AppleSpeechError.streamStopped
        }
        guard sampleData.count.isMultiple(of: MemoryLayout<Float>.size) else {
            throw AppleSpeechError.invalidPCMByteCount(sampleData.count)
        }

        let frameCount = sampleData.count / MemoryLayout<Float>.size
        guard frameCount > 0 else {
            return
        }
        guard let buffer = AVAudioPCMBuffer(
            pcmFormat: sourceFormat,
            frameCapacity: AVAudioFrameCount(frameCount)
        ), let samples = buffer.floatChannelData?[0] else {
            throw AppleSpeechError.cannotCreatePCMBuffer
        }

        sampleData.withUnsafeBytes { bytes in
            guard let source = bytes.baseAddress else {
                return
            }
            memcpy(samples, source, sampleData.count)
        }
        buffer.frameLength = AVAudioFrameCount(frameCount)

        if converter == nil {
            inputContinuation.yield(AnalyzerInput(buffer: buffer))
            return
        }
        try convert(buffer, endOfStream: false)
    }

    func finish() async throws -> NativeTranscriptionResult {
        guard state == .active else {
            throw AppleSpeechError.streamStopped
        }

        state = .finishing
        do {
            if converter != nil {
                try convert(nil, endOfStream: true)
            }
            inputContinuation.finish()
            try await analyzer.finalizeAndFinishThroughEndOfInput()
            try await resultTask?.value
            guard state == .finishing else {
                throw CancellationError()
            }
            state = .completed
            return NativeTranscriptionResult(
                locale: bcp47Identifier(locale),
                results: segments.filter(\.isFinal).map(\.detail),
                text: transcriptText
            )
        } catch {
            if state != .disposed {
                state = .disposed
                resultTask?.cancel()
                await analyzer.cancelAndFinishNow()
            }
            throw error
        }
    }

    func cancel() async {
        guard state != .completed, state != .disposed else {
            return
        }

        state = .disposed
        inputContinuation.finish()
        resultTask?.cancel()
        await analyzer.cancelAndFinishNow()
    }

    private var transcriptText: String {
        segments.map(\.text).joined().trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func accept(_ result: NativeTranscriptionDetail) {
        let text = result.text
        segments.removeAll { segment in
            rangesOverlap(segment.range, result.range)
                && (result.isFinal || !segment.isFinal)
        }
        if !text.isEmpty {
            segments.append(Segment(
                detail: result,
                isFinal: result.isFinal,
                range: result.range,
                text: text
            ))
        }
        segments.sort { CMTimeCompare($0.range.start, $1.range.start) < 0 }

        do {
            partial(try jsonString([
                "locale": bcp47Identifier(locale),
                "range": [
                    "durationMilliseconds": milliseconds(result.range.duration),
                    "isFinal": result.isFinal,
                    "startMilliseconds": milliseconds(result.range.start),
                ],
                "result": result.jsonObject,
                "text": transcriptText,
                "type": "transcript.text.partial",
            ]) as NSString)
        } catch {
            resultTask?.cancel()
        }
    }

    private func convert(
        _ inputBuffer: AVAudioPCMBuffer?,
        endOfStream: Bool
    ) throws {
        guard let converter else {
            return
        }

        let sourceFrames = Double(inputBuffer?.frameLength ?? 0)
        let rateRatio = analyzerFormat.sampleRate / sourceFormat.sampleRate
        let estimatedFrames = sourceFrames * rateRatio
        let capacity = AVAudioFrameCount(max(4_096, ceil(estimatedFrames) + 256))
        let inputState = ConverterInputState(buffer: inputBuffer)

        while true {
            guard let output = AVAudioPCMBuffer(
                pcmFormat: analyzerFormat,
                frameCapacity: capacity
            ) else {
                throw AppleSpeechError.cannotCreatePCMBuffer
            }

            var conversionError: NSError?
            let status = converter.convert(
                to: output,
                error: &conversionError
            ) { _, outputStatus in
                if !inputState.supplied, let inputBuffer = inputState.buffer {
                    inputState.supplied = true
                    outputStatus.pointee = .haveData
                    return inputBuffer
                }

                outputStatus.pointee = endOfStream ? .endOfStream : .noDataNow
                return nil
            }
            if let conversionError {
                throw conversionError
            }
            if output.frameLength > 0 {
                inputContinuation.yield(AnalyzerInput(buffer: output))
            }

            switch status {
            case .haveData:
                continue
            case .inputRanDry:
                return
            case .endOfStream:
                return
            case .error:
                throw AppleSpeechError.audioConversionFailed
            @unknown default:
                throw AppleSpeechError.audioConversionFailed
            }
        }
    }
}

@available(macOS 26.0, *)
private func makeTranscriber(
    localeIdentifier: String,
    configuration: NativeTranscriptionConfiguration
) async throws -> ConfiguredTranscriber {
    let requestedIdentifier = bcp47Identifier(Locale(identifier: localeIdentifier))
    if configuration.transcriber != .dictation, SpeechTranscriber.isAvailable {
        let supportedLocales = await SpeechTranscriber.supportedLocales
        if let locale = exactLocale(requestedIdentifier, in: supportedLocales) {
            guard let options = configuration.speech else {
                throw AppleSpeechError.invalidConfiguration(
                    "SpeechTranscriber options are missing."
                )
            }
            return .speech(locale, speechTranscriber(locale: locale, options: options))
        }
        if configuration.transcriber == .speech {
            throw AppleSpeechError.unsupportedLocale(
                localeIdentifier,
                supportedLocales.map(bcp47Identifier).sorted()
            )
        }
    } else if configuration.transcriber == .speech {
        throw AppleSpeechError.unavailable("SpeechTranscriber")
    }

    let supportedLocales = await DictationTranscriber.supportedLocales
    guard let locale = exactLocale(requestedIdentifier, in: supportedLocales) else {
        throw AppleSpeechError.unsupportedLocale(
            localeIdentifier,
            supportedLocales.map(bcp47Identifier).sorted()
        )
    }
    guard let options = configuration.dictation else {
        throw AppleSpeechError.invalidConfiguration(
            "DictationTranscriber options are missing."
        )
    }
    return .dictation(locale, try dictationTranscriber(locale: locale, options: options))
}

@available(macOS 26.0, *)
private func makeAssetTranscriber(
    localeIdentifier: String,
    transcriber: NativeTranscriber
) async throws -> ConfiguredTranscriber {
    let requestedIdentifier = bcp47Identifier(Locale(identifier: localeIdentifier))
    if transcriber != .dictation, SpeechTranscriber.isAvailable {
        let supportedLocales = await SpeechTranscriber.supportedLocales
        if let locale = exactLocale(requestedIdentifier, in: supportedLocales) {
            return .speech(
                locale,
                SpeechTranscriber(locale: locale, preset: .transcription)
            )
        }
        if transcriber == .speech {
            throw AppleSpeechError.unsupportedLocale(
                localeIdentifier,
                supportedLocales.map(bcp47Identifier).sorted()
            )
        }
    } else if transcriber == .speech {
        throw AppleSpeechError.unavailable("SpeechTranscriber")
    }

    let supportedLocales = await DictationTranscriber.supportedLocales
    guard let locale = exactLocale(requestedIdentifier, in: supportedLocales) else {
        throw AppleSpeechError.unsupportedLocale(
            localeIdentifier,
            supportedLocales.map(bcp47Identifier).sorted()
        )
    }
    return .dictation(
        locale,
        DictationTranscriber(locale: locale, preset: .longDictation)
    )
}

@available(macOS 26.0, *)
private func exactLocale(_ identifier: String, in locales: [Locale]) -> Locale? {
    locales.first { bcp47Identifier($0) == identifier }
}

@available(macOS 26.0, *)
private func speechTranscriber(
    locale: Locale,
    options: NativeSpeechOptions
) -> SpeechTranscriber {
    var transcriptionOptions = Set<SpeechTranscriber.TranscriptionOption>()
    var reportingOptions = Set<SpeechTranscriber.ReportingOption>()
    var attributeOptions = Set<SpeechTranscriber.ResultAttributeOption>()

    if options.transcription.etiquetteReplacements {
        transcriptionOptions.insert(.etiquetteReplacements)
    }
    if options.reporting.volatileResults {
        reportingOptions.insert(.volatileResults)
    }
    if options.reporting.alternativeTranscriptions {
        reportingOptions.insert(.alternativeTranscriptions)
    }
    if options.reporting.fastResults {
        reportingOptions.insert(.fastResults)
    }
    if options.attributes.audioTimeRange {
        attributeOptions.insert(.audioTimeRange)
    }
    if options.attributes.transcriptionConfidence {
        attributeOptions.insert(.transcriptionConfidence)
    }

    return SpeechTranscriber(
        locale: locale,
        transcriptionOptions: transcriptionOptions,
        reportingOptions: reportingOptions,
        attributeOptions: attributeOptions
    )
}

@available(macOS 26.0, *)
private func dictationTranscriber(
    locale: Locale,
    options: NativeDictationOptions
) throws -> DictationTranscriber {
    var contentHints = Set<DictationTranscriber.ContentHint>()
    var transcriptionOptions = Set<DictationTranscriber.TranscriptionOption>()
    var reportingOptions = Set<DictationTranscriber.ReportingOption>()
    var attributeOptions = Set<DictationTranscriber.ResultAttributeOption>()

    if options.contentHints.shortForm {
        contentHints.insert(.shortForm)
    }
    if options.contentHints.farField {
        contentHints.insert(.farField)
    }
    if options.contentHints.atypicalSpeech {
        contentHints.insert(.atypicalSpeech)
    }
    if let customizedLanguage = options.contentHints.customizedLanguage {
        let model = customizedLanguage.modelConfiguration
        if model.languageModel.trimmingCharacters(
            in: .whitespacesAndNewlines
        ).isEmpty {
            throw AppleSpeechError.invalidConfiguration(
                "The custom language model path must not be empty."
            )
        }
        if let weight = model.weight, !(0 ... 1).contains(weight) {
            throw AppleSpeechError.invalidConfiguration(
                "The custom language model weight must be from 0 through 1."
            )
        }
        let modelConfiguration = SFSpeechLanguageModel.Configuration(
            languageModel: URL(fileURLWithPath: model.languageModel),
            vocabulary: model.vocabulary.map { URL(fileURLWithPath: $0) },
            weight: model.weight.map { NSNumber(value: $0) }
        )
        contentHints.insert(.customizedLanguage(
            modelConfiguration: modelConfiguration
        ))
    }

    if options.transcription.punctuation {
        transcriptionOptions.insert(.punctuation)
    }
    if options.transcription.emoji {
        transcriptionOptions.insert(.emoji)
    }
    if options.transcription.etiquetteReplacements {
        transcriptionOptions.insert(.etiquetteReplacements)
    }
    if options.reporting.volatileResults {
        reportingOptions.insert(.volatileResults)
    }
    if options.reporting.alternativeTranscriptions {
        reportingOptions.insert(.alternativeTranscriptions)
    }
    if options.reporting.frequentFinalization {
        reportingOptions.insert(.frequentFinalization)
    }
    if options.attributes.audioTimeRange {
        attributeOptions.insert(.audioTimeRange)
    }
    if options.attributes.transcriptionConfidence {
        attributeOptions.insert(.transcriptionConfidence)
    }

    return DictationTranscriber(
        locale: locale,
        contentHints: contentHints,
        transcriptionOptions: transcriptionOptions,
        reportingOptions: reportingOptions,
        attributeOptions: attributeOptions
    )
}

@available(macOS 26.0, *)
private func analysisContext(
    _ options: NativeAnalysisContextOptions?
) throws -> AnalysisContext {
    let context = AnalysisContext()
    if let general = options?.contextualStrings?.general {
        if general.count > 100 {
            throw AppleSpeechError.invalidConfiguration(
                "Apple Speech accepts at most 100 contextual strings."
            )
        }
        context.contextualStrings[.general] = general
    }
    return context
}

@available(macOS 26.0, *)
private func installAssets(
    for transcriber: ConfiguredTranscriber,
    progressUpdate: AppleSpeechValueCallback? = nil
) async throws {
    guard let request = try await AssetInventory.assetInstallationRequest(
        supporting: [transcriber.module]
    ) else {
        return
    }

    let progress = request.progress
    let observer = Task {
        var lastValue = -1
        while !Task.isCancelled {
            let value = min(100, max(0, Int((progress.fractionCompleted * 100).rounded())))
            if value != lastValue {
                lastValue = value
                if let progressUpdate {
                    progressUpdate(try jsonString([
                        "locale": bcp47Identifier(transcriber.locale),
                        "progress": value,
                        "status": "progress",
                    ]) as NSString)
                }
            }
            try await Task.sleep(for: .milliseconds(100))
        }
    }
    defer { observer.cancel() }

    do {
        try Task.checkCancellation()
        try await request.downloadAndInstall()
        try Task.checkCancellation()
    } catch {
        if progress.isCancellable {
            progress.cancel()
        }
        throw error
    }
}

func audioFormatsMatch(
    _ left: AVAudioFormat,
    _ right: AVAudioFormat
) -> Bool {
    left.channelCount == right.channelCount
        && left.commonFormat == right.commonFormat
        && left.isInterleaved == right.isInterleaved
        && left.sampleRate == right.sampleRate
}

func bcp47Identifier(_ locale: Locale) -> String {
    locale.identifier.replacingOccurrences(of: "_", with: "-")
}

private func jsonString(_ value: Any) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    guard let json = String(data: data, encoding: .utf8) else {
        throw AppleSpeechError.invalidJSON
    }
    return json
}

private func milliseconds(_ time: CMTime) -> Double {
    let seconds = CMTimeGetSeconds(time)
    return seconds.isFinite ? seconds * 1_000 : 0
}

private func rangesOverlap(_ left: CMTimeRange, _ right: CMTimeRange) -> Bool {
    CMTimeCompare(left.start, CMTimeRangeGetEnd(right)) < 0
        && CMTimeCompare(right.start, CMTimeRangeGetEnd(left)) < 0
}

func decodeConfiguration(
    _ json: String
) throws -> NativeTranscriptionConfiguration {
    guard let data = json.data(using: .utf8) else {
        throw AppleSpeechError.invalidConfiguration(
            "The transcription configuration is not valid UTF-8."
        )
    }
    do {
        return try JSONDecoder().decode(
            NativeTranscriptionConfiguration.self,
            from: data
        )
    } catch {
        throw AppleSpeechError.invalidConfiguration(error.localizedDescription)
    }
}

private func decodeTranscriber(_ identifier: String) throws -> NativeTranscriber {
    guard let transcriber = NativeTranscriber(rawValue: identifier) else {
        throw AppleSpeechError.invalidConfiguration(
            "The transcriber must be automatic, dictation, or speech."
        )
    }
    return transcriber
}

@available(macOS 26.0, *)
private func transcriberIsAvailable(_ transcriber: NativeTranscriber) async -> Bool {
    switch transcriber {
    case .speech:
        return SpeechTranscriber.isAvailable
    case .dictation:
        return !(await DictationTranscriber.supportedLocales).isEmpty
    case .automatic:
        if SpeechTranscriber.isAvailable {
            return true
        }
        return !(await DictationTranscriber.supportedLocales).isEmpty
    }
}

@available(macOS 26.0, *)
private func localeInventory(
    _ transcriber: NativeTranscriber
) async -> [[String: Any]] {
    var inventory: [String: Bool] = [:]

    if transcriber != .speech {
        let supported = await DictationTranscriber.supportedLocales
        let installed = Set(
            await DictationTranscriber.installedLocales.map(bcp47Identifier)
        )
        for locale in supported {
            let identifier = bcp47Identifier(locale)
            inventory[identifier] = installed.contains(identifier)
        }
    }

    if transcriber != .dictation, SpeechTranscriber.isAvailable {
        let supported = await SpeechTranscriber.supportedLocales
        let installed = Set(
            await SpeechTranscriber.installedLocales.map(bcp47Identifier)
        )
        for locale in supported {
            let identifier = bcp47Identifier(locale)
            inventory[identifier] = installed.contains(identifier)
        }
    }

    return inventory.map { identifier, installed in
        ["installed": installed, "locale": identifier] as [String: Any]
    }.sorted {
        ($0["locale"] as? String ?? "") < ($1["locale"] as? String ?? "")
    }
}

@available(macOS 26.0, *)
@objc public final class AppleSpeechBridge: NSObject {
    private static let operationRegistry = AppleSpeechTaskRegistry()
    private static let streamRegistry = AppleSpeechStreamRegistry()

    @objc public static func isAvailable(
        transcriberIdentifier: NSString,
        completion: @escaping AppleSpeechJSONCallback
    ) {
        let identifier = transcriberIdentifier as String
        Task {
            do {
                let transcriber = try decodeTranscriber(identifier)
                let available = await transcriberIsAvailable(transcriber)
                completion((available ? "true" : "false") as NSString, nil)
            } catch {
                completion(nil, String(describing: error) as NSString)
            }
        }
    }

    @objc public static func getLocales(
        transcriberIdentifier: NSString,
        completion: @escaping AppleSpeechJSONCallback
    ) {
        let identifier = transcriberIdentifier as String
        Task {
            do {
                let transcriber = try decodeTranscriber(identifier)
                completeJSON(
                    await localeInventory(transcriber),
                    completion: completion
                )
            } catch {
                completion(nil, String(describing: error) as NSString)
            }
        }
    }

    @objc public static func load(
        operationIdentifier: NSString,
        localeIdentifier: NSString,
        transcriberIdentifier: NSString,
        progress: @escaping AppleSpeechValueCallback,
        completion: @escaping AppleSpeechJSONCallback
    ) {
        let identifier = operationIdentifier as String
        let locale = localeIdentifier as String
        let requestedTranscriber = transcriberIdentifier as String
        Task {
            await operationRegistry.launch(identifier: identifier) {
                do {
                    let transcriber = try await makeAssetTranscriber(
                        localeIdentifier: locale,
                        transcriber: try decodeTranscriber(requestedTranscriber)
                    )
                    try await installAssets(for: transcriber, progressUpdate: progress)
                    completion("{}" as NSString, nil)
                } catch {
                    completion(nil, String(describing: error) as NSString)
                }
            }
        }
    }

    @objc public static func cancelLoad(
        operationIdentifier: NSString,
        completion: @escaping AppleSpeechJSONCallback
    ) {
        let identifier = operationIdentifier as String
        Task {
            _ = await operationRegistry.cancelAndWait(
                identifier: identifier
            )
            completion("{}" as NSString, nil)
        }
    }

    @objc public static func generate(
        operationIdentifier: NSString,
        audio: NSData,
        localeIdentifier: NSString,
        configurationJSON: NSString,
        fileName: NSString?,
        mediaType: NSString?,
        completion: @escaping AppleSpeechJSONCallback
    ) {
        let identifier = operationIdentifier as String
        let audioData = audio as Data
        let locale = localeIdentifier as String
        let configurationText = configurationJSON as String
        let originalFileName = fileName as String?
        let originalMediaType = mediaType as String?
        Task {
            await operationRegistry.launch(identifier: identifier) {
                let fileExtension = safeFileExtension(
                    fileName: originalFileName,
                    mediaType: originalMediaType
                )
                let temporaryURL = FileManager.default.temporaryDirectory
                    .appendingPathComponent(UUID().uuidString)
                    .appendingPathExtension(fileExtension)

                do {
                    try audioData.write(to: temporaryURL, options: .atomic)
                    defer { try? FileManager.default.removeItem(at: temporaryURL) }
                    let result = try await transcribeFile(
                        url: temporaryURL,
                        localeIdentifier: locale,
                        configuration: try decodeConfiguration(configurationText)
                    )
                    completeJSON(result.jsonObject, completion: completion)
                } catch {
                    completion(nil, String(describing: error) as NSString)
                }
            }
        }
    }

    @objc public static func cancelOperation(
        operationIdentifier: NSString,
        completion: @escaping AppleSpeechJSONCallback
    ) {
        let identifier = operationIdentifier as String
        Task {
            _ = await operationRegistry.cancelAndWait(
                identifier: identifier
            )
            completion("{}" as NSString, nil)
        }
    }

    @objc public static func startStream(
        sessionIdentifier: NSString,
        localeIdentifier: NSString,
        inputSampleRate: Double,
        configurationJSON: NSString,
        partial: @escaping AppleSpeechValueCallback,
        completion: @escaping AppleSpeechJSONCallback
    ) {
        let identifier = sessionIdentifier as String
        let locale = localeIdentifier as String
        let configurationText = configurationJSON as String
        Task {
            await operationRegistry.launch(
                identifier: identifier,
                retainAfterCompletion: true
            ) {
                do {
                    try await streamRegistry.start(
                        identifier: identifier,
                        localeIdentifier: locale,
                        sampleRate: inputSampleRate,
                        configuration: try decodeConfiguration(configurationText),
                        partial: partial
                    )
                    completion("{}" as NSString, nil)
                } catch {
                    completion(nil, String(describing: error) as NSString)
                }
            }
        }
    }

    @objc public static func writeStream(
        sessionIdentifier: NSString,
        samples: NSData,
        completion: @escaping AppleSpeechJSONCallback
    ) {
        let identifier = sessionIdentifier as String
        let sampleData = samples as Data
        Task {
            do {
                try await streamRegistry.append(
                    identifier: identifier,
                    samples: sampleData
                )
                completion("{}" as NSString, nil)
            } catch {
                completion(nil, String(describing: error) as NSString)
            }
        }
    }

    @objc public static func finishStream(
        sessionIdentifier: NSString,
        completion: @escaping AppleSpeechJSONCallback
    ) {
        let identifier = sessionIdentifier as String
        Task {
            do {
                let result = try await streamRegistry.finish(
                    identifier: identifier
                )
                await operationRegistry.forget(identifier: identifier)
                completeJSON(result.jsonObject, completion: completion)
            } catch {
                await operationRegistry.forget(identifier: identifier)
                completion(nil, String(describing: error) as NSString)
            }
        }
    }

    @objc public static func cancelStream(
        sessionIdentifier: NSString,
        completion: @escaping AppleSpeechJSONCallback
    ) {
        let identifier = sessionIdentifier as String
        Task {
            let taskWasRegistered = await operationRegistry.cancelAndWait(
                identifier: identifier
            )
            await streamRegistry.cancel(
                identifier: identifier,
                expectStart: !taskWasRegistered
            )
            completion("{}" as NSString, nil)
        }
    }

    private static func transcribeFile(
        url: URL,
        localeIdentifier: String,
        configuration: NativeTranscriptionConfiguration
    ) async throws -> NativeTranscriptionResult {
        let transcriber = try await makeTranscriber(
            localeIdentifier: localeIdentifier,
            configuration: configuration
        )
        try await installAssets(for: transcriber)

        let file = try AVAudioFile(forReading: url)
        let analyzer = SpeechAnalyzer(modules: [transcriber.module])
        try await analyzer.setContext(try analysisContext(configuration.analysisContext))
        let resultTask = Task { () throws -> [NativeTranscriptionDetail] in
            var results: [NativeTranscriptionDetail] = []
            switch transcriber {
            case let .speech(_, speechTranscriber):
                for try await result in speechTranscriber.results where result.isFinal {
                    try Task.checkCancellation()
                    let detail = NativeTranscriptionDetail(result)
                    if !detail.text.trimmingCharacters(
                        in: .whitespacesAndNewlines
                    ).isEmpty {
                        results.append(detail)
                    }
                }
            case let .dictation(_, dictationTranscriber):
                for try await result in dictationTranscriber.results where result.isFinal {
                    try Task.checkCancellation()
                    let detail = NativeTranscriptionDetail(result)
                    if !detail.text.trimmingCharacters(
                        in: .whitespacesAndNewlines
                    ).isEmpty {
                        results.append(detail)
                    }
                }
            }
            return results
        }
        defer { resultTask.cancel() }

        do {
            try Task.checkCancellation()
            let lastSampleTime = try await analyzer.analyzeSequence(from: file)
            try Task.checkCancellation()
            if let lastSampleTime {
                try await analyzer.finalizeAndFinish(through: lastSampleTime)
            } else {
                await analyzer.cancelAndFinishNow()
            }
            let results = try await resultTask.value
            return NativeTranscriptionResult(
                locale: bcp47Identifier(transcriber.locale),
                results: results,
                text: results.map(\.text).joined(separator: " ")
            )
        } catch {
            resultTask.cancel()
            await analyzer.cancelAndFinishNow()
            throw error
        }
    }

    private static func completeJSON(
        _ value: Any,
        completion: @escaping AppleSpeechJSONCallback
    ) {
        do {
            completion(try jsonString(value) as NSString, nil)
        } catch {
            completion(nil, String(describing: error) as NSString)
        }
    }
}

func safeFileExtension(
    fileName: String?,
    mediaType: String?
) -> String {
    if let fileName {
        let candidate = URL(fileURLWithPath: fileName).pathExtension
        let safe = candidate.filter { $0.isLetter || $0.isNumber }
        if !safe.isEmpty {
            return safe
        }
    }

    switch mediaType?.lowercased() {
    case "audio/mpeg":
        return "mp3"
    case "audio/mp4", "audio/x-m4a":
        return "m4a"
    case "audio/ogg":
        return "ogg"
    default:
        return "wav"
    }
}

private enum AppleSpeechError: LocalizedError {
    case audioConversionFailed
    case cannotCreateAudioConverter
    case cannotCreatePCMBuffer
    case invalidJSON
    case invalidConfiguration(String)
    case invalidPCMByteCount(Int)
    case invalidSampleRate(Double)
    case noCompatibleAudioFormat
    case streamStopped
    case unavailable(String)
    case unknownStream(String)
    case unsupportedLocale(String, [String])

    var errorDescription: String? {
        switch self {
        case .audioConversionFailed:
            return "Apple Speech could not convert the live audio."
        case .cannotCreateAudioConverter:
            return "Apple Speech could not create an audio converter."
        case .cannotCreatePCMBuffer:
            return "Apple Speech could not create a PCM audio buffer."
        case .invalidJSON:
            return "Apple Speech returned a result that cannot be encoded as JSON."
        case let .invalidConfiguration(message):
            return "Apple Speech received an invalid configuration. \(message)"
        case let .invalidPCMByteCount(count):
            return "Apple Speech received invalid PCM byte count \(count)."
        case let .invalidSampleRate(sampleRate):
            return "Apple Speech received invalid sample rate \(sampleRate)."
        case .noCompatibleAudioFormat:
            return "Apple Speech did not provide a compatible audio format."
        case .streamStopped:
            return "Apple Speech received audio after the stream stopped."
        case let .unavailable(transcriber):
            return "\(transcriber) is unavailable on this Mac."
        case let .unknownStream(identifier):
            return "Apple Speech stream \(identifier) does not exist."
        case let .unsupportedLocale(locale, supported):
            return "Apple Speech does not support locale \(locale). Supported locales: \(supported.joined(separator: ", "))."
        }
    }
}
