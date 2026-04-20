const path = require("path");
const fs = require("fs");
const webpack = require("webpack");
const webExtPackageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "node_modules/web-ext/package.json"), "utf-8")
);

module.exports = {
  mode: "production",
  devtool: "source-map",
  target: "node",
  ignoreWarnings: [
    {
      module: /node_modules[\\/]+@pnpm[\\/]npm-conf[\\/]index\.js/,
      message: /Critical dependency: require function is used in a way in which dependencies cannot be statically extracted/
    },
    {
      module: /node_modules[\\/]any-promise[\\/]register\.js/,
      message: /Critical dependency: the request of a dependency is an expression/
    },
    {
      module: /node_modules[\\/]firefox-profile[\\/]lib[\\/]firefox_profile\.js/,
      message: /Critical dependency: the request of a dependency is an expression/
    },
    {
      module: /node_modules[\\/]import-fresh[\\/]index\.js/,
      message: /Critical dependency: the request of a dependency is an expression/
    },
    {
      module: /node_modules[\\/]keyv[\\/]src[\\/]index\.js/,
      message: /Critical dependency: the request of a dependency is an expression/
    },
    {
      module: /node_modules[\\/]addons-linter[\\/]node_modules[\\/]eslint[\\/]lib[\\/]cli-engine[\\/]cli-engine\.js/,
      message: /Critical dependency: the request of a dependency is an expression/
    },
    {
      module: /node_modules[\\/]addons-linter[\\/]node_modules[\\/]eslint[\\/]lib[\\/]cli-engine[\\/]load-rules\.js/,
      message: /Critical dependency: the request of a dependency is an expression/
    },
    {
      module: /node_modules[\\/]addons-linter[\\/]node_modules[\\/]eslint[\\/]lib[\\/]config[\\/]config-loader\.js/,
      message: /Critical dependency: the request of a dependency is an expression/
    },
    {
      module: /node_modules[\\/]addons-linter[\\/]node_modules[\\/]eslint[\\/]lib[\\/]eslint[\\/]eslint-helpers\.js/,
      message: /Critical dependency: the request of a dependency is an expression/
    },
    {
      module: /node_modules[\\/]addons-linter[\\/]node_modules[\\/]eslint[\\/]lib[\\/]eslint[\\/]eslint\.js/,
      message: /Critical dependency: the request of a dependency is an expression/
    },
    {
      module: /node_modules[\\/]addons-linter[\\/]node_modules[\\/]eslint[\\/]lib[\\/]linter[\\/]rules\.js/,
      message: /Critical dependency: the request of a dependency is an expression/
    },
    {
      module: /node_modules[\\/]yargs-parser[\\/]build[\\/]index\.cjs/,
      message: /Critical dependency: the request of a dependency is an expression/
    },
    {
      module: /node_modules[\\/]yargs[\\/]build[\\/]index\.cjs/,
      message: /Critical dependency: the request of a dependency is an expression/
    },
    {
      module: /node_modules[\\/]yargs[\\/]build[\\/]index\.cjs/,
      message: /Critical dependency: require function is used in a way in which dependencies cannot be statically extracted/
    },
    {
      module: /node_modules[\\/]yargs[\\/]index\.cjs/,
      message: /Critical dependency: require function is used in a way in which dependencies cannot be statically extracted/
    }
  ],
  entry: "./src/index.js",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "index.cjs",
    library: {
      type: "commonjs2"
    },
    clean: true
  },
  externalsPresets: {
    node: true
  },
  experiments: {
    outputModule: false
  },
  resolve: {
    alias: {
      "git-rev-sync": false,
      "jiti": false,
      "jiti/package.json": false,
      esquery$: require.resolve("esquery/dist/esquery.js"),
      "try-thread-sleep": false,
      vertx: false
    }
  },
  plugins: [
    new webpack.optimize.LimitChunkCountPlugin({
      maxChunks: 1
    }),
    {
      apply(compiler) {
        compiler.hooks.thisCompilation.tap("EmitPackageJsonPlugin", (compilation) => {
          compilation.hooks.processAssets.tap(
            {
              name: "EmitPackageJsonPlugin",
              stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL
            },
            () => {
              const contents = JSON.stringify({ version: webExtPackageJson.version }, null, 2) + "\n";
              compilation.emitAsset(
                "package.json",
                new webpack.sources.RawSource(contents)
              );
            }
          );
        });
      }
    }
  ]
};
