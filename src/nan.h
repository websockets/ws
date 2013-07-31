/**********************************************************************************
 * NAN - Native Abstractions for Node.js
 *
 * Copyright (c) 2013 NAN contributors:
 *   - Rod Vagg <https://github.com/rvagg>
 *   - Benjamin Byholm <https://github.com/kkoopa>
 *   - Trevor Norris <https://github.com/trevnorris>
 *
 * MIT +no-false-attribs License <https://github.com/rvagg/nan/blob/master/LICENSE>
 *
 * Version 0.2.0-wip (current Node unstable: 0.11.4)
 *
 * ChangeLog:
 *  * 0.2.0 .... work in progress
 *    - Added NAN_PROPERTY_GETTER, NAN_PROPERTY_SETTER, NAN_PROPERTY_ENUMERATOR,
 *      NAN_PROPERTY_DELETER, NAN_PROPERTY_QUERY
 *    - Extracted _NAN_METHOD_ARGS, _NAN_GETTER_ARGS, _NAN_SETTER_ARGS,
 *      _NAN_PROPERTY_GETTER_ARGS, _NAN_PROPERTY_SETTER_ARGS,
 *      _NAN_PROPERTY_ENUMERATOR_ARGS, _NAN_PROPERTY_DELETER_ARGS,
 *      _NAN_PROPERTY_QUERY_ARGS
 *    - Added NanGetInternalFieldPointer, NanSetInternalFieldPointer
 *    - Added NAN_WEAK_CALLBACK, NAN_WEAK_CALLBACK_OBJECT,
 *      NAN_WEAK_CALLBACK_DATA, NanMakeWeak
 *    - Renamed THROW_ERROR to _NAN_THROW_ERROR
 *    - Added NanNewBufferHandle(char*, size_t, node::smalloc::FreeCallback, void*)
 *    - Added NanBufferUse(char*, uint32_t)
 *    - Added NanNewContextHandle(v8::ExtensionConfiguration*,
 *        v8::Handle<v8::ObjectTemplate>, v8::Handle<v8::Value>)
 *    - Fixed broken NanCallback#GetFunction()
 *
 *  * 0.1.0 Jul 21 2013
 *    - Added `NAN_GETTER`, `NAN_SETTER`
 *    - Added `NanThrowError` with single Local<Value> argument
 *    - Added `NanNewBufferHandle` with single uint32_t argument
 *    - Added `NanHasInstance(Persistent<FunctionTemplate>&, Handle<Value>)`
 *    - Added `Local<Function> NanCallback#GetFunction()`
 *    - Added `NanCallback#Call(int, Local<Value>[])`
 *    - Deprecated `NanCallback#Run(int, Local<Value>[])` in favour of Call
 *
 * See https://github.com/rvagg/nan for the latest update to this file
 **********************************************************************************/

#ifndef NAN_H
#define NAN_H

#include <node.h>
#include <node_buffer.h>

// some generic helpers

#define NanSymbol(value) v8::String::NewSymbol(value)

static inline char* NanFromV8String(v8::Local<v8::Value> from) {
  size_t sz_;
  char* to;
  v8::Local<v8::String> toStr = from->ToString();
  sz_ = toStr->Utf8Length();
  to = new char[sz_ + 1];
  toStr->WriteUtf8(to, -1, NULL, v8::String::NO_OPTIONS);
  return to;
}

static inline bool NanBooleanOptionValue(
      v8::Local<v8::Object> optionsObj
    , v8::Handle<v8::String> opt, bool def) {

  if (def) {
    return optionsObj.IsEmpty()
      || !optionsObj->Has(opt)
      || optionsObj->Get(opt)->BooleanValue();
  } else {
    return !optionsObj.IsEmpty()
      && optionsObj->Has(opt)
      && optionsObj->Get(opt)->BooleanValue();
  }
}

static inline bool NanBooleanOptionValue(
      v8::Local<v8::Object> optionsObj
    , v8::Handle<v8::String> opt) {
  return NanBooleanOptionValue(optionsObj, opt, false);
}

