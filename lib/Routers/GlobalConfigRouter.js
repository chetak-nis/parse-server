"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.GlobalConfigRouter = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _PromiseRouter = _interopRequireDefault(require("../PromiseRouter"));

var middleware = _interopRequireWildcard(require("../middlewares"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

// global_config.js
class GlobalConfigRouter extends _PromiseRouter.default {
  getGlobalConfig(req) {
    return req.config.database.find('_GlobalConfig', {
      objectId: '1'
    }, {
      limit: 1
    }).then(results => {
      if (results.length != 1) {
        // If there is no config in the database - return empty config.
        return {
          response: {
            params: {}
          }
        };
      }

      const globalConfig = results[0];
      return {
        response: {
          params: globalConfig.params
        }
      };
    });
  }

  updateGlobalConfig(req) {
    if (req.auth.isReadOnly) {
      throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, "read-only masterKey isn't allowed to update the config.");
    }

    const params = req.body.params; // Transform in dot notation to make sure it works

    const update = Object.keys(params).reduce((acc, key) => {
      acc[`params.${key}`] = params[key];
      return acc;
    }, {});
    return req.config.database.update('_GlobalConfig', {
      objectId: '1'
    }, update, {
      upsert: true
    }).then(() => ({
      response: {
        result: true
      }
    }));
  }

  mountRoutes() {
    this.route('GET', '/config', req => {
      return this.getGlobalConfig(req);
    });
    this.route('PUT', '/config', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.updateGlobalConfig(req);
    });
  }

}

