module.exports = function(RED) {
  let ContextStore = {};

  /**
   * Initialise the runtime mapping functions and prepare access to global context via `ContextStore`.
   * If a context store is not provided, an internal store will be created instead to keep things running 
   * @param {Object} [store] (optional) pass in the context store for where to store action flows mappings. Send `null` to use internal memory.
   */
  function initRuntimeMapper(store) {
    if(!initRuntimeMapper.initialised) {
      if(store) {
        ContextStore = store;
      } else {
        ContextStore = {
          get(name) {
            return RED.util.getObjectProperty(ContextStore, name);
          },
          set(name, value) {
            RED.util.setObjectProperty(ContextStore, name, value, true);
          }
        };
      }
      RED.events.on("flows:started", runtimeMap);
      initRuntimeMapper.initialised = true;
    }
  }

  RED.nodes.registerType("actionflows", actionflows);
  function actionflows(config) {
    // Create our node and event handler
    RED.nodes.createNode(this, config);
    const node = this;
    initRuntimeMapper(node.context().global);
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
    this.on("input", function(msg) {

      // Check no matching `action in`s, just move along
      var af = ContextStore.get('actionflows');
      // var af = node.context().global.get('actionflows');
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
        var globalContext = node.context().global;
        var flowContext = node.context().flow;
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
              var flowContext = node.context().flow;
              flowContext.set(property, value);
              break;
            case "global":
              var globalContext = node.context().global;
              globalContext.set(property, value);
              break;
          }
      }
    });
  }
  RED.nodes.registerType("actionflows_in", actionflows_in);
  function actionflows_in(config) {
    // Create our node and event handler
    RED.nodes.createNode(this, config);
    const node = this;
    initRuntimeMapper(node.context().global);
    var event = "af:" + config.id;
    var handler = function(msg) {
        node.receive(msg);
    }
    RED.events.on(event, handler);
    // Clean up event handler
    this.on("close",function() {
        RED.events.removeListener(event, handler);
    });
    this.on("input", function(msg) {
        this.send(msg);
    });
  }
  RED.nodes.registerType("actionflows_out", actionflows_out);
  function actionflows_out(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    initRuntimeMapper(node.context().global);
    this.on('input', function(msg) {
      if (typeof msg._af != "undefined") {
        RED.events.emit(msg._af["stack"].pop(), msg); // return to the action orig. flow
      }
		});
  }

  // Map actionflows with `action in` assocations on scope settings
  function runtimeMap() {
    
    const actionflowsNodes = {};
    const actionflowsInNodes = {};
    const actionflowsOutNodes = {};
    const allActionFlowsNodes = {};

    const actionflowsInstanceNodes = {};
    const actionflowsInInstanceNodes = {};
    const actionflowsOutInstanceNodes = {};
    const allActionFlowsInstances = {};
    const allActionFlowsInstancesInSubflowInstancesCopy = {};

    const allNodesCopy = {};
    const workspaces = {};
    const subflows = {};
    const subflowInstancesDefOnlyCopy = {};

    (function mapNodes() {
      RED.nodes.eachNode(node=>{
        allNodesCopy[node.id] = Object.assign({}, node);
        if(node.type === 'tab') {
          workspaces[node.id] = node;
        } else if(node.type === 'subflow') {
          subflows[node.id] = node;
        } else if(node.type === 'actionflows') {
          actionflowsNodes[node.id] = node;
          const instNode = RED.nodes.getNode(node.id);
          if(instNode) {
            actionflowsInstanceNodes[node.id] = instNode;
          }
        } else if(node.type === 'actionflows_in') {
          actionflowsInNodes[node.id] = node;
          const instNode = RED.nodes.getNode(node.id);
          if(instNode) {
            actionflowsInInstanceNodes[node.id] = instNode;
          }
        } else if(node.type === 'actionflows_out') {
          actionflowsOutNodes[node.id] = node;
          const instNode = RED.nodes.getNode(node.id);
          if(instNode) {
            actionflowsOutInstanceNodes[node.id] = instNode;
          }
        } else if(node.type.startsWith('subflow:')) {
          const subflowInst = RED.nodes.getNode(node.id);
          if(subflowInst) {
            const instances = instanceNodesForSub(subflowInst);
            for(const instId in instances) {
              const inst = instances[instId];
              if(inst.type.startsWith('actionflows')) {
                allActionFlowsInstancesInSubflowInstancesCopy[instId] = Object.assign({},inst);
              } else if(inst.type.startsWith("subflow:")) {

                let subflowName;
                try {
                  subflowName = inst._flow.subflowDef.name; // new Node-RED versions
                } catch (e) {
                  subflowName = subflows[inst.type.substring(8)].name; // Node-RED 19 or less
                }

                subflowInstancesDefOnlyCopy[inst.id] = {
                  name: subflowName,
                  type: inst.type,
                  id: inst.id,
                  z: inst.z
                }
              }
            }
          }
        }
      });

      Object.assign(allActionFlowsInstances, {
        ...actionflowsInstanceNodes,
        ...actionflowsInInstanceNodes,
        ...actionflowsOutInstanceNodes,
        ...allActionFlowsInstancesInSubflowInstancesCopy
      });

      Object.assign(allActionFlowsNodes, {
        ...actionflowsNodes,
        ...actionflowsInNodes,
        ...actionflowsOutNodes,
      });
    })();

    // Init mapping variables right away
    function map() {
      var af = ContextStore.get('actionflows');
      // var af = RED.settings.functionGlobalContext.get("actionflows");
      if (typeof af == "undefined") {
        af = new Object();
      }
      af["actions"] = new Object();
      af["afs"] = new Object();
      af["ins"] = new Object();
      const actionflowsMap = {...allActionFlowsNodes, ...allActionFlowsInstancesInSubflowInstancesCopy}

      // Merge alias with original object properties
      for(const id in allActionFlowsInstancesInSubflowInstancesCopy) {
        const nodeInst = allActionFlowsInstancesInSubflowInstancesCopy[id];
        const originalNodeObj = allNodesCopy[nodeInst._alias];
        actionflowsMap[id] = Object.assign(Object.assign({}, originalNodeObj), nodeInst);
      }

      // Separate our actions from our ins
      var afs_object = af["afs"];
      var ins_object = af["ins"];
      for (const nodeId in actionflowsMap) {
        const node = actionflowsMap[nodeId];
        const tabFound = findTab(node);

        // Purge `action`s on disabled tabs
        if(!tabFound || tabFound.disabled) continue;

        if (node.type === "actionflows") {
          node.ins = [];
          afs_object[node.id] = node;
        }
        if (node.type === "actionflows_in") {
          ins_object[node.id] = node;
        }
      }

      // Build associations between actions and their matching ins
      var actions = Object.assign({}, afs_object);
      for (var id in actions) {
        var a = actions[id];
        var ins = Object.assign({}, ins_object);
        for (var id in ins) {
          var i = ins[id];
          if (
              i.z == a.z || // Match actionflows on same z plane, regardless of scope
              (a.scope == "global" && i.scope == "global" && !i._alias) // Match any global actionflows, but dissallow global calls to be received in actionflow_in(s) that are within subflows
          ) {
            if (prefixMatch(i.name).startsWith(prefixMatch(a.name))) {
              a.ins.push(i);
              delete ins[id];
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
      af["map"] = map;
      ContextStore.set('actionflows', af);
      //RED.settings.functionGlobalContext.set("actionflows", af);

      // Return the parent (tab or subflow) of the given item or false
      function getParent(item) {
        if (item.type !== "tab") {
          const subflowFound = subflowInstancesDefOnlyCopy[item.z];
          if(subflowFound) return subflowFound;

          const tabFound = workspaces[item.z];
          if(tabFound) return tabFound;
        }
        return false;
      }

      // Support dividers; dot, dash, space, underscore
      function prefixMatch(s) {
        return s.replace(new RegExp("_", 'g'), " ")
            .replace(new RegExp("-", 'g'), " ")
            .replace(new RegExp("\\.", 'g'), " ") + " ";
      }

      // Given the item instance, return the tab it lives on or false
      function findTab(item) {
        if (item.type === "tab") return item;

        let t;

        const tabFound = workspaces[item.z];
        if(tabFound) t = tabFound;

        if(!t) {
          const subflowFound = subflowInstancesDefOnlyCopy[item.z];
          if(subflowFound) t = subflowFound;
        }

        if (!t) {
          return false;
        }
        return findTab(t);
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
    } // end function map()
    map();
  }

  function instanceNodesForSub(sub) {
    if(sub.hasOwnProperty('instanceNodes')) {
      return sub.instanceNodes; // Compatibility with Node-RED 0.19
    }
    if(sub.hasOwnProperty('_flow') && sub._flow.activeNodes) {
      const allNodes = {};
      allNodes[sub.id] = sub;
      for(const nodeId in sub._flow.activeNodes) {
        const node = sub._flow.activeNodes[nodeId];
        allNodes[node.id] = node;
        if(node.type.startsWith('subflow:')) {
          Object.assign(allNodes, instanceNodesForSub(node));
        }
      }
      return allNodes;
    }
    return {};
  }
}