static inline uint32_t NanUInt32OptionValue(
      v8::Local<v8::Object> optionsObj
    , v8::Handle<v8::String> opt
    , uint32_t def) {

  return !optionsObj.IsEmpty()
    && optionsObj->Has(opt)
    && optionsObj->Get(opt)->IsUint32()
      ? optionsObj->Get(opt)->Uint32Value()
      : def;
}

#if (NODE_MODULE_VERSION > 0x000B)
// Node 0.11+ (0.11.3 and below won't compile with these)

static v8::Isolate* nan_isolate = v8::Isolate::GetCurrent();

# define _NAN_METHOD_ARGS const v8::FunctionCallbackInfo<v8::Value>& args
# define NAN_METHOD(name) void name(_NAN_METHOD_ARGS)
# define _NAN_GETTER_ARGS const v8::PropertyCallbackInfo<v8::Value>& args
# define NAN_GETTER(name)                                                      \
    void name(v8::Local<v8::String> property, _NAN_GETTER_ARGS)
# define _NAN_SETTER_ARGS const v8::PropertyCallbackInfo<void>& args
# define NAN_SETTER(name)                                                      \
    void name(                                                                 \
        v8::Local<v8::String> property                                         \
      , v8::Local<v8::Value> value                                             \
      , _NAN_SETTER_ARGS)
# define _NAN_PROPERTY_GETTER_ARGS                                             \
    const v8::PropertyCallbackInfo<v8::Value>& args
# define NAN_PROPERTY_GETTER(name)                                             \
    void name(v8::Local<v8::String> property                                   \
      , _NAN_PROPERTY_GETTER_ARGS)
# define _NAN_PROPERTY_SETTER_ARGS                                             \
    const v8::PropertyCallbackInfo<v8::Value>& args
# define NAN_PROPERTY_SETTER(name)                                             \
    void name(v8::Local<v8::String> property                                   \
    , v8::Local<v8::Value> value                                               \
    , _NAN_PROPERTY_SETTER_ARGS)
# define _NAN_PROPERTY_ENUMERATOR_ARGS                                         \
    const v8::PropertyCallbackInfo<v8::Array>& args
# define NAN_PROPERTY_ENUMERATOR(name)                                         \
    void name(_NAN_PROPERTY_ENUMERATOR_ARGS)
# define _NAN_PROPERTY_DELETER_ARGS                                            \
    const v8::PropertyCallbackInfo<v8::Boolean>& args
# define NAN_PROPERTY_DELETER(name)                                            \
    void name(                                                                 \
        v8::Local<v8::String> property                                         \
      , _NAN_PROPERTY_DELETER_ARGS)
# define _NAN_PROPERTY_QUERY_ARGS                                              \
    const v8::PropertyCallbackInfo<v8::Integer>& args
# define NAN_PROPERTY_QUERY(name)                                              \
    void name(v8::Local<v8::String> property, _NAN_PROPERTY_QUERY_ARGS)
# define NanGetInternalFieldPointer(object, index)                             \
    object->GetAlignedPointerFromInternalField(index)
# define NanSetInternalFieldPointer(object, index, value)                      \
    object->SetAlignedPointerInInternalField(index, value)

# define NAN_WEAK_CALLBACK(type, name)                                         \
    void name(                                                                 \
      v8::Isolate* isolate,                                                    \
      v8::Persistent<v8::Object>* object,                                      \
      type data)
# define NAN_WEAK_CALLBACK_OBJECT (*object)
# define NAN_WEAK_CALLBACK_DATA(type) ((type) data)

# define NanScope() v8::HandleScope scope(nan_isolate)
# define NanReturnValue(value) return args.GetReturnValue().Set(value)
# define NanReturnUndefined() return
# define NanAssignPersistent(type, handle, obj) handle.Reset(nan_isolate, obj)
# define NanObjectWrapHandle(obj) obj->handle()
# define NanMakeWeak(handle, parameter, callback)                              \
    handle.MakeWeak(nan_isolate, parameter, callback)

