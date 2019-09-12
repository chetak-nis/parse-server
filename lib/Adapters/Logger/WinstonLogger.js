"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.configureLogger = configureLogger;
exports.addTransport = addTransport;
exports.removeTransport = removeTransport;
exports.default = exports.logger = void 0;

var _winston = _interopRequireWildcard(require("winston"));

var _fs = _interopRequireDefault(require("fs"));

var _path = _interopRequireDefault(require("path"));

var _winstonDailyRotateFile = _interopRequireDefault(require("winston-daily-rotate-file"));

var _lodash = _interopRequireDefault(require("lodash"));

var _defaults = _interopRequireDefault(require("../../defaults"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const logger = _winston.default.createLogger();

exports.logger = logger;

function configureTransports(options) {
  const transports = [];

  if (options) {
    const silent = options.silent;
    delete options.silent;

    if (!_lodash.default.isNil(options.dirname)) {
      const parseServer = new _winstonDailyRotateFile.default(Object.assign({
        filename: 'parse-server.info',
        json: true,
        format: _winston.format.combine(_winston.format.timestamp(), _winston.format.json())
      }, options));
      parseServer.name = 'parse-server';
      transports.push(parseServer);
      const parseServerError = new _winstonDailyRotateFile.default(Object.assign({
        filename: 'parse-server.err',
        json: true,
        format: _winston.format.combine(_winston.format.timestamp(), _winston.format.splat(), _winston.format.json())
      }, options, {
        level: 'error'
      }));
      parseServerError.name = 'parse-server-error';
      transports.push(parseServerError);
    }

    const consoleFormat = options.json ? _winston.format.json() : _winston.format.simple();
    const consoleOptions = Object.assign({
      colorize: true,
      name: 'console',
      silent,
      format: consoleFormat
    }, options);
    transports.push(new _winston.default.transports.Console(consoleOptions));
  }

  logger.configure({
    transports
  });
}

function configureLogger({
  logsFolder = _defaults.default.logsFolder,
  jsonLogs = _defaults.default.jsonLogs,
  logLevel = _winston.default.level,
  verbose = _defaults.default.verbose,
  silent = _defaults.default.silent
} = {}) {
  if (verbose) {
    logLevel = 'verbose';
  }

  _winston.default.level = logLevel;
  const options = {};

  if (logsFolder) {
    if (!_path.default.isAbsolute(logsFolder)) {
      logsFolder = _path.default.resolve(process.cwd(), logsFolder);
    }

    try {
      _fs.default.mkdirSync(logsFolder);
    } catch (e) {
      /* */
    }
  }

  options.dirname = logsFolder;
  options.level = logLevel;
  options.silent = silent;

  if (jsonLogs) {
    options.json = true;
    options.stringify = true;
  }

  configureTransports(options);
}

function addTransport(transport) {
  // we will remove the existing transport
  // before replacing it with a new one
  removeTransport(transport.name);
  logger.add(transport);
}

function removeTransport(transport) {
  const matchingTransport = logger.transports.find(t1 => {
    return typeof transport === 'string' ? t1.name === transport : t1 === transport;
  });

  if (matchingTransport) {
    logger.remove(matchingTransport);
  }
}

var _default = logger;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BZGFwdGVycy9Mb2dnZXIvV2luc3RvbkxvZ2dlci5qcyJdLCJuYW1lcyI6WyJsb2dnZXIiLCJ3aW5zdG9uIiwiY3JlYXRlTG9nZ2VyIiwiY29uZmlndXJlVHJhbnNwb3J0cyIsIm9wdGlvbnMiLCJ0cmFuc3BvcnRzIiwic2lsZW50IiwiXyIsImlzTmlsIiwiZGlybmFtZSIsInBhcnNlU2VydmVyIiwiRGFpbHlSb3RhdGVGaWxlIiwiT2JqZWN0IiwiYXNzaWduIiwiZmlsZW5hbWUiLCJqc29uIiwiZm9ybWF0IiwiY29tYmluZSIsInRpbWVzdGFtcCIsIm5hbWUiLCJwdXNoIiwicGFyc2VTZXJ2ZXJFcnJvciIsInNwbGF0IiwibGV2ZWwiLCJjb25zb2xlRm9ybWF0Iiwic2ltcGxlIiwiY29uc29sZU9wdGlvbnMiLCJjb2xvcml6ZSIsIkNvbnNvbGUiLCJjb25maWd1cmUiLCJjb25maWd1cmVMb2dnZXIiLCJsb2dzRm9sZGVyIiwiZGVmYXVsdHMiLCJqc29uTG9ncyIsImxvZ0xldmVsIiwidmVyYm9zZSIsInBhdGgiLCJpc0Fic29sdXRlIiwicmVzb2x2ZSIsInByb2Nlc3MiLCJjd2QiLCJmcyIsIm1rZGlyU3luYyIsImUiLCJzdHJpbmdpZnkiLCJhZGRUcmFuc3BvcnQiLCJ0cmFuc3BvcnQiLCJyZW1vdmVUcmFuc3BvcnQiLCJhZGQiLCJtYXRjaGluZ1RyYW5zcG9ydCIsImZpbmQiLCJ0MSIsInJlbW92ZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLE1BQU0sR0FBR0MsaUJBQVFDLFlBQVIsRUFBZjs7OztBQUVBLFNBQVNDLG1CQUFULENBQTZCQyxPQUE3QixFQUFzQztBQUNwQyxRQUFNQyxVQUFVLEdBQUcsRUFBbkI7O0FBQ0EsTUFBSUQsT0FBSixFQUFhO0FBQ1gsVUFBTUUsTUFBTSxHQUFHRixPQUFPLENBQUNFLE1BQXZCO0FBQ0EsV0FB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Q0FBQ0ssT0FBUixHQUFrQnNCLFVBQWxCO0FBQ0EzQixFQUFBQSxPQUFPLENBQUNtQixLQUFSLEdBQWdCVyxRQUFoQjtBQUNBOUIsRUFBQUEsT0FBTyxDQUFDRSxNQUFSLEdBQWlCQSxNQUFqQjs7QUFFQSxNQUFJMkIsUUFBSixFQUFjO0FBQ1o3QixJQUFBQSxPQUFPLENBQUNXLElBQVIsR0FBZSxJQUFmO0FBQ0FYLElBQUFBLE9BQU8sQ0FBQ3dDLFNBQVIsR0FBb0IsSUFBcEI7QUFDRDs7QUFDRHpDLEVBQUFBLG1CQUFtQixDQUFDQyxPQUFELENBQW5CO0FBQ0Q7O0FBRU0sU0FBU3lDLFlBQVQsQ0FBc0JDLFNBQXRCLEVBQWlDO0FBQ3RDO0FBQ0E7QUFDQUMsRUFBQUEsZUFBZSxDQUFDRCxTQUFTLENBQUMzQixJQUFYLENBQWY7QUFFQW5CLEVBQUFBLE1BQU0sQ0FBQ2dELEdBQVAsQ0FBV0YsU0FBWDtBQUNEOztBQUVNLFNBQVNDLGVBQVQsQ0FBeUJELFNBQXpCLEVBQW9DO0FBQ3pDLFFBQU1HLGlCQUFpQixHQUFHakQsTUFBTSxDQUFDSyxVQUFQLENBQWtCNkMsSUFBbEIsQ0FBdUJDLEVBQUUsSUFBSTtBQUNyRCxXQUFPLE9BQU9MLFNBQVAsS0FBcUIsUUFBckIsR0FDSEssRUFBRSxDQUFDaEMsSUFBSCxLQUFZMkIsU0FEVCxHQUVISyxFQUFFLEtBQUtMLFNBRlg7QUFHRCxHQUp5QixDQUExQjs7QUFNQSxNQUFJRyxpQkFBSixFQUF1QjtBQUNyQmpELElBQUFBLE1BQU0sQ0FBQ29ELE1BQVAsQ0FBY0gsaUJBQWQ7QUFDRDtBQUNGOztlQUdjakQsTSIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB3aW5zdG9uLCB7IGZvcm1hdCB9IGZyb20gJ3dpbnN0b24nO1xuaW1wb3J0IGZzIGZyb20gJ2ZzJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IERhaWx5Um90YXRlRmlsZSBmcm9tICd3aW5zdG9uLWRhaWx5LXJvdGF0ZS1maWxlJztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi4vLi4vZGVmYXVsdHMnO1xuXG5jb25zdCBsb2dnZXIgPSB3aW5zdG9uLmNyZWF0ZUxvZ2dlcigpO1xuXG5mdW5jdGlvbiBjb25maWd1cmVUcmFuc3BvcnRzKG9wdGlvbnMpIHtcbiAgY29uc3QgdHJhbnNwb3J0cyA9IFtdO1xuICBpZiAob3B0aW9ucykge1xuICAgIGNvbnN0IHNpbGVudCA9IG9wdGlvbnMuc2lsZW50O1xuICAgIGRlbGV0ZSBvcHRpb25zLnNpbGVudDtcblxuICAgIGlmICghXy5pc05pbChvcHRpb25zLmRpcm5hbWUpKSB7XG4gICAgICBjb25zdCBwYXJzZVNlcnZlciA9IG5ldyBEYWlseVJvdGF0ZUZpbGUoXG4gICAgICAgIE9iamVjdC5hc3NpZ24oXG4gICAgICAgICAge1xuICAgICAgICAgICAgZmlsZW5hbWU6ICdwYXJzZS1zZXJ2ZXIuaW5mbycsXG4gICAgICAgICAgICBqc29uOiB0cnVlLFxuICAgICAgICAgICAgZm9ybWF0OiBmb3JtYXQuY29tYmluZShmb3JtYXQudGltZXN0YW1wKCksIGZvcm1hdC5qc29uKCkpLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgb3B0aW9uc1xuICAgICAgICApXG4gICAgICApO1xuICAgICAgcGFyc2VTZXJ2ZXIubmFtZSA9ICdwYXJzZS1zZXJ2ZXInO1xuICAgICAgdHJhbnNwb3J0cy5wdXNoKHBhcnNlU2VydmVyKTtcblxuICAgICAgY29uc3QgcGFyc2VTZXJ2ZXJFcnJvciA9IG5ldyBEYWlseVJvdGF0ZUZpbGUoXG4gICAgICAgIE9iamVjdC5hc3NpZ24oXG4gICAgICAgICAge1xuICAgICAgICAgICAgZmlsZW5hbWU6ICdwYXJzZS1zZXJ2ZXIuZXJyJyxcbiAgICAgICAgICAgIGpzb246IHRydWUsXG4gICAgICAgICAgICBmb3JtYXQ6IGZvcm1hdC5jb21iaW5lKFxuICAgICAgICAgICAgICBmb3JtYXQudGltZXN0YW1wKCksXG4gICAgICAgICAgICAgIGZvcm1hdC5zcGxhdCgpLFxuICAgICAgICAgICAgICBmb3JtYXQuanNvbigpXG4gICAgICAgICAgICApLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgb3B0aW9ucyxcbiAgICAgICAgICB7IGxldmVsOiAnZXJyb3InIH1cbiAgICAgICAgKVxuICAgICAgKTtcbiAgICAgIHBhcnNlU2VydmVyRXJyb3IubmFtZSA9ICdwYXJzZS1zZXJ2ZXItZXJyb3InO1xuICAgICAgdHJhbnNwb3J0cy5wdXNoKHBhcnNlU2VydmVyRXJyb3IpO1xuICAgIH1cblxuICAgIGNvbnN0IGNvbnNvbGVGb3JtYXQgPSBvcHRpb25zLmpzb24gPyBmb3JtYXQuanNvbigpIDogZm9ybWF0LnNpbXBsZSgpO1xuICAgIGNvbnN0IGNvbnNvbGVPcHRpb25zID0gT2JqZWN0LmFzc2lnbihcbiAgICAgIHtcbiAgICAgICAgY29sb3JpemU6IHRydWUsXG4gICAgICAgIG5hbWU6ICdjb25zb2xlJyxcbiAgICAgICAgc2lsZW50LFxuICAgICAgICBmb3JtYXQ6IGNvbnNvbGVGb3JtYXQsXG4gICAgICB9LFxuICAgICAgb3B0aW9uc1xuICAgICk7XG5cbiAgICB0cmFuc3BvcnRzLnB1c2gobmV3IHdpbnN0b24udHJhbnNwb3J0cy5Db25zb2xlKGNvbnNvbGVPcHRpb25zKSk7XG4gIH1cblxuICBsb2dnZXIuY29uZmlndXJlKHtcbiAgICB0cmFuc3BvcnRzLFxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbmZpZ3VyZUxvZ2dlcih7XG4gIGxvZ3NGb2xkZXIgPSBkZWZhdWx0cy5sb2dzRm9sZGVyLFxuICBqc29uTG9ncyA9IGRlZmF1bHRzLmpzb25Mb2dzLFxuICBsb2dMZXZlbCA9IHdpbnN0b24ubGV2ZWwsXG4gIHZlcmJvc2UgPSBkZWZhdWx0cy52ZXJib3NlLFxuICBzaWxlbnQgPSBkZWZhdWx0cy5zaWxlbnQsXG59ID0ge30pIHtcbiAgaWYgKHZlcmJvc2UpIHtcbiAgICBsb2dMZXZlbCA9ICd2ZXJib3NlJztcbiAgfVxuXG4gIHdpbnN0b24ubGV2ZWwgPSBsb2dMZXZlbDtcbiAgY29uc3Qgb3B0aW9ucyA9IHt9O1xuXG4gIGlmIChsb2dzRm9sZGVyKSB7XG4gICAgaWYgKCFwYXRoLmlzQWJzb2x1dGUobG9nc0ZvbGRlcikpIHtcbiAgICAgIGxvZ3NGb2xkZXIgPSBwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgbG9nc0ZvbGRlcik7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBmcy5ta2RpclN5bmMobG9nc0ZvbGRlcik7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgLyogKi9cbiAgICB9XG4gIH1cbiAgb3B0aW9ucy5kaXJuYW1lID0gbG9nc0ZvbGRlcjtcbiAgb3B0aW9ucy5sZXZlbCA9IGxvZ0xldmVsO1xuICBvcHRpb25zLnNpbGVudCA9IHNpbGVudDtcblxuICBpZiAoanNvbkxvZ3MpIHtcbiAgICBvcHRpb25zLmpzb24gPSB0cnVlO1xuICAgIG9wdGlvbnMuc3RyaW5naWZ5ID0gdHJ1ZTtcbiAgfVxuICBjb25maWd1cmVUcmFuc3BvcnRzKG9wdGlvbnMpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWRkVHJhbnNwb3J0KHRyYW5zcG9ydCkge1xuICAvLyB3ZSB3aWxsIHJlbW92ZSB0aGUgZXhpc3RpbmcgdHJhbnNwb3J0XG4gIC8vIGJlZm9yZSByZXBsYWNpbmcgaXQgd2l0aCBhIG5ldyBvbmVcbiAgcmVtb3ZlVHJhbnNwb3J0KHRyYW5zcG9ydC5uYW1lKTtcblxuICBsb2dnZXIuYWRkKHRyYW5zcG9ydCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVUcmFuc3BvcnQodHJhbnNwb3J0KSB7XG4gIGNvbnN0IG1hdGNoaW5nVHJhbnNwb3J0ID0gbG9nZ2VyLnRyYW5zcG9ydHMuZmluZCh0MSA9PiB7XG4gICAgcmV0dXJuIHR5cGVvZiB0cmFuc3BvcnQgPT09ICdzdHJpbmcnXG4gICAgICA/IHQxLm5hbWUgPT09IHRyYW5zcG9ydFxuICAgICAgOiB0MSA9PT0gdHJhbnNwb3J0O1xuICB9KTtcblxuICBpZiAobWF0Y2hpbmdUcmFuc3BvcnQpIHtcbiAgICBsb2dnZXIucmVtb3ZlKG1hdGNoaW5nVHJhbnNwb3J0KTtcbiAgfVxufVxuXG5leHBvcnQgeyBsb2dnZXIgfTtcbmV4cG9ydCBkZWZhdWx0IGxvZ2dlcjtcbiJdfQ==