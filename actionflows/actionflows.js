module.exports = function(RED) {
  RED.nodes.registerType("actionflows", actionflows);
  function actionflows(config) {
    var node = this;

    // var RED2 = require.main.require('node-red');
    // var flows = RED2.nodes.getFlows().flows;
    // node.warn(flows);
    //
    // Create our node and event handler
    RED.nodes.createNode(this, config);
    var event = "af:" + config.id;
    var handler = function(msg) {
      if (typeof msg._af != "undefined") {
        msg._af["noinc0"] = true; // Returning flag, do not increment from zero
        node.receive(msg);
      }
    }
    RED.events.on(event, handler);

    // Clean up event handler
    this.on("close",function() {
        RED.events.removeListener(event, handler);
        node.status({});
    });
    assembleFlows(config, node);

    this.on("input", function(msg) {

        // Check no matching `action in`s, just move along
        var af = node.context().global.get('actionflows');
        if (typeof af == "undefined") {
          node.status({});
          node.send(msg);
          return;
        }
        if (typeof af[config.id] == "undefined") {
          node.status({});
          node.send(msg);
          return;
        }

        // Check loop conditional
        if (stopLoop()) {
          // Move on
          if (msg._af.stack.length == 0) {
            delete msg._af;
          }
          node.status({});
          node.send(msg);
          return;
        }
        if (typeof msg._af == "undefined") {
          msg._af = {};
          msg._af.stack = [];
        }
        if (typeof msg._af[config.id] == "undefined") {
          msg._af[config.id] = af[config.id];
          msg._af[config.id].execTime = process.hrtime();
          msg._af[config.id].index = 0;
          node.status({fill:"green",shape:"dot",text: "running" });
        }

        if (msg._af[config.id].index < msg._af[config.id].ins.length) {
          msg._af.stack.push(event);
          msg._af[config.id].index++;
          RED.events.emit("af:" + msg._af[config.id].ins[msg._af[config.id].index - 1].id, msg);
        }else{
          if (config.perf) {
            var t = process.hrtime(msg._af[config.id].execTime);
            node.warn("Action cycle execution time: " + t[0] + "s and " + t[1]/1000000 + "ms");
          }
          delete msg._af[config.id];

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

  }
  RED.nodes.registerType("actionflows_in", actionflows_in);
  function actionflows_in(config) {
    var node = this;

    // Create our node and event handler
    RED.nodes.createNode(this, config);
    var event = "af:" + config.id;
    var handler = function(msg) {
        node.receive(msg);
    }
    RED.events.on(event, handler);

    // Clean up event handler
    this.on("close",function() {
        RED.events.removeListener(event, handler);
    });
    assembleFlows(config, node);

    this.on("input", function(msg) {
        this.send(msg);
    });
  }
  RED.nodes.registerType("actionflows_out", actionflows_out);
  function actionflows_out(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    this.on('input', function(msg) {
      if (typeof msg._af != "undefined") {
        RED.events.emit(msg._af["stack"].pop(), msg); // return to the action orig. flow
      }
		});
  }

  // Gather all live instances of actionflows and subflows
  function assembleFlows(item, node) {
    // Add the given node to our internal list of subflows and actionflows
    var af = node.context().global.get('actionflows');
    if (typeof af == "undefined") {
      af = new Object();
    }
    af[item.id] = JSON.parse(JSON.stringify(item)); // deep clone;
    var seconds = new Date().getTime() / 1000;
    af[item.id].age = seconds;;

    // Add our list of subflow instances
    var RED2 = require.main.require('node-red');
    var flows = RED2.nodes.getFlows().flows;
    flows = JSON.parse(JSON.stringify(flows)); // deep clone
    flows.forEach(function(n) {
      if (n.type.startsWith("subflow:")) {

        // Ensure subflow instance has a default name
        if (typeof n.name == "undefined" || n.name == "") {
          var s = getByID(n.type.substr(8));
          n.name = s.name;
        }
        n.age = seconds;
        af[n.id] = n;
      }
    });

    // Identify the tabs each node lives on
    for (var id in af) {
      af[id].tab = getTab(af[id]);
    }

    // Filter out disabled, non-existent (in a subflow but not on a tab)
    for (var id in af) {
      if (af[id].tab === false) {
        delete af[id];
      }
    }

    // Purge from old deployments (not created within the last few seconds)
    for (var id in af) {
      if ((seconds - af[id].age) > 2) {
        delete af[id];
      }
    }

    // Get ids of all actionflows
    var actionflows = [];
    for (var id in af) {
      if (af[id].type == "actionflows") {
        actionflows.push(id);

        // Store reference to parent container
        var parent = getByID(af[id].z);
        if (parent.type == "tab") {
          parent.name = parent.label;
        }
        if (typeof parent.name == "undefined" || parent.name == "") {
          parent.name = getByID(parent.type.substr(8)).name;
        }
        af[id].parent = parent;
      }
    }
    actionflows.forEach(function(a) {
      var ins = [];
      for (var id in af) {
        if (af[id].type == "actionflows_in") {

          // Add all matching non-private ins
          if (af[id].private == false) {
            if (prefixMatch(af[id].name).startsWith(prefixMatch(af[a].name))) {
              ins.push(af[id]);
            }
          }else{

            // Add all private within same z plane
            if (prefixMatch(af[id].name).startsWith(prefixMatch(af[a].name))) {
              if (af[id].z == af[a].z) {
                ins.push(af[id]);
              }
            }

            // Find all private with parent z plane and namespace
            if (prefixMatch(af[id].name).startsWith(prefixMatch(af[a].parent.name + " " + af[a].name))) {
              if (af[id].z == af[a].parent.z) {
                ins.push(af[id]);
              }
            }
          }
        }
      }

      // Sort ins by priority
      ins.sort(function(a, b) {
        return parseInt(a.priority)-parseInt(b.priority);
      });
      af[a].ins = ins;
    });

    // Furnish invoke function for JavaScript authors
    node.context().global.set('afInvoke', function(sName, msg) {
      var ins = [];
      for (var id in af) {
        if (af[id].type == "actionflows_in" && af[id].name == sName) {
          ins.push(af[id]);
        }
      }

      // Sort ins by priority
      ins.sort(function(a, b) {
        return parseInt(a.priority)-parseInt(b.priority);
      });

      if (typeof msg._af == 'undefined') {
        msg._af = {};
        msg._af["stack"] = [];
      }
      var done;
      var event = "af:" + RED2.util.generateId();
      var handler = function(msg) {
        if (ins.length > 0) {
          msg._af["stack"].push(event);
          RED.events.emit("af:" + ins.shift().id, msg);
        }else{
          RED.events.removeListener(event, handler);
          if (msg._af["stack"].length == 0) {
            delete msg._af;
          }
          done(msg);
        }
      }
      RED.events.on(event, handler);
      var p = new Promise(function(resolve) {
        done = resolve;
      });
      if (ins.length > 0) {
        var id = ins.shift().id;
        msg._af["stack"].push(event);
        RED.events.emit("af:" + id, msg);
      }else{
        RED.events.removeListener(event, handler);
        delete msg._af;
        done(msg);
      }
      return p;
    });
    node.context().global.set('actionflows', af);
  }
  // Support dividers; dot, dash, space, underscore
  function prefixMatch(s) {
    return s.replace(new RegExp("_", 'g'), " ")
            .replace(new RegExp("-", 'g'), " ")
            .replace(new RegExp("\\.", 'g'), " ") + " ";
  }
  // Find the enabled tab where the given item exists or false.
  function getTab(item) {
    if (item.type == "tab") {
      return item;
    }
    if (item.type.startsWith("subflows:")) {
      item = getByID(item.type.substr(8));
    }else{
      if (item.type == "subflow") {
        return false;
      }
    }
    item = getByID(item.z);
    if (item != false) {
      return getTab(item);
    }else{
      return item;
    }
  }
  // Return the node by id of null if not found
  function getByID(id) {
    var RED2 = require.main.require('node-red');
    var flows = RED2.nodes.getFlows().flows;
    var result = false;
    for (var i = 0; i < flows.length; i++) {
      var f = flows[i];
      if (f.id == id) {
        result = f;
        break;
      }
    }
    // Try our global list?
    if (result == null) {
      console.log("Warning: getByID is returning null for " + id);
    }
    return result;
  }
}