# define _NAN_THROW_ERROR(fun, errmsg)                                         \
    do {                                                                       \
      NanScope();                                                              \
      v8::ThrowException(fun(v8::String::New(errmsg)));                        \
    } while (0);

  inline static void NanThrowError(const char* errmsg) {
    _NAN_THROW_ERROR(v8::Exception::Error, errmsg);
  }

  inline static void NanThrowError(v8::Local<v8::Value> error) {
    NanScope();
    v8::ThrowException(error);
  }

  inline static void NanThrowTypeError(const char* errmsg) {
    _NAN_THROW_ERROR(v8::Exception::TypeError, errmsg);
  }

  inline static void NanThrowRangeError(const char* errmsg) {
    _NAN_THROW_ERROR(v8::Exception::RangeError, errmsg);
  }

  template<class T> static inline void NanDispose(v8::Persistent<T> &handle) {
    handle.Dispose(nan_isolate);
  }

  static inline v8::Local<v8::Object> NanNewBufferHandle (
      char *data,
      size_t length,
      node::smalloc::FreeCallback callback,
      void *hint) {
    return node::Buffer::New(data, length, callback, hint);
  }

  static inline v8::Local<v8::Object> NanNewBufferHandle (
     char *data, uint32_t size) {
    return node::Buffer::New(data, size);
  }

  static inline v8::Local<v8::Object> NanNewBufferHandle (uint32_t size) {
    return node::Buffer::New(size);
  }

  static inline v8::Local<v8::Object> NanBufferUse(char* data, uint32_t size) {
    return node::Buffer::Use(data, size);
  }

  template <class TypeName>
  inline v8::Local<TypeName> NanPersistentToLocal(
     const v8::Persistent<TypeName>& persistent) {
    if (persistent.IsWeak()) {
     return v8::Local<TypeName>::New(nan_isolate, persistent);
    } else {
     return *reinterpret_cast<v8::Local<TypeName>*>(
         const_cast<v8::Persistent<TypeName>*>(&persistent));
    }
  }

  inline bool NanHasInstance(
        v8::Persistent<v8::FunctionTemplate>& function_template
      , v8::Handle<v8::Value> value) {
    return NanPersistentToLocal(function_template)->HasInstance(value);
  }

  static inline v8::Local<v8::Context> NanNewContextHandle(
    v8::ExtensionConfiguration* extensions = NULL,
    v8::Handle<v8::ObjectTemplate> g_template = v8::Handle<v8::ObjectTemplate>(),
    v8::Handle<v8::Value> g_object = v8::Handle<v8::Value>()) {
      return v8::Local<v8::Context>::New(nan_isolate, v8::Context::New(
          nan_isolate, extensions, g_template, g_object));
  }

#else
// Node 0.8 and 0.10

# define _NAN_METHOD_ARGS const v8::Arguments& args
# define NAN_METHOD(name) v8::Handle<v8::Value> name(_NAN_METHOD_ARGS)
# define _NAN_GETTER_ARGS const v8::AccessorInfo &args
# define NAN_GETTER(name)                                                      \
    v8::Handle<v8::Value> name(v8::Local<v8::String> property, _NAN_GETTER_ARGS)
# define _NAN_SETTER_ARGS const v8::AccessorInfo &args
# define NAN_SETTER(name)                                                      \
    void name(                                                                 \
      v8::Local<v8::String> property                                           \
    , v8::Local<v8::Value> value                                               \
    , _NAN_SETTER_ARGS)
# define _NAN_PROPERTY_GETTER_ARGS const v8::AccessorInfo& args
# define NAN_PROPERTY_GETTER(name)                                             \
    v8::Handle<v8::Value> name(v8::Local<v8::String> property                  \
    , _NAN_PROPERTY_GETTER_ARGS)
# define _NAN_PROPERTY_SETTER_ARGS const v8::AccessorInfo& args
# define NAN_PROPERTY_SETTER(name)                                             \
    v8::Handle<v8::Value> name(v8::Local<v8::String> property                  \
    , v8::Local<v8::Value> value                                               \
    , _NAN_PROPERTY_SETTER_ARGS)
# define _NAN_PROPERTY_ENUMERATOR_ARGS const v8::AccessorInfo& args
# define NAN_PROPERTY_ENUMERATOR(name)                                         \
    v8::Handle<v8::Array> name(_NAN_PROPERTY_ENUMERATOR_ARGS)
