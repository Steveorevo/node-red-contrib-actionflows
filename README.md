# node-red-contrib-actionflows
Provides three nodes that allow you to create extensible, reusable,
looped, and prioritized flows. ActionFlows includes performance benchmarks with
nanosecond precision. Advanced use enables the ability to group flows into
"libraries" by using Node-RED's subflow capabilities. You can organize flows for
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
This technique can also be used to organize your existing flows for readability.
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
will activate any `action in` nodes with names like "Sample in", "Sample-in",
"Sample_Exercise", or "Sample.Acme.com".

```
A prefix is an existing `action` node's name followed by
a space, hyphen, underscore, or a period.
```

If present, ActionFlows will invoke *multiple* matching prefix named nodes
sequentially. By default, the sequence order is by creation order but can be
changed using the `action in` node's Priority property.

![ActionFlow Sequence](/actionflows/demo/basic3.png?raw=true "Sequential Flow Segments")

In the example above:

1) The `action` node is encountered with `msg.payload` containing "Hello World".
2) The `action in` node (named "action in") is called, changing "World" into "World, and Solar System!".
3) The `action in` node (named "action 2") is called after the last `action out` node and "World" is replaced with "Mars".

The versatility of ActionFlows allows the adding of additional flow sequences
after the original flow has been authored. The `action in` node's flow segments
can be created or imported dynamically (such as with the `flowman` node). Flows
can be defined on other tabs or within subflows (see the "Libraries" section
below) or restricted to the same tab or subflow where the calling `action` node
has been defined.

Flow sequence order can also be changed by the `action in` node's settings (see
the "Priorities" section).

[Download the Basic example flow here.](/actionflows/demo/basic.json)

### Benchmarks

Benchmarks in the `action` node allow you to see how long all `action in` flow
sequences take to execute. Use the checkbox labelled "Debug action cycle
execution time?" to see debug output indicating how long it took to run all of
the corresponding `action in/out` flow segments before returning to the calling
action.

![ActionFlow Benchmarks](/actionflows/demo/bench2.png?raw=true "Debug Execution Time")

> Note: Benchmarks report how long it takes to run all matching `action in/out`
> flows for one given iteration. Loops return to the `action` node before
> repeating and may generate multiple debug outputs.

