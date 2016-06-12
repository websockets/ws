var zlib = require('zlib'),
  util = require('util');

var AVAILABLE_WINDOW_BITS = [8, 9, 10, 11, 12, 13, 14, 15];
var DEFAULT_WINDOW_BITS = 15;
var DEFAULT_MEM_LEVEL = 8;

var flushcnt = 0;

PerMessageDeflate.extensionName = 'permessage-deflate';

function ZJob (data, fin, cb) {
  this.data = data;
  this.fin = fin;
  this.cb = cb;
  this.buffers = [];
}
ZJob.prototype.destroy = function () {
  this.buffers = null;
  this.cb = null;
  this.fin = null;
  this.data = null;
};
ZJob.prototype.push = function (buffer) {
  this.buffers.push(buffer);
};
ZJob.prototype.abort = function (error) {
  this.cb(error);
  this.destroy();
};

function CompressJob (data, fin, cb) {
  ZJob.call(this, data, fin, cb);
}
util.inherits(CompressJob, ZJob);
CompressJob.prototype.go = function (z) {
  z.write(this.data);
};
CompressJob.prototype.finish = function () {
  var data = Buffer.concat(this.buffers);
  if (this.fin) {
    data = data.slice(0, data.length - 4);
  }
  this.cb(null, data);
  this.destroy();
};

function DecompressJob (data, fin, cb) {
  ZJob.call(this, data, fin, cb);
}
util.inherits(DecompressJob, ZJob);
DecompressJob.prototype.go = function (z) {
  z.write(this.data);
  if (this.fin) {
    z.write(new Buffer([0x00, 0x00, 0xff, 0xff]));
  }
};
DecompressJob.prototype.finish = function () {
  this.cb(null, Buffer.concat(this.buffers));
  this.destroy();
};


function ZProcess (permessagedeflate) {
  var endpoint = permessagedeflate._isServer ? 'server' : 'client';
  var maxWindowBits = permessagedeflate.params[endpoint + '_max_window_bits'];
  this.endpoint = endpoint;
  this.pendingClose = false;
  this.job = null;
  this.jobs = [];
  this.permessagedeflate = permessagedeflate;
  this.z = null;
  this.createZ(maxWindowBits, permessagedeflate._options.memLevel);
  this.handler = this.onData.bind(this);
  this.errorer = this.onError.bind(this);
  this.doner = this.onDone.bind(this);
  this.z.on('error', this.errorer).on('data', this.handler);
}
ZProcess.prototype.destroy = function () {
  if (this.z) {
    this.z.removeListener('data', this.handler);
    this.z.removeListener('error', this.errorer);
    this.z.close();
  }
  this.z = null;
  this.doner = null;
  this.errorer = null;
  this.handler = null;
  this.permessagedeflate = null;
  this.jobs = null;
  this.job = null; //clear it
  this.pendingClose = null;
  this.endpoint = null;
};
ZProcess.prototype.inProgress = function () {
  return this.job || (this.jobs && this.jobs.length);
};
ZProcess.prototype.maybeDestroy = function () {
  if (this.inProgress()) {
    this.pendingClose = true;
    return false;
  }
  return true;
};
ZProcess.prototype.write = function (data, fin, callback) {
  var job;
  if (!this.z) {
    callback(Error('Already destroyed'));
    return;
  }
  job = new this.JobCtor(data, fin, callback);
  if (this.job) {
    this.jobs.push(job);
    return;
  }
  this.fire(job);
};
ZProcess.prototype.fire = function (job) {
  if (!this.z) {
    console.trace();
    console.error('No Z object on', this);
    throw Error('No Z object');
  }
  this.job = job;
  job.go(this.z);
  this.z.flush(this.onDone.bind(this));
};
ZProcess.prototype.checkJob = function () {
  if (!this.job) {
    console.trace();
    console.error('no job on', this);
    throw Error('No ZJob to end');
  }
};
ZProcess.prototype.onData = function (buffer) {
  this.checkJob();
  this.job.push(buffer);
};
ZProcess.prototype.onError = function (err) {
  this.cb(err);
  this.destroy();
};
ZProcess.prototype.onDone = function () {
  var job = this.job;
  this.checkJob();
  this.job = null;
  job.finish();
  if (!this.jobs) {
    return;
    console.trace();
    console.error('already destroyed', this);
    throw Error('Already destroyed');
  } else if (this.jobs.length) {
    this.fire(this.jobs.shift());
  } else if (this.pendingClose) {
    this.destroy();
  } 
};

