"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.SessionsRouter = void 0;

var _ClassesRouter = _interopRequireDefault(require("./ClassesRouter"));

var _node = _interopRequireDefault(require("parse/node"));

var _rest = _interopRequireDefault(require("../rest"));

var _AdminAuth = _interopRequireDefault(require("../AdminAuth"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

class SessionsRouter extends _ClassesRouter.default {
  className() {
    return 'AdminSession';
  }

  handleMe(req) {
    // TODO: Verify correct behavior
    if (!req.info || !req.info.sessionToken) {
      throw new _node.default.Error(_node.default.Error.INVALIDAdminSession_TOKEN, 'Session token required.');
    }

    return _rest.default.find(req.config, _AdminAuth.default.master(req.config), 'AdminSession', {
      sessionToken: req.info.sessionToken
    }, undefined, req.info.clientSDK).then(response => {
      if (!response.results || response.results.length == 0) {
        throw new _node.default.Error(_node.default.Error.INVALIDAdminSession_TOKEN, 'Session token not found.');
      }

      return {
        response: response.results[0]
      };
    });
  }

  handleUpdateToRevocableSession(req) {
    const config = req.config;
    const user = req.auth.user; // Issue #2720
    // Calling without a session token would result in a not found user

    if (!user) {
      throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'invalid session');
    }

    const {
      sessionData,
      createSession
    } = _AdminAuth.default.createSession(config, {
      userId: user.id,
      createdWith: {
        action: 'upgrade'
      },
      installationId: req.auth.installationId
    });

    return createSession().then(() => {
      // delete the session token, use the db to skip beforeSave
      return config.database.update('_User', {
        objectId: user.id
      }, {
        sessionToken: {
          __op: 'Delete'
        }
      });
    }).then(() => {
      return Promise.resolve({
        response: sessionData
      });
    });
  }

  mountRoutes() {
    this.route('GET', '/sessions/me', req => {
      return this.handleMe(req);
    });
    this.route('GET', '/sessions', req => {
      return this.handleFind(req);
    });
    this.route('GET', '/sessions/:objectId', req => {
      return this.handleGet(req);
    });
    this.route('POST', '/sessions', req => {
      return this.handleCreate(req);
    });
    this.route('PUT', '/sessions/:objectId', req => {
      return this.handleUpdate(req);
    });
    this.route('DELETE', '/sessions/:objectId', req => {
      return this.handleDelete(req);
    });
    this.route('POST', '/upgradeToRevocableSession', req => {
      return this.handleUpdateToRevocableSession(req);
    });
  }

}

exports.SessionsRouter = SessionsRouter;
var _default = SessionsRouter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Sb3V0ZXJzL0FkbWluU2Vzc2lvbnNSb3V0ZXIuanMiXSwibmFtZXMiOlsiU2Vzc2lvbnNSb3V0ZXIiLCJDbGFzc2VzUm91dGVyIiwiY2xhc3NOYW1lIiwiaGFuZGxlTWUiLCJyZXEiLCJpbmZvIiwic2Vzc2lvblRva2VuIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURBZG1pblNlc3Npb25fVE9LRU4iLCJyZXN0IiwiZmluZCIsImNvbmZpZyIsIkF1dGgiLCJtYXN0ZXIiLCJ1bmRlZmluZWQiLCJjbGllbnRTREsiLCJ0aGVuIiwicmVzcG9uc2UiLCJyZXN1bHRzIiwibGVuZ3RoIiwiaGFuZGxlVXBkYXRlVG9SZXZvY2FibGVTZXNzaW9uIiwidXNlciIsImF1dGgiLCJPQkpFQ1RfTk9UX0ZPVU5EIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwidXNlcklkIiwiaWQiLCJjcmVhdGVkV2l0aCIsImFjdGlvbiIsImluc3RhbGxhdGlvbklkIiwiZGF0YWJhc2UiLCJ1cGRhdGUiLCJvYmplY3RJZCIsIl9fb3AiLCJQcm9taXNlIiwicmVzb2x2ZSIsIm1vdW50Um91dGVzIiwicm91dGUiLCJoYW5kbGVGaW5kIiwiaGFuZGxlR2V0IiwiaGFuZGxlQ3JlYXRlIiwiaGFuZGxlVXBkYXRlIiwiaGFuZGxlRGVsZXRlIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7QUFFTyxNQUFNQSxjQUFOLFNBQTZCQyxzQkFBN0IsQ0FBMkM7QUFDaERDLEVBQUFBLFNBQVMsR0FBRztBQUNWLFdBQU8sY0FBUDtBQUNEOztBQUVEQyxFQUFBQSxRQUFRLENBQUNDLEdBQUQsRUFBTTtBQUNaO0FBQ0EsUUFBSSxDQUFDQSxHQUFHLENBQUNDLElBQUwsSUFBYSxDQUFDRCxHQUFHLENBQUNDLElBQUosQ0FBU0MsWUFBM0IsRUFBeUM7QUFDdkMsWUFBTSxJQUFJQyxjQUFNQyxLQUFWLENBQ0pELGNBQU1DLEtBQU4sQ0FBWUMseUJB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QUFQO0FBQ0QsS0FGRDtBQUdBLFNBQUttQyxLQUFMLENBQVcsS0FBWCxFQUFrQixxQkFBbEIsRUFBeUNuQyxHQUFHLElBQUk7QUFDOUMsYUFBTyxLQUFLdUMsWUFBTCxDQUFrQnZDLEdBQWxCLENBQVA7QUFDRCxLQUZEO0FBR0EsU0FBS21DLEtBQUwsQ0FBVyxRQUFYLEVBQXFCLHFCQUFyQixFQUE0Q25DLEdBQUcsSUFBSTtBQUNqRCxhQUFPLEtBQUt3QyxZQUFMLENBQWtCeEMsR0FBbEIsQ0FBUDtBQUNELEtBRkQ7QUFHQSxTQUFLbUMsS0FBTCxDQUFXLE1BQVgsRUFBbUIsNEJBQW5CLEVBQWlEbkMsR0FBRyxJQUFJO0FBQ3RELGFBQU8sS0FBS2lCLDhCQUFMLENBQW9DakIsR0FBcEMsQ0FBUDtBQUNELEtBRkQ7QUFHRDs7QUEzRitDOzs7ZUE4Rm5DSixjIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IENsYXNzZXNSb3V0ZXIgZnJvbSAnLi9DbGFzc2VzUm91dGVyJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuaW1wb3J0IEF1dGggZnJvbSAnLi4vQWRtaW5BdXRoJztcblxuZXhwb3J0IGNsYXNzIFNlc3Npb25zUm91dGVyIGV4dGVuZHMgQ2xhc3Nlc1JvdXRlciB7XG4gIGNsYXNzTmFtZSgpIHtcbiAgICByZXR1cm4gJ0FkbWluU2Vzc2lvbic7XG4gIH1cblxuICBoYW5kbGVNZShyZXEpIHtcbiAgICAvLyBUT0RPOiBWZXJpZnkgY29ycmVjdCBiZWhhdmlvclxuICAgIGlmICghcmVxLmluZm8gfHwgIXJlcS5pbmZvLnNlc3Npb25Ub2tlbikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEQWRtaW5TZXNzaW9uX1RPS0VOLFxuICAgICAgICAnU2Vzc2lvbiB0b2tlbiByZXF1aXJlZC4nXG4gICAgICApO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdFxuICAgICAgLmZpbmQoXG4gICAgICAgIHJlcS5jb25maWcsXG4gICAgICAgIEF1dGgubWFzdGVyKHJlcS5jb25maWcpLFxuICAgICAgICAnQWRtaW5TZXNzaW9uJyxcbiAgICAgICAgeyBzZXNzaW9uVG9rZW46IHJlcS5pbmZvLnNlc3Npb25Ub2tlbiB9LFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIHJlcS5pbmZvLmNsaWVudFNES1xuICAgICAgKVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICBpZiAoIXJlc3BvbnNlLnJlc3VsdHMgfHwgcmVzcG9uc2UucmVzdWx0cy5sZW5ndGggPT0gMCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURBZG1pblNlc3Npb25fVE9LRU4sXG4gICAgICAgICAgICAnU2Vzc2lvbiB0b2tlbiBub3QgZm91bmQuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICByZXNwb25zZTogcmVzcG9uc2UucmVzdWx0c1swXSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICB9XG5cbiAgaGFuZGxlVXBkYXRlVG9SZXZvY2FibGVTZXNzaW9uKHJlcSkge1xuICAgIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG4gICAgY29uc3QgdXNlciA9IHJlcS5hdXRoLnVzZXI7XG4gICAgLy8gSXNzdWUgIzI3MjBcbiAgICAvLyBDYWxsaW5nIHdpdGhvdXQgYSBzZXNzaW9uIHRva2VuIHdvdWxkIHJlc3VsdCBpbiBhIG5vdCBmb3VuZCB1c2VyXG4gICAgaWYgKCF1c2VyKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ2ludmFsaWQgc2Vzc2lvbicpO1xuICAgIH1cbiAgICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBBdXRoLmNyZWF0ZVNlc3Npb24oY29uZmlnLCB7XG4gICAgICB1c2VySWQ6IHVzZXIuaWQsXG4gICAgICBjcmVhdGVkV2l0aDoge1xuICAgICAgICBhY3Rpb246ICd1cGdyYWRlJyxcbiAgICAgIH0sXG4gICAgICBpbnN0YWxsYXRpb25JZDogcmVxLmF1dGguaW5zdGFsbGF0aW9uSWQsXG4gICAgfSk7XG5cbiAgICByZXR1cm4gY3JlYXRlU2Vzc2lvbigpXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIC8vIGRlbGV0ZSB0aGUgc2Vzc2lvbiB0b2tlbiwgdXNlIHRoZSBkYiB0byBza2lwIGJlZm9yZVNhdmVcbiAgICAgICAgcmV0dXJuIGNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBvYmplY3RJZDogdXNlci5pZCxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHNlc3Npb25Ub2tlbjogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgICAgICAgIH1cbiAgICAgICAgKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoeyByZXNwb25zZTogc2Vzc2lvbkRhdGEgfSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIG1vdW50Um91dGVzKCkge1xuICAgIHRoaXMucm91dGUoJ0dFVCcsICcvc2Vzc2lvbnMvbWUnLCByZXEgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlTWUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3Nlc3Npb25zJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZpbmQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdHRVQnLCAnL3Nlc3Npb25zLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVHZXQocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy9zZXNzaW9ucycsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVDcmVhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQVVQnLCAnL3Nlc3Npb25zLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVVcGRhdGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdERUxFVEUnLCAnL3Nlc3Npb25zLzpvYmplY3RJZCcsIHJlcSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVEZWxldGUocmVxKTtcbiAgICB9KTtcbiAgICB0aGlzLnJvdXRlKCdQT1NUJywgJy91cGdyYWRlVG9SZXZvY2FibGVTZXNzaW9uJywgcmVxID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZVVwZGF0ZVRvUmV2b2NhYmxlU2Vzc2lvbihyZXEpO1xuICAgIH0pO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFNlc3Npb25zUm91dGVyO1xuIl19