"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _UsersRouter = _interopRequireDefault(require("../../Routers/UsersRouter"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var objectsMutations = _interopRequireWildcard(require("./objectsMutations"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const usersRouter = new _UsersRouter.default();

const load = parseGraphQLSchema => {
  const fields = {};
  fields.signUp = {
    description: 'The signUp mutation can be used to sign the user up.',
    args: {
      fields: {
        descriptions: 'These are the fields of the user.',
        type: parseGraphQLSchema.parseClassTypes['_User'].signUpInputType
      }
    },
    type: new _graphql.GraphQLNonNull(defaultGraphQLTypes.SIGN_UP_RESULT),

    async resolve(_source, args, context) {
      try {
        const {
          fields
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        return await objectsMutations.createObject('_User', fields, config, auth, info);
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  };
  fields.logIn = {
    description: 'The logIn mutation can be used to log the user in.',
    args: {
      username: {
        description: 'This is the username used to log the user in.',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      },
      password: {
        description: 'This is the password used to log the user in.',
        type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
      }
    },
    type: new _graphql.GraphQLNonNull(parseGraphQLSchema.meType),

    async resolve(_source, args, context) {
      try {
        const {
          username,
          password
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        return (await usersRouter.handleLogIn({
          body: {
            username,
            password
          },
          query: {},
          config,
          auth,
          info
        })).response;
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  };
  fields.logOut = {
    description: 'The logOut mutation can be used to log the user out.',
    type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean),

    async resolve(_source, _args, context) {
      try {
        const {
          config,
          auth,
          info
        } = context;
        await usersRouter.handleLogOut({
          config,
          auth,
          info
        });
        return true;
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  };
  const usersMutation = new _graphql.GraphQLObjectType({
    name: 'UsersMutation',
    description: 'UsersMutation is the top level type for files mutations.',
    fields
  });
  parseGraphQLSchema.graphQLTypes.push(usersMutation);
  parseGraphQLSchema.graphQLMutations.users = {
    description: 'This is the top level for users mutations.',
    type: usersMutation,
    resolve: () => new Object()
  };
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvdXNlcnNNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsidXNlcnNSb3V0ZXIiLCJVc2Vyc1JvdXRlciIsImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJmaWVsZHMiLCJzaWduVXAiLCJkZXNjcmlwdGlvbiIsImFyZ3MiLCJkZXNjcmlwdGlvbnMiLCJ0eXBlIiwicGFyc2VDbGFzc1R5cGVzIiwic2lnblVwSW5wdXRUeXBlIiwiR3JhcGhRTE5vbk51bGwiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiU0lHTl9VUF9SRVNVTFQiLCJyZXNvbHZlIiwiX3NvdXJjZSIsImNvbnRleHQiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsIm9iamVjdHNNdXRhdGlvbnMiLCJjcmVhdGVPYmplY3QiLCJlIiwiaGFuZGxlRXJyb3IiLCJsb2dJbiIsInVzZXJuYW1lIiwiR3JhcGhRTFN0cmluZyIsInBhc3N3b3JkIiwibWVUeXBlIiwiaGFuZGxlTG9nSW4iLCJib2R5IiwicXVlcnkiLCJyZXNwb25zZSIsImxvZ091dCIsIkdyYXBoUUxCb29sZWFuIiwiX2FyZ3MiLCJoYW5kbGVMb2dPdXQiLCJ1c2Vyc011dGF0aW9uIiwiR3JhcGhRTE9iamVjdFR5cGUiLCJuYW1lIiwiZ3JhcGhRTFR5cGVzIiwicHVzaCIsImdyYXBoUUxNdXRhdGlvbnMiLCJ1c2VycyIsIk9iamVjdCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQU1BOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLFdBQVcsR0FBRyxJQUFJQyxvQkFBSixFQUFwQjs7QUFFQSxNQUFNQyxJQUFJLEdBQUdDLGtCQUFrQixJQUFJO0FBQ2pDLFFBQU1DLE1BQU0sR0FBRyxFQUFmO0FBRUFBLEVBQUFBLE1BQU0sQ0FBQ0MsTUFBUCxHQUFnQjtBQUNkQyxJQUFBQSxXQUFXLEVBQUUsc0RBREM7QUFFZEMsSUFBQUEsSUFBSSxFQUFFO0FBQ0pILE1BQUFBLE1BQU0sRUFBRTtB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QUFBQTtBQUg2QixTQUF6QixDQUFOO0FBS0EsZUFBTyxJQUFQO0FBQ0QsT0FURCxDQVNFLE9BQU9HLENBQVAsRUFBVTtBQUNWcEIsUUFBQUEsa0JBQWtCLENBQUNxQixXQUFuQixDQUErQkQsQ0FBL0I7QUFDRDtBQUNGOztBQWhCYSxHQUFoQjtBQW1CQSxRQUFNZSxhQUFhLEdBQUcsSUFBSUMsMEJBQUosQ0FBc0I7QUFDMUNDLElBQUFBLElBQUksRUFBRSxlQURvQztBQUUxQ2xDLElBQUFBLFdBQVcsRUFBRSwwREFGNkI7QUFHMUNGLElBQUFBO0FBSDBDLEdBQXRCLENBQXRCO0FBS0FELEVBQUFBLGtCQUFrQixDQUFDc0MsWUFBbkIsQ0FBZ0NDLElBQWhDLENBQXFDSixhQUFyQztBQUVBbkMsRUFBQUEsa0JBQWtCLENBQUN3QyxnQkFBbkIsQ0FBb0NDLEtBQXBDLEdBQTRDO0FBQzFDdEMsSUFBQUEsV0FBVyxFQUFFLDRDQUQ2QjtBQUUxQ0csSUFBQUEsSUFBSSxFQUFFNkIsYUFGb0M7QUFHMUN2QixJQUFBQSxPQUFPLEVBQUUsTUFBTSxJQUFJOEIsTUFBSjtBQUgyQixHQUE1QztBQUtELENBL0ZEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgR3JhcGhRTEJvb2xlYW4sXG4gIEdyYXBoUUxOb25OdWxsLFxuICBHcmFwaFFMT2JqZWN0VHlwZSxcbiAgR3JhcGhRTFN0cmluZyxcbn0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgVXNlcnNSb3V0ZXIgZnJvbSAnLi4vLi4vUm91dGVycy9Vc2Vyc1JvdXRlcic7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzTXV0YXRpb25zIGZyb20gJy4vb2JqZWN0c011dGF0aW9ucyc7XG5cbmNvbnN0IHVzZXJzUm91dGVyID0gbmV3IFVzZXJzUm91dGVyKCk7XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBjb25zdCBmaWVsZHMgPSB7fTtcblxuICBmaWVsZHMuc2lnblVwID0ge1xuICAgIGRlc2NyaXB0aW9uOiAnVGhlIHNpZ25VcCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBzaWduIHRoZSB1c2VyIHVwLicsXG4gICAgYXJnczoge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uczogJ1RoZXNlIGFyZSB0aGUgZmllbGRzIG9mIHRoZSB1c2VyLicsXG4gICAgICAgIHR5cGU6IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbJ19Vc2VyJ10uc2lnblVwSW5wdXRUeXBlLFxuICAgICAgfSxcbiAgICB9LFxuICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChkZWZhdWx0R3JhcGhRTFR5cGVzLlNJR05fVVBfUkVTVUxUKSxcbiAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgZmllbGRzIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICByZXR1cm4gYXdhaXQgb2JqZWN0c011dGF0aW9ucy5jcmVhdGVPYmplY3QoXG4gICAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAgICBmaWVsZHMsXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mb1xuICAgICAgICApO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfTtcblxuICBmaWVsZHMubG9nSW4gPSB7XG4gICAgZGVzY3JpcHRpb246ICdUaGUgbG9nSW4gbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gbG9nIHRoZSB1c2VyIGluLicsXG4gICAgYXJnczoge1xuICAgICAgdXNlcm5hbWU6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1c2VybmFtZSB1c2VkIHRvIGxvZyB0aGUgdXNlciBpbi4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmQ6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBwYXNzd29yZCB1c2VkIHRvIGxvZyB0aGUgdXNlciBpbi4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgICB9LFxuICAgIH0sXG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKHBhcnNlR3JhcGhRTFNjaGVtYS5tZVR5cGUpLFxuICAgIGFzeW5jIHJlc29sdmUoX3NvdXJjZSwgYXJncywgY29udGV4dCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyB1c2VybmFtZSwgcGFzc3dvcmQgfSA9IGFyZ3M7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIHJldHVybiAoYXdhaXQgdXNlcnNSb3V0ZXIuaGFuZGxlTG9nSW4oe1xuICAgICAgICAgIGJvZHk6IHtcbiAgICAgICAgICAgIHVzZXJuYW1lLFxuICAgICAgICAgICAgcGFzc3dvcmQsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBxdWVyeToge30sXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mbyxcbiAgICAgICAgfSkpLnJlc3BvbnNlO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfTtcblxuICBmaWVsZHMubG9nT3V0ID0ge1xuICAgIGRlc2NyaXB0aW9uOiAnVGhlIGxvZ091dCBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBsb2cgdGhlIHVzZXIgb3V0LicsXG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIF9hcmdzLCBjb250ZXh0KSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICBhd2FpdCB1c2Vyc1JvdXRlci5oYW5kbGVMb2dPdXQoe1xuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm8sXG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG5cbiAgY29uc3QgdXNlcnNNdXRhdGlvbiA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgbmFtZTogJ1VzZXJzTXV0YXRpb24nLFxuICAgIGRlc2NyaXB0aW9uOiAnVXNlcnNNdXRhdGlvbiBpcyB0aGUgdG9wIGxldmVsIHR5cGUgZm9yIGZpbGVzIG11dGF0aW9ucy4nLFxuICAgIGZpZWxkcyxcbiAgfSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaCh1c2Vyc011dGF0aW9uKTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTE11dGF0aW9ucy51c2VycyA9IHtcbiAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHRvcCBsZXZlbCBmb3IgdXNlcnMgbXV0YXRpb25zLicsXG4gICAgdHlwZTogdXNlcnNNdXRhdGlvbixcbiAgICByZXNvbHZlOiAoKSA9PiBuZXcgT2JqZWN0KCksXG4gIH07XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=