function CompressProcess (permessagedeflate) {
  ZProcess.call(this, permessagedeflate);
}
util.inherits(CompressProcess, ZProcess);
CompressProcess.prototype.destroy = function () {
  if (!this.permessagedeflate) {
    return;
  }
  if (!ZProcess.prototype.maybeDestroy.call(this)) {
    return;
  }
  /*
  if (!((this.fin && this.permessagedeflate.params[this.endpoint + '_no_context_takeover']) || this.deflate.pendingClose)) {
    return;
  }
  */
  this.permessagedeflate._deflate = null;
  ZProcess.prototype.destroy.call(this);
};
CompressProcess.prototype.createZ = function (maxWindowBits, memlevel) {
  this.z = zlib.createDeflateRaw({
    flush: zlib.Z_SYNC_FLUSH,
    windowBits: 'number' === typeof maxWindowBits ? maxWindowBits : DEFAULT_WINDOW_BITS,
    memLevel: memlevel || DEFAULT_MEM_LEVEL
  });

};
CompressProcess.prototype.JobCtor = CompressJob;

function DecompressProcess(permessagedeflate) {
  ZProcess.call(this, permessagedeflate);
  this.maxPayload = 
    ( permessagedeflate._maxPayload!==undefined &&
      permessagedeflate._maxPayload!==null &&
      permessagedeflate._maxPayload>0 ) ? permessagedeflate._maxPayload : 0;
  this.cumulativeBufferLength = 0;
}
util.inherits(DecompressProcess, ZProcess);
DecompressProcess.prototype.destroy = function () {
  if (!this.permessagedeflate) {
    return;
  }
  if (!ZProcess.prototype.maybeDestroy.call(this)) {
    return;
  }
  /*
  if (!((this.fin && this.permessagedeflate.params[this.endpoint + '_no_context_takeover']) || this.inflate.pendingClose)) {
    return;
  }
  */
  this.cumulativeBufferLength = null;
  this.maxPayload = null;
  this.permessagedeflate._inflate = null;
  ZProcess.prototype.destroy.call(this);
};
DecompressProcess.prototype.createZ = function (maxWindowBits, memlevel) {
  this.z = zlib.createInflateRaw({
    windowBits: 'number' === typeof maxWindowBits ? maxWindowBits : DEFAULT_WINDOW_BITS
  });
};
DecompressProcess.prototype.onError = function (err) {
  if (this.job) {
    this.job.abort(err);
  }
  this.job = null;
  if (this.jobs && this.jobs.length) {
    while(this.jobs.length) {
      this.jobs.pop().abort(err);
    }
  }
  this.destroy();
};
DecompressProcess.prototype.onData = function (buffer) {
  if(this.maxPayload) {
      this.cumulativeBufferLength+=buffer.length;
      if(this.cumulativeBufferLength>this._maxPayload){
        console.trace();
        console.error('AAAAAAAAAa');
        this.cb({type:1009});
        this.destroy();
        return;
      }
  }
  ZProcess.prototype.onData.call(this, buffer);
};
DecompressProcess.prototype.JobCtor = DecompressJob;

/**
 * Per-message Compression Extensions implementation
 */

function PerMessageDeflate(options, isServer,maxPayload) {
  if (this instanceof PerMessageDeflate === false) {
    throw new TypeError("Classes can't be function-called");
  }

  this._options = options || {};
  this._isServer = !!isServer;
  this._inflate = null;
  this._deflate = null;
  this.params = null;
  this._maxPayload = maxPayload || 0;
}

/**
 * Create extension parameters offer
 *
 * @api public
 */

PerMessageDeflate.prototype.offer = function() {
  var params = {};
  if (this._options.serverNoContextTakeover) {
    params.server_no_context_takeover = true;
  }
  if (this._options.clientNoContextTakeover) {
    params.client_no_context_takeover = true;
  }
  if (this._options.serverMaxWindowBits) {
    params.server_max_window_bits = this._options.serverMaxWindowBits;
  }
  if (this._options.clientMaxWindowBits) {
    params.client_max_window_bits = this._options.clientMaxWindowBits;
  } else if (this._options.clientMaxWindowBits == null) {
    params.client_max_window_bits = true;
  }
  return params;
};

/**
 * Accept extension offer
 *
 * @api public
 */

PerMessageDeflate.prototype.accept = function(paramsList) {
  paramsList = this.normalizeParams(paramsList);

  var params;
  if (this._isServer) {
    params = this.acceptAsServer(paramsList);
  } else {
    params = this.acceptAsClient(paramsList);
  }

  this.params = params;
  return params;
};

/**
 * Releases all resources used by the extension
 *
 * @api public
 */

