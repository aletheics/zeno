// Workaround for @earendil-works/pi-coding-agent@0.85.0, which statically
// imports @earendil-works/pi-server (dist/main.js → dist/experimental/server.js)
// but does not declare it in its dependencies, so pnpm's isolated node_modules
// cannot resolve the import. Inject the missing dependency until upstream fixes it.
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === "@earendil-works/pi-coding-agent") {
        pkg.dependencies = pkg.dependencies ?? {};
        pkg.dependencies["@earendil-works/pi-server"] = "^0.85.0";
      }
      return pkg;
    },
  },
};
