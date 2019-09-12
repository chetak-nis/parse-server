"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _Options = require("./Options");

var _defaults = _interopRequireDefault(require("./defaults"));

var logging = _interopRequireWildcard(require("./logger"));

var _Config = _interopRequireDefault(require("./Config"));

var _PromiseRouter = _interopRequireDefault(require("./PromiseRouter"));

var _requiredParameter = _interopRequireDefault(require("./requiredParameter"));

var _AnalyticsRouter = require("./Routers/AnalyticsRouter");

var _ClassesRouter = require("./Routers/ClassesRouter");

var _FeaturesRouter = require("./Routers/FeaturesRouter");

var _FilesRouter = require("./Routers/FilesRouter");

var _FunctionsRouter = require("./Routers/FunctionsRouter");

var _GlobalConfigRouter = require("./Routers/GlobalConfigRouter");

var _HooksRouter = require("./Routers/HooksRouter");

var _IAPValidationRouter = require("./Routers/IAPValidationRouter");

var _InstallationsRouter = require("./Routers/InstallationsRouter");

var _LogsRouter = require("./Routers/LogsRouter");

var _ParseLiveQueryServer = require("./LiveQuery/ParseLiveQueryServer");

var _PublicAPIRouter = require("./Routers/PublicAPIRouter");

var _PushRouter = require("./Routers/PushRouter");

var _CloudCodeRouter = require("./Routers/CloudCodeRouter");

var _RolesRouter = require("./Routers/RolesRouter");

var _SchemasRouter = require("./Routers/SchemasRouter");

var _AdminSessionsRouter = require("./Routers/AdminSessionsRouter");

var _AdminUsersRouter = require("./Routers/AdminUsersRouter");

var _SessionsRouter = require("./Routers/SessionsRouter");

var _UsersRouter = require("./Routers/UsersRouter");

var _PurgeRouter = require("./Routers/PurgeRouter");

var _AudiencesRouter = require("./Routers/AudiencesRouter");

var _AggregateRouter = require("./Routers/AggregateRouter");

var _ParseServerRESTController = require("./ParseServerRESTController");

var controllers = _interopRequireWildcard(require("./Controllers"));

var _ParseGraphQLServer = require("./GraphQL/ParseGraphQLServer");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// ParseServer - open-source compatible API Server for Parse apps
var batch = require('./batch'),
    bodyParser = require('body-parser'),
    express = require('express'),
    middlewares = require('./middlewares'),
    Parse = require('parse/node').Parse,
    path = require('path');

// Mutate the Parse object to add the Cloud Code handlers
addParseCloud(); // ParseServer works like a constructor of an express app.
// The args that we understand are:
// "analyticsAdapter": an adapter class for analytics
// "filesAdapter": a class like GridFSBucketAdapter providing create, get,
//                 and delete
// "loggerAdapter": a class like WinstonLoggerAdapter providing info, error,
//                 and query
// "jsonLogs": log as structured JSON objects
// "databaseURI": a uri like mongodb://localhost:27017/dbname to tell us
//          what database this Parse API connects to.
// "cloud": relative location to cloud code to require, or a function
//          that is given an instance of Parse as a parameter.  Use this instance of Parse
//          to register your cloud code hooks and functions.
// "appId": the application id to host
// "masterKey": the master key for requests to this app
// "collectionPrefix": optional prefix for database collection names
// "fileKey": optional key from Parse dashboard for supporting older files
//            hosted by Parse
// "clientKey": optional key from Parse dashboard
// "dotNetKey": optional key from Parse dashboard
// "restAPIKey": optional key from Parse dashboard
// "webhookKey": optional key from Parse dashboard
// "javascriptKey": optional key from Parse dashboard
// "push": optional key from configure push
// "sessionLength": optional length in seconds for how long Sessions should be valid for
// "maxLimit": optional upper bound for what can be specified for the 'limit' parameter on queries

class ParseServer {
  /**
   * @constructor
   * @param {ParseServerOptions} options the parse server initialization options
   */
  constructor(options) {
    /*if(!process.env.USER_SERVICE)
    {
      UsersRouter = AdminUsersRouter;
      SessionsRouter = AdminSessionsRouter;
    }*/
    injectDefaults(options);
    const {
      appId = (0, _requiredParameter.default)('You must provide an appId!'),
      masterKey = (0, _requiredParameter.default)('You must provide a masterKey!'),
      cloud,
      javascriptKey,
      serverURL = (0, _requiredParameter.default)('You must provide a serverURL!'),
      serverStartComplete
    } = options; // Initialize the node client SDK automatically

    Parse.initialize(appId, javascriptKey || 'unused', masterKey);
    Parse.serverURL = serverURL;
    const allControllers = controllers.getControllers(options);
    const {
      loggerController,
      databaseController,
      hooksController
    } = allControllers;
    this.config = _Config.default.put(Object.assign({}, options, allControllers));
    logging.setLogger(loggerController);
    const dbInitPromise = databaseController.performInitialization();
    const hooksLoadPromise = hooksController.load(); // Note: Tests will start to fail if any validation happens after this is called.

    Promise.all([dbInitPromise, hooksLoadPromise]).then(() => {
      if (serverStartComplete) {
        serverStartComplete();
      }
    }).catch(error => {
      if (serverStartComplete) {
        serverStartComplete(error);
      } else {
        // eslint-disable-next-line no-console
        console.error(error);
        process.exit(1);
      }
    });

    if (cloud) {
      addParseCloud();

      if (typeof cloud === 'function') {
        cloud(Parse);
      } else if (typeof cloud === 'string') {
        require(path.resolve(process.cwd(), cloud));
      } else {
        throw "argument 'cloud' must either be a string or a function";
      }
    }
  }

  get app() {
    if (!this._app) {
      this._app = ParseServer.app(this.config);
    }

    return this._app;
  }

  handleShutdown() {
    const {
      adapter
    } = this.config.databaseController;

    if (adapter && typeof adapter.handleShutdown === 'function') {
      adapter.handleShutdown();
    }
  }
  /**
   * @static
   * Create an express app for the parse server
   * @param {Object} options let you specify the maxUploadSize when creating the express app  */


  static app({
    maxUploadSize = '20mb',
    appId,
    directAccess
  }) {
    // This app serves the Parse API directly.
    // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.
    var api = express(); //api.use("/apps", express.static(__dirname + "/public"));

    api.use(middlewares.allowCrossDomain); // File handling needs to be before default middlewares are applied

    api.use('/', new _FilesRouter.FilesRouter().expressRouter({
      maxUploadSize: maxUploadSize
    }));
    api.use('/health', function (req, res) {
      res.json({
        status: 'ok'
      });
    });
    api.use('/', bodyParser.urlencoded({
      extended: false
    }), new _PublicAPIRouter.PublicAPIRouter().expressRouter());
    api.use(bodyParser.json({
      type: '*/*',
      limit: maxUploadSize
    }));
    api.use(middlewares.allowMethodOverride);
    api.use(middlewares.handleParseHeaders);
    const appRouter = ParseServer.promiseRouter({
      appId
    });
    api.use(appRouter.expressRouter());
    api.use(middlewares.handleParseErrors); // run the following when not testing

    if (!process.env.TESTING) {
      //This causes tests to spew some useless warnings, so disable in test

      /* istanbul ignore next */
      process.on('uncaughtException', err => {
        if (err.code === 'EADDRINUSE') {
          // user-friendly message for this common error
          process.stderr.write(`Unable to listen on port ${err.port}. The port is already in use.`);
          process.exit(0);
        } else {
          throw err;
        }
      }); // verify the server url after a 'mount' event is received

      /* istanbul ignore next */

      api.on('mount', function () {
        ParseServer.verifyServerUrl();
      });
    }

    if (process.env.PARSE_SERVER_ENABLE_EXPERIMENTAL_DIRECT_ACCESS === '1' || directAccess) {
      Parse.CoreManager.setRESTController((0, _ParseServerRESTController.ParseServerRESTController)(appId, appRouter));
    }

    return api;
  }

