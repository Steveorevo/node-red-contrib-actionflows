module.exports = function(RED) {
  RED.nodes.registerType("actionflows", actionflows);
  function actionflows(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    node.warn(getActionFlows());
    this.on('input', function(msg) {
      //
      // TODO: search for any actionflows_in with name prefixes that match ours
      // and send the message along the way to them.
      //
			node.send(msg);
		});
  }
  RED.nodes.registerType("actionflows_in", actionflows_in);
  function actionflows_in(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    //cacheActionFlowsIn = getActionFlowsIn();
    // var globalContext = node.context().global;
  }
  RED.nodes.registerType("actionflows_out", actionflows_out);
  function actionflows_out(config) {
    RED.nodes.createNode(this, config);
    var node = this;
    this.on('input', function(msg) {
      //
      // TODO: search for any actionflows_in with name prefixes that match ours
      // and send the message along the way to them.
      //
			node.send(msg);
		});

  }

  /**
   * getActionFlows returns all actionflows nodes
   */
  function getActionFlows() {
    var RED2 = require.main.require('node-red');
    var flows = RED2.nodes.getFlows().flows;
    var afInIDs = [];
    flows.forEach(function(f) {
      if (f.type.substring(0, 11) == 'actionflows') {
        afInIDs.push(f);
      }
    });
    // TODO: sort by types and priority to allow optimized, early exits
    return afInIDs;
  }

}
