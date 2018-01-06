module.exports = function(RED) {
  RED.nodes.registerType("actionflows", actionflows);
  function actionflows(config) {
    RED.nodes.createNode(this, config);
    var nodeID = config.id;
    var node = this;
    if (typeof config._alias != "undefined") {
      nodeID = config._alias;
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
        // Check no matching `action in`s defined
        var af = node.context().global.get('actionflows');
        if (typeof af == "undefined") {
          node.status({});
          node.send(msg);
          return;
        }else{
          if (typeof af[nodeID] == "undefined") {
            node.status({});
            node.send(msg);
            return;
          }
        }

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
        if (typeof msg._af == "undefined") {
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
    var nodeID = config.id;
    var node = this;
    if (typeof config._alias != "undefined") {
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

    // Build actionflows associations
    var RED2 = require.main.require('node-red');
    var flows = RED2.nodes.getFlows().flows;
    flows = JSON.parse(JSON.stringify(flows)); // deep clone

    // Purge items from disabled tabs
    var disabledTabs = [];
    flows.forEach(function(f) {
      if (f.type == "tab") {
        if (f.disabled) {
          disabledTabs.push(f.id);
        }
      }
    });
    var purged = [];
    flows.forEach(function(f) {
      if (typeof f.z != "undefined") {
        if (disabledTabs.indexOf(f.z) == -1) {
          purged.push(f);
        }
      }else{
        purged.push(f);
      }
    });
    flows = purged;

    // Ensure Subflows have a default name
    for (var i = 0; i < flows.length; i++) {
      if (flows[i].type.startsWith("subflow:")) {
        if (typeof flows[i].name == "undefined" || flows[i].name == "") {
          var id = flows[i].type.substr(8);
          flows[i].name = getByID(id).name;
        }
      }
    }

    // Purge old actionflows not deployed within the last few seconds
    var af = node.context().global.get('actionflows');
    if (typeof af == "undefined") {
      af = new Object();
    }
    var seconds = new Date().getTime() / 1000;
    for(var id in af) {
      if ((seconds - af[id].age) > 2) {
        delete af[id];
      }
    }

    // Furnish invoke function to JavaScript authors
    af.invoke = function(sName, msg) {
      var ins = [];
      flows.forEach(function(f) {
        if (f.type == "actionflows_in" && f.name == sName) {
          if (getTabID(f) != false) {
            ins.push(f);
          }
        }
      });

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
    };

    // Look for any actionflows on the same plane
    var item = getByID(nodeID);
    flows.forEach(function(f) {
      if (config.private) {
        if (f.z == item.z && f.type == "actionflows" && prefixMatch(config.name + " ").startsWith(f.name + " ")) {
          //node.warn(nameToID(nodeID + " " + f.id));
          associateActionFlows(f, config);
        }

        // Look for any subflows on the same plane
        if (f.z == item.z && f.type.startsWith("subflow:") && prefixMatch(config.name + " ").startsWith(f.name + " ")) {
          var name = config.name.substr(f.name.length + 1);
          // Look inside subflows for actionflows
          flows.forEach(function(a) {
            if (a.z == f.type.substr(8) && a.type == "actionflows" && prefixMatch(name + " ").startsWith(a.name + " ")) {
              //node.warn(nameToID(nodeID + " " + a.id));
              associateActionFlows(a, config);
            }
          });
        }
      }else{
        if (f.type == "actionflows" && prefixMatch(config.name + " ").startsWith(f.name + " ")) {
          if (getTabID(f) != false) {
            //node.warn(nameToID(nodeID + " " + f.id));
            associateActionFlows(f, config);
          }
        }
      }
    });
    node.context().global.set('actionflows', af);

    // Record `action` to `action in` associations
    function associateActionFlows(aa, ai) {
      if (typeof af[aa.id] == "undefined") {
        af[aa.id] = aa;
      }
      if (typeof af[aa.id].ins == "undefined") {
        af[aa.id].ins = [];
      }
      af[aa.id].age = new Date().getTime() / 1000;
      af[aa.id].ins.push(ai);

      // Sort ins by priority
      af[aa.id].ins.sort(function(a, b) {
        return parseInt(a.priority)-parseInt(b.priority);
      });
    }

    // Support namespace dividers with space, period, underscore or dash
    function prefixMatch(s) {
      return s.replace(new RegExp("_", 'g'), " ")   // search for prefix while preventing
              .replace(new RegExp("-", 'g'), " ")   // substr match (i.e. 'he' in 'head')
              .replace(new RegExp("\\.", 'g'), " "); // support domain format
    }

    // Find the tab id the given item lives on or false.
    function getTabID(item) {
      var RED2 = require.main.require('node-red');
      var flows = RED2.nodes.getFlows().flows;

      // Get enabled tabs
      var result = false;
      var tabIDs = [];
      flows.forEach(function(f) {
        if (f.type == "tab") {
          if (f.disabled == false) {
            tabIDs.push(f.id);
          }
        }
      });
      if (tabIDs.indexOf(item.z) != -1) {
        result = item.z;
      }else{
        if (typeof item._alias != "undefined") {
          for (var a = 0; a < flows.length; a++) {
            if (flows[a].id == item._alias) {
              item = flows[a];
              result = item.id;
              break;
            }
          }
        }
        for (var i = 0; i < flows.length; i++) {
          if (flows[i].type == ("subflow:" + item.z)) {
            if (result != false) {
              result = getTabID(flows[i]);
            }else{
              result = getTabID(flows[i]);
            }
            break;
          }
        }
      }
      return result;
    }

    // Debug function to reveal id name
    function nameToID(sPath) {
      var RED2 = require.main.require('node-red');
      var flows = RED2.nodes.getFlows().flows;
      flows.forEach(function(f) {
        var name = f.name;
        if (typeof name == "undefined" || name == "") {
          name = f.label;
        }
        if (typeof name == "undefined" || name == "") {
          flows.forEach(function(s) {
            if (s.id == f.type.substr(8)) {
              name = s.name;
            }
          });
        }
        sPath = sPath.replace(new RegExp(f.id, 'g'), name);
      });
      return sPath;
    }

    // Return the item by id
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
    //node.warn(af);
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
}
