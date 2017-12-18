module.exports = function(RED) {
  RED.nodes.registerType("actionflows", actionflows);
  function actionflows(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    node.context().global.set('actionflows', getActionFlows());
    var nodeID = config.id;
    if (typeof config._alias != 'undefined') {
      nodeID = config._alias;
    }
    var event = "af:" + nodeID;
    var handler = function(msg) {
      msg._af["noinc0"] = true; // Returning flag, do not increment from zero
      node.receive(msg);
    }
    RED.events.on(event, handler);
    this.on("input", function(msg) {

        // Check loop conditional
        if (stopLoop()) {
          node.status({});
          node.send(msg);
          return;
        }
        var af = node.context().global.get('actionflows');
        if (typeof msg._af == 'undefined') {
          msg._af = {};
          msg._af["stack"] = [];
        }

        if (typeof msg._af[nodeID] == "undefined") {
          msg._af[nodeID] = {
            execTime: process.hrtime(),
            ins: af[nodeID].ins,
            index: 0
          };
          node.status({fill:"green",shape:"dot",text: "running" });
        }
        if (msg._af[nodeID].index < msg._af[nodeID].ins.length) {
          msg._af["stack"].push(event);
          msg._af[nodeID].index++;
          RED.events.emit("af:" + msg._af[nodeID].ins[msg._af[nodeID].index - 1].id, msg);
        }else{
          if (config.perf) {
            var t = process.hrtime(msg._af[nodeID].execTime);
            node.warn("Action cycle execution time: " + t[0] + "s and " + t[1]/1000000 + "ms");
          }
          delete msg._af[nodeID];

          // Bump loop and restart action
          if (config.loop != "none") {
            if (bumpLoop()) {
              RED.events.emit(event, msg);
            }else{
              // Stop on bump error
              node.status({fill:"red",shape:"ring",text: "error" });
              return;
            }
          }else{
            // Move on
            node.status({});
            node.send(msg);
          }
        }

        // Check if stopLoop condition met
        function stopLoop() {

          // Support increment from zero
          if (typeof msg._af != "undefined") {
            if (typeof msg._af["noinc0"] == "undefined" && config.loop == "inc0") {
              setContextPropertyValue(config.proptype, config.prop, 0);
            }else{
              delete msg._af["noinc0"];
            }
          }

          var sl = false;
          if (config.loop == "none") return sl;
          var prop = getTypeInputValue(config.proptype, config.prop);

          // Initialized undefined variables
          if (typeof prop == "undefined") {

            // String logic operator inits to empty string
            if (config.until == "cont" || config.until == "notc") {
              prop = "";
            }else{

              // Math logic operator inits to zero
              prop = 0;
            }
            setContextPropertyValue(config.proptype, config.prop, prop);
          }
          var untilprop = getTypeInputValue(config.untilproptype, config.untilprop);
          switch(config.until) {
            case "eq":
              sl = (prop == untilprop);
              break;
            case "neq":
              sl = (prop != untilprop);
              break;
            case "lt":
              sl = (prop < untilprop);
              break;
            case "lte":
              sl = (prop <= untilprop);
              break;
            case "gt":
              sl = (prop > untilprop);
              break;
            case "gte":
              sl = (prop >= untilprop);
              break;
            case "cont":
              sl = (prop.indexOf(untilprop) != -1);
              break;
            case "notc":
              sl = (prop.indexOf(untilprop) == -1);
              break;
          }
          return sl;
        }

        // Bump any loop increment, decrement
        function bumpLoop() {
          if (config.loop == "none") return true;
          var prop = getTypeInputValue(config.proptype, config.prop);
          switch(config.loop) {
            case "inc0":
            case "inc":
              if (typeof prop == "number") {
                prop++;
              }else{
                node.error("Cannot increment loop variable. " + config.prop + " is not a number.");
                return false;
              }
              break;
            case "dec":
              if (typeof prop == "number") {
                prop--;
              }else{
                node.error("Cannot decrement loop variable. " + config.prop + " is not a number.");
                return false;
              }
              break;
            case "watch":
              break;
          }
          setContextPropertyValue(config.proptype, config.prop, prop);
          return true;
        }

        // Decode typeInput value by type/value
        function getTypeInputValue(t, v) {
          var r = '';
          switch(t) {
            case "msg":
              r = RED.util.getMessageProperty(msg, v);
              break;
            case "flow":
              r = flowContext.get(v);
              break;
            case "global":
              r = globalContext.get(v);
              break;
            case "str":
              try {
                r = unescape(JSON.parse('"'+v+'"'));;
              }catch(e){
                r = v;
              }
              break;
            case "num":
              r = parseFloat(v);
              break;
            case 'bool':
              r = (v=='true');
              break;
            default:
              r = v;
          }
          return r;
        }

        // Set the context property value
        function setContextPropertyValue(context, property, value) {
            // Assign value to given object and property
            switch(context) {
              case "msg":
                RED.util.setMessageProperty(msg, property, value);
                break;
              case "flow":
                flowContext.set(property, value);
                break;
              case "global":
                globalContext.set(property, value);
                break;
            }
        }
    });
    this.on("close",function() {
        RED.events.removeListener(event, handler);
        node.status({});
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
      RED.events.emit(msg._af["stack"].pop(), msg); // return to the action orig. flow
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
                     .replaceAll(".", " ") // support domain format
                     .startsWith(a.name + " ")) {
          a.ins.push(i);
        }
      });
      af[a.id] = a;
    });
    return af;
  }
}
