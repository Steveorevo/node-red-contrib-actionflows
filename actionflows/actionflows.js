module.exports = function(RED) {
  RED.nodes.registerType("actionflows", actionflows);
  function actionflows(config) {
    RED.nodes.createNode(this, config);
    var nodeID = config.id;
    var node = this;

    // Gather all `action in`
    var RED2 = require.main.require('node-red');
    var flows = RED2.nodes.getFlows().flows;

    // Get disabled tabs
    var tabs = [];
    flows.forEach(function(f) {
      if (typeof f.disabled != "undefined") {
        if (f.disabled) {
          tabs.push(f.id);
        }
      }
    });

    // Remove nodes on disabled tab from our flows
    var enabled = [];
    flows.forEach(function(f) {
      if (typeof f.z != "undefined") {
        if (tabs.indexOf(f.z) == -1) {
          enabled.push(f);
        }
      }
    });
    flows = enabled;

    var ai = [];
    flows.forEach(function(f) {
      if (f.type == 'actionflows_in') {
        ai.push(f);
      }
    });

    // Find all `action in` related by this actionflows' name
    var ins = [];

    // Identify instance
    var instance = config.name;
    var subflow = getByID(config.z);
    if (subflow != null) {
      if (typeof subflow.name != "undefined") {
        instance = subflow.name + " " + config.name;
      }
    }

    ai.forEach(function(f) {
      // Look for any `action in` on this level
      if (typeof config._alias == "undefined") {

        // Any tab, as long as we're not in a subflow
        if (prefixMatch(f.name).startsWith(prefixMatch(config.name))) {
          ins.push(f);
        }
      }else{

        // Restrict to this tab
        if (f.z == config.z && prefixMatch(f.name).startsWith(prefixMatch(config.name))) {
          ins.push(f);
        }
      }
    });
    ai.forEach(function(f) {
      // Look for any `action in` within the subflow instance
      var alias = getByID(config._alias);
      if (alias != null) {
        if (f.z == alias.z && prefixMatch(f.name).startsWith(prefixMatch(alias.name))) {
          ins.push(f);
        }
      }
    });
    ai.forEach(function(f) {
      // Look for any `action in` on first namespace'd (subflow) level
      if (subflow != null) {
        if (f.z == subflow.z && prefixMatch(f.name).startsWith(prefixMatch(subflow.name + " " + config.name))) {
          ins.push(f);
        }
      }
    });

    // Sort all `action in` by priority
    ins.sort(function(a, b) {
      return parseInt(a.priority)-parseInt(b.priority);
    });

    // Enforce private settings
    var zz = config.z;
    if (typeof config._alias != "undefined") {
      zz = getByID(config._alias).z;
    }
    var pins = [];
    ins.forEach(function(i) {
      if ((i.private == false && config.private == false) ||
          (config.private == true && i.z == zz) ||
          (i.private == true && i.z == zz)) {
            pins.push(i);
      }
    });
    ins = pins;

    // Associate all `action in` with their actionflows
    var af = node.context().global.get('actionflows');
    if (typeof af == "undefined") {
      af = new Object();
    }
    if (typeof af[config.id] == "undefined") {
      af[config.id] = config;
    }
    var seconds = new Date().getTime() / 1000;
    af[config.id].age = seconds;
    af[config.id].ins = ins;

    // Purge old actionflows not deployed within the last 10 seconds
    for(var id in af) {
      if ((seconds - af[id].age) > 10) {
        delete af[id];
      }
    }
    node.context().global.set('actionflows', af);

    // Util functions
    function prefixMatch(s) {
      s = S(s).replaceAll("_", " ").replaceAll("-", " ").replaceAll(".", " ");
      return s.toString();
    }
    function getByID(id) {
      for (var i = 0; i < flows.length; i++) {
        var f = flows[i];
        if (f.id == id) {
          return f;
          break;
        }
      }
      return null;
    }

    var event = "af:" + config.id;
    var handler = function(msg) {
      if (typeof msg._af != "undefined") {
        msg._af["noinc0"] = true; // Returning flag, do not increment from zero
        node.receive(msg);
      }
    }
    RED.events.on(event, handler);
    this.on("input", function(msg) {

        // Check loop conditional
        if (stopLoop()) {
          // Move on
          if (msg._af["stack"].length == 0) {
            delete msg._af;
          }
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
            if (msg._af["stack"].length == 0) {
              delete msg._af;
            }
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
    var event = "af:" + config.id;
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

    // Associate actionflows with ins
    actionflows.forEach(function(a) {
      a.ins = [];
      ins.forEach(function(i) {

        // Enforce private settings
        if ((a.private == false && i.private == false) ||
            (a.private == true && a.z == i.z) ||
            (i.private == true && a.z == i.z)) {
              if (i.name.replace(new RegExp("_", 'g'), " ")   // search for prefix while preventing
                        .replace(new RegExp("-", 'g'), " ")   // substr match (i.e. 'he' in 'head')
                        .replace(new RegExp("\\.", 'g'), " ") // support domain format
                        .startsWith(a.name + " ")) {
                a.ins.push(i);
              }
        }
      });
      af[a.id] = a;
    });
    return af;
  }
}
