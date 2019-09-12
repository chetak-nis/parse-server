"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var objectsQueries = _interopRequireWildcard(require("./objectsQueries"));

var parseClassTypes = _interopRequireWildcard(require("./parseClassTypes"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const load = (parseGraphQLSchema, parseClass) => {
  const className = parseClass.className;
  const {
    classGraphQLOutputType,
    classGraphQLFindArgs,
    classGraphQLFindResultType
  } = parseGraphQLSchema.parseClassTypes[className];
  const getGraphQLQueryName = `get${className}`;
  parseGraphQLSchema.graphQLObjectsQueries[getGraphQLQueryName] = {
    description: `The ${getGraphQLQueryName} query can be used to get an object of the ${className} class by its id.`,
    args: {
      objectId: defaultGraphQLTypes.OBJECT_ID_ATT,
      readPreference: defaultGraphQLTypes.READ_PREFERENCE_ATT,
      includeReadPreference: defaultGraphQLTypes.INCLUDE_READ_PREFERENCE_ATT
    },
    type: new _graphql.GraphQLNonNull(classGraphQLOutputType),

    async resolve(_source, args, context, queryInfo) {
      try {
        const {
          objectId,
          readPreference,
          includeReadPreference
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        const selectedFields = (0, _graphqlListFields.default)(queryInfo);
        const {
          keys,
          include
        } = parseClassTypes.extractKeysAndInclude(selectedFields);
        return await objectsQueries.getObject(className, objectId, keys, include, readPreference, includeReadPreference, config, auth, info);
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  };
  const findGraphQLQueryName = `find${className}`;
  parseGraphQLSchema.graphQLObjectsQueries[findGraphQLQueryName] = {
    description: `The ${findGraphQLQueryName} query can be used to find objects of the ${className} class.`,
    args: classGraphQLFindArgs,
    type: new _graphql.GraphQLNonNull(classGraphQLFindResultType),

    async resolve(_source, args, context, queryInfo) {
      try {
        const {
          where,
          order,
          skip,
          limit,
          readPreference,
          includeReadPreference,
          subqueryReadPreference
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        const selectedFields = (0, _graphqlListFields.default)(queryInfo);
        const {
          keys,
          include
        } = parseClassTypes.extractKeysAndInclude(selectedFields.filter(field => field.includes('.')).map(field => field.slice(field.indexOf('.') + 1)));
        const parseOrder = order && order.join(',');
        return await objectsQueries.findObjects(className, where, parseOrder, skip, limit, keys, include, false, readPreference, includeReadPreference, subqueryReadPreference, config, auth, info, selectedFields.map(field => field.split('.', 1)[0]));
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  };
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1F1ZXJpZXMuanMiXSwibmFtZXMiOlsibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInBhcnNlQ2xhc3MiLCJjbGFzc05hbWUiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwiY2xhc3NHcmFwaFFMRmluZEFyZ3MiLCJjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSIsInBhcnNlQ2xhc3NUeXBlcyIsImdldEdyYXBoUUxRdWVyeU5hbWUiLCJncmFwaFFMT2JqZWN0c1F1ZXJpZXMiLCJkZXNjcmlwdGlvbiIsImFyZ3MiLCJvYmplY3RJZCIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJPQkpFQ1RfSURfQVRUIiwicmVhZFByZWZlcmVuY2UiLCJSRUFEX1BSRUZFUkVOQ0VfQVRUIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwiSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRUIiwidHlwZSIsIkdyYXBoUUxOb25OdWxsIiwicmVzb2x2ZSIsIl9zb3VyY2UiLCJjb250ZXh0IiwicXVlcnlJbmZvIiwiY29uZmlnIiwiYXV0aCIsImluZm8iLCJzZWxlY3RlZEZpZWxkcyIsImtleXMiLCJpbmNsdWRlIiwiZXh0cmFjdEtleXNBbmRJbmNsdWRlIiwib2JqZWN0c1F1ZXJpZXMiLCJnZXRPYmplY3QiLCJlIiwiaGFuZGxlRXJyb3IiLCJmaW5kR3JhcGhRTFF1ZXJ5TmFtZSIsIndoZXJlIiwib3JkZXIiLCJza2lwIiwibGltaXQiLCJzdWJxdWVyeVJlYWRQcmVmZXJlbmNlIiwiZmlsdGVyIiwiZmllbGQiLCJpbmNsdWRlcyIsIm1hcCIsInNsaWNlIiwiaW5kZXhPZiIsInBhcnNlT3JkZXIiLCJqb2luIiwiZmluZE9iamVjdHMiLCJzcGxpdCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLElBQUksR0FBRyxDQUFDQyxrQkFBRCxF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LENBQ1hjLE1BREgsQ0FDVUMsS0FBSyxJQUFJQSxLQUFLLENBQUNDLFFBQU4sQ0FBZSxHQUFmLENBRG5CLEVBRUdDLEdBRkgsQ0FFT0YsS0FBSyxJQUFJQSxLQUFLLENBQUNHLEtBQU4sQ0FBWUgsS0FBSyxDQUFDSSxPQUFOLENBQWMsR0FBZCxJQUFxQixDQUFqQyxDQUZoQixDQUR3QixDQUExQjtBQUtBLGNBQU1DLFVBQVUsR0FBR1YsS0FBSyxJQUFJQSxLQUFLLENBQUNXLElBQU4sQ0FBVyxHQUFYLENBQTVCO0FBRUEsZUFBTyxNQUFNakIsY0FBYyxDQUFDa0IsV0FBZixDQUNYL0MsU0FEVyxFQUVYa0MsS0FGVyxFQUdYVyxVQUhXLEVBSVhULElBSlcsRUFLWEMsS0FMVyxFQU1YWCxJQU5XLEVBT1hDLE9BUFcsRUFRWCxLQVJXLEVBU1hmLGNBVFcsRUFVWEUscUJBVlcsRUFXWHdCLHNCQVhXLEVBWVhoQixNQVpXLEVBYVhDLElBYlcsRUFjWEMsSUFkVyxFQWVYQyxjQUFjLENBQUNpQixHQUFmLENBQW1CRixLQUFLLElBQUlBLEtBQUssQ0FBQ1EsS0FBTixDQUFZLEdBQVosRUFBaUIsQ0FBakIsRUFBb0IsQ0FBcEIsQ0FBNUIsQ0FmVyxDQUFiO0FBaUJELE9BckNELENBcUNFLE9BQU9qQixDQUFQLEVBQVU7QUFDVmpDLFFBQUFBLGtCQUFrQixDQUFDa0MsV0FBbkIsQ0FBK0JELENBQS9CO0FBQ0Q7QUFDRjs7QUE3QzhELEdBQWpFO0FBK0NELENBN0ZEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCBnZXRGaWVsZE5hbWVzIGZyb20gJ2dyYXBocWwtbGlzdC1maWVsZHMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c1F1ZXJpZXMgZnJvbSAnLi9vYmplY3RzUXVlcmllcyc7XG5pbXBvcnQgKiBhcyBwYXJzZUNsYXNzVHlwZXMgZnJvbSAnLi9wYXJzZUNsYXNzVHlwZXMnO1xuXG5jb25zdCBsb2FkID0gKHBhcnNlR3JhcGhRTFNjaGVtYSwgcGFyc2VDbGFzcykgPT4ge1xuICBjb25zdCBjbGFzc05hbWUgPSBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcblxuICBjb25zdCB7XG4gICAgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSxcbiAgICBjbGFzc0dyYXBoUUxGaW5kQXJncyxcbiAgICBjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSxcbiAgfSA9IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbY2xhc3NOYW1lXTtcblxuICBjb25zdCBnZXRHcmFwaFFMUXVlcnlOYW1lID0gYGdldCR7Y2xhc3NOYW1lfWA7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMT2JqZWN0c1F1ZXJpZXNbZ2V0R3JhcGhRTFF1ZXJ5TmFtZV0gPSB7XG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtnZXRHcmFwaFFMUXVlcnlOYW1lfSBxdWVyeSBjYW4gYmUgdXNlZCB0byBnZXQgYW4gb2JqZWN0IG9mIHRoZSAke2NsYXNzTmFtZX0gY2xhc3MgYnkgaXRzIGlkLmAsXG4gICAgYXJnczoge1xuICAgICAgb2JqZWN0SWQ6IGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUX0lEX0FUVCxcbiAgICAgIHJlYWRQcmVmZXJlbmNlOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlJFQURfUFJFRkVSRU5DRV9BVFQsXG4gICAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2U6IGRlZmF1bHRHcmFwaFFMVHlwZXMuSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRULFxuICAgIH0sXG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUpLFxuICAgIGFzeW5jIHJlc29sdmUoX3NvdXJjZSwgYXJncywgY29udGV4dCwgcXVlcnlJbmZvKSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IG9iamVjdElkLCByZWFkUHJlZmVyZW5jZSwgaW5jbHVkZVJlYWRQcmVmZXJlbmNlIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcbiAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKHF1ZXJ5SW5mbyk7XG5cbiAgICAgICAgY29uc3QgeyBrZXlzLCBpbmNsdWRlIH0gPSBwYXJzZUNsYXNzVHlwZXMuZXh0cmFjdEtleXNBbmRJbmNsdWRlKFxuICAgICAgICAgIHNlbGVjdGVkRmllbGRzXG4gICAgICAgICk7XG5cbiAgICAgICAgcmV0dXJuIGF3YWl0IG9iamVjdHNRdWVyaWVzLmdldE9iamVjdChcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgb2JqZWN0SWQsXG4gICAgICAgICAga2V5cyxcbiAgICAgICAgICBpbmNsdWRlLFxuICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aCxcbiAgICAgICAgICBpbmZvXG4gICAgICAgICk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9O1xuXG4gIGNvbnN0IGZpbmRHcmFwaFFMUXVlcnlOYW1lID0gYGZpbmQke2NsYXNzTmFtZX1gO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTE9iamVjdHNRdWVyaWVzW2ZpbmRHcmFwaFFMUXVlcnlOYW1lXSA9IHtcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2ZpbmRHcmFwaFFMUXVlcnlOYW1lfSBxdWVyeSBjYW4gYmUgdXNlZCB0byBmaW5kIG9iamVjdHMgb2YgdGhlICR7Y2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGFyZ3M6IGNsYXNzR3JhcGhRTEZpbmRBcmdzLFxuICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxGaW5kUmVzdWx0VHlwZSksXG4gICAgYXN5bmMgcmVzb2x2ZShfc291cmNlLCBhcmdzLCBjb250ZXh0LCBxdWVyeUluZm8pIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHtcbiAgICAgICAgICB3aGVyZSxcbiAgICAgICAgICBvcmRlcixcbiAgICAgICAgICBza2lwLFxuICAgICAgICAgIGxpbWl0LFxuICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICB9ID0gYXJncztcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG4gICAgICAgIGNvbnN0IHNlbGVjdGVkRmllbGRzID0gZ2V0RmllbGROYW1lcyhxdWVyeUluZm8pO1xuXG4gICAgICAgIGNvbnN0IHsga2V5cywgaW5jbHVkZSB9ID0gcGFyc2VDbGFzc1R5cGVzLmV4dHJhY3RLZXlzQW5kSW5jbHVkZShcbiAgICAgICAgICBzZWxlY3RlZEZpZWxkc1xuICAgICAgICAgICAgLmZpbHRlcihmaWVsZCA9PiBmaWVsZC5pbmNsdWRlcygnLicpKVxuICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5zbGljZShmaWVsZC5pbmRleE9mKCcuJykgKyAxKSlcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgcGFyc2VPcmRlciA9IG9yZGVyICYmIG9yZGVyLmpvaW4oJywnKTtcblxuICAgICAgICByZXR1cm4gYXdhaXQgb2JqZWN0c1F1ZXJpZXMuZmluZE9iamVjdHMoXG4gICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgIHdoZXJlLFxuICAgICAgICAgIHBhcnNlT3JkZXIsXG4gICAgICAgICAgc2tpcCxcbiAgICAgICAgICBsaW1pdCxcbiAgICAgICAgICBrZXlzLFxuICAgICAgICAgIGluY2x1ZGUsXG4gICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mbyxcbiAgICAgICAgICBzZWxlY3RlZEZpZWxkcy5tYXAoZmllbGQgPT4gZmllbGQuc3BsaXQoJy4nLCAxKVswXSlcbiAgICAgICAgKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=