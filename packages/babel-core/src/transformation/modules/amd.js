import DefaultFormatter from "./_default";
import CommonFormatter from "./common";
import includes from "lodash/collection/includes";
import values from "lodash/object/values";
import * as util from  "../../util";
import * as t from "babel-types";

export default class AMDFormatter extends DefaultFormatter {
  setup() {
    CommonFormatter.prototype._setup.call(this, this.hasNonDefaultExports);
  }

  buildDependencyLiterals() {
    let names = [];
    for (let name in this.ids) {
      names.push(t.stringLiteral(name));
    }
    return names;
  }

  /**
   * Wrap the entire body in a `define` wrapper.
   */

  transform(program) {
    CommonFormatter.prototype.transform.apply(this, arguments);

    let body = program.body;

    // build an array of module names

    let names = [t.stringLiteral("exports")];
    if (this.passModuleArg) names.push(t.stringLiteral("module"));
    names = names.concat(this.buildDependencyLiterals());
    names = t.arrayExpression(names);

    // build up define container

    let params = values(this.ids);
    if (this.passModuleArg) params.unshift(t.identifier("module"));
    params.unshift(t.identifier("exports"));

    let container = t.functionExpression(null, params, t.blockStatement(body));

    let defineArgs = [names, container];
    let moduleName = this.getModuleName();
    if (moduleName) defineArgs.unshift(t.stringLiteral(moduleName));

    let call = t.callExpression(t.identifier("define"), defineArgs);

    program.body = [t.expressionStatement(call)];
  }

  /**
   * Get the AMD module name that we'll prepend to the wrapper
   * to define this module
   */

  getModuleName() {
    if (this.file.opts.moduleIds) {
      return DefaultFormatter.prototype.getModuleName.apply(this, arguments);
    } else {
      return null;
    }
  }

  _getExternalReference(node) {
    return this.scope.generateUidIdentifier(node.source.value);
  }

  importDeclaration(node) {
    this.getExternalReference(node);
  }

  importSpecifier(specifier, node, nodes, scope) {
    let key = node.source.value;
    let ref = this.getExternalReference(node);

    if (t.isImportNamespaceSpecifier(specifier) || t.isImportDefaultSpecifier(specifier)) {
      this.defaultIds[key] = specifier.local;
    }

    if (this.isModuleType(node, "absolute")) {
      // absolute module reference
    } else if (this.isModuleType(node, "absoluteDefault")) {
      // prevent unnecessary renaming of dynamic imports
      this.ids[node.source.value] = ref;
      ref = t.memberExpression(ref, t.identifier("default"));
    } else if (t.isImportNamespaceSpecifier(specifier)) {
      // import * as bar from "foo";
    } else if (!includes(this.file.dynamicImported, node) && t.isSpecifierDefault(specifier) && !this.noInteropRequireImport) {
      // import foo from "foo";
      let uid = scope.generateUidIdentifier(specifier.local.name);
      nodes.push(t.variableDeclaration("var", [
        t.variableDeclarator(uid, t.callExpression(this.file.addHelper("interop-require-default"), [ref]))
      ]));
      ref = t.memberExpression(uid, t.identifier("default"));
    } else {
      // import { foo } from "foo";
      let imported = specifier.imported;
      if (t.isSpecifierDefault(specifier)) imported = t.identifier("default");
      ref = t.memberExpression(ref, imported);
    }

    this.remaps.add(scope, specifier.local.name, ref);
  }

  exportSpecifier(specifier, node, nodes) {
    if (this.doDefaultExportInterop(specifier)) {
      this.passModuleArg = true;

      if (specifier.exported !== specifier.local && !node.source) {
        nodes.push(util.template("exports-default-assign", {
          VALUE: specifier.local
        }, true));
        return;
      }
    }

    CommonFormatter.prototype.exportSpecifier.apply(this, arguments);
  }

  exportDeclaration(node, nodes) {
    if (this.doDefaultExportInterop(node)) {
      this.passModuleArg = true;

      let declar = node.declaration;
      let assign = util.template("exports-default-assign", {
        VALUE: this._pushStatement(declar, nodes)
      }, true);

      if (t.isFunctionDeclaration(declar)) {
        // we can hoist this assignment to the top of the file
        assign._blockHoist = 3;
      }

      nodes.push(assign);
      return;
    }

    DefaultFormatter.prototype.exportDeclaration.apply(this, arguments);
  }
}