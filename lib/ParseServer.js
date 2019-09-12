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
    if (!process.env.USER_SERVICE) {
      _UsersRouter.UsersRouter = (_AdminUsersRouter.AdminUsersRouter, function () {
        throw new Error('"' + "UsersRouter" + '" is read-only.');
      }());
      _SessionsRouter.SessionsRouter = (_AdminSessionsRouter.AdminSessionsRouter, function () {
        throw new Error('"' + "SessionsRouter" + '" is read-only.');
      }());
    }

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9QYXJzZVNlcnZlci5qcyJdLCJuYW1lcyI6WyJiYXRjaCIsInJlcXVpcmUiLCJib2R5UGFyc2VyIiwiZXhwcmVzcyIsIm1pZGRsZXdhcmVzIiwiUGFyc2UiLCJwYXRoIiwiYWRkUGFyc2VDbG91ZCIsIlBhcnNlU2VydmVyIiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwicHJvY2VzcyIsImVudiIsIlVTRVJfU0VSVklDRSIsIkFkbWluVXNlcnNSb3V0ZXIiLCJBZG1pblNlc3Npb25zUm91dGVyIiwiaW5qZWN0RGVmYXVsdHMiLCJhcHBJZCIsIm1hc3RlcktleSIsImNsb3VkIiwiamF2YXNjcmlwdEtleSIsInNlcnZlclVSTCIsInNlcnZlclN0YXJ0Q29tcGxldGUiLCJpbml0aWFsaXplIiwiYWxsQ29udHJvbGxlcnMiLCJjb250cm9sbGVycyIsImdldENvbnRyb2xsZXJzIiwibG9nZ2VyQ29udHJvbGxlciIsImRhdGFiYXNlQ29udHJvbGxlciIsImhvb2tzQ29udHJvbGxlciIsImNvbmZpZyIsIkNvbmZpZyIsInB1dCIsIk9iamVjdCIsImFzc2lnbiIsImxvZ2dpbmciLCJzZXRMb2dnZXIiLCJkYkluaXRQcm9taXNlIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiaG9va3NMb2FkUHJvbWlzZSIsImxvYWQiLCJQcm9taXNlIiwiYWxsIiwidGhlbiIsImNhdGNoIiwiZXJyb3IiLCJjb25zb2xlIiwiZXhpdCIsInJlc29sdmUiLCJjd2QiLCJhcHAiLCJfYXBwIiwiaGFuZGxlU2h1dGRvd24iLCJhZGFwdGVyIiwibWF4VXBsb2FkU2l6ZSIsImRpcmVjdEFjY2VzcyIsImFwaSIsInVzZSIsImFsbG93Q3Jvc3NEb21haW4iLCJGaWxlc1JvdXRlciIsImV4cHJlc3NSb3V0ZXIiLCJyZXEiLCJyZXMiLCJqc29uIiwic3RhdHVzIiwidXJsZW5jb2RlZCIsImV4dGVuZGVkIiwiUHVibGljQVBJUm91dGVyIiwidHlwZSIsImxpbWl0IiwiYWxsb3dNZXRob2RPdmVycmlkZSIsImhhbmRsZVBhcnNlSGVhZGVycyIsImFwcFJvdXRlciIsInByb21pc2VSb3V0ZXIiLCJoYW5kbGVQYXJzZUVycm9ycyIsIlRFU1RJTkciLCJvbiIsImVyciIsImNvZGUiLCJzdGRlcnIiLCJ3cml0ZSIsInBvcnQiLCJ2ZXJpZnlTZXJ2ZXJVcmwiLCJQQVJTRV9TRVJWRVJfRU5BQkxFX0VYUEVSSU1FTlRBTF9ESVJFQ1RfQUNDRVNTIiwiQ29yZU1hbmFnZXIiLCJzZXRSRVNUQ29udHJvbGxlciIsInJvdXRlcnMiLCJDbGFzc2VzUm91dGVyIiwiVXNlcnNSb3V0ZXIiLCJTZXNzaW9uc1JvdXRlciIsIlJvbGVzUm91dGVyIiwiQW5hbHl0aWNzUm91dGVyIiwiSW5zdGFsbGF0aW9uc1JvdXRlciIsIkZ1bmN0aW9uc1JvdXRlciIsIlNjaGVtYXNSb3V0ZXIiLCJQdXNoUm91dGVyIiwiTG9nc1JvdXRlciIsIklBUFZhbGlkYXRpb25Sb3V0ZXIiLCJGZWF0dXJlc1JvdXRlciIsIkdsb2JhbENvbmZpZ1JvdXRlciIsIlB1cmdlUm91dGVyIiwiSG9va3NSb3V0ZXIiLCJDbG91ZENvZGVSb3V0ZXIiLCJBdWRpZW5jZXNSb3V0ZXIiLCJBZ2dyZWdhdGVSb3V0ZXIiLCJyb3V0ZXMiLCJyZWR1Y2UiLCJtZW1vIiwicm91dGVyIiwiY29uY2F0IiwiUHJvbWlzZVJvdXRlciIsIm1vdW50T250byIsInN0YXJ0IiwiY2FsbGJhY2siLCJtaWRkbGV3YXJlIiwibW91bnRQYXRoIiwibW91bnRHcmFwaFFMIiwibW91bnRQbGF5Z3JvdW5kIiwicGFyc2VHcmFwaFFMU2VydmVyIiwiUGFyc2VHcmFwaFFMU2VydmVyIiwiZ3JhcGhRTFBhdGgiLCJwbGF5Z3JvdW5kUGF0aCIsImFwcGx5R3JhcGhRTCIsImFwcGx5UGxheWdyb3VuZCIsInNlcnZlciIsImxpc3RlbiIsImhvc3QiLCJzdGFydExpdmVRdWVyeVNlcnZlciIsImxpdmVRdWVyeVNlcnZlck9wdGlvbnMiLCJsaXZlUXVlcnlTZXJ2ZXIiLCJjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIiLCJjb25maWd1cmVMaXN0ZW5lcnMiLCJleHByZXNzQXBwIiwicGFyc2VTZXJ2ZXIiLCJodHRwU2VydmVyIiwiY3JlYXRlU2VydmVyIiwiUGFyc2VMaXZlUXVlcnlTZXJ2ZXIiLCJyZXF1ZXN0IiwidXJsIiwicmVwbGFjZSIsInJlc3BvbnNlIiwiZGF0YSIsIndhcm4iLCJQYXJzZUNsb3VkIiwiQ2xvdWQiLCJnbG9iYWwiLCJrZXlzIiwiZGVmYXVsdHMiLCJmb3JFYWNoIiwia2V5IiwiaGFzT3duUHJvcGVydHkiLCJ1c2VyU2Vuc2l0aXZlRmllbGRzIiwiQXJyYXkiLCJmcm9tIiwiU2V0IiwicHJvdGVjdGVkRmllbGRzIiwiX1VzZXIiLCJjIiwiY3VyIiwiciIsInVucSIsIm1hc3RlcktleUlwcyIsInNvY2tldHMiLCJzb2NrZXQiLCJzb2NrZXRJZCIsInJlbW90ZUFkZHJlc3MiLCJyZW1vdGVQb3J0IiwiZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMiLCJkZXN0cm95IiwiZSIsInN0ZG91dCIsImNsb3NlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBU0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBeENBO0FBRUEsSUFBSUEsS0FBSyxHQUFHQyxPQUFPLENBQUMsU0FBRCxDQUFuQjtBQUFBLElBQ0VDLFVBQVUsR0FBR0QsT0FBTyxDQUFDLGFBQUQsQ0FEdEI7QUFBQSxJQUVFRSxPQUFPLEdBQUdGLE9BQU8sQ0FBQyxTQUFELENBRm5CO0FBQUEsSUFHRUcsV0FBVyxHQUFHSCxPQUFPLENBQUMsZUFBRCxDQUh2QjtBQUFBLElBSUVJLEtBQUssR0FBR0osT0FBTyxDQUFDLFlBQUQsQ0FB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QztBQUM5QixVQUFJO0FBQ0ZBLFFBQUFBLE9BQU8sQ0FBQ0UsUUFBRCxDQUFQLENBQWtCSSxPQUFsQjtBQUNELE9BRkQsQ0FFRSxPQUFPQyxDQUFQLEVBQVU7QUFDVjtBQUNEO0FBQ0Y7QUFDRixHQVJEOztBQVVBLFFBQU1ySCxjQUFjLEdBQUcsWUFBVztBQUNoQ3pDLElBQUFBLE9BQU8sQ0FBQytKLE1BQVIsQ0FBZTFGLEtBQWYsQ0FBcUIsNkNBQXJCO0FBQ0F1RixJQUFBQSx1QkFBdUI7QUFDdkIzQyxJQUFBQSxNQUFNLENBQUMrQyxLQUFQO0FBQ0F0QyxJQUFBQSxXQUFXLENBQUNqRixjQUFaO0FBQ0QsR0FMRDs7QUFNQXpDLEVBQUFBLE9BQU8sQ0FBQ2lFLEVBQVIsQ0FBVyxTQUFYLEVBQXNCeEIsY0FBdEI7QUFDQXpDLEVBQUFBLE9BQU8sQ0FBQ2lFLEVBQVIsQ0FBVyxRQUFYLEVBQXFCeEIsY0FBckI7QUFDRDs7ZUFFYzVDLFciLCJzb3VyY2VzQ29udGVudCI6WyIvLyBQYXJzZVNlcnZlciAtIG9wZW4tc291cmNlIGNvbXBhdGlibGUgQVBJIFNlcnZlciBmb3IgUGFyc2UgYXBwc1xuXG52YXIgYmF0Y2ggPSByZXF1aXJlKCcuL2JhdGNoJyksXG4gIGJvZHlQYXJzZXIgPSByZXF1aXJlKCdib2R5LXBhcnNlcicpLFxuICBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpLFxuICBtaWRkbGV3YXJlcyA9IHJlcXVpcmUoJy4vbWlkZGxld2FyZXMnKSxcbiAgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2UsXG4gIHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG5cbmltcG9ydCB7IFBhcnNlU2VydmVyT3B0aW9ucywgTGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyB9IGZyb20gJy4vT3B0aW9ucyc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi9kZWZhdWx0cyc7XG5pbXBvcnQgKiBhcyBsb2dnaW5nIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi9Db25maWcnO1xuaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi9Qcm9taXNlUm91dGVyJztcbmltcG9ydCByZXF1aXJlZFBhcmFtZXRlciBmcm9tICcuL3JlcXVpcmVkUGFyYW1ldGVyJztcbmltcG9ydCB7IEFuYWx5dGljc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9BbmFseXRpY3NSb3V0ZXInO1xuaW1wb3J0IHsgQ2xhc3Nlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9DbGFzc2VzUm91dGVyJztcbmltcG9ydCB7IEZlYXR1cmVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0ZlYXR1cmVzUm91dGVyJztcbmltcG9ydCB7IEZpbGVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0ZpbGVzUm91dGVyJztcbmltcG9ydCB7IEZ1bmN0aW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9GdW5jdGlvbnNSb3V0ZXInO1xuaW1wb3J0IHsgR2xvYmFsQ29uZmlnUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0dsb2JhbENvbmZpZ1JvdXRlcic7XG5pbXBvcnQgeyBIb29rc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Ib29rc1JvdXRlcic7XG5pbXBvcnQgeyBJQVBWYWxpZGF0aW9uUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0lBUFZhbGlkYXRpb25Sb3V0ZXInO1xuaW1wb3J0IHsgSW5zdGFsbGF0aW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9JbnN0YWxsYXRpb25zUm91dGVyJztcbmltcG9ydCB7IExvZ3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvTG9nc1JvdXRlcic7XG5pbXBvcnQgeyBQYXJzZUxpdmVRdWVyeVNlcnZlciB9IGZyb20gJy4vTGl2ZVF1ZXJ5L1BhcnNlTGl2ZVF1ZXJ5U2VydmVyJztcbmltcG9ydCB7IFB1YmxpY0FQSVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdWJsaWNBUElSb3V0ZXInO1xuaW1wb3J0IHsgUHVzaFJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdXNoUm91dGVyJztcbmltcG9ydCB7IENsb3VkQ29kZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9DbG91ZENvZGVSb3V0ZXInO1xuaW1wb3J0IHsgUm9sZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUm9sZXNSb3V0ZXInO1xuaW1wb3J0IHsgU2NoZW1hc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9TY2hlbWFzUm91dGVyJztcbmltcG9ydCB7IEFkbWluU2Vzc2lvbnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQWRtaW5TZXNzaW9uc1JvdXRlcic7XG5pbXBvcnQgeyBBZG1pblVzZXJzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0FkbWluVXNlcnNSb3V0ZXInO1xuaW1wb3J0IHsgU2Vzc2lvbnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2Vzc2lvbnNSb3V0ZXInO1xuaW1wb3J0IHsgVXNlcnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvVXNlcnNSb3V0ZXInO1xuaW1wb3J0IHsgUHVyZ2VSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVyZ2VSb3V0ZXInO1xuaW1wb3J0IHsgQXVkaWVuY2VzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0F1ZGllbmNlc1JvdXRlcic7XG5pbXBvcnQgeyBBZ2dyZWdhdGVSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQWdncmVnYXRlUm91dGVyJztcbmltcG9ydCB7IFBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIgfSBmcm9tICcuL1BhcnNlU2VydmVyUkVTVENvbnRyb2xsZXInO1xuaW1wb3J0ICogYXMgY29udHJvbGxlcnMgZnJvbSAnLi9Db250cm9sbGVycyc7XG5pbXBvcnQgeyBQYXJzZUdyYXBoUUxTZXJ2ZXIgfSBmcm9tICcuL0dyYXBoUUwvUGFyc2VHcmFwaFFMU2VydmVyJztcblxuLy8gTXV0YXRlIHRoZSBQYXJzZSBvYmplY3QgdG8gYWRkIHRoZSBDbG91ZCBDb2RlIGhhbmRsZXJzXG5hZGRQYXJzZUNsb3VkKCk7XG5cbi8vIFBhcnNlU2VydmVyIHdvcmtzIGxpa2UgYSBjb25zdHJ1Y3RvciBvZiBhbiBleHByZXNzIGFwcC5cbi8vIFRoZSBhcmdzIHRoYXQgd2UgdW5kZXJzdGFuZCBhcmU6XG4vLyBcImFuYWx5dGljc0FkYXB0ZXJcIjogYW4gYWRhcHRlciBjbGFzcyBmb3IgYW5hbHl0aWNzXG4vLyBcImZpbGVzQWRhcHRlclwiOiBhIGNsYXNzIGxpa2UgR3JpZEZTQnVja2V0QWRhcHRlciBwcm92aWRpbmcgY3JlYXRlLCBnZXQsXG4vLyAgICAgICAgICAgICAgICAgYW5kIGRlbGV0ZVxuLy8gXCJsb2dnZXJBZGFwdGVyXCI6IGEgY2xhc3MgbGlrZSBXaW5zdG9uTG9nZ2VyQWRhcHRlciBwcm92aWRpbmcgaW5mbywgZXJyb3IsXG4vLyAgICAgICAgICAgICAgICAgYW5kIHF1ZXJ5XG4vLyBcImpzb25Mb2dzXCI6IGxvZyBhcyBzdHJ1Y3R1cmVkIEpTT04gb2JqZWN0c1xuLy8gXCJkYXRhYmFzZVVSSVwiOiBhIHVyaSBsaWtlIG1vbmdvZGI6Ly9sb2NhbGhvc3Q6MjcwMTcvZGJuYW1lIHRvIHRlbGwgdXNcbi8vICAgICAgICAgIHdoYXQgZGF0YWJhc2UgdGhpcyBQYXJzZSBBUEkgY29ubmVjdHMgdG8uXG4vLyBcImNsb3VkXCI6IHJlbGF0aXZlIGxvY2F0aW9uIHRvIGNsb3VkIGNvZGUgdG8gcmVxdWlyZSwgb3IgYSBmdW5jdGlvblxuLy8gICAgICAgICAgdGhhdCBpcyBnaXZlbiBhbiBpbnN0YW5jZSBvZiBQYXJzZSBhcyBhIHBhcmFtZXRlci4gIFVzZSB0aGlzIGluc3RhbmNlIG9mIFBhcnNlXG4vLyAgICAgICAgICB0byByZWdpc3RlciB5b3VyIGNsb3VkIGNvZGUgaG9va3MgYW5kIGZ1bmN0aW9ucy5cbi8vIFwiYXBwSWRcIjogdGhlIGFwcGxpY2F0aW9uIGlkIHRvIGhvc3Rcbi8vIFwibWFzdGVyS2V5XCI6IHRoZSBtYXN0ZXIga2V5IGZvciByZXF1ZXN0cyB0byB0aGlzIGFwcFxuLy8gXCJjb2xsZWN0aW9uUHJlZml4XCI6IG9wdGlvbmFsIHByZWZpeCBmb3IgZGF0YWJhc2UgY29sbGVjdGlvbiBuYW1lc1xuLy8gXCJmaWxlS2V5XCI6IG9wdGlvbmFsIGtleSBmcm9tIFBhcnNlIGRhc2hib2FyZCBmb3Igc3VwcG9ydGluZyBvbGRlciBmaWxlc1xuLy8gICAgICAgICAgICBob3N0ZWQgYnkgUGFyc2Vcbi8vIFwiY2xpZW50S2V5XCI6IG9wdGlvbmFsIGtleSBmcm9tIFBhcnNlIGRhc2hib2FyZFxuLy8gXCJkb3ROZXRLZXlcIjogb3B0aW9uYWwga2V5IGZyb20gUGFyc2UgZGFzaGJvYXJkXG4vLyBcInJlc3RBUElLZXlcIjogb3B0aW9uYWwga2V5IGZyb20gUGFyc2UgZGFzaGJvYXJkXG4vLyBcIndlYmhvb2tLZXlcIjogb3B0aW9uYWwga2V5IGZyb20gUGFyc2UgZGFzaGJvYXJkXG4vLyBcImphdmFzY3JpcHRLZXlcIjogb3B0aW9uYWwga2V5IGZyb20gUGFyc2UgZGFzaGJvYXJkXG4vLyBcInB1c2hcIjogb3B0aW9uYWwga2V5IGZyb20gY29uZmlndXJlIHB1c2hcbi8vIFwic2Vzc2lvbkxlbmd0aFwiOiBvcHRpb25hbCBsZW5ndGggaW4gc2Vjb25kcyBmb3IgaG93IGxvbmcgU2Vzc2lvbnMgc2hvdWxkIGJlIHZhbGlkIGZvclxuLy8gXCJtYXhMaW1pdFwiOiBvcHRpb25hbCB1cHBlciBib3VuZCBmb3Igd2hhdCBjYW4gYmUgc3BlY2lmaWVkIGZvciB0aGUgJ2xpbWl0JyBwYXJhbWV0ZXIgb24gcXVlcmllc1xuXG5jbGFzcyBQYXJzZVNlcnZlciB7XG4gIC8qKlxuICAgKiBAY29uc3RydWN0b3JcbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgdGhlIHBhcnNlIHNlcnZlciBpbml0aWFsaXphdGlvbiBvcHRpb25zXG4gICAqL1xuICBjb25zdHJ1Y3RvcihvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICBpZighcHJvY2Vzcy5lbnYuVVNFUl9TRVJWSUNFKVxuICAgIHtcbiAgICAgIFVzZXJzUm91dGVyID0gQWRtaW5Vc2Vyc1JvdXRlcjtcbiAgICAgIFNlc3Npb25zUm91dGVyID0gQWRtaW5TZXNzaW9uc1JvdXRlcjtcbiAgICB9XG4gICAgaW5qZWN0RGVmYXVsdHMob3B0aW9ucyk7XG4gICAgY29uc3Qge1xuICAgICAgYXBwSWQgPSByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhbiBhcHBJZCEnKSxcbiAgICAgIG1hc3RlcktleSA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgbWFzdGVyS2V5IScpLFxuICAgICAgY2xvdWQsXG4gICAgICBqYXZhc2NyaXB0S2V5LFxuICAgICAgc2VydmVyVVJMID0gcmVxdWlyZWRQYXJhbWV0ZXIoJ1lvdSBtdXN0IHByb3ZpZGUgYSBzZXJ2ZXJVUkwhJyksXG4gICAgICBzZXJ2ZXJTdGFydENvbXBsZXRlLFxuICAgIH0gPSBvcHRpb25zO1xuICAgIC8vIEluaXRpYWxpemUgdGhlIG5vZGUgY2xpZW50IFNESyBhdXRvbWF0aWNhbGx5XG4gICAgUGFyc2UuaW5pdGlhbGl6ZShhcHBJZCwgamF2YXNjcmlwdEtleSB8fCAndW51c2VkJywgbWFzdGVyS2V5KTtcbiAgICBQYXJzZS5zZXJ2ZXJVUkwgPSBzZXJ2ZXJVUkw7XG5cbiAgICBjb25zdCBhbGxDb250cm9sbGVycyA9IGNvbnRyb2xsZXJzLmdldENvbnRyb2xsZXJzKG9wdGlvbnMpO1xuXG4gICAgY29uc3Qge1xuICAgICAgbG9nZ2VyQ29udHJvbGxlcixcbiAgICAgIGRhdGFiYXNlQ29udHJvbGxlcixcbiAgICAgIGhvb2tzQ29udHJvbGxlcixcbiAgICB9ID0gYWxsQ29udHJvbGxlcnM7XG4gICAgdGhpcy5jb25maWcgPSBDb25maWcucHV0KE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIGFsbENvbnRyb2xsZXJzKSk7XG5cbiAgICBsb2dnaW5nLnNldExvZ2dlcihsb2dnZXJDb250cm9sbGVyKTtcbiAgICBjb25zdCBkYkluaXRQcm9taXNlID0gZGF0YWJhc2VDb250cm9sbGVyLnBlcmZvcm1Jbml0aWFsaXphdGlvbigpO1xuICAgIGNvbnN0IGhvb2tzTG9hZFByb21pc2UgPSBob29rc0NvbnRyb2xsZXIubG9hZCgpO1xuXG4gICAgLy8gTm90ZTogVGVzdHMgd2lsbCBzdGFydCB0byBmYWlsIGlmIGFueSB2YWxpZGF0aW9uIGhhcHBlbnMgYWZ0ZXIgdGhpcyBpcyBjYWxsZWQuXG4gICAgUHJvbWlzZS5hbGwoW2RiSW5pdFByb21pc2UsIGhvb2tzTG9hZFByb21pc2VdKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBpZiAoc2VydmVyU3RhcnRDb21wbGV0ZSkge1xuICAgICAgICAgIHNlcnZlclN0YXJ0Q29tcGxldGUoKTtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChzZXJ2ZXJTdGFydENvbXBsZXRlKSB7XG4gICAgICAgICAgc2VydmVyU3RhcnRDb21wbGV0ZShlcnJvcik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcbiAgICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgaWYgKGNsb3VkKSB7XG4gICAgICBhZGRQYXJzZUNsb3VkKCk7XG4gICAgICBpZiAodHlwZW9mIGNsb3VkID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGNsb3VkKFBhcnNlKTtcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNsb3VkID09PSAnc3RyaW5nJykge1xuICAgICAgICByZXF1aXJlKHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBjbG91ZCkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgXCJhcmd1bWVudCAnY2xvdWQnIG11c3QgZWl0aGVyIGJlIGEgc3RyaW5nIG9yIGEgZnVuY3Rpb25cIjtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZXQgYXBwKCkge1xuICAgIGlmICghdGhpcy5fYXBwKSB7XG4gICAgICB0aGlzLl9hcHAgPSBQYXJzZVNlcnZlci5hcHAodGhpcy5jb25maWcpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fYXBwO1xuICB9XG5cbiAgaGFuZGxlU2h1dGRvd24oKSB7XG4gICAgY29uc3QgeyBhZGFwdGVyIH0gPSB0aGlzLmNvbmZpZy5kYXRhYmFzZUNvbnRyb2xsZXI7XG4gICAgaWYgKGFkYXB0ZXIgJiYgdHlwZW9mIGFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIGFkYXB0ZXIuaGFuZGxlU2h1dGRvd24oKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQHN0YXRpY1xuICAgKiBDcmVhdGUgYW4gZXhwcmVzcyBhcHAgZm9yIHRoZSBwYXJzZSBzZXJ2ZXJcbiAgICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnMgbGV0IHlvdSBzcGVjaWZ5IHRoZSBtYXhVcGxvYWRTaXplIHdoZW4gY3JlYXRpbmcgdGhlIGV4cHJlc3MgYXBwICAqL1xuICBzdGF0aWMgYXBwKHsgbWF4VXBsb2FkU2l6ZSA9ICcyMG1iJywgYXBwSWQsIGRpcmVjdEFjY2VzcyB9KSB7XG4gICAgLy8gVGhpcyBhcHAgc2VydmVzIHRoZSBQYXJzZSBBUEkgZGlyZWN0bHkuXG4gICAgLy8gSXQncyB0aGUgZXF1aXZhbGVudCBvZiBodHRwczovL2FwaS5wYXJzZS5jb20vMSBpbiB0aGUgaG9zdGVkIFBhcnNlIEFQSS5cbiAgICB2YXIgYXBpID0gZXhwcmVzcygpO1xuICAgIC8vYXBpLnVzZShcIi9hcHBzXCIsIGV4cHJlc3Muc3RhdGljKF9fZGlybmFtZSArIFwiL3B1YmxpY1wiKSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5hbGxvd0Nyb3NzRG9tYWluKTtcbiAgICAvLyBGaWxlIGhhbmRsaW5nIG5lZWRzIHRvIGJlIGJlZm9yZSBkZWZhdWx0IG1pZGRsZXdhcmVzIGFyZSBhcHBsaWVkXG4gICAgYXBpLnVzZShcbiAgICAgICcvJyxcbiAgICAgIG5ldyBGaWxlc1JvdXRlcigpLmV4cHJlc3NSb3V0ZXIoe1xuICAgICAgICBtYXhVcGxvYWRTaXplOiBtYXhVcGxvYWRTaXplLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgYXBpLnVzZSgnL2hlYWx0aCcsIGZ1bmN0aW9uKHJlcSwgcmVzKSB7XG4gICAgICByZXMuanNvbih7XG4gICAgICAgIHN0YXR1czogJ29rJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgYXBpLnVzZShcbiAgICAgICcvJyxcbiAgICAgIGJvZHlQYXJzZXIudXJsZW5jb2RlZCh7IGV4dGVuZGVkOiBmYWxzZSB9KSxcbiAgICAgIG5ldyBQdWJsaWNBUElSb3V0ZXIoKS5leHByZXNzUm91dGVyKClcbiAgICApO1xuXG4gICAgYXBpLnVzZShib2R5UGFyc2VyLmpzb24oeyB0eXBlOiAnKi8qJywgbGltaXQ6IG1heFVwbG9hZFNpemUgfSkpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuYWxsb3dNZXRob2RPdmVycmlkZSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5oYW5kbGVQYXJzZUhlYWRlcnMpO1xuXG4gICAgY29uc3QgYXBwUm91dGVyID0gUGFyc2VTZXJ2ZXIucHJvbWlzZVJvdXRlcih7IGFwcElkIH0pO1xuICAgIGFwaS51c2UoYXBwUm91dGVyLmV4cHJlc3NSb3V0ZXIoKSk7XG5cbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlRXJyb3JzKTtcblxuICAgIC8vIHJ1biB0aGUgZm9sbG93aW5nIHdoZW4gbm90IHRlc3RpbmdcbiAgICBpZiAoIXByb2Nlc3MuZW52LlRFU1RJTkcpIHtcbiAgICAgIC8vVGhpcyBjYXVzZXMgdGVzdHMgdG8gc3BldyBzb21lIHVzZWxlc3Mgd2FybmluZ3MsIHNvIGRpc2FibGUgaW4gdGVzdFxuICAgICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICAgIHByb2Nlc3Mub24oJ3VuY2F1Z2h0RXhjZXB0aW9uJywgZXJyID0+IHtcbiAgICAgICAgaWYgKGVyci5jb2RlID09PSAnRUFERFJJTlVTRScpIHtcbiAgICAgICAgICAvLyB1c2VyLWZyaWVuZGx5IG1lc3NhZ2UgZm9yIHRoaXMgY29tbW9uIGVycm9yXG4gICAgICAgICAgcHJvY2Vzcy5zdGRlcnIud3JpdGUoXG4gICAgICAgICAgICBgVW5hYmxlIHRvIGxpc3RlbiBvbiBwb3J0ICR7ZXJyLnBvcnR9LiBUaGUgcG9ydCBpcyBhbHJlYWR5IGluIHVzZS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICAgIC8vIHZlcmlmeSB0aGUgc2VydmVyIHVybCBhZnRlciBhICdtb3VudCcgZXZlbnQgaXMgcmVjZWl2ZWRcbiAgICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgICBhcGkub24oJ21vdW50JywgZnVuY3Rpb24oKSB7XG4gICAgICAgIFBhcnNlU2VydmVyLnZlcmlmeVNlcnZlclVybCgpO1xuICAgICAgfSk7XG4gICAgfVxuICAgIGlmIChcbiAgICAgIHByb2Nlc3MuZW52LlBBUlNFX1NFUlZFUl9FTkFCTEVfRVhQRVJJTUVOVEFMX0RJUkVDVF9BQ0NFU1MgPT09ICcxJyB8fFxuICAgICAgZGlyZWN0QWNjZXNzXG4gICAgKSB7XG4gICAgICBQYXJzZS5Db3JlTWFuYWdlci5zZXRSRVNUQ29udHJvbGxlcihcbiAgICAgICAgUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlcihhcHBJZCwgYXBwUm91dGVyKVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIGFwaTtcbiAgfVxuXG4gIHN0YXRpYyBwcm9taXNlUm91dGVyKHsgYXBwSWQgfSkge1xuICAgIGNvbnN0IHJvdXRlcnMgPSBbXG4gICAgICBuZXcgQ2xhc3Nlc1JvdXRlcigpLFxuICAgICAgbmV3IFVzZXJzUm91dGVyKCksXG4gICAgICBuZXcgU2Vzc2lvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBSb2xlc1JvdXRlcigpLFxuICAgICAgbmV3IEFuYWx5dGljc1JvdXRlcigpLFxuICAgICAgbmV3IEluc3RhbGxhdGlvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBGdW5jdGlvbnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBTY2hlbWFzUm91dGVyKCksXG4gICAgICBuZXcgUHVzaFJvdXRlcigpLFxuICAgICAgbmV3IExvZ3NSb3V0ZXIoKSxcbiAgICAgIG5ldyBJQVBWYWxpZGF0aW9uUm91dGVyKCksXG4gICAgICBuZXcgRmVhdHVyZXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBHbG9iYWxDb25maWdSb3V0ZXIoKSxcbiAgICAgIG5ldyBQdXJnZVJvdXRlcigpLFxuICAgICAgbmV3IEhvb2tzUm91dGVyKCksXG4gICAgICBuZXcgQ2xvdWRDb2RlUm91dGVyKCksXG4gICAgICBuZXcgQXVkaWVuY2VzUm91dGVyKCksXG4gICAgICBuZXcgQWdncmVnYXRlUm91dGVyKCksXG4gICAgXTtcblxuICAgIGNvbnN0IHJvdXRlcyA9IHJvdXRlcnMucmVkdWNlKChtZW1vLCByb3V0ZXIpID0+IHtcbiAgICAgIHJldHVybiBtZW1vLmNvbmNhdChyb3V0ZXIucm91dGVzKTtcbiAgICB9LCBbXSk7XG5cbiAgICBjb25zdCBhcHBSb3V0ZXIgPSBuZXcgUHJvbWlzZVJvdXRlcihyb3V0ZXMsIGFwcElkKTtcblxuICAgIGJhdGNoLm1vdW50T250byhhcHBSb3V0ZXIpO1xuICAgIHJldHVybiBhcHBSb3V0ZXI7XG4gIH1cblxuICAvKipcbiAgICogc3RhcnRzIHRoZSBwYXJzZSBzZXJ2ZXIncyBleHByZXNzIGFwcFxuICAgKiBAcGFyYW0ge1BhcnNlU2VydmVyT3B0aW9uc30gb3B0aW9ucyB0byB1c2UgdG8gc3RhcnQgdGhlIHNlcnZlclxuICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBjYWxsZWQgd2hlbiB0aGUgc2VydmVyIGhhcyBzdGFydGVkXG4gICAqIEByZXR1cm5zIHtQYXJzZVNlcnZlcn0gdGhlIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhcnQob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zLCBjYWxsYmFjazogPygpID0+IHZvaWQpIHtcbiAgICBjb25zdCBhcHAgPSBleHByZXNzKCk7XG4gICAgaWYgKG9wdGlvbnMubWlkZGxld2FyZSkge1xuICAgICAgbGV0IG1pZGRsZXdhcmU7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMubWlkZGxld2FyZSA9PSAnc3RyaW5nJykge1xuICAgICAgICBtaWRkbGV3YXJlID0gcmVxdWlyZShwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgb3B0aW9ucy5taWRkbGV3YXJlKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtaWRkbGV3YXJlID0gb3B0aW9ucy5taWRkbGV3YXJlOyAvLyB1c2UgYXMtaXMgbGV0IGV4cHJlc3MgZmFpbFxuICAgICAgfVxuICAgICAgYXBwLnVzZShtaWRkbGV3YXJlKTtcbiAgICB9XG5cbiAgICBhcHAudXNlKG9wdGlvbnMubW91bnRQYXRoLCB0aGlzLmFwcCk7XG5cbiAgICBpZiAob3B0aW9ucy5tb3VudEdyYXBoUUwgPT09IHRydWUgfHwgb3B0aW9ucy5tb3VudFBsYXlncm91bmQgPT09IHRydWUpIHtcbiAgICAgIGNvbnN0IHBhcnNlR3JhcGhRTFNlcnZlciA9IG5ldyBQYXJzZUdyYXBoUUxTZXJ2ZXIodGhpcywge1xuICAgICAgICBncmFwaFFMUGF0aDogb3B0aW9ucy5ncmFwaFFMUGF0aCxcbiAgICAgICAgcGxheWdyb3VuZFBhdGg6IG9wdGlvbnMucGxheWdyb3VuZFBhdGgsXG4gICAgICB9KTtcblxuICAgICAgaWYgKG9wdGlvbnMubW91bnRHcmFwaFFMKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNlcnZlci5hcHBseUdyYXBoUUwoYXBwKTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wdGlvbnMubW91bnRQbGF5Z3JvdW5kKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNlcnZlci5hcHBseVBsYXlncm91bmQoYXBwKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCBzZXJ2ZXIgPSBhcHAubGlzdGVuKG9wdGlvbnMucG9ydCwgb3B0aW9ucy5ob3N0LCBjYWxsYmFjayk7XG4gICAgdGhpcy5zZXJ2ZXIgPSBzZXJ2ZXI7XG5cbiAgICBpZiAob3B0aW9ucy5zdGFydExpdmVRdWVyeVNlcnZlciB8fCBvcHRpb25zLmxpdmVRdWVyeVNlcnZlck9wdGlvbnMpIHtcbiAgICAgIHRoaXMubGl2ZVF1ZXJ5U2VydmVyID0gUGFyc2VTZXJ2ZXIuY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyKFxuICAgICAgICBzZXJ2ZXIsXG4gICAgICAgIG9wdGlvbnMubGl2ZVF1ZXJ5U2VydmVyT3B0aW9uc1xuICAgICAgKTtcbiAgICB9XG4gICAgLyogaXN0YW5idWwgaWdub3JlIG5leHQgKi9cbiAgICBpZiAoIXByb2Nlc3MuZW52LlRFU1RJTkcpIHtcbiAgICAgIGNvbmZpZ3VyZUxpc3RlbmVycyh0aGlzKTtcbiAgICB9XG4gICAgdGhpcy5leHByZXNzQXBwID0gYXBwO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLyoqXG4gICAqIENyZWF0ZXMgYSBuZXcgUGFyc2VTZXJ2ZXIgYW5kIHN0YXJ0cyBpdC5cbiAgICogQHBhcmFtIHtQYXJzZVNlcnZlck9wdGlvbnN9IG9wdGlvbnMgdXNlZCB0byBzdGFydCB0aGUgc2VydmVyXG4gICAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIGNhbGxlZCB3aGVuIHRoZSBzZXJ2ZXIgaGFzIHN0YXJ0ZWRcbiAgICogQHJldHVybnMge1BhcnNlU2VydmVyfSB0aGUgcGFyc2Ugc2VydmVyIGluc3RhbmNlXG4gICAqL1xuICBzdGF0aWMgc3RhcnQob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zLCBjYWxsYmFjazogPygpID0+IHZvaWQpIHtcbiAgICBjb25zdCBwYXJzZVNlcnZlciA9IG5ldyBQYXJzZVNlcnZlcihvcHRpb25zKTtcbiAgICByZXR1cm4gcGFyc2VTZXJ2ZXIuc3RhcnQob3B0aW9ucywgY2FsbGJhY2spO1xuICB9XG5cbiAgLyoqXG4gICAqIEhlbHBlciBtZXRob2QgdG8gY3JlYXRlIGEgbGl2ZVF1ZXJ5IHNlcnZlclxuICAgKiBAc3RhdGljXG4gICAqIEBwYXJhbSB7U2VydmVyfSBodHRwU2VydmVyIGFuIG9wdGlvbmFsIGh0dHAgc2VydmVyIHRvIHBhc3NcbiAgICogQHBhcmFtIHtMaXZlUXVlcnlTZXJ2ZXJPcHRpb25zfSBjb25maWcgb3B0aW9ucyBmb3QgaGUgbGl2ZVF1ZXJ5U2VydmVyXG4gICAqIEByZXR1cm5zIHtQYXJzZUxpdmVRdWVyeVNlcnZlcn0gdGhlIGxpdmUgcXVlcnkgc2VydmVyIGluc3RhbmNlXG4gICAqL1xuICBzdGF0aWMgY3JlYXRlTGl2ZVF1ZXJ5U2VydmVyKGh0dHBTZXJ2ZXIsIGNvbmZpZzogTGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucykge1xuICAgIGlmICghaHR0cFNlcnZlciB8fCAoY29uZmlnICYmIGNvbmZpZy5wb3J0KSkge1xuICAgICAgdmFyIGFwcCA9IGV4cHJlc3MoKTtcbiAgICAgIGh0dHBTZXJ2ZXIgPSByZXF1aXJlKCdodHRwJykuY3JlYXRlU2VydmVyKGFwcCk7XG4gICAgICBodHRwU2VydmVyLmxpc3Rlbihjb25maWcucG9ydCk7XG4gICAgfVxuICAgIHJldHVybiBuZXcgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIoaHR0cFNlcnZlciwgY29uZmlnKTtcbiAgfVxuXG4gIHN0YXRpYyB2ZXJpZnlTZXJ2ZXJVcmwoY2FsbGJhY2spIHtcbiAgICAvLyBwZXJmb3JtIGEgaGVhbHRoIGNoZWNrIG9uIHRoZSBzZXJ2ZXJVUkwgdmFsdWVcbiAgICBpZiAoUGFyc2Uuc2VydmVyVVJMKSB7XG4gICAgICBjb25zdCByZXF1ZXN0ID0gcmVxdWlyZSgnLi9yZXF1ZXN0Jyk7XG4gICAgICByZXF1ZXN0KHsgdXJsOiBQYXJzZS5zZXJ2ZXJVUkwucmVwbGFjZSgvXFwvJC8sICcnKSArICcvaGVhbHRoJyB9KVxuICAgICAgICAuY2F0Y2gocmVzcG9uc2UgPT4gcmVzcG9uc2UpXG4gICAgICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgICAgICBjb25zdCBqc29uID0gcmVzcG9uc2UuZGF0YSB8fCBudWxsO1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHJlc3BvbnNlLnN0YXR1cyAhPT0gMjAwIHx8XG4gICAgICAgICAgICAhanNvbiB8fFxuICAgICAgICAgICAgKGpzb24gJiYganNvbi5zdGF0dXMgIT09ICdvaycpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgICAgIGBcXG5XQVJOSU5HLCBVbmFibGUgdG8gY29ubmVjdCB0byAnJHtQYXJzZS5zZXJ2ZXJVUkx9Jy5gICtcbiAgICAgICAgICAgICAgICBgIENsb3VkIGNvZGUgYW5kIHB1c2ggbm90aWZpY2F0aW9ucyBtYXkgYmUgdW5hdmFpbGFibGUhXFxuYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uc29sZSAqL1xuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgIGNhbGxiYWNrKGZhbHNlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICAgIGNhbGxiYWNrKHRydWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGFkZFBhcnNlQ2xvdWQoKSB7XG4gIGNvbnN0IFBhcnNlQ2xvdWQgPSByZXF1aXJlKCcuL2Nsb3VkLWNvZGUvUGFyc2UuQ2xvdWQnKTtcbiAgT2JqZWN0LmFzc2lnbihQYXJzZS5DbG91ZCwgUGFyc2VDbG91ZCk7XG4gIGdsb2JhbC5QYXJzZSA9IFBhcnNlO1xufVxuXG5mdW5jdGlvbiBpbmplY3REZWZhdWx0cyhvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgT2JqZWN0LmtleXMoZGVmYXVsdHMpLmZvckVhY2goa2V5ID0+IHtcbiAgICBpZiAoIW9wdGlvbnMuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgb3B0aW9uc1trZXldID0gZGVmYXVsdHNba2V5XTtcbiAgICB9XG4gIH0pO1xuXG4gIGlmICghb3B0aW9ucy5oYXNPd25Qcm9wZXJ0eSgnc2VydmVyVVJMJykpIHtcbiAgICBvcHRpb25zLnNlcnZlclVSTCA9IGBodHRwOi8vbG9jYWxob3N0OiR7b3B0aW9ucy5wb3J0fSR7b3B0aW9ucy5tb3VudFBhdGh9YDtcbiAgfVxuXG4gIC8vIEJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG4gIGlmIChvcHRpb25zLnVzZXJTZW5zaXRpdmVGaWVsZHMpIHtcbiAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG4gICAgIXByb2Nlc3MuZW52LlRFU1RJTkcgJiZcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYFxcbkRFUFJFQ0FURUQ6IHVzZXJTZW5zaXRpdmVGaWVsZHMgaGFzIGJlZW4gcmVwbGFjZWQgYnkgcHJvdGVjdGVkRmllbGRzIGFsbG93aW5nIHRoZSBhYmlsaXR5IHRvIHByb3RlY3QgZmllbGRzIGluIGFsbCBjbGFzc2VzIHdpdGggQ0xQLiBcXG5gXG4gICAgICApO1xuICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uc29sZSAqL1xuXG4gICAgY29uc3QgdXNlclNlbnNpdGl2ZUZpZWxkcyA9IEFycmF5LmZyb20oXG4gICAgICBuZXcgU2V0KFtcbiAgICAgICAgLi4uKGRlZmF1bHRzLnVzZXJTZW5zaXRpdmVGaWVsZHMgfHwgW10pLFxuICAgICAgICAuLi4ob3B0aW9ucy51c2VyU2Vuc2l0aXZlRmllbGRzIHx8IFtdKSxcbiAgICAgIF0pXG4gICAgKTtcblxuICAgIC8vIElmIHRoZSBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyBpcyB1bnNldCxcbiAgICAvLyBpdCdsbCBiZSBhc3NpZ25lZCB0aGUgZGVmYXVsdCBhYm92ZS5cbiAgICAvLyBIZXJlLCBwcm90ZWN0IGFnYWluc3QgdGhlIGNhc2Ugd2hlcmUgcHJvdGVjdGVkRmllbGRzXG4gICAgLy8gaXMgc2V0LCBidXQgZG9lc24ndCBoYXZlIF9Vc2VyLlxuICAgIGlmICghKCdfVXNlcicgaW4gb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHMpKSB7XG4gICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyA9IE9iamVjdC5hc3NpZ24oXG4gICAgICAgIHsgX1VzZXI6IFtdIH0sXG4gICAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzXG4gICAgICApO1xuICAgIH1cblxuICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzWydfVXNlciddWycqJ10gPSBBcnJheS5mcm9tKFxuICAgICAgbmV3IFNldChbXG4gICAgICAgIC4uLihvcHRpb25zLnByb3RlY3RlZEZpZWxkc1snX1VzZXInXVsnKiddIHx8IFtdKSxcbiAgICAgICAgLi4udXNlclNlbnNpdGl2ZUZpZWxkcyxcbiAgICAgIF0pXG4gICAgKTtcbiAgfVxuXG4gIC8vIE1lcmdlIHByb3RlY3RlZEZpZWxkcyBvcHRpb25zIHdpdGggZGVmYXVsdHMuXG4gIE9iamVjdC5rZXlzKGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkcykuZm9yRWFjaChjID0+IHtcbiAgICBjb25zdCBjdXIgPSBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXTtcbiAgICBpZiAoIWN1cikge1xuICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY10gPSBkZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHNbY107XG4gICAgfSBlbHNlIHtcbiAgICAgIE9iamVjdC5rZXlzKGRlZmF1bHRzLnByb3RlY3RlZEZpZWxkc1tjXSkuZm9yRWFjaChyID0+IHtcbiAgICAgICAgY29uc3QgdW5xID0gbmV3IFNldChbXG4gICAgICAgICAgLi4uKG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdW3JdIHx8IFtdKSxcbiAgICAgICAgICAuLi5kZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0sXG4gICAgICAgIF0pO1xuICAgICAgICBvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXVtyXSA9IEFycmF5LmZyb20odW5xKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgb3B0aW9ucy5tYXN0ZXJLZXlJcHMgPSBBcnJheS5mcm9tKFxuICAgIG5ldyBTZXQoXG4gICAgICBvcHRpb25zLm1hc3RlcktleUlwcy5jb25jYXQoZGVmYXVsdHMubWFzdGVyS2V5SXBzLCBvcHRpb25zLm1hc3RlcktleUlwcylcbiAgICApXG4gICk7XG59XG5cbi8vIFRob3NlIGNhbid0IGJlIHRlc3RlZCBhcyBpdCByZXF1aXJlcyBhIHN1YnByb2Nlc3Ncbi8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG5mdW5jdGlvbiBjb25maWd1cmVMaXN0ZW5lcnMocGFyc2VTZXJ2ZXIpIHtcbiAgY29uc3Qgc2VydmVyID0gcGFyc2VTZXJ2ZXIuc2VydmVyO1xuICBjb25zdCBzb2NrZXRzID0ge307XG4gIC8qIEN1cnJlbnRseSwgZXhwcmVzcyBkb2Vzbid0IHNodXQgZG93biBpbW1lZGlhdGVseSBhZnRlciByZWNlaXZpbmcgU0lHSU5UL1NJR1RFUk0gaWYgaXQgaGFzIGNsaWVudCBjb25uZWN0aW9ucyB0aGF0IGhhdmVuJ3QgdGltZWQgb3V0LiAoVGhpcyBpcyBhIGtub3duIGlzc3VlIHdpdGggbm9kZSAtIGh0dHBzOi8vZ2l0aHViLmNvbS9ub2RlanMvbm9kZS9pc3N1ZXMvMjY0MilcbiAgICBUaGlzIGZ1bmN0aW9uLCBhbG9uZyB3aXRoIGBkZXN0cm95QWxpdmVDb25uZWN0aW9ucygpYCwgaW50ZW5kIHRvIGZpeCB0aGlzIGJlaGF2aW9yIHN1Y2ggdGhhdCBwYXJzZSBzZXJ2ZXIgd2lsbCBjbG9zZSBhbGwgb3BlbiBjb25uZWN0aW9ucyBhbmQgaW5pdGlhdGUgdGhlIHNodXRkb3duIHByb2Nlc3MgYXMgc29vbiBhcyBpdCByZWNlaXZlcyBhIFNJR0lOVC9TSUdURVJNIHNpZ25hbC4gKi9cbiAgc2VydmVyLm9uKCdjb25uZWN0aW9uJywgc29ja2V0ID0+IHtcbiAgICBjb25zdCBzb2NrZXRJZCA9IHNvY2tldC5yZW1vdGVBZGRyZXNzICsgJzonICsgc29ja2V0LnJlbW90ZVBvcnQ7XG4gICAgc29ja2V0c1tzb2NrZXRJZF0gPSBzb2NrZXQ7XG4gICAgc29ja2V0Lm9uKCdjbG9zZScsICgpID0+IHtcbiAgICAgIGRlbGV0ZSBzb2NrZXRzW3NvY2tldElkXTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgY29uc3QgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMgPSBmdW5jdGlvbigpIHtcbiAgICBmb3IgKGNvbnN0IHNvY2tldElkIGluIHNvY2tldHMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHNvY2tldHNbc29ja2V0SWRdLmRlc3Ryb3koKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgLyogKi9cbiAgICAgIH1cbiAgICB9XG4gIH07XG5cbiAgY29uc3QgaGFuZGxlU2h1dGRvd24gPSBmdW5jdGlvbigpIHtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZSgnVGVybWluYXRpb24gc2lnbmFsIHJlY2VpdmVkLiBTaHV0dGluZyBkb3duLicpO1xuICAgIGRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zKCk7XG4gICAgc2VydmVyLmNsb3NlKCk7XG4gICAgcGFyc2VTZXJ2ZXIuaGFuZGxlU2h1dGRvd24oKTtcbiAgfTtcbiAgcHJvY2Vzcy5vbignU0lHVEVSTScsIGhhbmRsZVNodXRkb3duKTtcbiAgcHJvY2Vzcy5vbignU0lHSU5UJywgaGFuZGxlU2h1dGRvd24pO1xufVxuXG5leHBvcnQgZGVmYXVsdCBQYXJzZVNlcnZlcjtcbiJdfQ==