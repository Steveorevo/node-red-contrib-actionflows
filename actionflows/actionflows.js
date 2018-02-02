module.exports = function(RED) {
  // var RED2 = require.main.require('node-red');
  // console.log("line 3");
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
      af["afs"] = new Object();
      af["ins"] = new Object();
    }
    if (typeof af["map"] == "undefined") {
      af["map"] = function(e) {
        if (e.id == "runtime-state") {
          var mapTO = false;
          var flows = [];
          RED.nodes.eachNode(function(cb){
            flows.push(Object.assign({}, cb));
            if (mapTO) {
              clearTimeout(mapTO);
            }
            mapTO = setTimeout(function(){
              purge(node);
              map(node, flows);
            }, 500);
          });
        }
      }
      RED.events.on("runtime-event", af["map"]);
    }
    af["afs"][config.id] = config;
    af["map"] = map;
    node.context().global.set('actionflows', af);
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

      if (typeof msg._af == "undefined") {
        msg._af = {};
        msg._af.stack = [];
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
      af["afs"] = new Object();
      af["ins"] = new Object();
    }
    if (typeof af["map"] == "undefined") {
      af["map"] = function(e) {
        if (e.id == "runtime-state") {
          var mapTO = false;
          var flows = [];
          RED.nodes.eachNode(function(cb){
            flows.push(Object.assign({}, cb));
            if (mapTO) {
              clearTimeout(mapTO);
            }
            mapTO = setTimeout(function(){
              purge(node);
              map(node, flows);
            }, 500);
          });
        }
      }
      RED.events.on("runtime-event", af["map"]);
    }
    // Save details
    af["ins"][config.id] = config;
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
  // Purge flows from prior deployment
  function purge(node) {
    var af = node.context().global.get("actionflows");
    var afs_object = af["afs"];
    for (var id in afs_object) {
      if (afs_object[id].mapped == true) {
        delete afs_object[id];
      }
    }
    var ins_object = af["ins"];
    for (var id in ins_object) {
      if (ins_object[id].mapped == true) {
        delete ins_object[id];
      }
    }
    af["afs"] = afs_object;
    af["ins"] = ins_object;
    node.context().global.set('actionflows', af);
  }
  // Map actionflows with `action in` assocations on scope settings
  function map(node, flows) {
    // Separate our actions from our ins
    var af = node.context().global.get("actionflows");
    var afs_object = af["afs"];
    var ins_object = af["ins"];

    // Purge `action`s on disabled tabs
    for (var id in afs_object) {
      var t = findTab(afs_object[id]);
      if (t == false || t.disabled == true) {
        delete afs_object[id];
      }else{
        afs_object[id].ins = [];
      }
      // Mark for mapped
      afs_object[id].mapped = true;
    }

    // Purge `action in`s on disabled tabs
    for (var id in ins_object) {
      var t = findTab(ins_object[id]);
      if (t == false || t.disabled == true) {
        delete ins_object[id];
      }
      // Mark for mapped
      ins_object[id].mapped = true;
    }

    // Build associations between actions and their matching ins
    var actions = Object.assign({}, afs_object);
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
    af["invoke"] = invokeActionIn;
    af["actions"] = actions;
    node.context().global.set('actionflows', af);

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
    function invokeActionIn(sName, msg) {
      // Match action ins with the given name
      var ains = [];
      for (var id in ins) {
        if (prefixMatch(ins[id].name).startsWith(prefixMatch(sName))) {
          ains.push(ins[id]);
        }
      }
      // Sort `action in` by priority
      ains.sort(function(a, b) {
        return parseInt(a.priority)-parseInt(b.priority);
      });
      if (typeof msg._af == "undefined") {
        msg._af = {};
        msg._af.stack = [];
      }
      var done;
      var event = "af:" + RED.util.generateId();
      var handler = function(msg) {
        if (ains.length > 0) {
          callActionIn();
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
      if (ains.length > 0) {
        callActionIn();
      }else{
        RED.events.removeListener(event, handler);
        if (msg._af["stack"].length == 0) {
          delete msg._af;
        }
        done(msg);
      }
      function callActionIn() {
        msg._af["stack"].push(event);
        var ain_node = ains.shift();
        if (sName == "#deployed") {
          msg.payload = Object.assign({}, getParent(ain_node));
          msg.settings = Object.assign({}, RED.settings);
        }
        RED.events.emit("af:" + ain_node.id, msg);
      }
      return p;
    }
    invokeActionIn("#deployed", {payload:""});
  }
}