PerMessageDeflate.prototype.cleanup = function() {
  if (this._inflate) {
    this._inflate.destroy();
    this._inflate = null;
  }
  if (this._deflate) {
    this._deflate.destroy();
    this._deflate = null;
  }
};

/**
 * Accept extension offer from client
 *
 * @api private
 */

PerMessageDeflate.prototype.acceptAsServer = function(paramsList) {
  var accepted = {};
  var result = paramsList.some(function(params) {
    accepted = {};
    if (this._options.serverNoContextTakeover === false && params.server_no_context_takeover) {
      return;
    }
    if (this._options.serverMaxWindowBits === false && params.server_max_window_bits) {
      return;
    }
    if (typeof this._options.serverMaxWindowBits === 'number' &&
        typeof params.server_max_window_bits === 'number' &&
        this._options.serverMaxWindowBits > params.server_max_window_bits) {
      return;
    }
    if (typeof this._options.clientMaxWindowBits === 'number' && !params.client_max_window_bits) {
      return;
    }

    if (this._options.serverNoContextTakeover || params.server_no_context_takeover) {
      accepted.server_no_context_takeover = true;
    }
    if (this._options.clientNoContextTakeover) {
      accepted.client_no_context_takeover = true;
    }
    if (this._options.clientNoContextTakeover !== false && params.client_no_context_takeover) {
      accepted.client_no_context_takeover = true;
    }
    if (typeof this._options.serverMaxWindowBits === 'number') {
      accepted.server_max_window_bits = this._options.serverMaxWindowBits;
    } else if (typeof params.server_max_window_bits === 'number') {
      accepted.server_max_window_bits = params.server_max_window_bits;
    }
    if (typeof this._options.clientMaxWindowBits === 'number') {
      accepted.client_max_window_bits = this._options.clientMaxWindowBits;
    } else if (this._options.clientMaxWindowBits !== false && typeof params.client_max_window_bits === 'number') {
      accepted.client_max_window_bits = params.client_max_window_bits;
    }
    return true;
  }, this);

  if (!result) {
    throw new Error('Doesn\'t support the offered configuration');
  }

  return accepted;
};

/**
 * Accept extension response from server
 *
 * @api private
 */

PerMessageDeflate.prototype.acceptAsClient = function(paramsList) {
  var params = paramsList[0];
  if (this._options.clientNoContextTakeover != null) {
    if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
      throw new Error('Invalid value for "client_no_context_takeover"');
    }
  }
  if (this._options.clientMaxWindowBits != null) {
    if (this._options.clientMaxWindowBits === false && params.client_max_window_bits) {
      throw new Error('Invalid value for "client_max_window_bits"');
    }
    if (typeof this._options.clientMaxWindowBits === 'number' &&
        (!params.client_max_window_bits || params.client_max_window_bits > this._options.clientMaxWindowBits)) {
      throw new Error('Invalid value for "client_max_window_bits"');
    }
  }
  return params;
};

/**
 * Normalize extensions parameters
 *
 * @api private
 */

PerMessageDeflate.prototype.normalizeParams = function(paramsList) {
  return paramsList.map(function(params) {
    Object.keys(params).forEach(function(key) {
      var value = params[key];
      if (value.length > 1) {
        throw new Error('Multiple extension parameters for ' + key);
      }

      value = value[0];

      switch (key) {
      case 'server_no_context_takeover':
      case 'client_no_context_takeover':
        if (value !== true) {
          throw new Error('invalid extension parameter value for ' + key + ' (' + value + ')');
        }
        params[key] = true;
        break;
      case 'server_max_window_bits':
      case 'client_max_window_bits':
        if (typeof value === 'string') {
          value = parseInt(value, 10);
          if (!~AVAILABLE_WINDOW_BITS.indexOf(value)) {
            throw new Error('invalid extension parameter value for ' + key + ' (' + value + ')');
          }
        }
        if (!this._isServer && value === true) {
          throw new Error('Missing extension parameter value for ' + key);
        }
        params[key] = value;
        break;
      default:
        throw new Error('Not defined extension parameter (' + key + ')');
      }
    }, this);
    return params;
  }, this);
};

/**
 * Decompress message
 *
 * @api public
 */


PerMessageDeflate.prototype.decompress = function (data, fin, callback) {
  if (!this._inflate) {
    this._inflate = new DecompressProcess(this);
  }
  this._inflate.write(data, fin, callback);
};

/**
 * Compress message
 *
 * @api public
 */

PerMessageDeflate.prototype.compress = function (data, fin, callback) {
  if (!this._deflate) {
    this._deflate = new CompressProcess(this);
  }
  this._deflate.write(data, fin, callback);
};

module.exports = PerMessageDeflate;
