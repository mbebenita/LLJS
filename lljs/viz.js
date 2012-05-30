function writeGraphViz(writer, root, idFn, succFn, predFn, nameFn, otherFn) {
  var active = {};
  var visited = {};
  var order = [];
  
  function next(node) {
    if (visited[idFn(node)]) {
      return;
    } else {
      visited[idFn(node)] = true;
      order.push(node);
      succFn(node).forEach(function (succ) {
        next(succ);
      });
    }
  }
  
  next(root);
  writer.enter("digraph G {");
  writer.writeLn("node [shape=box, fontname=Consolas, fontsize=11, colorscheme=spectral11, style=filled];");
  
  order.forEach(function (node) {
    var color = otherFn && otherFn.color ? ", fillcolor=" + otherFn.color(node) : "";
    writer.writeLn("block_" + idFn(node) + " [label=\"" + nameFn(node) + "\"" + color + "];");
  });
  
  order.forEach(function (node) {
    succFn(node).forEach(function (succ) {
      writer.writeLn("block_" + idFn(node) + " -> " + "block_" + idFn(succ) + ";");
    });
  });
  
  writer.leave("}");
}