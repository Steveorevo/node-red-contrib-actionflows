module.exports = function(RED) {
  RED.nodes.registerType("actionflows", actionflows);
  function actionflows(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    var af = getActionFlows();
    node.context().global.set('actionflows', af);
    var nodeID = config.id;
    if (typeof config._alias != 'undefined') {
      nodeID = config._alias;
    }
    var event = "af:" + nodeID;
    var handler = function(msg) {
        node.receive(msg);
    }
    RED.events.on(event, handler);
    this.on("input", function(msg) {
        var af = node.context().global.get('actionflows');
        if (typeof msg._afIndex == 'undefined') {
          msg._afID = [];
          msg._afIndex = 0;
        }
        if (msg._afIndex < af[nodeID].ins.length) {
          msg._afIndex++;
          msg._afID.push(event);
          RED.events.emit("af:" + af[nodeID].ins[msg._afIndex - 1].id, msg);
        }else{
          if (msg._afID.length == 0){
            delete msg._afIndex;
            delete msg._afID;
          }
          this.send(msg);
        }
    });
    this.on("close",function() {
        RED.events.removeListener(event, handler);
    });
  }
  RED.nodes.registerType("actionflows_in", actionflows_in);
  function actionflows_in(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    var nodeID = config.id;
    if (typeof config._alias != 'undefined') {
      nodeID = config._alias;
    }
    var event = "af:" + nodeID;
    var handler = function(msg) {
        node.receive(msg);
    }
    RED.events.on(event, handler);
    this.on("input", function(msg) {
        this.send(msg);
    });
    this.on("close",function() {
        RED.events.removeListener(event, handler);
    });
  }
  RED.nodes.registerType("actionflows_out", actionflows_out);
  function actionflows_out(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    this.on('input', function(msg) {
      RED.events.emit(msg._afID.pop(), msg); // return to the action orig. flow
		});
  }

  /**
   * getActionFlows returns all actionflows nodes
   */
  function getActionFlows() {
    var RED2 = require.main.require('node-red');
    var flows = RED2.nodes.getFlows().flows;
    var S = require('string');
    var actionflows = [];
    var ins = [];
    flows.forEach(function(f) {
      if (f.type.substring(0, 11) == 'actionflows') {
        if (f.type == 'actionflows') {
          actionflows.push(f);
        }
        if (f.type == 'actionflows_in') {
          ins.push(f);
        }
      }
    });
    // Sort actionflows_in by priority
    ins.sort(function(a, b) {
      return parseInt(a.priority)-parseInt(b.priority);
    });
    var af = {};

    // associate actionflows with ins
    actionflows.forEach(function(a) {
      a.ins = [];
      ins.forEach(function(i) {
        if (S(i.name).replaceAll("_", " ") // search for prefix while preventing
                     .replaceAll("-", " ") // substr match (i.e. 'he' in 'head')
                     .startsWith(a.name + " ")) {
          a.ins.push(i);
        }
      });
      af[a.id] = a;
    });
    return af;
  }
}
