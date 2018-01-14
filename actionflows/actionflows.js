module.exports = function(RED) {
  RED.nodes.registerType("actionflows", actionflows);
  function actionflows(config) {
    var node = this;

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

    // Clean up event handler on close
    this.on("close",function() {
        RED.events.removeListener(event, handler);
        node.status({});
    });

    // Create our global context actionflows object for mapping details
    var af = node.context().global.get('actionflows');
    if (typeof af == "undefined") {
      af = new Object();
      af["actions"] = new Object();
    }
    if (typeof af["map"] == "undefined") {
      af["map"] = function(e) {
        if (e.id == "runtime-state") {
          mapActionFlows(node);
        }
      }
      RED.events.on("runtime-event", af["map"]);
    }
    af["actions"][config.id] = config;
    node.context().global.set('actionflows', af);

    // Map actionflows with `action in` assocations on scope settings
    function mapActionFlows(node) {
      // Separate our actions from our ins
      var RED2 = require.main.require('node-red');
      var flows = RED2.nodes.getFlows().flows;
      var actionflows = getActionflows();
      var ins_object = new Object();
      var actions = new Object();
      for (var id in actionflows) {
        if (actionflows[id].type == "actionflows_in") {
          ins_object[id] = actionflows[id];
        }else{
          actions[id] = actionflows[id];
        }
      }
      // Build associations between actions and their matching ins
      for (var id in actions) {
        var a = actions[id];
        var ins = Object.assign({}, ins_object);
        // Match actionflows on same z plane, regardless of scope
        for (var id in ins) {
          var i = ins[id];
          if (i.z == a.z) {
            if (prefixMatch(i.name).startsWith(prefixMatch(a.name))) {
              a.ins.push(i);
              delete ins[id];
            }
          }
        }
        // Match any global actionflows
        if (a.scope == "global") {
          for (var id in ins) {
            var i = ins[id];
            if (i.scope == "global") {
              if (prefixMatch(i.name).startsWith(prefixMatch(a.name))) {
                a.ins.push(i);
                delete ins[i];
              }
            }
          }
        }
        // Match protected actionflows to explicitly named ins
        if (a.scope == "protected") {
          var name = a.name;
          var parent = getParent(a);
          while (parent != false && parent.type != "tab") {
            name = parent.name + " " + name;
            for (var id in ins) {
              var i = ins[id];
              if (i.scope == "protected" && i.z == parent.z) {
                if (prefixMatch(i.name).startsWith(prefixMatch(name))) {
                  a.ins.push(i);
                  delete ins[id];
                }
              }
            }
            parent = getParent(parent);
          }
        }
      }

      // Match protected ins with explicity named actions
      var ins = Object.assign({}, ins_object);
      for (var id in ins) {
        var i = ins[id];
        if (i.scope == "protected") {
          var name = i.name;
          var parent = getParent(i);
          while (parent != false && parent.type != "tab") {
            name = parent.name + " " + name;
            for (var id in actions) {
              var a = actions[id];
              if (a.scope == "protected" && a.z == parent.z) {
                if (prefixMatch(a.name).startsWith(prefixMatch(name))) {
                  a.ins.push(i);
                }
              }
            }
            parent = getParent(parent);
          }
        }
      }

      // Sort matched ins by priority
      for (var id in actions) {
        actions[id].ins.sort(function(a, b) {
          return parseInt(a.priority)-parseInt(b.priority);
        });
      }

      af["invoke"] = invoke;
      // Return all current enabled actions
      function getActionflows() {
        var af = node.context().global.get("actionflows");
        var actions = af["actions"];

        for (var id in actions) {
          if (typeof actions[id].ins != "undefined") {
            // Purge old; already have `action in` assoc.
            delete actions[id];
          }else{
            // Purge any disabled tabs
            var t = findTab(actions[id]);
            if (t == false || t.disabled == true) {
              delete actions[id];
            }else{
              actions[id].ins = [];
            }
          }
        }
        return actions;
      }
      // Return the parent (tab or subflow) of the given item or false
      function getParent(item) {
        var parent = false;
        if (item.type == "tab") {
          return parent;
        }
        var subs = getSubflows();
        for (var i = 0; i < subs.length; i++) {
          if (subs[i].id == item.z) {
            parent = subs[i];
            break;
          }
        }
        if (parent == false) {
          var tabs = getTabs();
          for (var i = 0; i < tabs.length; i++) {
            if (tabs[i].id == item.z) {
              parent = tabs[i];
              break;
            }
          }
        }
        return parent;
      }
      // Return all subflows recursively from the given array
      function getSubflows(scan) {
        if (typeof scan == "undefined") {
          scan = flows;
        }
        var items = [];
        for (var i = 0; i < scan.length; i++) {
          if (scan[i].type.startsWith("subflow:")) {
            items.push({
              name: getSubflowName(scan[i]),
              type: scan[i].type,
              id: scan[i].id,
              z: scan[i].z
            });
          }
        }
        // Return the subflow name, or its default
        function getSubflowName(ss) {
          if (typeof ss.name == "undefined" || ss.name == "") {
            var name = "";
            for (var f = 0; f < flows.length; f++) {
              if (flows[f].id == ss.type.substr(8)) {
                name = flows[f].name;
                break;
              }
            }
            return name;
          }else{
            return ss.name;
          }
        };
        var more = [];
        items.forEach(function(f) {
          var sub = RED.nodes.getNode(f.id);
          if (sub != null) {
            if (typeof sub.instanceNodes != "undefined") {
              var inst = sub.instanceNodes;
              for(var id in inst) {
                if (id != f.id) {
                  var subsub = Object.assign({}, inst[id]);
                  if (subsub.type.startsWith("subflow:")) {
                    more.push({
                      name: getSubflowName(subsub),
                      type: subsub.type,
                      id: subsub.id,
                      z: subsub.z
                    });
                  }
                }
              }
            }
          }
        });
        if (more.length > 0) {
          var subsub = getSubflows(more);
          if (subsub.length > 0) {
            items = items.concat(subsub);
          }
        }
        return items;
      }
      // Support dividers; dot, dash, space, underscore
      function prefixMatch(s) {
        return s.replace(new RegExp("_", 'g'), " ")
                .replace(new RegExp("-", 'g'), " ")
                .replace(new RegExp("\\.", 'g'), " ") + " ";
      }
      // Given the item instance, return the tab it lives on or false
      function findTab(item) {
        if (item.type == "tab") {
          return item;
        }
        var tabs = getTabs();
        var t = tabs.find(function(t) {
          return item.z == t.id;
        });
        if (typeof t == "undefined") {
          var subs = getSubflows();
          t = subs.find(function(s) {
            return item.z == s.id;
          });
        }
        if (typeof t == "undefined") {
          return false;
        }
        return findTab(t);
      }
      // Return all tabs
      function getTabs() {
        var tabs = [];
        for (var i = 0; i < flows.length; i++) {
          if (flows[i].type == "tab") {
            tabs.push(flows[i]);
          }
        }
        return tabs;
      }
      // Furnish invoke function for JavaScript authors
      function invoke(sName, msg) {

      }
      // Update our actions
      node.context().global.set("actionflows", af);
    }
    this.on("input", function(msg) {

      // Check no matching `action in`s, just move along
      var af = node.context().global.get('actionflows');
      if (typeof af == "undefined") {
        node.status({});
        node.send(msg);
        return;
      }
      var actions = af["actions"];
      if (typeof actions[config.id] == "undefined") {
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
        msg._af[config.id] = actions[config.id];
        msg._af[config.id].execTime = process.hrtime();
        msg._af[config.id].index = 0;
        node.status({fill:"green",shape:"dot",text: "running" });
      }

      if (msg._af[config.id].index < msg._af[config.id].ins.length) {
        msg._af.stack.push(event);
        msg._af[config.id].index++;
        var ain = msg._af[config.id].ins[msg._af[config.id].index - 1];
        if (config.seq) {
          node.warn("`" + config.name + "` (" + config.id + ") -> `" + ain.name + "` (" + ain.id + ")");
        }
        RED.events.emit("af:" + ain.id, msg);
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
    // Create our global context actionflows object for mapping details
    var af = node.context().global.get('actionflows');
    if (typeof af == "undefined") {
      af = new Object();
      af["actions"] = new Object();
    }
    // Save details
    af["actions"][config.id] = config;
    node.context().global.set('actionflows', af);
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
}
