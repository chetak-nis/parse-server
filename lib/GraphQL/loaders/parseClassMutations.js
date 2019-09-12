"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var objectsMutations = _interopRequireWildcard(require("./objectsMutations"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const load = (parseGraphQLSchema, parseClass) => {
  const className = parseClass.className;
  const classGraphQLInputType = parseGraphQLSchema.parseClassTypes[className].classGraphQLInputType;
  const fields = {
    description: 'These are the fields of the object.',
    type: classGraphQLInputType
  };
  const classGraphQLInputTypeFields = classGraphQLInputType.getFields();

  const transformTypes = fields => {
    if (fields) {
      Object.keys(fields).forEach(field => {
        if (classGraphQLInputTypeFields[field]) {
          switch (classGraphQLInputTypeFields[field].type) {
            case defaultGraphQLTypes.GEO_POINT:
              fields[field].__type = 'GeoPoint';
              break;

            case defaultGraphQLTypes.POLYGON:
              fields[field] = {
                __type: 'Polygon',
                coordinates: fields[field].map(geoPoint => [geoPoint.latitude, geoPoint.longitude])
              };
              break;
          }
        }
      });
    }
  };

  const createGraphQLMutationName = `create${className}`;
  parseGraphQLSchema.graphQLObjectsMutations[createGraphQLMutationName] = {
    description: `The ${createGraphQLMutationName} mutation can be used to create a new object of the ${className} class.`,
    args: {
      fields
    },
    type: new _graphql.GraphQLNonNull(defaultGraphQLTypes.CREATE_RESULT),

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
        transformTypes(fields);
        return await objectsMutations.createObject(className, fields, config, auth, info);
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  };
  const updateGraphQLMutationName = `update${className}`;
  parseGraphQLSchema.graphQLObjectsMutations[updateGraphQLMutationName] = {
    description: `The ${updateGraphQLMutationName} mutation can be used to update an object of the ${className} class.`,
    args: {
      objectId: defaultGraphQLTypes.OBJECT_ID_ATT,
      fields
    },
    type: defaultGraphQLTypes.UPDATE_RESULT,

    async resolve(_source, args, context) {
      try {
        const {
          objectId,
          fields
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        transformTypes(fields);
        return await objectsMutations.updateObject(className, objectId, fields, config, auth, info);
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  };
  const deleteGraphQLMutationName = `delete${className}`;
  parseGraphQLSchema.graphQLObjectsMutations[deleteGraphQLMutationName] = {
    description: `The ${deleteGraphQLMutationName} mutation can be used to delete an object of the ${className} class.`,
    args: {
      objectId: defaultGraphQLTypes.OBJECT_ID_ATT
    },
    type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean),

    async resolve(_source, args, context) {
      try {
        const {
          objectId
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        return await objectsMutations.deleteObject(className, objectId, config, auth, info);
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  };
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc011dGF0aW9ucy5qcyJdLCJuYW1lcyI6WyJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwicGFyc2VDbGFzcyIsImNsYXNzTmFtZSIsImNsYXNzR3JhcGhRTElucHV0VHlwZSIsInBhcnNlQ2xhc3NUeXBlcyIsImZpZWxkcyIsImRlc2NyaXB0aW9uIiwidHlwZSIsImNsYXNzR3JhcGhRTElucHV0VHlwZUZpZWxkcyIsImdldEZpZWxkcyIsInRyYW5zZm9ybVR5cGVzIiwiT2JqZWN0Iiwia2V5cyIsImZvckVhY2giLCJmaWVsZCIsImRlZmF1bHRHcmFwaFFMVHlwZXMiLCJHRU9fUE9JTlQiLCJfX3R5cGUiLCJQT0xZR09OIiwiY29vcmRpbmF0ZXMiLCJtYXAiLCJnZW9Qb2ludCIsImxhdGl0dWRlIiwibG9uZ2l0dWRlIiwiY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsImdyYXBoUUxPYmplY3RzTXV0YXRpb25zIiwiYXJncyIsIkdyYXBoUUxOb25OdWxsIiwiQ1JFQVRFX1JFU1VMVCIsInJlc29sdmUiLCJfc291cmNlIiwiY29udGV4dCIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwib2JqZWN0c011dGF0aW9ucyIsImNyZWF0ZU9iamVjdCIsImUiLCJoYW5kbGVFcnJvciIsInVwZGF0ZUdyYXBoUUxNdXRhdGlvbk5hbWUiLCJvYmplY3RJZCIsIk9CSkVDVF9JRF9BVFQiLCJVUERBVEVfUkVTVUxUIiwidXBkYXRlT2JqZWN0IiwiZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZSIsIkdyYXBoUUxCb29sZWFuIiwiZGVsZXRlT2JqZWN0Il0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7Ozs7OztBQUVBLE1BQU1BLElBQUksR0FBRyxDQUFDQyxrQkFBRCxFQUFxQkMsVUFBckIsS0FBb0M7QUFDL0MsUUFBTUMsU0FBUyxHQUFHRCxVQUFVLENBQUNDLFNBQTdCO0FBRUEsUUFB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TUFBTUksZ0JBQWdCLENBQUNXLFlBQWpCLENBQ1g1QyxTQURXLEVBRVhzQyxRQUZXLEVBR1hSLE1BSFcsRUFJWEMsSUFKVyxFQUtYQyxJQUxXLENBQWI7QUFPRCxPQVhELENBV0UsT0FBT0csQ0FBUCxFQUFVO0FBQ1ZyQyxRQUFBQSxrQkFBa0IsQ0FBQ3NDLFdBQW5CLENBQStCRCxDQUEvQjtBQUNEO0FBQ0Y7O0FBckJxRSxHQUF4RTtBQXVCRCxDQWxIRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsLCBHcmFwaFFMQm9vbGVhbiB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c011dGF0aW9ucyBmcm9tICcuL29iamVjdHNNdXRhdGlvbnMnO1xuXG5jb25zdCBsb2FkID0gKHBhcnNlR3JhcGhRTFNjaGVtYSwgcGFyc2VDbGFzcykgPT4ge1xuICBjb25zdCBjbGFzc05hbWUgPSBwYXJzZUNsYXNzLmNsYXNzTmFtZTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxJbnB1dFR5cGUgPVxuICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbY2xhc3NOYW1lXS5jbGFzc0dyYXBoUUxJbnB1dFR5cGU7XG4gIGNvbnN0IGZpZWxkcyA9IHtcbiAgICBkZXNjcmlwdGlvbjogJ1RoZXNlIGFyZSB0aGUgZmllbGRzIG9mIHRoZSBvYmplY3QuJyxcbiAgICB0eXBlOiBjbGFzc0dyYXBoUUxJbnB1dFR5cGUsXG4gIH07XG4gIGNvbnN0IGNsYXNzR3JhcGhRTElucHV0VHlwZUZpZWxkcyA9IGNsYXNzR3JhcGhRTElucHV0VHlwZS5nZXRGaWVsZHMoKTtcblxuICBjb25zdCB0cmFuc2Zvcm1UeXBlcyA9IGZpZWxkcyA9PiB7XG4gICAgaWYgKGZpZWxkcykge1xuICAgICAgT2JqZWN0LmtleXMoZmllbGRzKS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgICAgaWYgKGNsYXNzR3JhcGhRTElucHV0VHlwZUZpZWxkc1tmaWVsZF0pIHtcbiAgICAgICAgICBzd2l0Y2ggKGNsYXNzR3JhcGhRTElucHV0VHlwZUZpZWxkc1tmaWVsZF0udHlwZSkge1xuICAgICAgICAgICAgY2FzZSBkZWZhdWx0R3JhcGhRTFR5cGVzLkdFT19QT0lOVDpcbiAgICAgICAgICAgICAgZmllbGRzW2ZpZWxkXS5fX3R5cGUgPSAnR2VvUG9pbnQnO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgZGVmYXVsdEdyYXBoUUxUeXBlcy5QT0xZR09OOlxuICAgICAgICAgICAgICBmaWVsZHNbZmllbGRdID0ge1xuICAgICAgICAgICAgICAgIF9fdHlwZTogJ1BvbHlnb24nLFxuICAgICAgICAgICAgICAgIGNvb3JkaW5hdGVzOiBmaWVsZHNbZmllbGRdLm1hcChnZW9Qb2ludCA9PiBbXG4gICAgICAgICAgICAgICAgICBnZW9Qb2ludC5sYXRpdHVkZSxcbiAgICAgICAgICAgICAgICAgIGdlb1BvaW50LmxvbmdpdHVkZSxcbiAgICAgICAgICAgICAgICBdKSxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH07XG5cbiAgY29uc3QgY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZSA9IGBjcmVhdGUke2NsYXNzTmFtZX1gO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTE9iamVjdHNNdXRhdGlvbnNbY3JlYXRlR3JhcGhRTE11dGF0aW9uTmFtZV0gPSB7XG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjcmVhdGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBjcmVhdGUgYSBuZXcgb2JqZWN0IG9mIHRoZSAke2NsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBhcmdzOiB7XG4gICAgICBmaWVsZHMsXG4gICAgfSxcbiAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoZGVmYXVsdEdyYXBoUUxUeXBlcy5DUkVBVEVfUkVTVUxUKSxcbiAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgZmllbGRzIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICB0cmFuc2Zvcm1UeXBlcyhmaWVsZHMpO1xuXG4gICAgICAgIHJldHVybiBhd2FpdCBvYmplY3RzTXV0YXRpb25zLmNyZWF0ZU9iamVjdChcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgZmllbGRzLFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm9cbiAgICAgICAgKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG5cbiAgY29uc3QgdXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZSA9IGB1cGRhdGUke2NsYXNzTmFtZX1gO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTE9iamVjdHNNdXRhdGlvbnNbdXBkYXRlR3JhcGhRTE11dGF0aW9uTmFtZV0gPSB7XG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHt1cGRhdGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byB1cGRhdGUgYW4gb2JqZWN0IG9mIHRoZSAke2NsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBhcmdzOiB7XG4gICAgICBvYmplY3RJZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfSURfQVRULFxuICAgICAgZmllbGRzLFxuICAgIH0sXG4gICAgdHlwZTogZGVmYXVsdEdyYXBoUUxUeXBlcy5VUERBVEVfUkVTVUxULFxuICAgIGFzeW5jIHJlc29sdmUoX3NvdXJjZSwgYXJncywgY29udGV4dCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBvYmplY3RJZCwgZmllbGRzIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICB0cmFuc2Zvcm1UeXBlcyhmaWVsZHMpO1xuXG4gICAgICAgIHJldHVybiBhd2FpdCBvYmplY3RzTXV0YXRpb25zLnVwZGF0ZU9iamVjdChcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgb2JqZWN0SWQsXG4gICAgICAgICAgZmllbGRzLFxuICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICBhdXRoLFxuICAgICAgICAgIGluZm9cbiAgICAgICAgKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgfVxuICAgIH0sXG4gIH07XG5cbiAgY29uc3QgZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZSA9IGBkZWxldGUke2NsYXNzTmFtZX1gO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTE9iamVjdHNNdXRhdGlvbnNbZGVsZXRlR3JhcGhRTE11dGF0aW9uTmFtZV0gPSB7XG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtkZWxldGVHcmFwaFFMTXV0YXRpb25OYW1lfSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBkZWxldGUgYW4gb2JqZWN0IG9mIHRoZSAke2NsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBhcmdzOiB7XG4gICAgICBvYmplY3RJZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfSURfQVRULFxuICAgIH0sXG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgb2JqZWN0SWQgfSA9IGFyZ3M7XG4gICAgICAgIGNvbnN0IHsgY29uZmlnLCBhdXRoLCBpbmZvIH0gPSBjb250ZXh0O1xuXG4gICAgICAgIHJldHVybiBhd2FpdCBvYmplY3RzTXV0YXRpb25zLmRlbGV0ZU9iamVjdChcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgb2JqZWN0SWQsXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mb1xuICAgICAgICApO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfTtcbn07XG5cbmV4cG9ydCB7IGxvYWQgfTtcbiJdfQ==