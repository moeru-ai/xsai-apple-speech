#include <node_api.h>

#include <mutex>
#include <string>
#include <unordered_map>

#import <Foundation/Foundation.h>

#import "AppleSpeechBridge-Swift.h"

namespace {

struct PromiseContext {
  napi_deferred deferred;
};

struct PromiseResult {
  NSString* error;
  NSString* value;
};

struct ValueResult {
  NSString* value;
};

std::mutex streamCallbacksMutex;
std::unordered_map<std::string, napi_threadsafe_function> streamCallbacks;

void callPromiseJavaScript(napi_env env, napi_value, void* context, void* data) {
  auto* promiseContext = static_cast<PromiseContext*>(context);
  auto* result = static_cast<PromiseResult*>(data);

  if (env != nullptr) {
    if (result->error != nil) {
      napi_value message;
      napi_value error;
      napi_create_string_utf8(
          env,
          result->error.UTF8String,
          NAPI_AUTO_LENGTH,
          &message);
      napi_create_error(env, nullptr, message, &error);
      napi_reject_deferred(env, promiseContext->deferred, error);
    } else if (result->value != nil) {
      napi_value value;
      napi_create_string_utf8(
          env,
          result->value.UTF8String,
          NAPI_AUTO_LENGTH,
          &value);
      napi_resolve_deferred(env, promiseContext->deferred, value);
    } else {
      napi_value undefined;
      napi_get_undefined(env, &undefined);
      napi_resolve_deferred(env, promiseContext->deferred, undefined);
    }
  }

  delete result;
}

void finalizePromiseFunction(napi_env, void* data, void*) {
  delete static_cast<PromiseContext*>(data);
}

void callValueJavaScript(napi_env env, napi_value callback, void*, void* data) {
  auto* result = static_cast<ValueResult*>(data);
  if (env != nullptr) {
    napi_value undefined;
    napi_get_undefined(env, &undefined);
    napi_value value;
    napi_create_string_utf8(
        env,
        result->value.UTF8String,
        NAPI_AUTO_LENGTH,
        &value);
    napi_value ignored;
    napi_call_function(env, undefined, callback, 1, &value, &ignored);
  }
  delete result;
}

napi_threadsafe_function createPromiseFunction(
    napi_env env,
    napi_deferred deferred) {
  auto* context = new PromiseContext{deferred};
  napi_value resourceName;
  napi_create_string_utf8(
      env,
      "xsai-apple-speech-promise",
      NAPI_AUTO_LENGTH,
      &resourceName);

  napi_threadsafe_function function;
  napi_create_threadsafe_function(
      env,
      nullptr,
      nullptr,
      resourceName,
      0,
      1,
      context,
      finalizePromiseFunction,
      context,
      callPromiseJavaScript,
      &function);
  return function;
}

napi_threadsafe_function createValueFunction(
    napi_env env,
    napi_value callback,
    const char* resourceNameText) {
  napi_value resourceName;
  napi_create_string_utf8(
      env,
      resourceNameText,
      NAPI_AUTO_LENGTH,
      &resourceName);

  napi_threadsafe_function function;
  napi_create_threadsafe_function(
      env,
      callback,
      nullptr,
      resourceName,
      0,
      1,
      nullptr,
      nullptr,
      nullptr,
      callValueJavaScript,
      &function);
  return function;
}

napi_value createPromise(
    napi_env env,
    napi_threadsafe_function* function) {
  napi_value promise;
  napi_deferred deferred;
  napi_create_promise(env, &deferred, &promise);
  *function = createPromiseFunction(env, deferred);
  return promise;
}

void complete(
    napi_threadsafe_function function,
    NSString* value,
    NSString* error) {
  auto* result = new PromiseResult{[error copy], [value copy]};
  napi_call_threadsafe_function(function, result, napi_tsfn_nonblocking);
  napi_release_threadsafe_function(function, napi_tsfn_release);
}

void sendValue(napi_threadsafe_function function, NSString* value) {
  auto* result = new ValueResult{[value copy]};
  napi_call_threadsafe_function(function, result, napi_tsfn_nonblocking);
}

void storeStreamCallback(
    const std::string& identifier,
    napi_threadsafe_function function) {
  std::lock_guard<std::mutex> lock(streamCallbacksMutex);
  streamCallbacks[identifier] = function;
}

void releaseStreamCallback(const std::string& identifier) {
  napi_threadsafe_function function = nullptr;
  {
    std::lock_guard<std::mutex> lock(streamCallbacksMutex);
    auto iterator = streamCallbacks.find(identifier);
    if (iterator == streamCallbacks.end())
      return;
    function = iterator->second;
    streamCallbacks.erase(iterator);
  }
  napi_release_threadsafe_function(function, napi_tsfn_release);
}

bool readString(napi_env env, napi_value value, std::string& output) {
  size_t length = 0;
  if (napi_get_value_string_utf8(env, value, nullptr, 0, &length) != napi_ok)
    return false;

  output.resize(length + 1);
  size_t copied = 0;
  if (napi_get_value_string_utf8(
          env,
          value,
          output.data(),
          output.size(),
          &copied) != napi_ok)
    return false;

  output.resize(copied);
  return true;
}

bool readOptionalString(
    napi_env env,
    napi_value value,
    NSString** output) {
  napi_valuetype type;
  if (napi_typeof(env, value, &type) != napi_ok)
    return false;
  if (type == napi_undefined || type == napi_null) {
    *output = nil;
    return true;
  }

  std::string text;
  if (!readString(env, value, text))
    return false;
  *output = [NSString stringWithUTF8String:text.c_str()];
  return true;
}

bool readTypedArray(
    napi_env env,
    napi_value value,
    napi_typedarray_type expectedType,
    NSData** output) {
  bool isTypedArray = false;
  if (napi_is_typedarray(env, value, &isTypedArray) != napi_ok || !isTypedArray)
    return false;

  napi_typedarray_type arrayType;
  size_t length;
  void* data;
  napi_value arrayBuffer;
  size_t byteOffset;
  if (napi_get_typedarray_info(
          env,
          value,
          &arrayType,
          &length,
          &data,
          &arrayBuffer,
          &byteOffset) != napi_ok)
    return false;
  if (arrayType != expectedType)
    return false;

  size_t elementSize = expectedType == napi_float32_array
      ? sizeof(float)
      : sizeof(uint8_t);
  *output = [NSData dataWithBytes:data length:length * elementSize];
  return true;
}

bool readCallback(napi_env env, napi_value value) {
  napi_valuetype type;
  return napi_typeof(env, value, &type) == napi_ok && type == napi_function;
}

napi_value isAvailable(napi_env env, napi_callback_info info) {
  size_t argumentCount = 1;
  napi_value arguments[1];
  napi_get_cb_info(env, info, &argumentCount, arguments, nullptr, nullptr);

  std::string transcriber;
  if (argumentCount != 1 || !readString(env, arguments[0], transcriber)) {
    napi_throw_type_error(env, nullptr, "isAvailable expects a transcriber.");
    return nullptr;
  }

  napi_threadsafe_function function;
  napi_value promise = createPromise(env, &function);
  if (@available(macOS 26.0, *)) {
    [AppleSpeechBridge
        isAvailableWithTranscriberIdentifier:
            [NSString stringWithUTF8String:transcriber.c_str()]
        completion:^(NSString* value, NSString* error) {
          complete(function, value, error);
        }];
  } else {
    complete(function, @"false", nil);
  }
  return promise;
}

napi_value getLocales(napi_env env, napi_callback_info info) {
  size_t argumentCount = 1;
  napi_value arguments[1];
  napi_get_cb_info(env, info, &argumentCount, arguments, nullptr, nullptr);

  std::string transcriber;
  if (argumentCount != 1 || !readString(env, arguments[0], transcriber)) {
    napi_throw_type_error(env, nullptr, "getLocales expects a transcriber.");
    return nullptr;
  }

  napi_threadsafe_function function;
  napi_value promise = createPromise(env, &function);

  if (@available(macOS 26.0, *)) {
    [AppleSpeechBridge
        getLocalesWithTranscriberIdentifier:
            [NSString stringWithUTF8String:transcriber.c_str()]
        completion:^(NSString* value, NSString* error) {
          complete(function, value, error);
        }];
  } else {
    complete(
        function,
        nil,
        @"Apple Speech transcription requires macOS 26 or later.");
  }
  return promise;
}

napi_value load(napi_env env, napi_callback_info info) {
  size_t argumentCount = 4;
  napi_value arguments[4];
  napi_get_cb_info(env, info, &argumentCount, arguments, nullptr, nullptr);

  std::string operationIdentifier;
  std::string locale;
  std::string transcriber;
  if (argumentCount != 4
      || !readString(env, arguments[0], operationIdentifier)
      || !readString(env, arguments[1], locale)
      || !readString(env, arguments[2], transcriber)
      || !readCallback(env, arguments[3])) {
    napi_throw_type_error(
        env,
        nullptr,
        "load expects an operation identifier, locale, transcriber, and progress callback.");
    return nullptr;
  }

  napi_threadsafe_function promiseFunction;
  napi_value promise = createPromise(env, &promiseFunction);
  napi_threadsafe_function progressFunction = createValueFunction(
      env,
      arguments[3],
      "xsai-apple-speech-load-progress");

  if (@available(macOS 26.0, *)) {
    [AppleSpeechBridge
        loadWithOperationIdentifier:
            [NSString stringWithUTF8String:operationIdentifier.c_str()]
        localeIdentifier:[NSString stringWithUTF8String:locale.c_str()]
        transcriberIdentifier:
            [NSString stringWithUTF8String:transcriber.c_str()]
        progress:^(NSString* value) {
          sendValue(progressFunction, value);
        }
        completion:^(NSString* value, NSString* error) {
          complete(promiseFunction, value, error);
          napi_release_threadsafe_function(
              progressFunction,
              napi_tsfn_release);
        }];
  } else {
    complete(
        promiseFunction,
        nil,
        @"Apple Speech transcription requires macOS 26 or later.");
    napi_release_threadsafe_function(progressFunction, napi_tsfn_release);
  }
  return promise;
}

napi_value cancelLoad(napi_env env, napi_callback_info info) {
  size_t argumentCount = 1;
  napi_value arguments[1];
  napi_get_cb_info(env, info, &argumentCount, arguments, nullptr, nullptr);

  std::string operationIdentifier;
  if (argumentCount != 1
      || !readString(env, arguments[0], operationIdentifier)) {
    napi_throw_type_error(
        env,
        nullptr,
        "cancelLoad expects an operation identifier.");
    return nullptr;
  }

  napi_threadsafe_function function;
  napi_value promise = createPromise(env, &function);
  if (@available(macOS 26.0, *)) {
    [AppleSpeechBridge
        cancelLoadWithOperationIdentifier:
            [NSString stringWithUTF8String:operationIdentifier.c_str()]
        completion:^(NSString* value, NSString* error) {
          complete(function, value, error);
        }];
  } else {
    complete(function, nil, nil);
  }
  return promise;
}

napi_value generate(napi_env env, napi_callback_info info) {
  size_t argumentCount = 6;
  napi_value arguments[6];
  napi_get_cb_info(env, info, &argumentCount, arguments, nullptr, nullptr);

  std::string operationIdentifier;
  std::string locale;
  std::string configuration;
  NSData* audio;
  NSString* fileName;
  NSString* mediaType;
  if (argumentCount != 6
      || !readString(env, arguments[0], operationIdentifier)
      || !readTypedArray(env, arguments[1], napi_uint8_array, &audio)
      || !readString(env, arguments[2], locale)
      || !readString(env, arguments[3], configuration)
      || !readOptionalString(env, arguments[4], &fileName)
      || !readOptionalString(env, arguments[5], &mediaType)) {
    napi_throw_type_error(
        env,
        nullptr,
        "generate expects an operation identifier, Uint8Array audio, locale, configuration, file name, and media type.");
    return nullptr;
  }

  napi_threadsafe_function function;
  napi_value promise = createPromise(env, &function);
  if (@available(macOS 26.0, *)) {
    [AppleSpeechBridge
        generateWithOperationIdentifier:
            [NSString stringWithUTF8String:operationIdentifier.c_str()]
        audio:audio
        localeIdentifier:[NSString stringWithUTF8String:locale.c_str()]
        configurationJSON:
            [NSString stringWithUTF8String:configuration.c_str()]
        fileName:fileName
        mediaType:mediaType
        completion:^(NSString* value, NSString* error) {
          complete(function, value, error);
        }];
  } else {
    complete(
        function,
        nil,
        @"Apple Speech transcription requires macOS 26 or later.");
  }
  return promise;
}

napi_value cancelOperation(napi_env env, napi_callback_info info) {
  size_t argumentCount = 1;
  napi_value arguments[1];
  napi_get_cb_info(env, info, &argumentCount, arguments, nullptr, nullptr);

  std::string operationIdentifier;
  if (argumentCount != 1
      || !readString(env, arguments[0], operationIdentifier)) {
    napi_throw_type_error(
        env,
        nullptr,
        "cancelOperation expects an operation identifier.");
    return nullptr;
  }

  napi_threadsafe_function function;
  napi_value promise = createPromise(env, &function);
  if (@available(macOS 26.0, *)) {
    [AppleSpeechBridge
        cancelOperationWithOperationIdentifier:
            [NSString stringWithUTF8String:operationIdentifier.c_str()]
        completion:^(NSString* value, NSString* error) {
          complete(function, value, error);
        }];
  } else {
    complete(function, nil, nil);
  }
  return promise;
}

napi_value startStream(napi_env env, napi_callback_info info) {
  size_t argumentCount = 5;
  napi_value arguments[5];
  napi_get_cb_info(env, info, &argumentCount, arguments, nullptr, nullptr);

  std::string sessionIdentifier;
  std::string locale;
  std::string configuration;
  double sampleRate;
  if (argumentCount != 5
      || !readString(env, arguments[0], sessionIdentifier)
      || !readString(env, arguments[1], locale)
      || napi_get_value_double(env, arguments[2], &sampleRate) != napi_ok
      || !readString(env, arguments[3], configuration)
      || !readCallback(env, arguments[4])) {
    napi_throw_type_error(
        env,
        nullptr,
        "startStream expects a session identifier, locale, sample rate, configuration, and partial callback.");
    return nullptr;
  }

  napi_threadsafe_function promiseFunction;
  napi_value promise = createPromise(env, &promiseFunction);
  napi_threadsafe_function partialFunction = createValueFunction(
      env,
      arguments[4],
      "xsai-apple-speech-partial");
  storeStreamCallback(sessionIdentifier, partialFunction);

  if (@available(macOS 26.0, *)) {
    [AppleSpeechBridge
        startStreamWithSessionIdentifier:
            [NSString stringWithUTF8String:sessionIdentifier.c_str()]
        localeIdentifier:[NSString stringWithUTF8String:locale.c_str()]
        inputSampleRate:sampleRate
        configurationJSON:
            [NSString stringWithUTF8String:configuration.c_str()]
        partial:^(NSString* value) {
          sendValue(partialFunction, value);
        }
        completion:^(NSString* value, NSString* error) {
          complete(promiseFunction, value, error);
          if (error != nil)
            releaseStreamCallback(sessionIdentifier);
        }];
  } else {
    complete(
        promiseFunction,
        nil,
        @"Apple Speech transcription requires macOS 26 or later.");
    releaseStreamCallback(sessionIdentifier);
  }
  return promise;
}

napi_value writeStream(napi_env env, napi_callback_info info) {
  size_t argumentCount = 2;
  napi_value arguments[2];
  napi_get_cb_info(env, info, &argumentCount, arguments, nullptr, nullptr);

  std::string sessionIdentifier;
  NSData* samples;
  if (argumentCount != 2
      || !readString(env, arguments[0], sessionIdentifier)
      || !readTypedArray(env, arguments[1], napi_float32_array, &samples)) {
    napi_throw_type_error(
        env,
        nullptr,
        "writeStream expects a session identifier and Float32Array samples.");
    return nullptr;
  }

  napi_threadsafe_function function;
  napi_value promise = createPromise(env, &function);
  if (@available(macOS 26.0, *)) {
    [AppleSpeechBridge
        writeStreamWithSessionIdentifier:
            [NSString stringWithUTF8String:sessionIdentifier.c_str()]
        samples:samples
        completion:^(NSString* value, NSString* error) {
          complete(function, value, error);
        }];
  } else {
    complete(
        function,
        nil,
        @"Apple Speech transcription requires macOS 26 or later.");
  }
  return promise;
}

napi_value finishStream(napi_env env, napi_callback_info info) {
  size_t argumentCount = 1;
  napi_value arguments[1];
  napi_get_cb_info(env, info, &argumentCount, arguments, nullptr, nullptr);

  std::string sessionIdentifier;
  if (argumentCount != 1
      || !readString(env, arguments[0], sessionIdentifier)) {
    napi_throw_type_error(
        env,
        nullptr,
        "finishStream expects a session identifier.");
    return nullptr;
  }

  napi_threadsafe_function function;
  napi_value promise = createPromise(env, &function);
  if (@available(macOS 26.0, *)) {
    [AppleSpeechBridge
        finishStreamWithSessionIdentifier:
            [NSString stringWithUTF8String:sessionIdentifier.c_str()]
        completion:^(NSString* value, NSString* error) {
          complete(function, value, error);
          releaseStreamCallback(sessionIdentifier);
        }];
  } else {
    complete(
        function,
        nil,
        @"Apple Speech transcription requires macOS 26 or later.");
    releaseStreamCallback(sessionIdentifier);
  }
  return promise;
}

napi_value cancelStream(napi_env env, napi_callback_info info) {
  size_t argumentCount = 1;
  napi_value arguments[1];
  napi_get_cb_info(env, info, &argumentCount, arguments, nullptr, nullptr);

  std::string sessionIdentifier;
  if (argumentCount != 1
      || !readString(env, arguments[0], sessionIdentifier)) {
    napi_throw_type_error(
        env,
        nullptr,
        "cancelStream expects a session identifier.");
    return nullptr;
  }

  napi_threadsafe_function function;
  napi_value promise = createPromise(env, &function);
  if (@available(macOS 26.0, *)) {
    [AppleSpeechBridge
        cancelStreamWithSessionIdentifier:
            [NSString stringWithUTF8String:sessionIdentifier.c_str()]
        completion:^(NSString* value, NSString* error) {
          complete(function, value, error);
          releaseStreamCallback(sessionIdentifier);
        }];
  } else {
    complete(function, nil, nil);
    releaseStreamCallback(sessionIdentifier);
  }
  return promise;
}

napi_value initialize(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
      {"cancelLoad", nullptr, cancelLoad, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"cancelOperation", nullptr, cancelOperation, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"cancelStream", nullptr, cancelStream, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"finishStream", nullptr, finishStream, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"generate", nullptr, generate, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"getLocales", nullptr, getLocales, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"isAvailable", nullptr, isAvailable, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"load", nullptr, load, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"startStream", nullptr, startStream, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"writeStream", nullptr, writeStream, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, 10, properties);
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