exports.GlobalConfigRouter = GlobalConfigRouter;
var _default = GlobalConfigRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0dsb2JhbENvbmZpZ1JvdXRlci5qcyJdLCJuYW1lcyI6WyJHbG9iYWxDb25maWdSb3V0ZXIiLCJQcm9taXNlUm91dGVyIiwiZ2V0R2xvYmFsQ29uZmlnIiwicmVxIiwiY29uZmlnIiwiZGF0YWJhc2UiLCJmaW5kIiwib2JqZWN0SWQiLCJsaW1pdCIsInRoZW4iLCJyZXN1bHRzIiwibGVuZ3RoIiwicmVzcG9uc2UiLCJwYXJhbXMiLCJnbG9iYWxDb25maWciLCJ1cGRhdGVHbG9iYWxDb25maWciLCJhdXRoIiwiaXNSZWFkT25seSIsIlBhcnNlIiwiRXJyb3IiLCJPUEVSQVRJT05fRk9SQklEREVOIiwiYm9keSIsInVwZGF0ZSIsIk9iamVjdCIsImtleXMiLCJyZWR1Y2UiLCJhY2MiLCJrZXkiLCJ1cHNlcnQiLCJyZXN1bHQiLCJtb3VudFJvdXRlcyIsInJvdXRlIiwibWlkZGxld2FyZSIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBSEE7QUFLTyxNQUFNQSxrQkFBTixTQUFpQ0Msc0JBQWpDLENBQStDO0FBQ3BEQyxFQUFBQSxlQUFlLENBQUNDLEdBQUQsRUFBTTtBQUNuQixXQUFPQSxHQUFHLENBQUNDLE1BQUosQ0FBV0MsUUFBWCxDQUNKQyxJQURJLENBQ0MsZUFERCxFQUNrQjtBQUFFQyxNQUFBQSxRQUFRLEVBQUU7QUFBWixLQURsQixFQUNxQztBQUFFQyxNQUFBQSxLQUFLLEVBQUU7QUFBVCxLQURyQyxFQUVKQyxJQUZJLENBRUNDLE9BQU8sSUFBSTtBQUNmLFVBQUlBLE9BQU8sQ0FBQ0MsTUFBUixJQUFrQixDQUF0QixFQUF5QjtBQUN2QjtBQUNBLGVBQU87QUFBRUMsVUFBQUEsUUFBUSxFQUFFO0FBQUVDLFlBQUFBLE1BQU0sRUFBRTtBQUFWO0FBQVosU0FBUDtBQUNEOztBQUNELFlBQU1DLFlBQVksR0FBR0osT0FBTyxDQUFDLENBQUQsQ0FBNUI7QUFDQSxhQUFPO0FBQUVFLFFBQUFBLFFBQVEsRUFBRTtBQUFFQyxVQUFBQSxNQUFNLEVBQUVDLFlBQVksQ0FBQ0Q7QUFBdkI7QUFBWixPQUFQO0FBQ0QsS0FUSSxDQUFQO0FBVUQ7O0FBRURFLEVBQUFBLGtCQUFrQixDQUFDWixHQUFELEVBQU07QUFDdEIsUUFBSUEsR0FBRyxDQUFDYSxJQUFKLENBQVNDLFVBQWIsRUFBeUI7QUFDdkIsWUFBTSxJQUFJQyxjQUFNQyxLQUFWLENBQ0pELGNBQU1DLEtBQU4sQ0FBWUMsbUJBRFIsRUFFSix5REFGSSxDQUFOO0FBSUQ7O0FBQ0QsVUFBTVAsTUFBTSxHQUFHVixHQUFHLENBQUNrQixJQUFKLENBQVNSLE1BQXhCLENBUHNCLENBUXRCOztBQUNBLFVBQU1TLE1BQU0sR0FBR0MsTUFBTSxDQUFDQyxJQUFQLENBQVlYLE1BQVosRUFBb0JZLE1BQXBCLENBQTJCLENBQUNDLEdBQUQsRUFBTUMsR0FBTixLQUFjO0FBQ3RERCxNQUFBQSxHQUFHLENBQUUsVUFBU0MsR0FBSSxFQUFmLENBQUgsR0FBdUJkLE1BQU0sQ0FBQ2MsR0FBRCxDQUE3QjtBQUNBLGFBQU9ELEdBQVA7QUFDRCxLQUhjLEVBR1osRUFIWSxDQUFmO0FBSUEsV0FBT3ZCLEdBQUcsQ0FBQ0MsTUFBSixDQUFXQyxRQUFYLENBQ0ppQixNQURJLENBQ0csZUFESCxFQUNvQjtBQUFFZixNQUFBQSxRQUFRLEVBQUU7QUFBWixLQURwQixFQUN1Q2UsTUFEdkMsRUFDK0M7QUFBRU0sTUFBQUEsTUFBTSxFQUFFO0FBQVYsS0FEL0MsRUFFSm5CLElBRkksQ0FFQyxPQUFPO0FBQUVHLE1BQUFBLFFBQVEsRUFBRTtBQUFFaUIsUUFBQUEsTUFBTSxFQUFFO0FBQVY7QUFBWixLQUFQLENBRkQsQ0FBUDtBQUdEOztBQUVEQyxFQUFBQSxXQUFXLEdBQUc7QUFDWixTQUFLQyxLQUFMLENBQVcsS0FBWCxFQUFrQixTQUFsQixFQUE2QjVCLEdBQUcsSUFBSTtBQUNsQyxhQUFPLEtBQUtELGVBQUwsQ0FBcUJDLEdBQXJCLENBQVA7QUFDRCxLQUZEO0FBR0EsU0FBSzRCLEtBQUwsQ0FDRSxLQURGLEVBRUUsU0FGRixFQUdFQyxVQUFVLENBQUNDLDZCQUhiLEVBSUU5QixHQUFHLElBQUk7QUFDTCxhQUFPLEtBQUtZLGtCQUFMLENBQXdCWixHQUF4QixDQUFQO0FBQ0QsS0FOSDtBQVFEOztBQTVDbUQ7OztlQStDdkNILGtCIiwic291cmNlc0NvbnRlbnQiOlsiLy8gZ2xvYmFsX2NvbmZpZy5qc1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi4vUHJvbWlzZVJvdXRlcic7XG5pbXBvcnQgKiBhcyBtaWRkbGV3YXJlIGZyb20gJy4uL21pZGRsZXdhcmVzJztcblxuZXhwb3J0IGNsYXNzIEdsb2JhbENvbmZpZ1JvdXRlciBleHRlbmRzIFByb21pc2VSb3V0ZXIge1xuICBnZXRHbG9iYWxDb25maWcocmVxKSB7XG4gICAgcmV0dXJuIHJlcS5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5maW5kKCdfR2xvYmFsQ29uZmlnJywgeyBvYmplY3RJZDogJzEnIH0sIHsgbGltaXQ6IDEgfSlcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgIC8vIElmIHRoZXJlIGlzIG5vIGNvbmZpZyBpbiB0aGUgZGF0YWJhc2UgLSByZXR1cm4gZW1wdHkgY29uZmlnLlxuICAgICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB7IHBhcmFtczoge30gfSB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGdsb2JhbENvbmZpZyA9IHJlc3VsdHNbMF07XG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlOiB7IHBhcmFtczogZ2xvYmFsQ29uZmlnLnBhcmFtcyB9IH07XG4gICAgICB9KTtcbiAgfVxuXG4gIHVwZGF0ZUdsb2JhbENvbmZpZyhyZXEpIHtcbiAgICBpZiAocmVxLmF1dGguaXNSZWFkT25seSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICBcInJlYWQtb25seSBtYXN0ZXJLZXkgaXNuJ3QgYWxsb3dlZCB0byB1cGRhdGUgdGhlIGNvbmZpZy5cIlxuICAgICAgKTtcbiAgICB9XG4gICAgY29uc3QgcGFyYW1zID0gcmVxLmJvZHkucGFyYW1zO1xuICAgIC8vIFRyYW5zZm9ybSBpbiBkb3Qgbm90YXRpb24gdG8gbWFrZSBzdXJlIGl0IHdvcmtzXG4gICAgY29uc3QgdXBkYXRlID0gT2JqZWN0LmtleXMocGFyYW1zKS5yZWR1Y2UoKGFjYywga2V5KSA9PiB7XG4gICAgICBhY2NbYHBhcmFtcy4ke2tleX1gXSA9IHBhcmFtc1trZXldO1xuICAgICAgcmV0dXJuIGFjYztcbiAgICB9LCB7fSk7XG4gICAgcmV0dXJuIHJlcS5jb25maWcuZGF0YWJhc2VcbiAgICAgIC51cGRhdGUoJ19HbG9iYWxDb25maWcnLCB7IG9iamVjdElkOiAnMScgfSwgdXBkYXRlLCB7IHVwc2VydDogdHJ1ZSB9KVxuICAgICAgLnRoZW4oKCkgPT4gKHsgcmVzcG9uc2U6IHsgcmVzdWx0OiB0cnVlIH0gfSkpO1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZSgnR0VUJywgJy9jb25maWcnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0R2xvYmFsQ29uZmlnKHJlcSk7XG4gICAgfSk7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdQVVQnLFxuICAgICAgJy9jb25maWcnLFxuICAgICAgbWlkZGxld2FyZS5wcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyxcbiAgICAgIHJlcSA9PiB7XG4gICAgICAgIHJldHVybiB0aGlzLnVwZGF0ZUdsb2JhbENvbmZpZyhyZXEpO1xuICAgICAgfVxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgR2xvYmFsQ29uZmlnUm91dGVyO1xuIl19