var modules = {};
var modulesInstances = {};

function require(name) {
  assert (name in modules, "Module " + quote(name) + " is not loaded.");
  var module = modulesInstances[name];
  if (module) {
    return module;
  }
  return modulesInstances[name] = modules[name]();
}