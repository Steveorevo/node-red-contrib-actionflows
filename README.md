# node-red-contrib-actionflows
ActionFlows brings easy to use loops and OOP (object oriented programming)
features to Node-RED's flow programming paradigm. Three nodes allow you to
create extensible, scoped, looped, and prioritized flows. Utilities include
performance benchmarks with nanosecond precision. Advanced use enables the
ability to group flows into "libraries" using Node-RED's native subflow
capabilities and invocation via JavaScript. You can organize flows for
readability and create extendable design patterns. To understand ActionFlows,
review each section starting with Basics below and each section's examples.

## Basics
The following example of ActionFlows' `action` node does nothing! "Hello
World" is placed in the `msg.payload` and passes through the `action` node and
can be seen in the debug output; but it's use and versatility can be illustrated
with the followup descriptions.

![Action Node Basics](/actionflows/demo/basic.png?raw=true "The Action Node")

ActionFlows' initial purpose was to allow for "after market" flow extendability.
Complex flows can be customized without modifying the original author's flow.
This technique can also be used to organize your existing flows for readability,
but links and subflows maybe better suited for that single purpose. ActionFlows
provide additional key functionality (described later in this document):

* "Late binding"; extend complex flows without modifying the original flow
* Looping; call flow segments repeatedly with conditional iteration
* Create OOP-like "classes" (subflows) with public/private flows
* Prioritize flows; allow for OOP-like overrides & inheritance
* Flow scopes; private, protected, and global flows

Simply include the `action` flow inline at specific points where you would like
to enable vendor customization. Like Node-RED's native subflows, a description
field allows you to create optional API (application programming interface)
documentation. The `action` node works like a subflow, allowing you to define a
reusable flow segment between the nodes `action in` and `action out`. Flow
execution resumes like Node-RED's native `links` node with "virtual wires" at
the `action in` node and returns to the calling `action` node after encountering
the `action out` node.

![Action In/Out Basics](/actionflows/demo/basic2.png?raw=true "The Action In and Action Out Nodes")

Unlike the `links` node, the `action` node invokes the `action in` node by a
prefix naming schema; allowing for multiple add-on flow segments to be appended
to the original flow. An `action` node's name determines the name of the
corresponding `action in` node that will be activated. Use the `action` node's
name as a prefix for all subsequent `action in` nodes that you wish to be
callable by the `action` node. For instance, an `action` node named "Sample",
will call any `action in` nodes with names like "Sample in", "Sample-in",
"Sample_Exercise", or "sample.acme.com".

```
A prefix is an existing `action` node's name followed by
a space, hyphen, underscore, or a period.
```

If present, ActionFlows will invoke *multiple* matching prefix named nodes
sequentially. By default, the sequence order is by creation order but can be
changed using the `action in` node's Priority property.

![ActionFlows Sequence](/actionflows/demo/basic3.png?raw=true "Sequential Flow Segments")

In the example above:

1) The `action` node is encountered with `msg.payload` containing "Hello World".
2) The `action in` node (named "action in") is called, changing "World" into "World, and Solar System!".
3) The `action in` node (named "action 2") is called after the last `action out` node and "World" is replaced with "Mars".

The versatility of ActionFlows allows the adding of additional flow sequences
after the original flow has been authored. The `action in` node's flow segments
can be created or imported dynamically (such as with the `flowman` node). Flows
can be defined on other tabs or within subflows (see the "Libraries and Scope"
section below) or restricted to the same tab or subflow where the calling
`action` node has been defined.

Flow sequence order can also be changed by the `action in` node's settings (see
the "Priorities" section).

[Download the Basic example flow here.](/actionflows/demo/basic.json)

### Benchmarks and Debugging

Benchmarks in the `action` node allow you to see how long all `action in` flow
sequences take to execute. Use the checkbox labelled "Debug action cycle
execution time" to see debug output indicating how long it took to run all of
the corresponding `action in/out` flow segments before returning to the calling
action.

