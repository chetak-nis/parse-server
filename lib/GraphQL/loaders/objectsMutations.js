"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.deleteObject = exports.updateObject = exports.createObject = void 0;

var _graphql = require("graphql");

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var _rest = _interopRequireDefault(require("../../rest"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const parseMap = {
  _op: '__op'
};

const transformToParse = fields => {
  if (!fields || typeof fields !== 'object') {
    return;
  }

  Object.keys(fields).forEach(fieldName => {
    const fieldValue = fields[fieldName];

    if (parseMap[fieldName]) {
      delete fields[fieldName];
      fields[parseMap[fieldName]] = fieldValue;
    }

    if (typeof fieldValue === 'object') {
      transformToParse(fieldValue);
    }
  });
};

const createObject = async (className, fields, config, auth, info) => {
  if (!fields) {
    fields = {};
  }

  transformToParse(fields);
  return (await _rest.default.create(config, auth, className, fields, info.clientSDK)).response;
};

exports.createObject = createObject;

const updateObject = async (className, objectId, fields, config, auth, info) => {
  if (!fields) {
    fields = {};
  }

  transformToParse(fields);
  return (await _rest.default.update(config, auth, className, {
    objectId
  }, fields, info.clientSDK)).response;
};

exports.updateObject = updateObject;

const deleteObject = async (className, objectId, config, auth, info) => {
  await _rest.default.del(config, auth, className, objectId, info.clientSDK);
  return true;
};

exports.deleteObject = deleteObject;

const load = parseGraphQLSchema => {
  parseGraphQLSchema.graphQLObjectsMutations.create = {
    description: 'The create mutation can be used to create a new object of a certain class.',
    args: {
      className: defaultGraphQLTypes.CLASS_NAME_ATT,
      fields: defaultGraphQLTypes.FIELDS_ATT
    },
    type: new _graphql.GraphQLNonNull(defaultGraphQLTypes.CREATE_RESULT),

    async resolve(_source, args, context) {
      try {
        const {
          className,
          fields
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        return await createObject(className, fields, config, auth, info);
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  };
  parseGraphQLSchema.graphQLObjectsMutations.update = {
    description: 'The update mutation can be used to update an object of a certain class.',
    args: {
      className: defaultGraphQLTypes.CLASS_NAME_ATT,
      objectId: defaultGraphQLTypes.OBJECT_ID_ATT,
      fields: defaultGraphQLTypes.FIELDS_ATT
    },
    type: new _graphql.GraphQLNonNull(defaultGraphQLTypes.UPDATE_RESULT),

    async resolve(_source, args, context) {
      try {
        const {
          className,
          objectId,
          fields
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        return await updateObject(className, objectId, fields, config, auth, info);
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  };
  parseGraphQLSchema.graphQLObjectsMutations.delete = {
    description: 'The delete mutation can be used to delete an object of a certain class.',
    args: {
      className: defaultGraphQLTypes.CLASS_NAME_ATT,
      objectId: defaultGraphQLTypes.OBJECT_ID_ATT
    },
    type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean),

    async resolve(_source, args, context) {
      try {
        const {
          className,
          objectId
        } = args;
        const {
          config,
          auth,
          info
        } = context;
        return await deleteObject(className, objectId, config, auth, info);
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  };
  const objectsMutation = new _graphql.GraphQLObjectType({
    name: 'ObjectsMutation',
    description: 'ObjectsMutation is the top level type for objects mutations.',
    fields: parseGraphQLSchema.graphQLObjectsMutations
  });
  parseGraphQLSchema.graphQLTypes.push(objectsMutation);
  parseGraphQLSchema.graphQLMutations.objects = {
    description: 'This is the top level for objects mutations.',
    type: objectsMutation,
    resolve: () => new Object()
  };
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvb2JqZWN0c011dGF0aW9ucy5qcyJdLCJuYW1lcyI6WyJwYXJzZU1hcCIsIl9vcCIsInRyYW5zZm9ybVRvUGFyc2UiLCJmaWVsZHMiLCJPYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsImZpZWxkTmFtZSIsImZpZWxkVmFsdWUiLCJjcmVhdGVPYmplY3QiLCJjbGFzc05hbWUiLCJjb25maWciLCJhdXRoIiwiaW5mbyIsInJlc3QiLCJjcmVhdGUiLCJjbGllbnRTREsiLCJyZXNwb25zZSIsInVwZGF0ZU9iamVjdCIsIm9iamVjdElkIiwidXBkYXRlIiwiZGVsZXRlT2JqZWN0IiwiZGVsIiwibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsImdyYXBoUUxPYmplY3RzTXV0YXRpb25zIiwiZGVzY3JpcHRpb24iLCJhcmdzIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIkNMQVNTX05BTUVfQVRUIiwiRklFTERTX0FUVCIsInR5cGUiLCJHcmFwaFFMTm9uTnVsbCIsIkNSRUFURV9SRVNVTFQiLCJyZXNvbHZlIiwiX3NvdXJjZSIsImNvbnRleHQiLCJlIiwiaGFuZGxlRXJyb3IiLCJPQkpFQ1RfSURfQVRUIiwiVVBEQVRFX1JFU1VMVCIsImRlbGV0ZSIsIkdyYXBoUUxCb29sZWFuIiwib2JqZWN0c011dGF0aW9uIiwiR3JhcGhRTE9iamVjdFR5cGUiLCJuYW1lIiwiZ3JhcGhRTFR5cGVzIiwicHVzaCIsImdyYXBoUUxNdXRhdGlvbnMiLCJvYmplY3RzIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7Ozs7Ozs7O0FBRUEsTUFBTUEsUUFBUSxHQUFHO0FBQ2ZDLEVBQUFBLEdBQUcsRUFBRTtBQURVLENBQWpCOztBQUlBLE1BQU1DLGdCQUFnQixHQUFHQyxNQUFNLElBQUk7QUFDakMsTUFBSSxDQUFDQSxNQUFELElBQVcsT0FBT0EsTUFBUCxLQUFrQixRQUFqQyxFQUEyQztBQUN6QztBQUNEOztBQUNE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T0FBcEMsR0FBOEM7QUFDNUN2QixJQUFBQSxXQUFXLEVBQUUsOENBRCtCO0FBRTVDSyxJQUFBQSxJQUFJLEVBQUVZLGVBRnNDO0FBRzVDVCxJQUFBQSxPQUFPLEVBQUUsTUFBTSxJQUFJOUIsTUFBSjtBQUg2QixHQUE5QztBQUtELENBakZEIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgR3JhcGhRTE5vbk51bGwsIEdyYXBoUUxCb29sZWFuLCBHcmFwaFFMT2JqZWN0VHlwZSB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vLi4vcmVzdCc7XG5cbmNvbnN0IHBhcnNlTWFwID0ge1xuICBfb3A6ICdfX29wJyxcbn07XG5cbmNvbnN0IHRyYW5zZm9ybVRvUGFyc2UgPSBmaWVsZHMgPT4ge1xuICBpZiAoIWZpZWxkcyB8fCB0eXBlb2YgZmllbGRzICE9PSAnb2JqZWN0Jykge1xuICAgIHJldHVybjtcbiAgfVxuICBPYmplY3Qua2V5cyhmaWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICBjb25zdCBmaWVsZFZhbHVlID0gZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgaWYgKHBhcnNlTWFwW2ZpZWxkTmFtZV0pIHtcbiAgICAgIGRlbGV0ZSBmaWVsZHNbZmllbGROYW1lXTtcbiAgICAgIGZpZWxkc1twYXJzZU1hcFtmaWVsZE5hbWVdXSA9IGZpZWxkVmFsdWU7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIHRyYW5zZm9ybVRvUGFyc2UoZmllbGRWYWx1ZSk7XG4gICAgfVxuICB9KTtcbn07XG5cbmNvbnN0IGNyZWF0ZU9iamVjdCA9IGFzeW5jIChjbGFzc05hbWUsIGZpZWxkcywgY29uZmlnLCBhdXRoLCBpbmZvKSA9PiB7XG4gIGlmICghZmllbGRzKSB7XG4gICAgZmllbGRzID0ge307XG4gIH1cblxuICB0cmFuc2Zvcm1Ub1BhcnNlKGZpZWxkcyk7XG5cbiAgcmV0dXJuIChhd2FpdCByZXN0LmNyZWF0ZShjb25maWcsIGF1dGgsIGNsYXNzTmFtZSwgZmllbGRzLCBpbmZvLmNsaWVudFNESykpXG4gICAgLnJlc3BvbnNlO1xufTtcblxuY29uc3QgdXBkYXRlT2JqZWN0ID0gYXN5bmMgKFxuICBjbGFzc05hbWUsXG4gIG9iamVjdElkLFxuICBmaWVsZHMsXG4gIGNvbmZpZyxcbiAgYXV0aCxcbiAgaW5mb1xuKSA9PiB7XG4gIGlmICghZmllbGRzKSB7XG4gICAgZmllbGRzID0ge307XG4gIH1cblxuICB0cmFuc2Zvcm1Ub1BhcnNlKGZpZWxkcyk7XG5cbiAgcmV0dXJuIChhd2FpdCByZXN0LnVwZGF0ZShcbiAgICBjb25maWcsXG4gICAgYXV0aCxcbiAgICBjbGFzc05hbWUsXG4gICAgeyBvYmplY3RJZCB9LFxuICAgIGZpZWxkcyxcbiAgICBpbmZvLmNsaWVudFNES1xuICApKS5yZXNwb25zZTtcbn07XG5cbmNvbnN0IGRlbGV0ZU9iamVjdCA9IGFzeW5jIChjbGFzc05hbWUsIG9iamVjdElkLCBjb25maWcsIGF1dGgsIGluZm8pID0+IHtcbiAgYXdhaXQgcmVzdC5kZWwoY29uZmlnLCBhdXRoLCBjbGFzc05hbWUsIG9iamVjdElkLCBpbmZvLmNsaWVudFNESyk7XG4gIHJldHVybiB0cnVlO1xufTtcblxuY29uc3QgbG9hZCA9IHBhcnNlR3JhcGhRTFNjaGVtYSA9PiB7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMT2JqZWN0c011dGF0aW9ucy5jcmVhdGUgPSB7XG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVGhlIGNyZWF0ZSBtdXRhdGlvbiBjYW4gYmUgdXNlZCB0byBjcmVhdGUgYSBuZXcgb2JqZWN0IG9mIGEgY2VydGFpbiBjbGFzcy4nLFxuICAgIGFyZ3M6IHtcbiAgICAgIGNsYXNzTmFtZTogZGVmYXVsdEdyYXBoUUxUeXBlcy5DTEFTU19OQU1FX0FUVCxcbiAgICAgIGZpZWxkczogZGVmYXVsdEdyYXBoUUxUeXBlcy5GSUVMRFNfQVRULFxuICAgIH0sXG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKGRlZmF1bHRHcmFwaFFMVHlwZXMuQ1JFQVRFX1JFU1VMVCksXG4gICAgYXN5bmMgcmVzb2x2ZShfc291cmNlLCBhcmdzLCBjb250ZXh0KSB7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCB7IGNsYXNzTmFtZSwgZmllbGRzIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICByZXR1cm4gYXdhaXQgY3JlYXRlT2JqZWN0KGNsYXNzTmFtZSwgZmllbGRzLCBjb25maWcsIGF1dGgsIGluZm8pO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTE9iamVjdHNNdXRhdGlvbnMudXBkYXRlID0ge1xuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSB1cGRhdGUgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gdXBkYXRlIGFuIG9iamVjdCBvZiBhIGNlcnRhaW4gY2xhc3MuJyxcbiAgICBhcmdzOiB7XG4gICAgICBjbGFzc05hbWU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQ0xBU1NfTkFNRV9BVFQsXG4gICAgICBvYmplY3RJZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfSURfQVRULFxuICAgICAgZmllbGRzOiBkZWZhdWx0R3JhcGhRTFR5cGVzLkZJRUxEU19BVFQsXG4gICAgfSxcbiAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoZGVmYXVsdEdyYXBoUUxUeXBlcy5VUERBVEVfUkVTVUxUKSxcbiAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgY2xhc3NOYW1lLCBvYmplY3RJZCwgZmllbGRzIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZywgYXV0aCwgaW5mbyB9ID0gY29udGV4dDtcblxuICAgICAgICByZXR1cm4gYXdhaXQgdXBkYXRlT2JqZWN0KFxuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICBvYmplY3RJZCxcbiAgICAgICAgICBmaWVsZHMsXG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGF1dGgsXG4gICAgICAgICAgaW5mb1xuICAgICAgICApO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTE9iamVjdHNNdXRhdGlvbnMuZGVsZXRlID0ge1xuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBkZWxldGUgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gZGVsZXRlIGFuIG9iamVjdCBvZiBhIGNlcnRhaW4gY2xhc3MuJyxcbiAgICBhcmdzOiB7XG4gICAgICBjbGFzc05hbWU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQ0xBU1NfTkFNRV9BVFQsXG4gICAgICBvYmplY3RJZDogZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfSURfQVRULFxuICAgIH0sXG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICBhc3luYyByZXNvbHZlKF9zb3VyY2UsIGFyZ3MsIGNvbnRleHQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IHsgY2xhc3NOYW1lLCBvYmplY3RJZCB9ID0gYXJncztcbiAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG5cbiAgICAgICAgcmV0dXJuIGF3YWl0IGRlbGV0ZU9iamVjdChjbGFzc05hbWUsIG9iamVjdElkLCBjb25maWcsIGF1dGgsIGluZm8pO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfSxcbiAgfTtcblxuICBjb25zdCBvYmplY3RzTXV0YXRpb24gPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgIG5hbWU6ICdPYmplY3RzTXV0YXRpb24nLFxuICAgIGRlc2NyaXB0aW9uOiAnT2JqZWN0c011dGF0aW9uIGlzIHRoZSB0b3AgbGV2ZWwgdHlwZSBmb3Igb2JqZWN0cyBtdXRhdGlvbnMuJyxcbiAgICBmaWVsZHM6IHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMT2JqZWN0c011dGF0aW9ucyxcbiAgfSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChvYmplY3RzTXV0YXRpb24pO1xuXG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMTXV0YXRpb25zLm9iamVjdHMgPSB7XG4gICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB0b3AgbGV2ZWwgZm9yIG9iamVjdHMgbXV0YXRpb25zLicsXG4gICAgdHlwZTogb2JqZWN0c011dGF0aW9uLFxuICAgIHJlc29sdmU6ICgpID0+IG5ldyBPYmplY3QoKSxcbiAgfTtcbn07XG5cbmV4cG9ydCB7IGNyZWF0ZU9iamVjdCwgdXBkYXRlT2JqZWN0LCBkZWxldGVPYmplY3QsIGxvYWQgfTtcbiJdfQ==