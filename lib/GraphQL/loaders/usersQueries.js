"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));

var _node = _interopRequireDefault(require("parse/node"));

var _rest = _interopRequireDefault(require("../../rest"));

var _Auth = _interopRequireDefault(require("../../Auth"));

var _parseClassTypes = require("./parseClassTypes");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const load = parseGraphQLSchema => {
  const fields = {};
  fields.me = {
    description: 'The Me query can be used to return the current user data.',
    type: new _graphql.GraphQLNonNull(parseGraphQLSchema.meType),

    async resolve(_source, _args, context, queryInfo) {
      try {
        const {
          config,
          info
        } = context;

        if (!info || !info.sessionToken) {
          throw new _node.default.Error(_node.default.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
        }

        const sessionToken = info.sessionToken;
        const selectedFields = (0, _graphqlListFields.default)(queryInfo);
        const {
          include
        } = (0, _parseClassTypes.extractKeysAndInclude)(selectedFields);
        const response = await _rest.default.find(config, _Auth.default.master(config), '_Session', {
          sessionToken
        }, {
          include: include.split(',').map(included => `user.${included}`).join(',')
        }, info.clientVersion);

        if (!response.results || response.results.length == 0 || !response.results[0].user) {
          throw new _node.default.Error(_node.default.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
        } else {
          const user = response.results[0].user;
          user.sessionToken = sessionToken;
          return user;
        }
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  };
  const usersQuery = new _graphql.GraphQLObjectType({
    name: 'UsersQuery',
    description: 'UsersQuery is the top level type for users queries.',
    fields
  });
  parseGraphQLSchema.graphQLTypes.push(usersQuery);
  parseGraphQLSchema.graphQLQueries.users = {
    description: 'This is the top level for users queries.',
    type: usersQuery,
    resolve: () => new Object()
  };
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvdXNlcnNRdWVyaWVzLmpzIl0sIm5hbWVzIjpbImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJmaWVsZHMiLCJtZSIsImRlc2NyaXB0aW9uIiwidHlwZSIsIkdyYXBoUUxOb25OdWxsIiwibWVUeXBlIiwicmVzb2x2ZSIsIl9zb3VyY2UiLCJfYXJncyIsImNvbnRleHQiLCJxdWVyeUluZm8iLCJjb25maWciLCJpbmZvIiwic2Vzc2lvblRva2VuIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsInNlbGVjdGVkRmllbGRzIiwiaW5jbHVkZSIsInJlc3BvbnNlIiwicmVzdCIsImZpbmQiLCJBdXRoIiwibWFzdGVyIiwic3BsaXQiLCJtYXAiLCJpbmNsdWRlZCIsImpvaW4iLCJjbGllbnRWZXJzaW9uIiwicmVzdWx0cyIsImxlbmd0aCIsInVzZXIiLCJlIiwiaGFuZGxlRXJyb3IiLCJ1c2Vyc1F1ZXJ5IiwiR3JhcGhRTE9iamVjdFR5cGUiLCJuYW1lIiwiZ3JhcGhRTFR5cGVzIiwicHVzaCIsImdyYXBoUUxRdWVyaWVzIiwidXNlcnMiLCJPYmplY3QiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7QUFDQTs7OztBQUVBLE1BQU1BLElBQUksR0FBR0Msa0JBQWtCLElBQUk7QUFDakMsUUFBTUMsTUFBTSxHQUFHLEVBQWY7QUFFQUEsRUFBQUEsTUFBTSxDQUFDQyxFQUFQLEdBQVk7QUFDVkMsSUFBQUEsV0FBVyxFQUFFLDJEQURIO0FBRVZDLElBQUFBLElBQUksRUFBRSxJQUFJQyx1QkFBSixDQUFtQkwsa0JBQWtCLENBQUNNLE1BQXRDLENBRkk7O0FBR1YsVUFBTUMsT0FBTixDQUFjQyxPQUFkLEVBQXVCQyxLQUF2QixFQUE4QkMsT0FBOUIsRUFBdUNDLFNBQXZDLEVBQWtEO0FBQ2hELFVBQUk7QUFDRixjQUFNO0FBQUVDLFVBQUFBLE1BQUY7QUFBVUMsVUFBQUE7QUFBVixZQUFtQkgsT0FBekI7O0FBRUEsWUFBSSxDQUFDRyxJQUFELElBQVMsQ0FBQ0EsSUFBSSxDQUFDQyxZQUFuQixFQUFpQztBQUMvQixnQkFBTSxJQUFJQyxjQUFNQyxLQUFWLENBQ0pELGNBQU1DLEtBQU4sQ0FBWUMscUJBRFIsRUFFSix1QkFGSSxDQUFOO0FBSUQ7O0FBQ0QsY0FBTUgsWUFBWSxHQUFHRCxJQUFJLENBQUNDLFlBQTFCO0FBQ0EsY0FBTUksY0FBYyxHQUFHLGdDQUFjUCxTQUFkLENBQXZCO0FBRUEsY0FBTTtBQUFFUSxVQUFBQTtBQUFGLFlBQWMsNENBQXNCRCxjQUF0QixDQUFwQjtBQUNBLGNBQU1FLFFBQVEsR0FBRyxNQUFNQyxjQUFLQyxJQUFMLENBQ3JCVixNQURxQixFQUVyQlcsY0FBS0MsTUFBTCxDQUFZWixNQUFaLENBRnFCLEVBR3JCLFVBSHFCLEVBSXJCO0FBQUVFLFVBQUFBO0FBQUYsU0FKcUIsRUFLckI7QUFDRUssVUFBQUEsT0FBTyxFQUFFQSxPQUFPLENBQ2JNLEtBRE0sQ0FDQSxHQURBLEVBRU5DLEdBRk0sQ0FFRkMsUUFBUSxJQUFLLFFBQU9BLFFBQVMsRUFGM0IsRUFHTkMsSUFITSxDQUdELEdBSEM7QUFEWCxTQUxxQixFQVdyQmYsSUFBSSxDQUFDZ0IsYUFYZ0IsQ0FBdkI7O0FBYUEsWUFDRSxDQUFDVCxRQUFRLENBQUNVLE9BQVYsSUFDQVYsUUFBUSxDQUFDVSxPQUFULENBQWlCQyxNQUFqQixJQUEyQixDQUQzQixJQUVBLENBQUNYLFFBQVEsQ0FBQ1UsT0FBVCxDQUFpQixDQUFqQixFQUFvQkUsSUFIdkIsRUFJRTtBQUNBLGdCQUFNLElBQUlqQixjQUFNQyxLQUFWLENBQ0pELGNBQU1DLEtBQU4sQ0FBWUMscUJBRFIsRUFFSix1QkFGSSxDQUFOO0FBSUQsU0FURCxNQVNPO0FBQ0wsZ0JBQU1lLElBQUksR0FBR1osUUFBUSxDQUFDVSxPQUFULENBQWlCLENBQWpCLEVBQW9CRSxJQUFqQztBQUNBQSxVQUFBQSxJQUFJLENBQUNsQixZQUFMLEdBQW9CQSxZQUFwQjtBQUNBLGlCQUFPa0IsSUFBUDtBQUNEO0FBQ0YsT0F4Q0QsQ0F3Q0UsT0FBT0MsQ0FBUCxFQUFVO0FBQ1ZqQyxRQUFBQSxrQkFBa0IsQ0FBQ2tDLFdBQW5CLENBQStCRCxDQUEvQjtBQUNEO0FBQ0Y7O0FBL0NTLEdBQVo7QUFrREEsUUFBTUUsVUFBVSxHQUFHLElBQUlDLDBCQUFKLENBQXNCO0FBQ3ZDQyxJQUFBQSxJQUFJLEVBQUUsWUFEaUM7QUFFdkNsQyxJQUFBQSxXQUFXLEVBQUUscURBRjBCO0FBR3ZDRixJQUFBQTtBQUh1QyxHQUF0QixDQUFuQjtBQUtBRCxFQUFBQSxrQkFBa0IsQ0FBQ3NDLFlBQW5CLENBQWdDQyxJQUFoQyxDQUFxQ0osVUFBckM7QUFFQW5DLEVBQUFBLGtCQUFrQixDQUFDd0MsY0FBbkIsQ0FBa0NDLEtBQWxDLEdBQTBDO0FBQ3hDdEMsSUFBQUEsV0FBVyxFQUFFLDBDQUQyQjtBQUV4Q0MsSUFBQUEsSUFBSSxFQUFFK0IsVUFGa0M7QUFHeEM1QixJQUFBQSxPQUFPLEVBQUUsTUFBTSxJQUFJbUMsTUFBSjtBQUh5QixHQUExQztBQUtELENBakVEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwsIEdyYXBoUUxPYmplY3RUeXBlIH0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgZ2V0RmllbGROYW1lcyBmcm9tICdncmFwaHFsLWxpc3QtZmllbGRzJztcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCByZXN0IGZyb20gJy4uLy4uL3Jlc3QnO1xuaW1wb3J0IEF1dGggZnJvbSAnLi4vLi4vQXV0aCc7XG5pbXBvcnQgeyBleHRyYWN0S2V5c0FuZEluY2x1ZGUgfSBmcm9tICcuL3BhcnNlQ2xhc3NUeXBlcyc7XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBjb25zdCBmaWVsZHMgPSB7fTtcblxuICBmaWVsZHMubWUgPSB7XG4gICAgZGVzY3JpcHRpb246ICdUaGUgTWUgcXVlcnkgY2FuIGJlIHVzZWQgdG8gcmV0dXJuIHRoZSBjdXJyZW50IHVzZXIgZGF0YS4nLFxuICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChwYXJzZUdyYXBoUUxTY2hlbWEubWVUeXBlKSxcbiAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIF9hcmdzLCBjb250ZXh0LCBxdWVyeUluZm8pIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIGlmICghaW5mbyB8fCAhaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sXG4gICAgICAgICAgICAnSW52YWxpZCBzZXNzaW9uIHRva2VuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qgc2Vzc2lvblRva2VuID0gaW5mby5zZXNzaW9uVG9rZW47XG4gICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhxdWVyeUluZm8pO1xuXG4gICAgICAgIGNvbnN0IHsgaW5jbHVkZSB9ID0gZXh0cmFjdEtleXNBbmRJbmNsdWRlKHNlbGVjdGVkRmllbGRzKTtcbiAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCByZXN0LmZpbmQoXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIEF1dGgubWFzdGVyKGNvbmZpZyksXG4gICAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgICB7IHNlc3Npb25Ub2tlbiB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIGluY2x1ZGU6IGluY2x1ZGVcbiAgICAgICAgICAgICAgLnNwbGl0KCcsJylcbiAgICAgICAgICAgICAgLm1hcChpbmNsdWRlZCA9PiBgdXNlci4ke2luY2x1ZGVkfWApXG4gICAgICAgICAgICAgIC5qb2luKCcsJyksXG4gICAgICAgICAgfSxcbiAgICAgICAgICBpbmZvLmNsaWVudFZlcnNpb25cbiAgICAgICAgKTtcbiAgICAgICAgaWYgKFxuICAgICAgICAgICFyZXNwb25zZS5yZXN1bHRzIHx8XG4gICAgICAgICAgcmVzcG9uc2UucmVzdWx0cy5sZW5ndGggPT0gMCB8fFxuICAgICAgICAgICFyZXNwb25zZS5yZXN1bHRzWzBdLnVzZXJcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLFxuICAgICAgICAgICAgJ0ludmFsaWQgc2Vzc2lvbiB0b2tlbidcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IHVzZXIgPSByZXNwb25zZS5yZXN1bHRzWzBdLnVzZXI7XG4gICAgICAgICAgdXNlci5zZXNzaW9uVG9rZW4gPSBzZXNzaW9uVG9rZW47XG4gICAgICAgICAgcmV0dXJuIHVzZXI7XG4gICAgICAgIH1cbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG5cbiAgY29uc3QgdXNlcnNRdWVyeSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgbmFtZTogJ1VzZXJzUXVlcnknLFxuICAgIGRlc2NyaXB0aW9uOiAnVXNlcnNRdWVyeSBpcyB0aGUgdG9wIGxldmVsIHR5cGUgZm9yIHVzZXJzIHF1ZXJpZXMuJyxcbiAgICBmaWVsZHMsXG4gIH0pO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2godXNlcnNRdWVyeSk7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxRdWVyaWVzLnVzZXJzID0ge1xuICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdG9wIGxldmVsIGZvciB1c2VycyBxdWVyaWVzLicsXG4gICAgdHlwZTogdXNlcnNRdWVyeSxcbiAgICByZXNvbHZlOiAoKSA9PiBuZXcgT2JqZWN0KCksXG4gIH07XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=