![ActionFlows Benchmarks](/actionflows/demo/bench2.jpg?raw=true "Debug Execution Time")

> Note: Benchmarks report how long it takes to run all matching `action in/out`
> flows for one given iteration. Loops return to the `action` node before
> repeating and may generate multiple debug outputs.

Use the "Debug invocation sequence" checkbox to reveal the name of each
`action in` that is called, it's sequence order, and node id in the debug tab.

### Priorities
Priorities allow you to define ActionFlows that take precedence over other
ActionFlows. Inspired by [WordPress' core actions and filters API](https://codex.wordpress.org/Plugin_API#Hooks:_Actions_and_Filters),
Priorities are at the heart of manageable extendability. In our Basic example
sequence we see that two `action in/out` flow segments have been defined; each
changing the "Hello World" in `msg.payload` to eventually become "Hello Mars,
and Solar System!". However, if we simply change the `action in/out` flow
sequences, we end up with "Hello Mars" in the `msg.payload`.

![ActionFlows Priorities](/actionflows/demo/priority2.png?raw=true "Flow Priorities")

Here we modify the node "action in" and "action 2" to execute in the reverse
order thus changing the debug output message. Open the settings for the nodes
and change the Priority for "action 2" to 45 and leave "action in" with Priority
50 (the default). Now when the `action` node is encountered, it will seek out
the `action in/out` flows and run them in a different sequence; the lower the
Priority number the earlier the flow order will be executed. Two flows with the
same Priority number will execute sequentially starting with whichever flow was
defined first.

Priority numbers can vary between 1 to 99. The lower the number, the earlier a
defined flow segment will execute. I.e. An `action in` node with #1 priority
executes before a #2 priority, etc. It is recommended that you leave the
priority numbers at their default of 50 to allow overrides by other authors
(if need be). Often times, multiple vendors or "plugin" authors may provide
future functionality that are priority dependent. For example, a
localization/translation service plugin may want to change their Priority
for their `action in/out` flow to 95 to ensure that their flow sequence runs
last. Thereby ensuring that they have all messages at hand that might need to
be translated from one spoken language to another; even if other plugin authors
include their `action in/out` flows leveraging the same `action` node.

### Nesting
ActionFlows can be nested whereby a flow segment can include an `action` node
that in turn, invokes additional `action in/out` flow segments. One way to trace
an ActionFlows' sequence is to use the "Debug invocation sequence" checkbox or,
(as illustrated below) by using the `delay` node. Be sure to set the delay
to above 2 seconds to see the blue dot appear in the `action in/out` flow path
and for the green dot and "running" indicator under the active `action` node.
Please see the animated gif below.

![ActionFlows Nesting](/actionflows/demo/nested.gif?raw=true "ActionFlows Nesting")

In this simple animation, the main `action` node calls two defined flows; one
`action in/out` node called "action in" and another called "action in 2". The
"action in 2" flow contains an `action` node called "nested" that invokes the
`action in/out` node named "nested in". The first action node waits until all
other flows and nested flows complete their sequence. Watch the end of the
animation above to view an overlay showing the complete flow path.

[Download the Nesting example flow here.](/actionflows/demo/nested.json)

## Loops
The `action` node allows execution of `action in/out` node segments based on a
conditional loop. The default loop mode for an `action` node is "none" for no
looping. Use the Looping drop down combobox to select the loop type.

![ActionFlows Looping](/actionflows/demo/loop2.jpg?raw=true "ActionFlows Looping")

> Note: The `action` node icon will change from a lightening bolt
> to a circular arrow to indicate the `action` is in loop mode.

In our example below, we will select the option "Increment from zero". This
option is followed by the variable we'd like to use in our conditional loop.
The "...from zero" ensures that the variable will be initialized to contain the
numeric value 0 when the `action` node is first encountered in the given flow.
The variable will be incremented by a numeric 1 each time all corresponding
`action in/out` nodes have completed. An initial check of the condition occurs
before each iteration. In this case, we will check if the variable `msg.loop` is
greater than 2; causing the loop to iterate three times (0, 1, 2).

![ActionFlows Increment from zero](/actionflows/demo/loop.png?raw=true "ActionFlows Increment from zero")

The `msg.loop` variable is accessible to our `change` node allowing us to inject
it into a string and output the count to the debug window. When the flow is run,
the debug window should show three separate outputs; "Testing 0", "Testing 1",
and "Testing 2" before execution of the flow is stopped.

[Download the Loops example flow here.](/actionflows/demo/loop.json)

### Looping Modes
The Looping options in the drop down combobox are defined as follows:

#### None
No Looping. The `action` node will seek out any defined `action in` nodes and
will call them sequentially, one time only.

#### Watch
Watch the given variable and compare it using the set logic operator with the
comparison variable/value; sequentially invoke each of the defined `action in`
nodes until the set logic operator evaluates to true. Note: the variable should
already exist prior to encountering this node. The logic condition is checked
before the first loop iteration.

#### Decrement
Decrement the given variable after each loop iteration. Note: the variable should
already exist prior to encountering this node. The logic condition is checked
before the first loop iteration, followed by calling each defined `action in`
flow. The decrement operation occurs after all defined `action in` flows have
completed.

#### Increment
Increment the given variable after each loop iteration. Note: the variable should
already exist prior to encountering this node. The logic condition is checked
before the first loop iteration, followed by calling each defined `action in`
flow. The increment operation occurs after all defined `action in` flows have
completed.

#### Increment From Zero
When a flow initially invokes the `action` node, the given variable will be
reset to zero. If the variable does not exist, it will be created. The logic
condition is checked before the first loop iteration, followed by calling each
defined `action in` flow. The increment operation occurs after all defined
`action in` flows have completed. The looping will continue until the logic
condition evaluates to a logical true.

### Until Conditional Logic Operator
The loop mode will continue until the given conditional logic operator evaluates
to a logical true. The Until options in the drop down combobox are defined as
follows:

#### == (equals)
Checks if the given variable is equal to the comparison variable or value.

#### != (not equals)
Checks if the given variable is not equal to the comparison variable or value.

#### < (less than)
Checks if the given variable is less than the comparison variable or value.
Note: the given variable and comparison variable/value should contain numeric
values.

#### <= (less than or equal to)
Checks if the given variable is less than or equal to the comparison variable
or value. Note: the given variable and comparison variable/value should contain
numeric values.

#### > (greater than)
Checks if the given variable is greater than the comparison variable or value.
Note: the given variable and comparison variable/value should contain numeric
values.

#### >= (greater than or equal to)
Checks if the given variable is greater than or equal to the comparison variable
or value. Note: the given variable and comparison variable/value should contain
numeric values.

#### contains
Checks if the given variable contains the value in the comparison variable/value.
Note: the given variable and comparison variable/value should contain string
data.

#### not contains
Checks if the given variable does not contain the value in the comparison
variable/value. Note: the given variable and comparison variable/value should
contain string data.


## Libraries and Scope
Scope provides functionality for flows that are more commonly found in OOP
(object oriented programming) environments. Using scopes with ActionFlows allows
you to build reusable flow libraries that may act as a base for other flows.
Regardless of the scope setting, `action` nodes will invoke all matching
`action in` flows that are on the same "z plane" (same tab or within the same
subflow). However, there are many benefits to using the different scope modes
and in different combinations. Here are the three main levels of scope which
define ActionFlows' behaviors:

#### global
The "global" scope is the default mode. The "global" setting allows you to use
ActionFlows across multiple tabs or within different subflows. An `action` node
will invoke any `action in` flow segment across the system, regardless of where
they are defined (within subflows or other tabs). Flows will be invoked if the
`action in` node's name begins with the name of the corresponding `action` node.
Use the global scope to allow other developers to extend a flow on their own tab
or without having to modify an existing flow no matter where it is located
(i.e. deep within a subflows). Placing a group of global ActionFlows within a
subflow is an easy way to distribute modular behaviors or add vendor specific
functionality.

#### protected
Using the "protected" scope setting for ActionFlows allows you to group
functionality while avoiding conflicts with common names that could occur with
global scope. Unlike global scope, protected scope restricts `action` and
corresponding `action in` nodes to the same tab. Furthermore, protected scope
places restrictions on accessing ActionFlows within a subflow; you may still
access them but must first declare a prefix that is the subflow's name. This
allows you to work with multiple subflows as **object instances** in a similar
fashion that OOP developers use classes and objects with public or private
methods.


![ActionFlows Scope: Protected](/actionflows/demo/protected.jpg?raw=true "ActionFlows Scope: Protected")

ActionFlows can address other ActionFlows within subflows using an explicit
prefix to identify the subflow location of other ActionFlows nodes. The prefix
is the name of the subflow where the corresponding `action` or `action in` node
exists. In the screenshot above we have two examples:

**An example of an `action` node calling a flow segment defined outside the subflow.**
  1a) The subflow is defined on the tab with the name "acme", it is invoked with
