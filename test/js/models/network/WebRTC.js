
var imports     = require('soop').imports();
var EventEmitter= imports.EventEmitter || require('events').EventEmitter;

/*
 * Emits
 *  'networkChange'
 *    when network layout has change (new/lost peers, etc)
 *
 *  'data'
 *    when an unknown data type arrives
 *
 * Provides
 *  send(toPeerIds, {data}, cb?)  
 *
 */

function Network(opts) {
  var self = this;
  opts                = opts || {};
  this.peerId         = opts.peerId;
  this.apiKey         = opts.apiKey || 'lwjd5qra8257b9';
  this.debug          = opts.debug || 3;
  this.maxPeers       = opts.maxPeers || 10;
  this.opts = { key: opts.key };
  this.connections = {};

  // For using your own peerJs server
  ['port', 'host', 'path', 'debug'].forEach(function(k) {
    if (opts[k]) self.opts[k]=opts[k];
  });
  this.connectedPeers = [];
  this.started = false;
}

Network.parent=EventEmitter;

// Array helpers
Network._arrayDiff = function(a, b) {
  var seen = [];
  var diff = [];

  for (var i = 0; i < b.length; i++)
    seen[b[i]] = true;

  for (var j = 0; j < a.length; j++)
    if (!seen[a[j]])
      diff.push(a[j]);

  return diff;
};

Network._inArray = function(el, array) {
  return array.indexOf(el) > -1;
};

Network._arrayPushOnce = function(el, array) {
  var ret = false;
  if (!Network._inArray(el, array)) {
    array.push(el);
    ret = true;
  }
  return ret;
};

Network._arrayRemove = function(el, array) {
  var pos = array.indexOf(el);
  if (pos >= 0) array.splice(pos, 1);
  return array;
};

Network.prototype._onClose = function(peerId) {
console.log('[WebRTC.js.72:_onClose:]');

  delete this.connections[peerId];
  this.connectedPeers = Network._arrayRemove(peerId, this.connectedPeers);
  this._notifyNetworkChange();
};

Network.prototype._connectToPeers = function(peerIds) {
  var self = this;
  var ret = false;
  var arrayDiff1= Network._arrayDiff(peerIds, this.connectedPeers);
  var arrayDiff = Network._arrayDiff(arrayDiff1, [this.peerId]);
  arrayDiff.forEach(function(peerId) {
    console.log('### CONNECTING TO:', peerId);
    self.connectTo(peerId);
    ret = true;
  });
  return ret;
};

Network.prototype._onData = function(data, isInbound) {
  var obj;
  try { 
    obj = JSON.parse(data);
  } catch (e) {
    console.log('### ERROR ON DATA: "%s" ', data, isInbound, e); 
    return;
  };
  console.log('### RECEIVED TYPE: %s FROM %s', obj.data.type, obj.sender, obj.data); 

  switch(obj.data.type) {
    case 'peerList':
      this._connectToPeers(obj.data.peers);
      this._notifyNetworkChange();
      break;
    case 'disconnect':
      this._onClose(obj.sender);
      break;
    default:
      this.emit('data', obj.sender, obj.data, isInbound);
  }
};

Network.prototype._sendPeers = function(peerIds) {
  console.log('#### SENDING PEER LIST: ', this.connectedPeers, ' TO ', peerIds?peerIds: 'ALL');
  this.send(peerIds, {
    type: 'peerList',
    peers: this.connectedPeers,
  });
};

Network.prototype._addPeer = function(peerId, isInbound) {

  var hasChanged = Network._arrayPushOnce(peerId, this.connectedPeers);
  if (isInbound && hasChanged) {
    this._sendPeers();              //broadcast peer list
  }
  else {
    if (isInbound) {
      this._sendPeers(peerId);
    }
  }
};

Network.prototype._checkAnyPeer = function() {
  if (!this.connectedPeers.length) {
    console.log('EMIT openError: no more peers, not even you!'); 
    this.emit('openError');
  }
}

Network.prototype._setupConnectionHandlers = function(dataConn, isInbound) {
  var self=this;

  dataConn.on('open', function() {
    if (!Network._inArray(dataConn.peer, self.connectedPeers)) {
      self.connections[dataConn.peer] = dataConn;

      console.log('### DATA CONNECTION READY TO: ADDING PEER: %s (inbound: %s)',
        dataConn.peer, isInbound);

      self._addPeer(dataConn.peer, isInbound);
      self._notifyNetworkChange( isInbound ? dataConn.peer : null);
      this.emit('open');
    }
  });

  dataConn.on('data', function(data) { 
    self._onData(data, isInbound);
  });

  dataConn.on('error', function(e) {
    console.log('### DATA ERROR',e ); //TODO
    self._onClose(dataConn.peer);
    self._checkAnyPeer();
    self.emit('dataError');
  });

  dataConn.on('close', function() {
    if (self.closing) return;

    console.log('### CLOSE RECV FROM:', dataConn.peer); 
    self._onClose(dataConn.peer);
    self._checkAnyPeer();
  });
};

