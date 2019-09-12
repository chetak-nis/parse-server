"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.AggregateRouter = void 0;

var _ClassesRouter = _interopRequireDefault(require("./ClassesRouter"));

var _rest = _interopRequireDefault(require("../rest"));

var middleware = _interopRequireWildcard(require("../middlewares"));

var _node = _interopRequireDefault(require("parse/node"));

var _UsersRouter = _interopRequireDefault(require("./UsersRouter"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const BASE_KEYS = ['where', 'distinct', 'pipeline'];
const PIPELINE_KEYS = ['addFields', 'bucket', 'bucketAuto', 'collStats', 'count', 'currentOp', 'facet', 'geoNear', 'graphLookup', 'group', 'indexStats', 'limit', 'listLocalSessions', 'listSessions', 'lookup', 'match', 'out', 'project', 'redact', 'replaceRoot', 'sample', 'skip', 'sort', 'sortByCount', 'unwind'];
const ALLOWED_KEYS = [...BASE_KEYS, ...PIPELINE_KEYS];

class AggregateRouter extends _ClassesRouter.default {
  handleFind(req) {
    const body = Object.assign(req.body, _ClassesRouter.default.JSONFromQuery(req.query));
    const options = {};

    if (body.distinct) {
      options.distinct = String(body.distinct);
    }

    options.pipeline = AggregateRouter.getPipeline(body);

    if (typeof body.where === 'string') {
      body.where = JSON.parse(body.where);
    }

    return _rest.default.find(req.config, req.auth, this.className(req), body.where, options, req.info.clientSDK).then(response => {
      for (const result of response.results) {
        if (typeof result === 'object') {
          _UsersRouter.default.removeHiddenProperties(result);
        }
      }

      return {
        response
      };
    });
  }
  /* Builds a pipeline from the body. Originally the body could be passed as a single object,
   * and now we support many options
   *
   * Array
   *
   * body: [{
   *   group: { objectId: '$name' },
   * }]
   *
   * Object
   *
   * body: {
   *   group: { objectId: '$name' },
   * }
   *
   *
   * Pipeline Operator with an Array or an Object
   *
   * body: {
   *   pipeline: {
   *     group: { objectId: '$name' },
   *   }
   * }
   *
   */


  static getPipeline(body) {
    let pipeline = body.pipeline || body;

    if (!Array.isArray(pipeline)) {
      pipeline = Object.keys(pipeline).map(key => {
        return {
          [key]: pipeline[key]
        };
      });
    }

    return pipeline.map(stage => {
      const keys = Object.keys(stage);

      if (keys.length != 1) {
        throw new Error(`Pipeline stages should only have one key found ${keys.join(', ')}`);
      }

      return AggregateRouter.transformStage(keys[0], stage);
    });
  }

  static transformStage(stageName, stage) {
    if (ALLOWED_KEYS.indexOf(stageName) === -1) {
      throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Invalid parameter for query: ${stageName}`);
    }

    if (stageName === 'group') {
      if (stage[stageName].hasOwnProperty('_id')) {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Invalid parameter for query: group. Please use objectId instead of _id`);
      }

      if (!stage[stageName].hasOwnProperty('objectId')) {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Invalid parameter for query: group. objectId is required`);
      }

      stage[stageName]._id = stage[stageName].objectId;
      delete stage[stageName].objectId;
    }

    return {
      [`$${stageName}`]: stage[stageName]
    };
  }

  mountRoutes() {
    this.route('GET', '/aggregate/:className', middleware.promiseEnforceMasterKeyAccess, req => {
      return this.handleFind(req);
    });
  }

}

exports.AggregateRouter = AggregateRouter;
var _default = AggregateRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0FnZ3JlZ2F0ZVJvdXRlci5qcyJdLCJuYW1lcyI6WyJCQVNFX0tFWVMiLCJQSVBFTElORV9LRVlTIiwiQUxMT1dFRF9LRVlTIiwiQWdncmVnYXRlUm91dGVyIiwiQ2xhc3Nlc1JvdXRlciIsImhhbmRsZUZpbmQiLCJyZXEiLCJib2R5IiwiT2JqZWN0IiwiYXNzaWduIiwiSlNPTkZyb21RdWVyeSIsInF1ZXJ5Iiwib3B0aW9ucyIsImRpc3RpbmN0IiwiU3RyaW5nIiwicGlwZWxpbmUiLCJnZXRQaXBlbGluZSIsIndoZXJlIiwiSlNPTiIsInBhcnNlIiwicmVzdCIsImZpbmQiLCJjb25maWciLCJhdXRoIiwiY2xhc3NOYW1lIiwiaW5mbyIsImNsaWVudFNESyIsInRoZW4iLCJyZXNwb25zZSIsInJlc3VsdCIsInJlc3VsdHMiLCJVc2Vyc1JvdXRlciIsInJlbW92ZUhpZGRlblByb3BlcnRpZXMiLCJBcnJheSIsImlzQXJyYXkiLCJrZXlzIiwibWFwIiwia2V5Iiwic3RhZ2UiLCJsZW5ndGgiLCJFcnJvciIsImpvaW4iLCJ0cmFuc2Zvcm1TdGFnZSIsInN0YWdlTmFtZSIsImluZGV4T2YiLCJQYXJzZSIsIklOVkFMSURfUVVFUlkiLCJoYXNPd25Qcm9wZXJ0eSIsIl9pZCIsIm9iamVjdElkIiwibW91bnRSb3V0ZXMiLCJyb3V0ZSIsIm1pZGRsZXdhcmUiLCJwcm9taXNlRW5mb3JjZU1hc3RlcktleUFjY2VzcyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLFNBQVMsR0FBRyxDQUFDLE9BQUQsRUFBVSxVQUFWLEVBQXNCLFVBQXRCLENBQWxCO0FBRUEsTUFBTUMsYUFBYSxHQUFHLENBQ3BCLFdBRG9CLEVBRXBCLFFBRm9CLEVBR3BCLFlBSG9CLEVBSXBCLFdBSm9CLEVBS3BCLE9BTG9CLEVBTXBCLFdBTm9CLEVBT3BCLE9BUG9CLEVBUXBCLFNBUm9CLEVB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QkFIYixFQUlFL0MsR0FBRyxJQUFJO0FBQ0wsYUFBTyxLQUFLRCxVQUFMLENBQWdCQyxHQUFoQixDQUFQO0FBQ0QsS0FOSDtBQVFEOztBQWpIZ0Q7OztlQW9IcENILGUiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQ2xhc3Nlc1JvdXRlciBmcm9tICcuL0NsYXNzZXNSb3V0ZXInO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vcmVzdCc7XG5pbXBvcnQgKiBhcyBtaWRkbGV3YXJlIGZyb20gJy4uL21pZGRsZXdhcmVzJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBVc2Vyc1JvdXRlciBmcm9tICcuL1VzZXJzUm91dGVyJztcblxuY29uc3QgQkFTRV9LRVlTID0gWyd3aGVyZScsICdkaXN0aW5jdCcsICdwaXBlbGluZSddO1xuXG5jb25zdCBQSVBFTElORV9LRVlTID0gW1xuICAnYWRkRmllbGRzJyxcbiAgJ2J1Y2tldCcsXG4gICdidWNrZXRBdXRvJyxcbiAgJ2NvbGxTdGF0cycsXG4gICdjb3VudCcsXG4gICdjdXJyZW50T3AnLFxuICAnZmFjZXQnLFxuICAnZ2VvTmVhcicsXG4gICdncmFwaExvb2t1cCcsXG4gICdncm91cCcsXG4gICdpbmRleFN0YXRzJyxcbiAgJ2xpbWl0JyxcbiAgJ2xpc3RMb2NhbFNlc3Npb25zJyxcbiAgJ2xpc3RTZXNzaW9ucycsXG4gICdsb29rdXAnLFxuICAnbWF0Y2gnLFxuICAnb3V0JyxcbiAgJ3Byb2plY3QnLFxuICAncmVkYWN0JyxcbiAgJ3JlcGxhY2VSb290JyxcbiAgJ3NhbXBsZScsXG4gICdza2lwJyxcbiAgJ3NvcnQnLFxuICAnc29ydEJ5Q291bnQnLFxuICAndW53aW5kJyxcbl07XG5cbmNvbnN0IEFMTE9XRURfS0VZUyA9IFsuLi5CQVNFX0tFWVMsIC4uLlBJUEVMSU5FX0tFWVNdO1xuXG5leHBvcnQgY2xhc3MgQWdncmVnYXRlUm91dGVyIGV4dGVuZHMgQ2xhc3Nlc1JvdXRlciB7XG4gIGhhbmRsZUZpbmQocmVxKSB7XG4gICAgY29uc3QgYm9keSA9IE9iamVjdC5hc3NpZ24oXG4gICAgICByZXEuYm9keSxcbiAgICAgIENsYXNzZXNSb3V0ZXIuSlNPTkZyb21RdWVyeShyZXEucXVlcnkpXG4gICAgKTtcbiAgICBjb25zdCBvcHRpb25zID0ge307XG4gICAgaWYgKGJvZHkuZGlzdGluY3QpIHtcbiAgICAgIG9wdGlvbnMuZGlzdGluY3QgPSBTdHJpbmcoYm9keS5kaXN0aW5jdCk7XG4gICAgfVxuICAgIG9wdGlvbnMucGlwZWxpbmUgPSBBZ2dyZWdhdGVSb3V0ZXIuZ2V0UGlwZWxpbmUoYm9keSk7XG4gICAgaWYgKHR5cGVvZiBib2R5LndoZXJlID09PSAnc3RyaW5nJykge1xuICAgICAgYm9keS53aGVyZSA9IEpTT04ucGFyc2UoYm9keS53aGVyZSk7XG4gICAgfVxuICAgIHJldHVybiByZXN0XG4gICAgICAuZmluZChcbiAgICAgICAgcmVxLmNvbmZpZyxcbiAgICAgICAgcmVxLmF1dGgsXG4gICAgICAgIHRoaXMuY2xhc3NOYW1lKHJlcSksXG4gICAgICAgIGJvZHkud2hlcmUsXG4gICAgICAgIG9wdGlvbnMsXG4gICAgICAgIHJlcS5pbmZvLmNsaWVudFNES1xuICAgICAgKVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICBmb3IgKGNvbnN0IHJlc3VsdCBvZiByZXNwb25zZS5yZXN1bHRzKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiByZXN1bHQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBVc2Vyc1JvdXRlci5yZW1vdmVIaWRkZW5Qcm9wZXJ0aWVzKHJlc3VsdCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7IHJlc3BvbnNlIH07XG4gICAgICB9KTtcbiAgfVxuXG4gIC8qIEJ1aWxkcyBhIHBpcGVsaW5lIGZyb20gdGhlIGJvZHkuIE9yaWdpbmFsbHkgdGhlIGJvZHkgY291bGQgYmUgcGFzc2VkIGFzIGEgc2luZ2xlIG9iamVjdCxcbiAgICogYW5kIG5vdyB3ZSBzdXBwb3J0IG1hbnkgb3B0aW9uc1xuICAgKlxuICAgKiBBcnJheVxuICAgKlxuICAgKiBib2R5OiBbe1xuICAgKiAgIGdyb3VwOiB7IG9iamVjdElkOiAnJG5hbWUnIH0sXG4gICAqIH1dXG4gICAqXG4gICAqIE9iamVjdFxuICAgKlxuICAgKiBib2R5OiB7XG4gICAqICAgZ3JvdXA6IHsgb2JqZWN0SWQ6ICckbmFtZScgfSxcbiAgICogfVxuICAgKlxuICAgKlxuICAgKiBQaXBlbGluZSBPcGVyYXRvciB3aXRoIGFuIEFycmF5IG9yIGFuIE9iamVjdFxuICAgKlxuICAgKiBib2R5OiB7XG4gICAqICAgcGlwZWxpbmU6IHtcbiAgICogICAgIGdyb3VwOiB7IG9iamVjdElkOiAnJG5hbWUnIH0sXG4gICAqICAgfVxuICAgKiB9XG4gICAqXG4gICAqL1xuICBzdGF0aWMgZ2V0UGlwZWxpbmUoYm9keSkge1xuICAgIGxldCBwaXBlbGluZSA9IGJvZHkucGlwZWxpbmUgfHwgYm9keTtcblxuICAgIGlmICghQXJyYXkuaXNBcnJheShwaXBlbGluZSkpIHtcbiAgICAgIHBpcGVsaW5lID0gT2JqZWN0LmtleXMocGlwZWxpbmUpLm1hcChrZXkgPT4ge1xuICAgICAgICByZXR1cm4geyBba2V5XTogcGlwZWxpbmVba2V5XSB9O1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBpcGVsaW5lLm1hcChzdGFnZSA9PiB7XG4gICAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMoc3RhZ2UpO1xuICAgICAgaWYgKGtleXMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgIGBQaXBlbGluZSBzdGFnZXMgc2hvdWxkIG9ubHkgaGF2ZSBvbmUga2V5IGZvdW5kICR7a2V5cy5qb2luKCcsICcpfWBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBBZ2dyZWdhdGVSb3V0ZXIudHJhbnNmb3JtU3RhZ2Uoa2V5c1swXSwgc3RhZ2UpO1xuICAgIH0pO1xuICB9XG5cbiAgc3RhdGljIHRyYW5zZm9ybVN0YWdlKHN0YWdlTmFtZSwgc3RhZ2UpIHtcbiAgICBpZiAoQUxMT1dFRF9LRVlTLmluZGV4T2Yoc3RhZ2VOYW1lKSA9PT0gLTEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgYEludmFsaWQgcGFyYW1ldGVyIGZvciBxdWVyeTogJHtzdGFnZU5hbWV9YFxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKHN0YWdlTmFtZSA9PT0gJ2dyb3VwJykge1xuICAgICAgaWYgKHN0YWdlW3N0YWdlTmFtZV0uaGFzT3duUHJvcGVydHkoJ19pZCcpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbnZhbGlkIHBhcmFtZXRlciBmb3IgcXVlcnk6IGdyb3VwLiBQbGVhc2UgdXNlIG9iamVjdElkIGluc3RlYWQgb2YgX2lkYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKCFzdGFnZVtzdGFnZU5hbWVdLmhhc093blByb3BlcnR5KCdvYmplY3RJZCcpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbnZhbGlkIHBhcmFtZXRlciBmb3IgcXVlcnk6IGdyb3VwLiBvYmplY3RJZCBpcyByZXF1aXJlZGBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHN0YWdlW3N0YWdlTmFtZV0uX2lkID0gc3RhZ2Vbc3RhZ2VOYW1lXS5vYmplY3RJZDtcbiAgICAgIGRlbGV0ZSBzdGFnZVtzdGFnZU5hbWVdLm9iamVjdElkO1xuICAgIH1cbiAgICByZXR1cm4geyBbYCQke3N0YWdlTmFtZX1gXTogc3RhZ2Vbc3RhZ2VOYW1lXSB9O1xuICB9XG5cbiAgbW91bnRSb3V0ZXMoKSB7XG4gICAgdGhpcy5yb3V0ZShcbiAgICAgICdHRVQnLFxuICAgICAgJy9hZ2dyZWdhdGUvOmNsYXNzTmFtZScsXG4gICAgICBtaWRkbGV3YXJlLnByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzLFxuICAgICAgcmVxID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRmluZChyZXEpO1xuICAgICAgfVxuICAgICk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgQWdncmVnYXRlUm91dGVyO1xuIl19