an injector supplying the string "Hello".
  1b) The injector activates the subflow's `action` node named "action".
  1c) The flow segment outside the subflow is found by the name `acme.action`
because the `action in` node's name starts with the subflow name and the
`action` node's name within it "action".

The flow segment contains a change node that alters the "Hello" and changes it
to "Hi".


**An example of a flow segment defined inside a subflow and accessed from outside.**
  2a) The `action` node named "acme.sample in" finds the defined flow segment
inside the subflow named "acme".
  2b) Within the "acme" subflow is the `action in` node named "sample in".

The flow segment has a change node that changes the injector's "Hello"
string to "Good bye".

[Download the Protected Scope example flow here.](/actionflows/demo/protected.json)

The following namespace-like rules apply to using ActionFlows with "protected"
scope inside of subflows:

* Both `action` and `action in` names must match within a subflow. I.e. an
`action` named "sample" will invoke any `action in` beginning with the name
"sample". The subflow name as a prefix is not necessary from inside the subflow.
* ActionFlows defined outside of the subflow must declare the subflow name as
apart of the prefix. For example, an `action` node named "apple" within
a subflow named "fruits" could invoke an `action in` node at the tab level if
the `action in` node's name begins with the subflow name, i.e. "fruits.apple".
Likewise, sub-subflows (subflows that exist within subflows) would require
additional prefixes to address the innermost node.
* Protected scope nodes can only invoke one another within the same tab.