# define _NAN_PROPERTY_DELETER_ARGS const v8::AccessorInfo& args
# define NAN_PROPERTY_DELETER(name)                                            \
    v8::Handle<v8::Boolean> name(                                              \
      v8::Local<v8::String> property                                           \
    , _NAN_PROPERTY_DELETER_ARGS)
# define _NAN_PROPERTY_QUERY_ARGS const v8::AccessorInfo& args
# define NAN_PROPERTY_QUERY(name)                                              \
    v8::Handle<v8::Integer> name(                                              \
      v8::Local<v8::String> property                                           \
    , _NAN_PROPERTY_QUERY_ARGS)

# define NanGetInternalFieldPointer(object, index)                             \
    object->GetPointerFromInternalField(index)
# define NanSetInternalFieldPointer(object, index, value)                      \
    object->SetPointerInInternalField(index, value)
# define NAN_WEAK_CALLBACK(type, name) void name(                              \
                v8::Persistent<v8::Value> object,                              \
                void *data)
# define NAN_WEAK_CALLBACK_OBJECT object
# define NAN_WEAK_CALLBACK_DATA(type) ((type) data)

# define NanScope() v8::HandleScope scope
# define NanReturnValue(value) return scope.Close(value)
# define NanReturnUndefined() return v8::Undefined()
# define NanAssignPersistent(type, handle, obj)                                \
    handle = v8::Persistent<type>::New(obj)
# define NanObjectWrapHandle(obj) obj->handle_
# define NanMakeWeak(handle, parameters, callback)                             \
    handle.MakeWeak(parameters, callback)

# define _NAN_THROW_ERROR(fun, errmsg)                                         \
    do {                                                                       \
      NanScope();                                                              \
      return v8::ThrowException(fun(v8::String::New(errmsg)));                 \
    } while (0);

  inline static v8::Handle<v8::Value> NanThrowError(const char* errmsg) {
    _NAN_THROW_ERROR(v8::Exception::Error, errmsg);
  }

  inline static v8::Handle<v8::Value> NanThrowError(
      v8::Local<v8::Value> error) {
    NanScope();
    return v8::ThrowException(error);
  }

  inline static v8::Handle<v8::Value> NanThrowTypeError(const char* errmsg) {
    _NAN_THROW_ERROR(v8::Exception::TypeError, errmsg);
  }

  inline static v8::Handle<v8::Value> NanThrowRangeError(const char* errmsg) {
    _NAN_THROW_ERROR(v8::Exception::RangeError, errmsg);
  }

  template<class T> static inline void NanDispose(v8::Persistent<T> &handle) {
    handle.Dispose();
  }

  static inline v8::Local<v8::Object> NanNewBufferHandle (
      char *data,
      size_t length,
      node::Buffer::free_callback callback,
      void *hint) {
    return v8::Local<v8::Object>::New(
        node::Buffer::New(data, length, callback, hint)->handle_);
  }

  static inline v8::Local<v8::Object> NanNewBufferHandle (
     char *data, uint32_t size) {
    return v8::Local<v8::Object>::New(node::Buffer::New(data, size)->handle_);
  }

  static inline v8::Local<v8::Object> NanNewBufferHandle (uint32_t size) {
    return v8::Local<v8::Object>::New(node::Buffer::New(size)->handle_);
  }

  static inline void FreeData(char *data, void *hint) {
    delete[] data;
  }

  static inline v8::Local<v8::Object> NanBufferUse(char* data, uint32_t size) {
    return v8::Local<v8::Object>::New(
        node::Buffer::New(data, size, FreeData, NULL)->handle_);
  }

  template <class TypeName>
  inline v8::Local<TypeName> NanPersistentToLocal(
     const v8::Persistent<TypeName>& persistent) {
    if (persistent.IsWeak()) {
     return v8::Local<TypeName>::New(persistent);
    } else {
     return *reinterpret_cast<v8::Local<TypeName>*>(
         const_cast<v8::Persistent<TypeName>*>(&persistent));
    }
  }

  inline bool NanHasInstance(
        v8::Persistent<v8::FunctionTemplate>& function_template
      , v8::Handle<v8::Value> value) {
    return function_template->HasInstance(value);
  }

  static inline v8::Local<v8::Context> NanNewContextHandle(
        v8::ExtensionConfiguration* extensions = NULL
      , v8::Handle<v8::ObjectTemplate> g_template =
            v8::Handle<v8::ObjectTemplate>()
      , v8::Handle<v8::Value> g_object = v8::Handle<v8::Value>()
    ) {
      v8::Persistent<v8::Context> ctx =
          v8::Context::New(extensions, g_template, g_object);
      v8::Local<v8::Context> lctx = v8::Local<v8::Context>::New(ctx);
      ctx.Dispose();
      return lctx;
  }