  static promiseRouter({
    appId
  }) {
    const routers = [new _ClassesRouter.ClassesRouter(), new _UsersRouter.UsersRouter(), new _SessionsRouter.SessionsRouter(), new _RolesRouter.RolesRouter(), new _AnalyticsRouter.AnalyticsRouter(), new _InstallationsRouter.InstallationsRouter(), new _FunctionsRouter.FunctionsRouter(), new _SchemasRouter.SchemasRouter(), new _PushRouter.PushRouter(), new _LogsRouter.LogsRouter(), new _IAPValidationRouter.IAPValidationRouter(), new _FeaturesRouter.FeaturesRouter(), new _GlobalConfigRouter.GlobalConfigRouter(), new _PurgeRouter.PurgeRouter(), new _HooksRouter.HooksRouter(), new _CloudCodeRouter.CloudCodeRouter(), new _AudiencesRouter.AudiencesRouter(), new _AggregateRouter.AggregateRouter()];
    const routes = routers.reduce((memo, router) => {
      return memo.concat(router.routes);
    }, []);
    const appRouter = new _PromiseRouter.default(routes, appId);
    batch.mountOnto(appRouter);
    return appRouter;
  }
  /**
   * starts the parse server's express app
   * @param {ParseServerOptions} options to use to start the server
   * @param {Function} callback called when the server has started
   * @returns {ParseServer} the parse server instance
   */


  start(options, callback) {
    const app = express();

    if (options.middleware) {
      let middleware;

      if (typeof options.middleware == 'string') {
        middleware = require(path.resolve(process.cwd(), options.middleware));
      } else {
        middleware = options.middleware; // use as-is let express fail
      }

      app.use(middleware);
    }

    app.use(options.mountPath, this.app);

    if (options.mountGraphQL === true || options.mountPlayground === true) {
      const parseGraphQLServer = new _ParseGraphQLServer.ParseGraphQLServer(this, {
        graphQLPath: options.graphQLPath,
        playgroundPath: options.playgroundPath
      });

      if (options.mountGraphQL) {
        parseGraphQLServer.applyGraphQL(app);
      }

      if (options.mountPlayground) {
        parseGraphQLServer.applyPlayground(app);
      }
    }

    const server = app.listen(options.port, options.host, callback);
    this.server = server;

    if (options.startLiveQueryServer || options.liveQueryServerOptions) {
      this.liveQueryServer = ParseServer.createLiveQueryServer(server, options.liveQueryServerOptions);
    }
    /* istanbul ignore next */


    if (!process.env.TESTING) {
      configureListeners(this);
    }

    this.expressApp = app;
    return this;
  }
  /**
   * Creates a new ParseServer and starts it.
   * @param {ParseServerOptions} options used to start the server
   * @param {Function} callback called when the server has started
   * @returns {ParseServer} the parse server instance
   */


  static start(options, callback) {
    const parseServer = new ParseServer(options);
    return parseServer.start(options, callback);
  }
  /**
   * Helper method to create a liveQuery server
   * @static
   * @param {Server} httpServer an optional http server to pass
   * @param {LiveQueryServerOptions} config options fot he liveQueryServer
   * @returns {ParseLiveQueryServer} the live query server instance
   */


  static createLiveQueryServer(httpServer, config) {
    if (!httpServer || config && config.port) {
      var app = express();
      httpServer = require('http').createServer(app);
      httpServer.listen(config.port);
    }

    return new _ParseLiveQueryServer.ParseLiveQueryServer(httpServer, config);
  }

  static verifyServerUrl(callback) {
    // perform a health check on the serverURL value
    if (Parse.serverURL) {
      const request = require('./request');

      request({
        url: Parse.serverURL.replace(/\/$/, '') + '/health'
      }).catch(response => response).then(response => {
        const json = response.data || null;

        if (response.status !== 200 || !json || json && json.status !== 'ok') {
          /* eslint-disable no-console */
          console.warn(`\nWARNING, Unable to connect to '${Parse.serverURL}'.` + ` Cloud code and push notifications may be unavailable!\n`);
          /* eslint-enable no-console */

          if (callback) {
            callback(false);
          }
        } else {
          if (callback) {
            callback(true);
          }
        }
      });
    }
  }

}

function addParseCloud() {
  const ParseCloud = require('./cloud-code/Parse.Cloud');

  Object.assign(Parse.Cloud, ParseCloud);
  global.Parse = Parse;
}

function injectDefaults(options) {
  Object.keys(_defaults.default).forEach(key => {
    if (!options.hasOwnProperty(key)) {
      options[key] = _defaults.default[key];
    }
  });

  if (!options.hasOwnProperty('serverURL')) {
    options.serverURL = `http://localhost:${options.port}${options.mountPath}`;
  } // Backwards compatibility


  if (options.userSensitiveFields) {
    /* eslint-disable no-console */
    !process.env.TESTING && console.warn(`\nDEPRECATED: userSensitiveFields has been replaced by protectedFields allowing the ability to protect fields in all classes with CLP. \n`);
    /* eslint-enable no-console */

    const userSensitiveFields = Array.from(new Set([...(_defaults.default.userSensitiveFields || []), ...(options.userSensitiveFields || [])])); // If the options.protectedFields is unset,
    // it'll be assigned the default above.
    // Here, protect against the case where protectedFields
    // is set, but doesn't have _User.

    if (!('_User' in options.protectedFields)) {
      options.protectedFields = Object.assign({
        _User: []
      }, options.protectedFields);
    }

    options.protectedFields['_User']['*'] = Array.from(new Set([...(options.protectedFields['_User']['*'] || []), ...userSensitiveFields]));
  } // Merge protectedFields options with defaults.


  Object.keys(_defaults.default.protectedFields).forEach(c => {
    const cur = options.protectedFields[c];

    if (!cur) {
      options.protectedFields[c] = _defaults.default.protectedFields[c];
    } else {
      Object.keys(_defaults.default.protectedFields[c]).forEach(r => {
        const unq = new Set([...(options.protectedFields[c][r] || []), ..._defaults.default.protectedFields[c][r]]);
        options.protectedFields[c][r] = Array.from(unq);
      });
    }
  });
  options.masterKeyIps = Array.from(new Set(options.masterKeyIps.concat(_defaults.default.masterKeyIps, options.masterKeyIps)));
} // Those can't be tested as it requires a subprocess

/* istanbul ignore next */


function configureListeners(parseServer) {
  const server = parseServer.server;
  const sockets = {};
  /* Currently, express doesn't shut down immediately after receiving SIGINT/SIGTERM if it has client connections that haven't timed out. (This is a known issue with node - https://github.com/nodejs/node/issues/2642)
    This function, along with `destroyAliveConnections()`, intend to fix this behavior such that parse server will close all open connections and initiate the shutdown process as soon as it receives a SIGINT/SIGTERM signal. */

  server.on('connection', socket => {
    const socketId = socket.remoteAddress + ':' + socket.remotePort;
    sockets[socketId] = socket;
    socket.on('close', () => {
      delete sockets[socketId];
    });
  });

  const destroyAliveConnections = function () {
    for (const socketId in sockets) {
      try {
        sockets[socketId].destroy();
      } catch (e) {
        /* */
      }
    }
  };

  const handleShutdown = function () {
    process.stdout.write('Termination signal received. Shutting down.');
    destroyAliveConnections();
    server.close();
    parseServer.handleShutdown();
  };

  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}