```
Note: Changing the name of a subflow may require a "Full Deploy" to update
ActionFlows' internal namespace map changes.
```

#### private
Private flows are useful if your actions have a commonly used name and/or you
wish to restrict extendability to within a subflow or tab. Unlike protected
scope, private scope inhibits the ability to invoke or respond to ActionFlows
that are defined outside of the given subflow or tab where the ActionFlows
exists. Using private scope helps avoid naming conflicts but prevents
extensibility.

### Mixed Scope Modes
Note that both `action` and `action in` nodes have a scope setting. For example
within a subflow, a global scope `action` next to private scope `action in` will
have a unique ability; this pattern ensures that the internal private
`action in` is always invoked once within the subflow and only for that subflow
instance. Any other `action in` nodes of the same name elsewhere could also be
called but the internal `action in` can never be invoked from other instances
of the subflow.

### Scope Icons
Scope settings are reflected in the ActionFlows node icons. The icons for
`action in` nodes, `action` nodes (in single or loop mode) will depict a small
"hint" icon in the upper right hand corner to indicate the scope setting.

![Scope Hint Icons](/actionflows/demo/scope-icons.jpg?raw=true "Scope Hint Icons")

## ActionFlows and JavaScript
ActionFlows creates a global object called "actionflows" that you can obtain a
reference to in JavaScript. The object contains a number of data structures and
methods that determine the runtime behavior of ActionFlows. For instance, the
ActionFlows' `action in` nodes can be pragmatically invoked using Node-RED's
native JavaScript function node. To invoke a given `action in` node, you will
need to obtain a reference to the "actionflows" global object. Line 1 in the
screenshot below shows how to get a reference to "actionflows" in the
variable `af`. From there you may use the `af` object's `invoke` method to call
an existing `action in` node (line 2). The `invoke` method expects two
parameters; the first should be a string representing the name that any matching
`action in` node should begin with. The second should be the `msg` object to be
passed into the matching `action in` node.