#endif // node version

class NanCallback {
 public:
  NanCallback(const v8::Local<v8::Function> &fn) {
   NanScope();
   v8::Local<v8::Object> obj = v8::Object::New();
   obj->Set(NanSymbol("callback"), fn);
   NanAssignPersistent(v8::Object, handle, obj);
  }

  ~NanCallback() {
   if (handle.IsEmpty()) return;
   handle.Dispose();
  }

  inline v8::Local<v8::Function> GetFunction () {
    return NanPersistentToLocal(handle)->Get(NanSymbol("callback"))
        .As<v8::Function>();
  }

  // deprecated
  void Run(int argc, v8::Local<v8::Value> argv[]) {
    Call(argc, argv);
  }

  void Call(int argc, v8::Local<v8::Value> argv[]) {
   NanScope();
   v8::Local<v8::Function> callback = NanPersistentToLocal(handle)->
       Get(NanSymbol("callback")).As<v8::Function>();
   v8::TryCatch try_catch;
   callback->Call(v8::Context::GetCurrent()->Global(), argc, argv);
   if (try_catch.HasCaught()) {
     node::FatalException(try_catch);
   }
  }

 private:
  v8::Persistent<v8::Object> handle;
};

/* abstract */ class NanAsyncWorker {
public:
  NanAsyncWorker (NanCallback *callback) : callback(callback) {
    request.data = this;
    errmsg = NULL;
  }

  virtual ~NanAsyncWorker () {
    if (!persistentHandle.IsEmpty())
      NanDispose(persistentHandle);
    if (callback)
      delete callback;
  }

  virtual void WorkComplete () {
    NanScope();

    if (errmsg == NULL)
      HandleOKCallback();
    else
      HandleErrorCallback();
    delete callback;
    callback = NULL;
  }

  virtual void Execute () =0;

  uv_work_t request;

protected:
  v8::Persistent<v8::Object> persistentHandle;
  NanCallback *callback;
  const char *errmsg;

  void SavePersistent(const char *key, v8::Local<v8::Object> &obj) {
    v8::Local<v8::Object> handle = NanPersistentToLocal(persistentHandle);
    handle->Set(NanSymbol(key), obj);
  }

  v8::Local<v8::Object> GetFromPersistent(const char *key) {
    v8::Local<v8::Object> handle = NanPersistentToLocal(persistentHandle);
    return handle->Get(NanSymbol(key)).As<v8::Object>();
  }

  virtual void HandleOKCallback () {
    NanScope();

    callback->Call(0, NULL);
  };

  virtual void HandleErrorCallback () {
    NanScope();

    v8::Local<v8::Value> argv[] = {
        v8::Exception::Error(v8::String::New(errmsg))
    };
    callback->Call(1, argv);
  }
};

inline void NanAsyncExecute (uv_work_t* req) {
  NanAsyncWorker *worker = static_cast<NanAsyncWorker*>(req->data);
  worker->Execute();
}

inline void NanAsyncExecuteComplete (uv_work_t* req) {
  NanAsyncWorker* worker = static_cast<NanAsyncWorker*>(req->data);
  worker->WorkComplete();
  delete worker;
}

inline void NanAsyncQueueWorker (NanAsyncWorker* worker) {
  uv_queue_work(
      uv_default_loop()
    , &worker->request
    , NanAsyncExecute
    , (uv_after_work_cb)NanAsyncExecuteComplete
  );
}

#endif