var _default = ParseServer;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9QYXJzZVNlcnZlci5qcyJdLCJuYW1lcyI6WyJiYXRjaCIsInJlcXVpcmUiLCJib2R5UGFyc2VyIiwiZXhwcmVzcyIsIm1pZGRsZXdhcmVzIiwiUGFyc2UiLCJwYXRoIiwiYWRkUGFyc2VDbG91ZCIsIlBhcnNlU2VydmVyIiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwiaW5qZWN0RGVmYXVsdHMiLCJhcHBJZCIsIm1hc3RlcktleSIsImNsb3VkIiwiamF2YXNjcmlwdEtleSIsInNlcnZlclVSTCIsInNlcnZlclN0YXJ0Q29tcGxldGUiLCJpbml0aWFsaXplIiwiYWxsQ29udHJvbGxlcnMiLCJjb250cm9sbGVycyIsImdldENvbnRyb2xsZXJzIiwibG9nZ2VyQ29udHJvbGxlciIsImRhdGFiYXNlQ29udHJvbGxlciIsImhvb2tzQ29udHJvbGxlciIsImNvbmZpZyIsIkNvbmZpZyIsInB1dCIsIk9iamVjdCIsImFzc2lnbiIsImxvZ2dpbmciLCJzZXRMb2dnZXIiLCJkYkluaXRQcm9taXNlIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiaG9va3NMb2FkUHJvbWlzZSIsImxvYWQiLCJQcm9taXNlIiwiYWxsIiwidGhlbiIsImNhdGNoIiwiZXJyb3IiLCJjb25zb2xlIiwicHJvY2VzcyIsImV4aXQiLCJyZXNvbHZlIiwiY3dkIiwiYXBwIiwiX2FwcCIsImhhbmRsZVNodXRkb3duIiwiYWRhcHRlciIsIm1heFVwbG9hZFNpemUiLCJkaXJlY3RBY2Nlc3MiLCJhcGkiLCJ1c2UiLCJhbGxvd0Nyb3NzRG9tYWluIiwiRmlsZXNSb3V0ZXIiLCJleHByZXNzUm91dGVyIiwicmVxIiwicmVzIiwianNvbiIsInN0YXR1cyIsInVybGVuY29kZWQiLCJleHRlbmRlZCIsIlB1YmxpY0FQSVJvdXRlciIsInR5cGUiLCJsaW1pdCIsImFsbG93TWV0aG9kT3ZlcnJpZGUiLCJoYW5kbGVQYXJzZUhlYWRlcnMiLCJhcHBSb3V0ZXIiLCJwcm9taXNlUm91dGVyIiwiaGFuZGxlUGFyc2VFcnJvcnMiLCJlbnYiLCJURVNUSU5HIiwib24iLCJlcnIiLCJjb2RlIiwic3RkZXJyIiwid3JpdGUiLCJwb3J0IiwidmVyaWZ5U2VydmVyVXJsIiwiUEFSU0VfU0VSVkVSX0VOQUJMRV9FWFBFUklNRU5UQUxfRElSRUNUX0FDQ0VTUyIsIkNvcmVNYW5hZ2VyIiwic2V0UkVTVENvbnRyb2xsZXIiLCJyb3V0ZXJzIiwiQ2xhc3Nlc1JvdXRlciIsIlVzZXJzUm91dGVyIiwiU2Vzc2lvbnNSb3V0ZXIiLCJSb2xlc1JvdXRlciIsIkFuYWx5dGljc1JvdXRlciIsIkluc3RhbGxhdGlvbnNSb3V0ZXIiLCJGdW5jdGlvbnNSb3V0ZXIiLCJTY2hlbWFzUm91dGVyIiwiUHVzaFJvdXRlciIsIkxvZ3NSb3V0ZXIiLCJJQVBWYWxpZGF0aW9uUm91dGVyIiwiRmVhdHVyZXNSb3V0ZXIiLCJHbG9iYWxDb25maWdSb3V0ZXIiLCJQdXJnZVJvdXRlciIsIkhvb2tzUm91dGVyIiwiQ2xvdWRDb2RlUm91dGVyIiwiQXVkaWVuY2VzUm91dGVyIiwiQWdncmVnYXRlUm91dGVyIiwicm91dGVzIiwicmVkdWNlIiwibWVtbyIsInJvdXRlciIsImNvbmNhdCIsIlByb21pc2VSb3V0ZXIiLCJtb3VudE9udG8iLCJzdGFydCIsImNhbGxiYWNrIiwibWlkZGxld2FyZSIsIm1vdW50UGF0aCIsIm1vdW50R3JhcGhRTCIsIm1vdW50UGxheWdyb3VuZCIsInBhcnNlR3JhcGhRTFNlcnZlciIsIlBhcnNlR3JhcGhRTFNlcnZlciIsImdyYXBoUUxQYXRoIiwicGxheWdyb3VuZFBhdGgiLCJhcHBseUdyYXBoUUwiLCJhcHBseVBsYXlncm91bmQiLCJzZXJ2ZXIiLCJsaXN0ZW4iLCJob3N0Iiwic3RhcnRMaXZlUXVlcnlTZXJ2ZXIiLCJsaXZlUXVlcnlTZXJ2ZXJPcHRpb25zIiwibGl2ZVF1ZXJ5U2VydmVyIiwiY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyIiwiY29uZmlndXJlTGlzdGVuZXJzIiwiZXhwcmVzc0FwcCIsInBhcnNlU2VydmVyIiwiaHR0cFNlcnZlciIsImNyZWF0ZVNlcnZlciIsIlBhcnNlTGl2ZVF1ZXJ5U2VydmVyIiwicmVxdWVzdCIsInVybCIsInJlcGxhY2UiLCJyZXNwb25zZSIsImRhdGEiLCJ3YXJuIiwiUGFyc2VDbG91ZCIsIkNsb3VkIiwiZ2xvYmFsIiwia2V5cyIsImRlZmF1bHRzIiwiZm9yRWFjaCIsImtleSIsImhhc093blByb3BlcnR5IiwidXNlclNlbnNpdGl2ZUZpZWxkcyIsIkFycmF5IiwiZnJvbSIsIlNldCIsInByb3RlY3RlZEZpZWxkcyIsIl9Vc2VyIiwiYyIsImN1ciIsInIiLCJ1bnEiLCJtYXN0ZXJLZXlJcHMiLCJzb2NrZXRzIiwic29ja2V0Iiwic29ja2V0SWQiLCJyZW1vdGVBZGRyZXNzIiwicmVtb3RlUG9ydCIsImRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zIiwiZGVzdHJveSIsImUiLCJzdGRvdXQiLCJjbG9zZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQVNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQXhDQTtBQUVBLElBQUlBLEtBQUssR0FBR0MsT0FBTyxDQUFDLFNBQUQsQ0FBbkI7QUFBQSxJQUNFQyxVQUFVLEdBQUdELE9BQU8sQ0FBQyxhQUFELENBRHRCO0FBQUEsSUFFRUUsT0FBTyxHQUFHRixPQUFPLENBQUMsU0FBRCxDQUZuQjtBQUFBLElBR0VHLFdBQVcsR0FBR0gsT0FBTyxDQUFDLGVBQUQsQ0FIdkI7QUFBQSxJQUlFSSxLQUFLLEdBQUdKLE9BQU8sQ0FBQyxZQUFELENBQVAsQ0FBc0JJLEtBSmhDO0FBQUEsSUFLRUMsSUFBSSxHQUFHTCxPQUFPLENBQUMsTUFBRCxDQUxo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ZTFGLEtBQWYsQ0FBcUIsNkNBQXJCO0FBQ0F1RixJQUFBQSx1QkFBdUI7QUFDdkIzQyxJQUFBQSxNQUFNLENBQUMrQyxLQUFQO0FBQ0F0QyxJQUFBQSxXQUFXLENBQUNsRixjQUFaO0FBQ0QsR0FMRDs7QUFNQU4sRUFBQUEsT0FBTyxDQUFDK0IsRUFBUixDQUFXLFNBQVgsRUFBc0J6QixjQUF0QjtBQUNBTixFQUFBQSxPQUFPLENBQUMrQixFQUFSLENBQVcsUUFBWCxFQUFxQnpCLGNBQXJCO0FBQ0Q7O2VBRWN4QyxXIiwic291cmNlc0NvbnRlbnQiOlsiLy8gUGFyc2VTZXJ2ZXIgLSBvcGVuLXNvdXJjZSBjb21wYXRpYmxlIEFQSSBTZXJ2ZXIgZm9yIFBhcnNlIGFwcHNcblxudmFyIGJhdGNoID0gcmVxdWlyZSgnLi9iYXRjaCcpLFxuICBib2R5UGFyc2VyID0gcmVxdWlyZSgnYm9keS1wYXJzZXInKSxcbiAgZXhwcmVzcyA9IHJlcXVpcmUoJ2V4cHJlc3MnKSxcbiAgbWlkZGxld2FyZXMgPSByZXF1aXJlKCcuL21pZGRsZXdhcmVzJyksXG4gIFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpLlBhcnNlLFxuICBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuXG5pbXBvcnQgeyBQYXJzZVNlcnZlck9wdGlvbnMsIExpdmVRdWVyeVNlcnZlck9wdGlvbnMgfSBmcm9tICcuL09wdGlvbnMnO1xuaW1wb3J0IGRlZmF1bHRzIGZyb20gJy4vZGVmYXVsdHMnO1xuaW1wb3J0ICogYXMgbG9nZ2luZyBmcm9tICcuL2xvZ2dlcic7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4vQ29uZmlnJztcbmltcG9ydCBQcm9taXNlUm91dGVyIGZyb20gJy4vUHJvbWlzZVJvdXRlcic7XG5pbXBvcnQgcmVxdWlyZWRQYXJhbWV0ZXIgZnJvbSAnLi9yZXF1aXJlZFBhcmFtZXRlcic7XG5pbXBvcnQgeyBBbmFseXRpY3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQW5hbHl0aWNzUm91dGVyJztcbmltcG9ydCB7IENsYXNzZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQ2xhc3Nlc1JvdXRlcic7XG5pbXBvcnQgeyBGZWF0dXJlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9GZWF0dXJlc1JvdXRlcic7XG5pbXBvcnQgeyBGaWxlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9GaWxlc1JvdXRlcic7XG5pbXBvcnQgeyBGdW5jdGlvbnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvRnVuY3Rpb25zUm91dGVyJztcbmltcG9ydCB7IEdsb2JhbENvbmZpZ1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9HbG9iYWxDb25maWdSb3V0ZXInO1xuaW1wb3J0IHsgSG9va3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSG9va3NSb3V0ZXInO1xuaW1wb3J0IHsgSUFQVmFsaWRhdGlvblJvdXRlciB9IGZyb20gJy4vUm91dGVycy9JQVBWYWxpZGF0aW9uUm91dGVyJztcbmltcG9ydCB7IEluc3RhbGxhdGlvbnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSW5zdGFsbGF0aW9uc1JvdXRlcic7XG5pbXBvcnQgeyBMb2dzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0xvZ3NSb3V0ZXInO1xuaW1wb3J0IHsgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIgfSBmcm9tICcuL0xpdmVRdWVyeS9QYXJzZUxpdmVRdWVyeVNlcnZlcic7XG5pbXBvcnQgeyBQdWJsaWNBUElSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVibGljQVBJUm91dGVyJztcbmltcG9ydCB7IFB1c2hSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVzaFJvdXRlcic7XG5pbXBvcnQgeyBDbG91ZENvZGVSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQ2xvdWRDb2RlUm91dGVyJztcbmltcG9ydCB7IFJvbGVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1JvbGVzUm91dGVyJztcbmltcG9ydCB7IFNjaGVtYXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2NoZW1hc1JvdXRlcic7XG5pbXBvcnQgeyBBZG1pblNlc3Npb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0FkbWluU2Vzc2lvbnNSb3V0ZXInO1xuaW1wb3J0IHsgQWRtaW5Vc2Vyc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9BZG1pblVzZXJzUm91dGVyJztcbmltcG9ydCB7IFNlc3Npb25zUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1Nlc3Npb25zUm91dGVyJztcbmltcG9ydCB7IFVzZXJzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1VzZXJzUm91dGVyJztcbmltcG9ydCB7IFB1cmdlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1B1cmdlUm91dGVyJztcbmltcG9ydCB7IEF1ZGllbmNlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9BdWRpZW5jZXNSb3V0ZXInO1xuaW1wb3J0IHsgQWdncmVnYXRlUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0FnZ3JlZ2F0ZVJvdXRlcic7XG5pbXBvcnQgeyBQYXJzZVNlcnZlclJFU1RDb250cm9sbGVyIH0gZnJvbSAnLi9QYXJzZVNlcnZlclJFU1RDb250cm9sbGVyJztcbmltcG9ydCAqIGFzIGNvbnRyb2xsZXJzIGZyb20gJy4vQ29udHJvbGxlcnMnO1xuaW1wb3J0IHsgUGFyc2VHcmFwaFFMU2VydmVyIH0gZnJvbSAnLi9HcmFwaFFML1BhcnNlR3JhcGhRTFNlcnZlcic7XG5cbi8vIE11dGF0ZSB0aGUgUGFyc2Ugb2JqZWN0IHRvIGFkZCB0aGUgQ2xvdWQgQ29kZSBoYW5kbGVyc1xuYWRkUGFyc2VDbG91ZCgpO1xuXG4vLyBQYXJzZVNlcnZlciB3b3JrcyBsaWtlIGEgY29uc3RydWN0b3Igb2YgYW4gZXhwcmVzcyBhcHAuXG4vLyBUaGUgYXJncyB0aGF0IHdlIHVuZGVyc3RhbmQgYXJlOlxuLy8gXCJhbmFseXRpY3NBZGFwdGVyXCI6IGFuIGFkYXB0ZXIgY2xhc3MgZm9yIGFuYWx5dGljc1xuLy8gXCJmaWxlc0FkYXB0ZXJcIjogYSBjbGFzcyBsaWtlIEdyaWRGU0J1Y2tldEFkYXB0ZXIgcHJvdmlkaW5nIGNyZWF0ZSwgZ2V0LFxuLy8gICAgICAgICAgICAgICAgIGFuZCBkZWxldGVcbi8vIFwibG9nZ2VyQWRhcHRlclwiOiBhIGNsYXNzIGxpa2UgV2luc3RvbkxvZ2dlckFkYXB0ZXIgcHJvdmlkaW5nIGluZm8sIGVycm9yLFxuLy8gICAgICAgICAgICAgICAgIGFuZCBxdWVyeVxuLy8gXCJqc29uTG9nc1wiOiBsb2cgYXMgc3RydWN0dXJlZCBKU09OIG9iamVjdHNcbi8vIFwiZGF0YWJhc2VVUklcIjogYSB1cmkgbGlrZSBtb25nb2RiOi8vbG9jYWxob3N0OjI3MDE3L2RibmFtZSB0byB0ZWxsIHVzXG4vLyAgICAgICAgICB3aGF0IGRhdGFiYXNlIHRoaXMgUGFyc2UgQVBJIGNvbm5lY3RzIHRvLlxuLy8gXCJjbG91ZFwiOiByZWxhdGl2ZSBsb2NhdGlvbiB0byBjbG91ZCBjb2RlIHRvIHJlcXVpcmUsIG9yIGEgZnVuY3Rpb25cbi8vICAgICAgICAgIHRoYXQgaXMgZ2l2ZW4gYW4gaW5zdGFuY2Ugb2YgUGFyc2UgYXMgYSBwYXJhbWV0ZXIuICBVc2UgdGhpcyBpbnN0YW5jZSBvZiBQYXJzZVxuLy8gICAgICAgICAgdG8gcmVnaXN0ZXIgeW91ciBjbG91ZCBjb2RlIGhvb2tzIGFuZCBmdW5jdGlvbnMuXG4vLyBcImFwcElkXCI6IHRoZSBhcHBsaWNhdGlvbiBpZCB0byBob3N0XG4vLyBcIm1hc3RlcktleVwiOiB0aGUgbWFzdGVyIGtleSBmb3IgcmVxdWVzdHMgdG8gdGhpcyBhcHBcbi8vIFwiY29sbGVjdGlvblByZWZpeFwiOiBvcHRpb25hbCBwcmVmaXggZm9yIGRhdGFiYXNlIGNvbGxlY3Rpb24gbmFtZXNcbi8vIFwiZmlsZUtleVwiOiBvcHRpb25hbCBrZXkgZnJvbSBQYXJzZSBkYXNoYm9hcmQgZm9yIHN1cHBvcnRpbmcgb2xkZXIgZmlsZXNcbi8vICAgICAgICAgICAgaG9zdGVkIGJ5IFBhcnNlXG4vLyBcImNsaWVudEtleVwiOiBvcHRpb25hbCBrZXkgZnJvbSBQYXJzZSBkYXNoYm9hcmRcbi8vIFwiZG90TmV0S2V5XCI6IG9wdGlvbmFsIGtleSBmcm9tIFBhcnNlIGRhc2hib2FyZFxuLy8gXCJyZXN0QVBJS2V5XCI6IG9wdGlvbmFsIGtleSBmcm9tIFBhcnNlIGRhc2hib2FyZFxuLy8gXCJ3ZWJob29rS2V5XCI6IG9wdGlvbmFsIGtleSBmcm9tIFBhcnNlIGRhc2hib2FyZFxuLy8gXCJqYXZhc2NyaXB0S2V5XCI6IG9wdGlvbmFsIGtleSBmcm9tIFBhcnNlIGRhc2hib2FyZFxuLy8gXCJwdXNoXCI6IG9wdGlvbmFsIGtleSBmcm9tIGNvbmZpZ3VyZSBwdXNoXG4vLyBcInNlc3Npb25MZW5ndGhcIjogb3B0aW9uYWwgbGVuZ3RoIGluIHNlY29uZHMgZm9yIGhvdyBsb25nIFNlc3Npb25zIHNob3VsZCBiZSB2YWxpZCBmb3Jcbi8vIFwibWF4TGltaXRcIjogb3B0aW9uYWwgdXBwZXIgYm91bmQgZm9yIHdoYXQgY2FuIGJlIHNwZWNpZmllZCBmb3IgdGhlICdsaW1pdCcgcGFyYW1ldGVyIG9uIHF1ZXJpZXNcblxuY2xhc3MgUGFyc2VTZXJ2ZXIge1xuICAvKipcbiAgICogQGNvbnN0cnVjdG9yXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHRoZSBwYXJzZSBzZXJ2ZXIgaW5pdGlhbGl6YXRpb24gb3B0aW9uc1xuICAgKi9cbiAgY29uc3RydWN0b3Iob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgLyppZighcHJvY2Vzcy5lbnYuVVNFUl9TRVJWSUNFKVxuICAgIHtcbiAgICAgIFVzZXJzUm91dGVyID0gQWRtaW5Vc2Vyc1JvdXRlcjtcbiAgICAgIFNlc3Npb25zUm91dGVyID0gQWRtaW5TZXNzaW9uc1JvdXRlcjtcbiAgICB9Ki9cbiAgICBpbmplY3REZWZhdWx0cyhvcHRpb25zKTtcbiAgICBjb25zdCB7XG4gICAgICBhcHBJZCA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGFuIGFwcElkIScpLFxuICAgICAgbWFzdGVyS2V5ID0gcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBtYXN0ZXJLZXkhJyksXG4gICAgICBjbG91ZCxcbiAgICAgIGphdmFzY3JpcHRLZXksXG4gICAgICBzZXJ2ZXJVUkwgPSByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIHNlcnZlclVSTCEnKSxcbiAgICAgIHNlcnZlclN0YXJ0Q29tcGxldGUsXG4gICAgfSA9IG9wdGlvbnM7XG4gICAgLy8gSW5pdGlhbGl6ZSB0aGUgbm9kZSBjbGllbnQgU0RLIGF1dG9tYXRpY2FsbHlcbiAgICBQYXJzZS5pbml0aWFsaXplKGFwcElkLCBqYXZhc2NyaXB0S2V5IHx8ICd1bnVzZWQnLCBtYXN0ZXJLZXkpO1xuICAgIFBhcnNlLnNlcnZlclVSTCA9IHNlcnZlclVSTDtcblxuICAgIGNvbnN0IGFsbENvbnRyb2xsZXJzID0gY29udHJvbGxlcnMuZ2V0Q29udHJvbGxlcnMob3B0aW9ucyk7XG5cbiAgICBjb25zdCB7XG4gICAgICBsb2dnZXJDb250cm9sbGVyLFxuICAgICAgZGF0YWJhc2VDb250cm9sbGVyLFxuICAgICAgaG9va3NDb250cm9sbGVyLFxuICAgIH0gPSBhbGxDb250cm9sbGVycztcbiAgICB0aGlzLmNvbmZpZyA9IENvbmZpZy5wdXQoT2JqZWN0LmFzc2lnbih7fSwgb3B0aW9ucywgYWxsQ29udHJvbGxlcnMpKTtcblxuICAgIGxvZ2dpbmcuc2V0TG9nZ2VyKGxvZ2dlckNvbnRyb2xsZXIpO1xuICAgIGNvbnN0IGRiSW5pdFByb21pc2UgPSBkYXRhYmFzZUNvbnRyb2xsZXIucGVyZm9ybUluaXRpYWxpemF0aW9uKCk7XG4gICAgY29uc3QgaG9va3NMb2FkUHJvbWlzZSA9IGhvb2tzQ29udHJvbGxlci5sb2FkKCk7XG5cbiAgICAvLyBOb3RlOiBUZXN0cyB3aWxsIHN0YXJ0IHRvIGZhaWwgaWYgYW55IHZhbGlkYXRpb24gaGFwcGVucyBhZnRlciB0aGlzIGlzIGNhbGxlZC5cbiAgICBQcm9taXNlLmFsbChbZGJJbml0UHJvbWlzZSwgaG9va3NMb2FkUHJvbWlzZV0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIGlmIChzZXJ2ZXJTdGFydENvbXBsZXRlKSB7XG4gICAgICAgICAgc2VydmVyU3RhcnRDb21wbGV0ZSgpO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKHNlcnZlclN0YXJ0Q29tcGxldGUpIHtcbiAgICAgICAgICBzZXJ2ZXJTdGFydENvbXBsZXRlKGVycm9yKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICBpZiAoY2xvdWQpIHtcbiAgICAgIGFkZFBhcnNlQ2xvdWQoKTtcbiAgICAgIGlmICh0eXBlb2YgY2xvdWQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgY2xvdWQoUGFyc2UpO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY2xvdWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHJlcXVpcmUocGF0aC5yZXNvbHZlKHByb2Nlc3MuY3dkKCksIGNsb3VkKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBcImFyZ3VtZW50ICdjbG91ZCcgbXVzdCBlaXRoZXIgYmUgYSBzdHJpbmcgb3IgYSBmdW5jdGlvblwiO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGdldCBhcHAoKSB7XG4gICAgaWYgKCF0aGlzLl9hcHApIHtcbiAgICAgIHRoaXMuX2FwcCA9IFBhcnNlU2VydmVyLmFwcCh0aGlzLmNvbmZpZyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9hcHA7XG4gIH1cblxuICBoYW5kbGVTaHV0ZG93bigpIHtcbiAgICBjb25zdCB7IGFkYXB0ZXIgfSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlQ29udHJvbGxlcjtcbiAgICBpZiAoYWRhcHRlciAmJiB0eXBlb2YgYWRhcHRlci5oYW5kbGVTaHV0ZG93biA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgYWRhcHRlci5oYW5kbGVTaHV0ZG93bigpO1xuICAgIH1cbiAgfVxuXG4gIC8qKlxuICAgKiBAc3RhdGljXG4gICAqIENyZWF0ZSBhbiBleHByZXNzIGFwcCBmb3IgdGhlIHBhcnNlIHNlcnZlclxuICAgKiBAcGFyYW0ge09iamVjdH0gb3B0aW9ucyBsZXQgeW91IHNwZWNpZnkgdGhlIG1heFVwbG9hZFNpemUgd2hlbiBjcmVhdGluZyB0aGUgZXhwcmVzcyBhcHAgICovXG4gIHN0YXRpYyBhcHAoeyBtYXhVcGxvYWRTaXplID0gJzIwbWInLCBhcHBJZCwgZGlyZWN0QWNjZXNzIH0pIHtcbiAgICAvLyBUaGlzIGFwcCBzZXJ2ZXMgdGhlIFBhcnNlIEFQSSBkaXJlY3RseS5cbiAgICAvLyBJdCdzIHRoZSBlcXVpdmFsZW50IG9mIGh0dHBzOi8vYXBpLnBhcnNlLmNvbS8xIGluIHRoZSBob3N0ZWQgUGFyc2UgQVBJLlxuICAgIHZhciBhcGkgPSBleHByZXNzKCk7XG4gICAgLy9hcGkudXNlKFwiL2FwcHNcIiwgZXhwcmVzcy5zdGF0aWMoX19kaXJuYW1lICsgXCIvcHVibGljXCIpKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmFsbG93Q3Jvc3NEb21haW4pO1xuICAgIC8vIEZpbGUgaGFuZGxpbmcgbmVlZHMgdG8gYmUgYmVmb3JlIGRlZmF1bHQgbWlkZGxld2FyZXMgYXJlIGFwcGxpZWRcbiAgICBhcGkudXNlKFxuICAgICAgJy8nLFxuICAgICAgbmV3IEZpbGVzUm91dGVyKCkuZXhwcmVzc1JvdXRlcih7XG4gICAgICAgIG1heFVwbG9hZFNpemU6IG1heFVwbG9hZFNpemUsXG4gICAgICB9KVxuICAgICk7XG5cbiAgICBhcGkudXNlKCcvaGVhbHRoJywgZnVuY3Rpb24ocmVxLCByZXMpIHtcbiAgICAgIHJlcy5qc29uKHtcbiAgICAgICAgc3RhdHVzOiAnb2snLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICBhcGkudXNlKFxuICAgICAgJy8nLFxuICAgICAgYm9keVBhcnNlci51cmxlbmNvZGVkKHsgZXh0ZW5kZWQ6IGZhbHNlIH0pLFxuICAgICAgbmV3IFB1YmxpY0FQSVJvdXRlcigpLmV4cHJlc3NSb3V0ZXIoKVxuICAgICk7XG5cbiAgICBhcGkudXNlKGJvZHlQYXJzZXIuanNvbih7IHR5cGU6ICcqLyonLCBsaW1pdDogbWF4VXBsb2FkU2l6ZSB9KSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5hbGxvd01ldGhvZE92ZXJyaWRlKTtcbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlSGVhZGVycyk7XG5cbiAgICBjb25zdCBhcHBSb3V0ZXIgPSBQYXJzZVNlcnZlci5wcm9taXNlUm91dGVyKHsgYXBwSWQgfSk7XG4gICAgYXBpLnVzZShhcHBSb3V0ZXIuZXhwcmVzc1JvdXRlcigpKTtcblxuICAgIGFwaS51c2UobWlkZGxld2FyZXMuaGFuZGxlUGFyc2VFcnJvcnMpO1xuXG4gICAgLy8gcnVuIHRoZSBmb2xsb3dpbmcgd2hlbiBub3QgdGVzdGluZ1xuICAgIGlmICghcHJvY2Vzcy5lbnYuVEVTVElORykge1xuICAgICAgLy9UaGlzIGNhdXNlcyB0ZXN0cyB0byBzcGV3IHNvbWUgdXNlbGVzcyB3YXJuaW5ncywgc28gZGlzYWJsZSBpbiB0ZXN0XG4gICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgICAgcHJvY2Vzcy5vbigndW5jYXVnaHRFeGNlcHRpb24nLCBlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyLmNvZGUgPT09ICdFQUREUklOVVNFJykge1xuICAgICAgICAgIC8vIHVzZXItZnJpZW5kbHkgbWVzc2FnZSBmb3IgdGhpcyBjb21tb24gZXJyb3JcbiAgICAgICAgICBwcm9jZXNzLnN0ZGVyci53cml0ZShcbiAgICAgICAgICAgIGBVbmFibGUgdG8gbGlzdGVuIG9uIHBvcnQgJHtlcnIucG9ydH0uIFRoZSBwb3J0IGlzIGFscmVhZHkgaW4gdXNlLmBcbiAgICAgICAgICApO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgLy8gdmVyaWZ5IHRoZSBzZXJ2ZXIgdXJsIGFmdGVyIGEgJ21vdW50JyBldmVudCBpcyByZWNlaXZlZFxuICAgICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICAgIGFwaS5vbignbW91bnQnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgUGFyc2VTZXJ2ZXIudmVyaWZ5U2VydmVyVXJsKCk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgaWYgKFxuICAgICAgcHJvY2Vzcy5lbnYuUEFSU0VfU0VSVkVSX0VOQUJMRV9FWFBFUklNRU5UQUxfRElSRUNUX0FDQ0VTUyA9PT0gJzEnIHx8XG4gICAgICBkaXJlY3RBY2Nlc3NcbiAgICApIHtcbiAgICAgIFBhcnNlLkNvcmVNYW5hZ2VyLnNldFJFU1RDb250cm9sbGVyKFxuICAgICAgICBQYXJzZVNlcnZlclJFU1RDb250cm9sbGVyKGFwcElkLCBhcHBSb3V0ZXIpXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gYXBpO1xuICB9XG5cbiAgc3RhdGljIHByb21pc2VSb3V0ZXIoeyBhcHBJZCB9KSB7XG4gICAgY29uc3Qgcm91dGVycyA9IFtcbiAgICAgIG5ldyBDbGFzc2VzUm91dGVyKCksXG4gICAgICBuZXcgVXNlcnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBTZXNzaW9uc1JvdXRlcigpLFxuICAgICAgbmV3IFJvbGVzUm91dGVyKCksXG4gICAgICBuZXcgQW5hbHl0aWNzUm91dGVyKCksXG4gICAgICBuZXcgSW5zdGFsbGF0aW9uc1JvdXRlcigpLFxuICAgICAgbmV3IEZ1bmN0aW9uc1JvdXRlcigpLFxuICAgICAgbmV3IFNjaGVtYXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBQdXNoUm91dGVyKCksXG4gICAgICBuZXcgTG9nc1JvdXRlcigpLFxuICAgICAgbmV3IElBUFZhbGlkYXRpb25Sb3V0ZXIoKSxcbiAgICAgIG5ldyBGZWF0dXJlc1JvdXRlcigpLFxuICAgICAgbmV3IEdsb2JhbENvbmZpZ1JvdXRlcigpLFxuICAgICAgbmV3IFB1cmdlUm91dGVyKCksXG4gICAgICBuZXcgSG9va3NSb3V0ZXIoKSxcbiAgICAgIG5ldyBDbG91ZENvZGVSb3V0ZXIoKSxcbiAgICAgIG5ldyBBdWRpZW5jZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBBZ2dyZWdhdGVSb3V0ZXIoKSxcbiAgICBdO1xuXG4gICAgY29uc3Qgcm91dGVzID0gcm91dGVycy5yZWR1Y2UoKG1lbW8sIHJvdXRlcikgPT4ge1xuICAgICAgcmV0dXJuIG1lbW8uY29uY2F0KHJvdXRlci5yb3V0ZXMpO1xuICAgIH0sIFtdKTtcblxuICAgIGNvbnN0IGFwcFJvdXRlciA9IG5ldyBQcm9taXNlUm91dGVyKHJvdXRlcywgYXBwSWQpO1xuXG4gICAgYmF0Y2gubW91bnRPbnRvKGFwcFJvdXRlcik7XG4gICAgcmV0dXJuIGFwcFJvdXRlcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBzdGFydHMgdGhlIHBhcnNlIHNlcnZlcidzIGV4cHJlc3MgYXBwXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHRvIHVzZSB0byBzdGFydCB0aGUgc2VydmVyXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIGNhbGxlZCB3aGVuIHRoZSBzZXJ2ZXIgaGFzIHN0YXJ0ZWRcbiAgICogQHJldHVybnMge1BhcnNlU2VydmVyfSB0aGUgcGFyc2Ugc2VydmVyIGluc3RhbmNlXG4gICAqL1xuICBzdGFydChvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMsIGNhbGxiYWNrOiA/KCkgPT4gdm9pZCkge1xuICAgIGNvbnN0IGFwcCA9IGV4cHJlc3MoKTtcbiAgICBpZiAob3B0aW9ucy5taWRkbGV3YXJlKSB7XG4gICAgICBsZXQgbWlkZGxld2FyZTtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5taWRkbGV3YXJlID09ICdzdHJpbmcnKSB7XG4gICAgICAgIG1pZGRsZXdhcmUgPSByZXF1aXJlKHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBvcHRpb25zLm1pZGRsZXdhcmUpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1pZGRsZXdhcmUgPSBvcHRpb25zLm1pZGRsZXdhcmU7IC8vIHVzZSBhcy1pcyBsZXQgZXhwcmVzcyBmYWlsXG4gICAgICB9XG4gICAgICBhcHAudXNlKG1pZGRsZXdhcmUpO1xuICAgIH1cblxuICAgIGFwcC51c2Uob3B0aW9ucy5tb3VudFBhdGgsIHRoaXMuYXBwKTtcblxuICAgIGlmIChvcHRpb25zLm1vdW50R3JhcGhRTCA9PT0gdHJ1ZSB8fCBvcHRpb25zLm1vdW50UGxheWdyb3VuZCA9PT0gdHJ1ZSkge1xuICAgICAgY29uc3QgcGFyc2VHcmFwaFFMU2VydmVyID0gbmV3IFBhcnNlR3JhcGhRTFNlcnZlcih0aGlzLCB7XG4gICAgICAgIGdyYXBoUUxQYXRoOiBvcHRpb25zLmdyYXBoUUxQYXRoLFxuICAgICAgICBwbGF5Z3JvdW5kUGF0aDogb3B0aW9ucy5wbGF5Z3JvdW5kUGF0aCxcbiAgICAgIH0pO1xuXG4gICAgICBpZiAob3B0aW9ucy5tb3VudEdyYXBoUUwpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2VydmVyLmFwcGx5R3JhcGhRTChhcHApO1xuICAgICAgfVxuXG4gICAgICBpZiAob3B0aW9ucy5tb3VudFBsYXlncm91bmQpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2VydmVyLmFwcGx5UGxheWdyb3VuZChhcHApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHNlcnZlciA9IGFwcC5saXN0ZW4ob3B0aW9ucy5wb3J0LCBvcHRpb25zLmhvc3QsIGNhbGxiYWNrKTtcbiAgICB0aGlzLnNlcnZlciA9IHNlcnZlcjtcblxuICAgIGlmIChvcHRpb25zLnN0YXJ0TGl2ZVF1ZXJ5U2VydmVyIHx8IG9wdGlvbnMubGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucykge1xuICAgICAgdGhpcy5saXZlUXVlcnlTZXJ2ZXIgPSBQYXJzZVNlcnZlci5jcmVhdGVMaXZlUXVlcnlTZXJ2ZXIoXG4gICAgICAgIHNlcnZlcixcbiAgICAgICAgb3B0aW9ucy5saXZlUXVlcnlTZXJ2ZXJPcHRpb25zXG4gICAgICApO1xuICAgIH1cbiAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgIGlmICghcHJvY2Vzcy5lbnYuVEVTVElORykge1xuICAgICAgY29uZmlndXJlTGlzdGVuZXJzKHRoaXMpO1xuICAgIH1cbiAgICB0aGlzLmV4cHJlc3NBcHAgPSBhcHA7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvKipcbiAgICogQ3JlYXRlcyBhIG5ldyBQYXJzZVNlcnZlciBhbmQgc3RhcnRzIGl0LlxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyB1c2VkIHRvIHN0YXJ0IHRoZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgY2FsbGVkIHdoZW4gdGhlIHNlcnZlciBoYXMgc3RhcnRlZFxuICAgKiBAcmV0dXJucyB7UGFyc2VTZXJ2ZXJ9IHRoZSBwYXJzZSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICovXG4gIHN0YXRpYyBzdGFydChvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMsIGNhbGxiYWNrOiA/KCkgPT4gdm9pZCkge1xuICAgIGNvbnN0IHBhcnNlU2VydmVyID0gbmV3IFBhcnNlU2VydmVyKG9wdGlvbnMpO1xuICAgIHJldHVybiBwYXJzZVNlcnZlci5zdGFydChvcHRpb25zLCBjYWxsYmFjayk7XG4gIH1cblxuICAvKipcbiAgICogSGVscGVyIG1ldGhvZCB0byBjcmVhdGUgYSBsaXZlUXVlcnkgc2VydmVyXG4gICAqIEBzdGF0aWNcbiAgICogQHBhcmFtIHtTZXJ2ZXJ9IGh0dHBTZXJ2ZXIgYW4gb3B0aW9uYWwgaHR0cCBzZXJ2ZXIgdG8gcGFzc1xuICAgKiBAcGFyYW0ge0xpdmVRdWVyeVNlcnZlck9wdGlvbnN9IGNvbmZpZyBvcHRpb25zIGZvdCBoZSBsaXZlUXVlcnlTZXJ2ZXJcbiAgICogQHJldHVybnMge1BhcnNlTGl2ZVF1ZXJ5U2VydmVyfSB0aGUgbGl2ZSBxdWVyeSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICovXG4gIHN0YXRpYyBjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIoaHR0cFNlcnZlciwgY29uZmlnOiBMaXZlUXVlcnlTZXJ2ZXJPcHRpb25zKSB7XG4gICAgaWYgKCFodHRwU2VydmVyIHx8IChjb25maWcgJiYgY29uZmlnLnBvcnQpKSB7XG4gICAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xuICAgICAgaHR0cFNlcnZlciA9IHJlcXVpcmUoJ2h0dHAnKS5jcmVhdGVTZXJ2ZXIoYXBwKTtcbiAgICAgIGh0dHBTZXJ2ZXIubGlzdGVuKGNvbmZpZy5wb3J0KTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBQYXJzZUxpdmVRdWVyeVNlcnZlcihodHRwU2VydmVyLCBjb25maWcpO1xuICB9XG5cbiAgc3RhdGljIHZlcmlmeVNlcnZlclVybChjYWxsYmFjaykge1xuICAgIC8vIHBlcmZvcm0gYSBoZWFsdGggY2hlY2sgb24gdGhlIHNlcnZlclVSTCB2YWx1ZVxuICAgIGlmIChQYXJzZS5zZXJ2ZXJVUkwpIHtcbiAgICAgIGNvbnN0IHJlcXVlc3QgPSByZXF1aXJlKCcuL3JlcXVlc3QnKTtcbiAgICAgIHJlcXVlc3QoeyB1cmw6IFBhcnNlLnNlcnZlclVSTC5yZXBsYWNlKC9cXC8kLywgJycpICsgJy9oZWFsdGgnIH0pXG4gICAgICAgIC5jYXRjaChyZXNwb25zZSA9PiByZXNwb25zZSlcbiAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICAgIGNvbnN0IGpzb24gPSByZXNwb25zZS5kYXRhIHx8IG51bGw7XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgcmVzcG9uc2Uuc3RhdHVzICE9PSAyMDAgfHxcbiAgICAgICAgICAgICFqc29uIHx8XG4gICAgICAgICAgICAoanNvbiAmJiBqc29uLnN0YXR1cyAhPT0gJ29rJylcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgICAgICAgYFxcbldBUk5JTkcsIFVuYWJsZSB0byBjb25uZWN0IHRvICcke1BhcnNlLnNlcnZlclVSTH0nLmAgK1xuICAgICAgICAgICAgICAgIGAgQ2xvdWQgY29kZSBhbmQgcHVzaCBub3RpZmljYXRpb25zIG1heSBiZSB1bmF2YWlsYWJsZSFcXG5gXG4gICAgICAgICAgICApO1xuICAgICAgICAgICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25zb2xlICovXG4gICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgY2FsbGJhY2soZmFsc2UpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgY2FsbGJhY2sodHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gYWRkUGFyc2VDbG91ZCgpIHtcbiAgY29uc3QgUGFyc2VDbG91ZCA9IHJlcXVpcmUoJy4vY2xvdWQtY29kZS9QYXJzZS5DbG91ZCcpO1xuICBPYmplY3QuYXNzaWduKFBhcnNlLkNsb3VkLCBQYXJzZUNsb3VkKTtcbiAgZ2xvYmFsLlBhcnNlID0gUGFyc2U7XG59XG5cbmZ1bmN0aW9uIGluamVjdERlZmF1bHRzKG9wdGlvbnM6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICBPYmplY3Qua2V5cyhkZWZhdWx0cykuZm9yRWFjaChrZXkgPT4ge1xuICAgIGlmICghb3B0aW9ucy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICBvcHRpb25zW2tleV0gPSBkZWZhdWx0c1trZXldO1xuICAgIH1cbiAgfSk7XG5cbiAgaWYgKCFvcHRpb25zLmhhc093blByb3BlcnR5KCdzZXJ2ZXJVUkwnKSkge1xuICAgIG9wdGlvbnMuc2VydmVyVVJMID0gYGh0dHA6Ly9sb2NhbGhvc3Q6JHtvcHRpb25zLnBvcnR9JHtvcHRpb25zLm1vdW50UGF0aH1gO1xuICB9XG5cbiAgLy8gQmFja3dhcmRzIGNvbXBhdGliaWxpdHlcbiAgaWYgKG9wdGlvbnMudXNlclNlbnNpdGl2ZUZpZWxkcykge1xuICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAhcHJvY2Vzcy5lbnYuVEVTVElORyAmJlxuICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICBgXFxuREVQUkVDQVRFRDogdXNlclNlbnNpdGl2ZUZpZWxkcyBoYXMgYmVlbiByZXBsYWNlZCBieSBwcm90ZWN0ZWRGaWVsZHMgYWxsb3dpbmcgdGhlIGFiaWxpdHkgdG8gcHJvdGVjdCBmaWVsZHMgaW4gYWxsIGNsYXNzZXMgd2l0aCBDTFAuIFxcbmBcbiAgICAgICk7XG4gICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25zb2xlICovXG5cbiAgICBjb25zdCB1c2VyU2Vuc2l0aXZlRmllbGRzID0gQXJyYXkuZnJvbShcbiAgICAgIG5ldyBTZXQoW1xuICAgICAgICAuLi4oZGVmYXVsdHMudXNlclNlbnNpdGl2ZUZpZWxkcyB8fCBbXSksXG4gICAgICAgIC4uLihvcHRpb25zLnVzZXJTZW5zaXRpdmVGaWVsZHMgfHwgW10pLFxuICAgICAgXSlcbiAgICApO1xuXG4gICAgLy8gSWYgdGhlIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzIGlzIHVuc2V0LFxuICAgIC8vIGl0J2xsIGJlIGFzc2lnbmVkIHRoZSBkZWZhdWx0IGFib3ZlLlxuICAgIC8vIEhlcmUsIHByb3RlY3QgYWdhaW5zdCB0aGUgY2FzZSB3aGVyZSBwcm90ZWN0ZWRGaWVsZHNcbiAgICAvLyBpcyBzZXQsIGJ1dCBkb2Vzbid0IGhhdmUgX1VzZXIuXG4gICAgaWYgKCEoJ19Vc2VyJyBpbiBvcHRpb25zLnByb3RlY3RlZEZpZWxkcykpIHtcbiAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzID0gT2JqZWN0LmFzc2lnbihcbiAgICAgICAgeyBfVXNlcjogW10gfSxcbiAgICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNcbiAgICAgICk7XG4gICAgfVxuXG4gICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbJ19Vc2VyJ11bJyonXSA9IEFycmF5LmZyb20oXG4gICAgICBuZXcgU2V0KFtcbiAgICAgICAgLi4uKG9wdGlvbnMucHJvdGVjdGVkRmllbGRzWydfVXNlciddWycqJ10gfHwgW10pLFxuICAgICAgICAuLi51c2VyU2Vuc2l0aXZlRmllbGRzLFxuICAgICAgXSlcbiAgICApO1xuICB9XG5cbiAgLy8gTWVyZ2UgcHJvdGVjdGVkRmllbGRzIG9wdGlvbnMgd2l0aCBkZWZhdWx0cy5cbiAgT2JqZWN0LmtleXMoZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzKS5mb3JFYWNoKGMgPT4ge1xuICAgIGNvbnN0IGN1ciA9IG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdO1xuICAgIGlmICghY3VyKSB7XG4gICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXSA9IGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXTtcbiAgICB9IGVsc2Uge1xuICAgICAgT2JqZWN0LmtleXMoZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzW2NdKS5mb3JFYWNoKHIgPT4ge1xuICAgICAgICBjb25zdCB1bnEgPSBuZXcgU2V0KFtcbiAgICAgICAgICAuLi4ob3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0gfHwgW10pLFxuICAgICAgICAgIC4uLmRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXVtyXSxcbiAgICAgICAgXSk7XG4gICAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdW3JdID0gQXJyYXkuZnJvbSh1bnEpO1xuICAgICAgfSk7XG4gICAgfVxuICB9KTtcblxuICBvcHRpb25zLm1hc3RlcktleUlwcyA9IEFycmF5LmZyb20oXG4gICAgbmV3IFNldChcbiAgICAgIG9wdGlvbnMubWFzdGVyS2V5SXBzLmNvbmNhdChkZWZhdWx0cy5tYXN0ZXJLZXlJcHMsIG9wdGlvbnMubWFzdGVyS2V5SXBzKVxuICAgIClcbiAgKTtcbn1cblxuLy8gVGhvc2UgY2FuJ3QgYmUgdGVzdGVkIGFzIGl0IHJlcXVpcmVzIGEgc3VicHJvY2Vzc1xuLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbmZ1bmN0aW9uIGNvbmZpZ3VyZUxpc3RlbmVycyhwYXJzZVNlcnZlcikge1xuICBjb25zdCBzZXJ2ZXIgPSBwYXJzZVNlcnZlci5zZXJ2ZXI7XG4gIGNvbnN0IHNvY2tldHMgPSB7fTtcbiAgLyogQ3VycmVudGx5LCBleHByZXNzIGRvZXNuJ3Qgc2h1dCBkb3duIGltbWVkaWF0ZWx5IGFmdGVyIHJlY2VpdmluZyBTSUdJTlQvU0lHVEVSTSBpZiBpdCBoYXMgY2xpZW50IGNvbm5lY3Rpb25zIHRoYXQgaGF2ZW4ndCB0aW1lZCBvdXQuIChUaGlzIGlzIGEga25vd24gaXNzdWUgd2l0aCBub2RlIC0gaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL2lzc3Vlcy8yNjQyKVxuICAgIFRoaXMgZnVuY3Rpb24sIGFsb25nIHdpdGggYGRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zKClgLCBpbnRlbmQgdG8gZml4IHRoaXMgYmVoYXZpb3Igc3VjaCB0aGF0IHBhcnNlIHNlcnZlciB3aWxsIGNsb3NlIGFsbCBvcGVuIGNvbm5lY3Rpb25zIGFuZCBpbml0aWF0ZSB0aGUgc2h1dGRvd24gcHJvY2VzcyBhcyBzb29uIGFzIGl0IHJlY2VpdmVzIGEgU0lHSU5UL1NJR1RFUk0gc2lnbmFsLiAqL1xuICBzZXJ2ZXIub24oJ2Nvbm5lY3Rpb24nLCBzb2NrZXQgPT4ge1xuICAgIGNvbnN0IHNvY2tldElkID0gc29ja2V0LnJlbW90ZUFkZHJlc3MgKyAnOicgKyBzb2NrZXQucmVtb3RlUG9ydDtcbiAgICBzb2NrZXRzW3NvY2tldElkXSA9IHNvY2tldDtcbiAgICBzb2NrZXQub24oJ2Nsb3NlJywgKCkgPT4ge1xuICAgICAgZGVsZXRlIHNvY2tldHNbc29ja2V0SWRdO1xuICAgIH0pO1xuICB9KTtcblxuICBjb25zdCBkZXN0cm95QWxpdmVDb25uZWN0aW9ucyA9IGZ1bmN0aW9uKCkge1xuICAgIGZvciAoY29uc3Qgc29ja2V0SWQgaW4gc29ja2V0cykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgc29ja2V0c1tzb2NrZXRJZF0uZGVzdHJveSgpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAvKiAqL1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICBjb25zdCBoYW5kbGVTaHV0ZG93biA9IGZ1bmN0aW9uKCkge1xuICAgIHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdUZXJtaW5hdGlvbiBzaWduYWwgcmVjZWl2ZWQuIFNodXR0aW5nIGRvd24uJyk7XG4gICAgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMoKTtcbiAgICBzZXJ2ZXIuY2xvc2UoKTtcbiAgICBwYXJzZVNlcnZlci5oYW5kbGVTaHV0ZG93bigpO1xuICB9O1xuICBwcm9jZXNzLm9uKCdTSUdURVJNJywgaGFuZGxlU2h1dGRvd24pO1xuICBwcm9jZXNzLm9uKCdTSUdJTlQnLCBoYW5kbGVTaHV0ZG93bik7XG59XG5cbmV4cG9ydCBkZWZhdWx0IFBhcnNlU2VydmVyO1xuIl19