![JavaScript invoke](/actionflows/demo/invoke.jpg?raw=true "JavaScript Invoke")

In the given screenshot, the JavaScript function node invokes the `action in`
node with the name "action". The flow is executed and appends the string
" World" to the injector node's "Hello" resulting in "Hello World" in the debug
window.

[Download the JavaScript Invoke example flow here.](/actionflows/demo/invoke.json)
*Note: the JavaScript Invoke example requires the [string](https://flows.nodered.org/node/node-red-contrib-string) node.*

The `actionflows` global object contains the following methods and properties of
interest:

### Methods
**invoke** - Invokes any matching `action in` nodes with the name found in the
first parameter. The second parameter should be the `msg` object to be passed
into the flow segment. A promise object is returned with a single incoming
parameter containing the returned `msg` object. Note: the invoke method ignores
scope settings and can be used to invoke any `action in` node by name.

**map** - The map method processes all the found `action` and `action in` nodes
and builds an associative map. This method is called once internally at
deployment and determines the order in which each `action in` node is called
for it's corresponding `action` node. The results are updated in the `actions`
property (see below).

### Properties
**actions** - An object containing the calculated associative map from the `map`
method (defined above) that is used internally by ActionFlows. The map is a list
of enabled `action` node instances with a special `ins` property containing
corresponding, `action in` node instances based on their priority and scope
settings. The map allows ActionFlows to quickly execute sequential flows at
runtime. Editing this list will alter the ActionFlows behavior (use with
caution). The object can be reset by recalling the `map` method or re-deploying
to restore the original design-time flow settings.

**afs** - An object containing all the `action` nodes in the system. This property
is used internally by the `map` method to determine the runtime behavior of
ActionFlows. Altering this list prior to calling the `map` method will
permanently change the runtime behavior of ActionFlows. Alteration is not
recommended as this will disable the ability to reset the behavior until
re-deployment.

**ins** - An object containing all the `action in` nodes in the system. This
property is used internally by the `map` method to determine the runtime
behavior of ActionFlows. Altering this list prior to calling the `map` method
will permanently change the runtime behavior of ActionFlows. Alteration is not
recommended as this will disable the ability to reset the behavior until
re-deployment.

### Reserved Action Names
Currently, ActionFlows has only one reserved `action in` node name:

```
#deployed
```
Any `action in` nodes that start with "#deployed" in their name will be invoked
at deployment. This would be the equivalent of pairing an inject node with the
option for "Inject once at start" set to invoke a flow segment defined by
ActionFlows. The `action in` node named "#deployed" will also contain a
msg.payload object property that references the *parent container* the
`action in` node lives in (i.e. a tab or subflow).

![#deployed Event](/actionflows/demo/deployed.jpg?raw=true "#deployed Event")

This feature can be used to obtain the subflow instance name should you require
a reference to it within your subflow object instance. In addition, the Node-RED
runtime instance's settings are exposed in `msg.settings` allowing your flows to
know the uiPort, settingsFile folder, httpRoot, etc.

[Download the #deployed event example flow here.](/actionflows/demo/deployed.json)

## Installation
Run the following command in your Node-RED user directory (typically ~/.node-red):

    npm install node-red-contrib-actionflows

The ActionFlows' nodes will appear in the palette under the advanced group as
the nodes `action`, `action in`, and `action out`.