Network.prototype._notifyNetworkChange = function(newPeer) {
  console.log('[WebRTC.js.164:_notifyNetworkChange:]', newPeer); //TODO
  this.emit('networkChange', newPeer);
};

Network.prototype._setupPeerHandlers = function(openCallback) {
  var self=this;
  var p = this.peer;

  p.on('open', function() {
    self.connectedPeers = [self.peerId];
    return openCallback();
  });

  p.on('error', function(err) {
    console.log('### PEER ERROR:', err);
    //self.disconnect(null, true); // force disconnect
    self._checkAnyPeer();
  });

  p.on('connection', function(dataConn) {

    console.log('### NEW INBOUND CONNECTION %d/%d', self.connectedPeers.length, self.maxPeers);
    if (self.connectedPeers.length >= self.maxPeers) {
      console.log('### PEER REJECTED. PEER MAX LIMIT REACHED');
      dataConn.on('open', function() {
        console.log('###  CLOSING CONN FROM:' + dataConn.peer);
        dataConn.close();
      });
    }
    else {
      self._setupConnectionHandlers(dataConn, true);
    }
  });
};

Network.prototype.setPeerId = function(peerId) {
  if (this.started) {
    throw new Error ('network already started: can not change peerId')
  }
  this.peerId = peerId;
};


Network.prototype.start = function(openCallback, opts) {
  opts = opts || {};
  // Start PeerJS Peer
  var self = this;

  if (this.started)  return openCallback();

  opts.connectedPeers = opts.connectedPeers || [];
  this.peerId = this.peerId || opts.peerId;

  this.peer = new Peer(this.peerId, this.opts);
  this._setupPeerHandlers(openCallback);
  for (var i = 0; i<opts.connectedPeers.length; i++) {
    var otherPeerId = opts.connectedPeers[i];
    this.connectTo(otherPeerId);
  }
  this.started = true;

console.log('[WebRTC.js.237] started TRUE'); //TODO
};

Network.prototype._sendToOne = function(peerId, data, cb) {
  if (peerId !== this.peerId) {
    var dataConn = this.connections[peerId];
    if (dataConn) {
      var str = JSON.stringify({
        sender: this.peerId,
        data: data
      });
      dataConn.send(str);
    }
    else {
console.log('[WebRTC.js.255] WARN: NO CONNECTION TO:', peerId); //TODO
    }
  }
  if (typeof cb === 'function') cb();
};

Network.prototype.send = function(peerIds, data, cb) {
  var self=this;
console.log('[WebRTC.js.242] SENDING ', data.type); //TODO
  if (!peerIds) {
    peerIds = this.connectedPeers;
    data.isBroadcast = 1;
  }

  if (Array.isArray(peerIds)) {
    var l = peerIds.length;
    var i = 0;
    peerIds.forEach(function(peerId) {
console.log('[WebRTC.js.258:peerId:]',peerId); //TODO
      self._sendToOne(peerId, data, function () {
        if (++i === l && typeof cb === 'function') cb();
      });
    });
  }
  else if (typeof peerIds === 'string')
    self._sendToOne(peerIds, data, cb);
};

Network.prototype.connectTo = function(peerId) {
  var self = this;

  console.log('### STARTING CONNECTION TO:' + peerId );

  var dataConn = this.peer.connect(peerId, {
    serialization: 'none',
    reliable: true,
    metadata: { message: 'hi copayer!' }
  });

  self._setupConnectionHandlers(dataConn, false);
};


Network.prototype.disconnect = function(cb, forced) {
  var self = this;
  self.closing = 1;
  var cleanUp = function() {
    self.connectedPeers = [];
    self.started = false;
    self.peerId = null;
    if (self.peer) {
      self.peer.disconnect();
      self.peer.destroy();
      self.peer = null;
    }
    self.closing = 0;
    if (typeof cb === 'function') cb();
  };
  if (!forced) {
    this.send(null, { type: 'disconnect' }, cleanUp);
  } else {
    cleanUp();
  }
};

module.exports = require('soop')(Network);
