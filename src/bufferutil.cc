/*!
 * ws: a node.js websocket client
 * Copyright(c) 2011 Einar Otto Stangvik <einaros@gmail.com>
 * MIT Licensed
 */

#include <v8.h>
#include <node.h>
#include <node_buffer.h>
#include <node_object_wrap.h>
#include <stdlib.h>
#include <string.h>
#include <wchar.h>
#include <stdio.h>

using namespace v8;
using namespace node;

class BufferUtil : public ObjectWrap
{
public:
  
  static void Initialize(v8::Handle<v8::Object> target)
  {
    HandleScope scope;
    Local<FunctionTemplate> t = FunctionTemplate::New(New);
    t->InstanceTemplate()->SetInternalFieldCount(1);
    NODE_SET_METHOD(t->GetFunction(), "unmask", BufferUtil::Unmask);
    NODE_SET_METHOD(t->GetFunction(), "mask", BufferUtil::Mask);
    NODE_SET_METHOD(t->GetFunction(), "merge", BufferUtil::Merge);
    target->Set(String::NewSymbol("BufferUtil"), t->GetFunction());
  }
  
protected:
  
  static Handle<Value> New(const Arguments& args)
  {
    HandleScope scope;
    BufferUtil* bufferUtil = new BufferUtil();
    bufferUtil->Wrap(args.This());
    return args.This();
  }

  static Handle<Value> Merge(const Arguments& args)
  {
    HandleScope scope;
    Local<Object> bufferObj = args[0]->ToObject();
    char* buffer = Buffer::Data(bufferObj);
    Local<Array> array = Local<Array>::Cast(args[1]);
    int arrayLength = array->Length();
    int offset = 0;
    int i;
    for (i = 0; i < arrayLength; ++i) {
      Local<Object> src = array->Get(i)->ToObject();
      int length = Buffer::Length(src);
      memcpy(buffer + offset, Buffer::Data(src), length);
      offset += length;
    }
    return scope.Close(True());
  }

  static Handle<Value> Unmask(const Arguments& args)
  {
    HandleScope scope;
    Local<Object> buffer_obj = args[0]->ToObject();
    unsigned char* buffer = (unsigned char*)Buffer::Data(buffer_obj);
    size_t length = Buffer::Length(buffer_obj);
    Local<Object> mask_obj = args[1]->ToObject();
    unsigned char *mask = (unsigned char*)Buffer::Data(mask_obj);
    int i;
    for (i = 0; i < length; ++i) {
      buffer[i] ^= mask[i % 4];
    }
    return scope.Close(True());
   }
   
   static Handle<Value> Mask(const Arguments& args)
   {
     HandleScope scope;
     Local<Object> buffer_obj = args[0]->ToObject();
     unsigned char* buffer = (unsigned char*)Buffer::Data(buffer_obj);
     size_t length = Buffer::Length(buffer_obj);
     Local<Object> mask_obj = args[1]->ToObject();
     unsigned char *mask = (unsigned char*)Buffer::Data(mask_obj);
     Local<Object> output_obj = args[2]->ToObject();
     unsigned char* output = (unsigned char*)Buffer::Data(output_obj);
     int dataOffset = args[3]->Int32Value();
     int i;
     for (i = 0; i < length; ++i) {
       output[dataOffset + i] = buffer[i] ^ mask[i % 4];
     }
     return scope.Close(True());
    }
};

extern "C" void init (Handle<Object> target)
{
  HandleScope scope;
  BufferUtil::Initialize(target);
}