### Priorities
Priorities allow you to define ActionFlows that take precedence over other
ActionFlows. Inspired by [WordPress' core actions and filters API](https://codex.wordpress.org/Plugin_API#Hooks:_Actions_and_Filters), Priorities
are at the heart of manageable extendability. In our Basic example sequence
we see that two `action in/out` flow segments have been defined; each changing
the "Hello World" in `msg.payload` to eventually become "Hello Mars, and Solar
System!". However, if we simply change the `action in/out` flow sequences, we
end up with "Hello Mars" in the `msg.payload`.

![ActionFlow Priorities](/actionflows/demo/priority2.png?raw=true "Flow Priorities")

Here we modify the node "action in" and "action 2" to execute in the reverse
order thus changing the debug output message. Open the settings for the nodes
and change the Priority for "action 2" to 45 and leave `action in` with Priority
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
an ActionFlows' sequence is to use the `delay` node. Be sure to set the delay
to above 2 seconds to see the blue dot appear in the `action in/out` flow path
and for the green dot and "running" indicator under the active `action` node.
Please see the animated gif below.

![ActionFlow Nesting](/actionflows/demo/nested.gif?raw=true "ActionFlow Nesting")

In this simple animation, the main `action` node calls two defined flows; one
`action in/out` node called "action in" and another called "action in 2". The
"action in 2" flow contains an `action` node called "nested" that invokes the
`action in/out` node named "nested in". The first action node waits until all
other flows and nested flows complete their sequence. Watch the end of the
animation above to view an overlay showing the complete flow path.

[Download the Nesting example flow here.](/actionflows/demo/nested.json)

## Loops
The `action` node allows execution of `action in/out` node seqments based on a
conditional loop. Use the Looping drop down combobox to select the loop type.
The default is "none" for no looping. In our example below, we will select the
option "Increment from zero". This option is followed by the variable we'd like
to use in our conditional loop. The "...from zero" ensures that the variable
will be initialized to contain the numeric value 0 when the `action` node is
first encountered in the given flow. The variable will be incremented by a
numeric 1 each time all corresponding `action in/out` nodes have completed. An
initial check of the condition occurs before each iteration. In this case, we
will check if the variable `msg.loop` is greater than 2; causing the loop to
iterate three times (0, 1, 2).

![ActionFlow Loop](/actionflows/demo/loop.png?raw=true "ActionFlow Loop")

The `msg.loop` variable is accessible to our `change` node allowing us to inject
it into a string and output the count to the debug window. When the flow is run,
the debug window should show three separate outputs; "Testing 0", "Testing 1",
and "Testing 2" before execution of the flow is stopped.

> Note: The `action` node icon will change from a lightening bolt
> to a circular arrow to indicate the `action` is in loop mode.

[Download the Loops example flow here.](/actionflows/demo/loop.json)

### None

### Watch

### Decrement

### Increment

### Increment From Zero

## Libraries

### Private actions
Use the private checkbox in the `action` node's settings to restrict calling any
`action in/out` flow sequences to the same tab or within the given subflow.
Uncheck the checkbox to allow invoking flow sequences defined on other tabs, or
subflows.

### Private flows
Use the private flow checkbox to limit this <code>action in</code> node's
flow to `action` nodes calling from within the same tab or within the
same subflow. Uncheck to allow actions to invoke the `action in` node
from other tabs or subflows (where the `action` node's own private
checkbox is unchecked.

## Advanced
Overrides, invalidating segments at runtime, manipulating msg._af and the
global.actionflows object.

## Installation


blah blah blah

 ,  Provides nodes to enable an extendable design pattern for flows. ActionFlows
can streamline the appearance of flows in a similar way that Node-RED's native
subflows work or the link nodes' "virtual wires"; invoking flow segments located
elsewhere. Unlike link nodes or subflows, flows that use the actionflows node do
NOT need to be aware of existing segments or have them pre-defined. Instead,
segments are invoked by a named prefix schema; allowing an arbitrary number of
flow segments to be added or imported later (such as when using flowman or flow
dispatcher) without modifying the original flow. ActionFlows' segments are
invoked sequentially with their order determined by the segment's author (see
priority description below).

## ActionFlow Segments
Action flow segments are defined by using the `action in` and `action out` nodes.
The in/out nodes should have a unique name but must start (have a prefix)
with a name of an existing action node followed by a space, hyphen, or underscore.
For instance the default name `action in` or `action_in` would be invoked when
the `action` node is encountered. The `actionflows`, `action in`, and `action out`
nodes can exist in any combination of multiple different tabs, inside or outside
of subflows.

Inspired by WordPress' core actions and filters API (but faster) that inarguably
enabled one of the world's largest and most prolific plugin communities. This
implementation leverages jump tables and indexed objects to ensure the fastest
execution of flow segments.

## Priority Description
Like WordPress' actions & filters, actionflows allow flow segments to have a
priority property with values of 1 to 100 (with a default of 50; a higher
resolution than WordPress'). The priority property determines earlier or later
execution order of a flow segment (i.e. priority 1 executes before any priority
2s, etc). These features can make flows extendable and allows flows to furnish
an expandable, "plugin-able" API.

## Examples

#### Basic Example


![ActionFlows Basic Example](/actionflows/demo/basic.jpg?raw=true "Basic use")

Description to follow...
* Place the `action` node between nodes in a given flow to make the flow extensible.
* Give the `action` node a unique and short name that describes the action.
* Use the `action in` and `action out` nodes to create a flow segment.
* Name `action in` and `action out` nodes with a prefix that matches an existing action.
* Assign a priority to the `action in` node (1 to 100).


#### Another Example
Description with flow below...

```
[
    {
    }
]
```
## Installation
Run the following command in your Node-RED user directory (typically ~/.node-red):

    npm install node-red-contrib-actionflows

The actionflows' nodes are will appear in the palette under the advanced group as
the nodes `action`, `action in`, and `action out`.
