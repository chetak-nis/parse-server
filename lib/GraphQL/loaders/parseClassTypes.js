"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = exports.extractKeysAndInclude = void 0;

var _graphql = require("graphql");

var _graphqlListFields = _interopRequireDefault(require("graphql-list-fields"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var objectsQueries = _interopRequireWildcard(require("./objectsQueries"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const mapInputType = (parseType, targetClass, parseClassTypes) => {
  switch (parseType) {
    case 'String':
      return _graphql.GraphQLString;

    case 'Number':
      return _graphql.GraphQLFloat;

    case 'Boolean':
      return _graphql.GraphQLBoolean;

    case 'Array':
      return new _graphql.GraphQLList(defaultGraphQLTypes.ANY);

    case 'Object':
      return defaultGraphQLTypes.OBJECT;

    case 'Date':
      return defaultGraphQLTypes.DATE;

    case 'Pointer':
      if (parseClassTypes[targetClass]) {
        return parseClassTypes[targetClass].classGraphQLScalarType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }

    case 'Relation':
      if (parseClassTypes[targetClass]) {
        return parseClassTypes[targetClass].classGraphQLRelationOpType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }

    case 'File':
      return defaultGraphQLTypes.FILE;

    case 'GeoPoint':
      return defaultGraphQLTypes.GEO_POINT;

    case 'Polygon':
      return defaultGraphQLTypes.POLYGON;

    case 'Bytes':
      return defaultGraphQLTypes.BYTES;

    case 'ACL':
      return defaultGraphQLTypes.OBJECT;

    default:
      return undefined;
  }
};

const mapOutputType = (parseType, targetClass, parseClassTypes) => {
  switch (parseType) {
    case 'String':
      return _graphql.GraphQLString;

    case 'Number':
      return _graphql.GraphQLFloat;

    case 'Boolean':
      return _graphql.GraphQLBoolean;

    case 'Array':
      return new _graphql.GraphQLList(defaultGraphQLTypes.ANY);

    case 'Object':
      return defaultGraphQLTypes.OBJECT;

    case 'Date':
      return defaultGraphQLTypes.DATE;

    case 'Pointer':
      if (parseClassTypes[targetClass]) {
        return parseClassTypes[targetClass].classGraphQLOutputType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }

    case 'Relation':
      if (parseClassTypes[targetClass]) {
        return new _graphql.GraphQLNonNull(parseClassTypes[targetClass].classGraphQLFindResultType);
      } else {
        return new _graphql.GraphQLNonNull(defaultGraphQLTypes.FIND_RESULT);
      }

    case 'File':
      return defaultGraphQLTypes.FILE_INFO;

    case 'GeoPoint':
      return defaultGraphQLTypes.GEO_POINT_INFO;

    case 'Polygon':
      return defaultGraphQLTypes.POLYGON_INFO;

    case 'Bytes':
      return defaultGraphQLTypes.BYTES;

    case 'ACL':
      return defaultGraphQLTypes.OBJECT;

    default:
      return undefined;
  }
};

const mapConstraintType = (parseType, targetClass, parseClassTypes) => {
  switch (parseType) {
    case 'String':
      return defaultGraphQLTypes.STRING_CONSTRAINT;

    case 'Number':
      return defaultGraphQLTypes.NUMBER_CONSTRAINT;

    case 'Boolean':
      return defaultGraphQLTypes.BOOLEAN_CONSTRAINT;

    case 'Array':
      return defaultGraphQLTypes.ARRAY_CONSTRAINT;

    case 'Object':
      return defaultGraphQLTypes.OBJECT_CONSTRAINT;

    case 'Date':
      return defaultGraphQLTypes.DATE_CONSTRAINT;

    case 'Pointer':
      if (parseClassTypes[targetClass]) {
        return parseClassTypes[targetClass].classGraphQLConstraintType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }

    case 'File':
      return defaultGraphQLTypes.FILE_CONSTRAINT;

    case 'GeoPoint':
      return defaultGraphQLTypes.GEO_POINT_CONSTRAINT;

    case 'Polygon':
      return defaultGraphQLTypes.POLYGON_CONSTRAINT;

    case 'Bytes':
      return defaultGraphQLTypes.BYTES_CONSTRAINT;

    case 'ACL':
      return defaultGraphQLTypes.OBJECT_CONSTRAINT;

    case 'Relation':
    default:
      return undefined;
  }
};

const extractKeysAndInclude = selectedFields => {
  selectedFields = selectedFields.filter(field => !field.includes('__typename'));
  let keys = undefined;
  let include = undefined;

  if (selectedFields && selectedFields.length > 0) {
    keys = selectedFields.join(',');
    include = selectedFields.reduce((fields, field) => {
      fields = fields.slice();
      let pointIndex = field.lastIndexOf('.');

      while (pointIndex > 0) {
        const lastField = field.slice(pointIndex + 1);
        field = field.slice(0, pointIndex);

        if (!fields.includes(field) && lastField !== 'objectId') {
          fields.push(field);
        }

        pointIndex = field.lastIndexOf('.');
      }

      return fields;
    }, []).join(',');
  }

  return {
    keys,
    include
  };
};

exports.extractKeysAndInclude = extractKeysAndInclude;

const load = (parseGraphQLSchema, parseClass) => {
  const className = parseClass.className;
  const classFields = Object.keys(parseClass.fields);
  const classCustomFields = classFields.filter(field => !Object.keys(defaultGraphQLTypes.CLASS_FIELDS).includes(field));
  const classGraphQLScalarTypeName = `${className}Pointer`;

  const parseScalarValue = value => {
    if (typeof value === 'string') {
      return {
        __type: 'Pointer',
        className,
        objectId: value
      };
    } else if (typeof value === 'object' && value.__type === 'Pointer' && value.className === className && typeof value.objectId === 'string') {
      return value;
    }

    throw new defaultGraphQLTypes.TypeValidationError(value, classGraphQLScalarTypeName);
  };

  const classGraphQLScalarType = new _graphql.GraphQLScalarType({
    name: classGraphQLScalarTypeName,
    description: `The ${classGraphQLScalarTypeName} is used in operations that involve ${className} pointers.`,
    parseValue: parseScalarValue,

    serialize(value) {
      if (typeof value === 'string') {
        return value;
      } else if (typeof value === 'object' && value.__type === 'Pointer' && value.className === className && typeof value.objectId === 'string') {
        return value.objectId;
      }

      throw new defaultGraphQLTypes.TypeValidationError(value, classGraphQLScalarTypeName);
    },

    parseLiteral(ast) {
      if (ast.kind === _graphql.Kind.STRING) {
        return parseScalarValue(ast.value);
      } else if (ast.kind === _graphql.Kind.OBJECT) {
        const __type = ast.fields.find(field => field.name.value === '__type');

        const className = ast.fields.find(field => field.name.value === 'className');
        const objectId = ast.fields.find(field => field.name.value === 'objectId');

        if (__type && __type.value && className && className.value && objectId && objectId.value) {
          return parseScalarValue({
            __type: __type.value.value,
            className: className.value.value,
            objectId: objectId.value.value
          });
        }
      }

      throw new defaultGraphQLTypes.TypeValidationError(ast.kind, classGraphQLScalarTypeName);
    }

  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLScalarType);
  const classGraphQLRelationOpTypeName = `${className}RelationOp`;
  const classGraphQLRelationOpType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLRelationOpTypeName,
    description: `The ${classGraphQLRelationOpTypeName} input type is used in operations that involve relations with the ${className} class.`,
    fields: () => ({
      _op: {
        description: 'This is the operation to be executed.',
        type: new _graphql.GraphQLNonNull(defaultGraphQLTypes.RELATION_OP)
      },
      ops: {
        description: 'In the case of a Batch operation, this is the list of operations to be executed.',
        type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLRelationOpType))
      },
      objects: {
        description: 'In the case of a AddRelation or RemoveRelation operation, this is the list of objects to be added/removed.',
        type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLScalarType))
      }
    })
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLRelationOpType);
  const classGraphQLInputTypeName = `${className}Fields`;
  const classGraphQLInputType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLInputTypeName,
    description: `The ${classGraphQLInputTypeName} input type is used in operations that involve inputting objects of ${className} class.`,
    fields: () => classCustomFields.reduce((fields, field) => {
      const type = mapInputType(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);

      if (type) {
        return _objectSpread({}, fields, {
          [field]: {
            description: `This is the object ${field}.`,
            type
          }
        });
      } else {
        return fields;
      }
    }, {
      ACL: defaultGraphQLTypes.ACL_ATT
    })
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLInputType);
  const classGraphQLConstraintTypeName = `${className}PointerConstraint`;
  const classGraphQLConstraintType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLConstraintTypeName,
    description: `The ${classGraphQLConstraintTypeName} input type is used in operations that involve filtering objects by a pointer field to ${className} class.`,
    fields: {
      _eq: defaultGraphQLTypes._eq(classGraphQLScalarType),
      _ne: defaultGraphQLTypes._ne(classGraphQLScalarType),
      _in: defaultGraphQLTypes._in(classGraphQLScalarType),
      _nin: defaultGraphQLTypes._nin(classGraphQLScalarType),
      _exists: defaultGraphQLTypes._exists,
      _select: defaultGraphQLTypes._select,
      _dontSelect: defaultGraphQLTypes._dontSelect,
      _inQuery: {
        description: 'This is the $inQuery operator to specify a constraint to select the objects where a field equals to any of the ids in the result of a different query.',
        type: defaultGraphQLTypes.SUBQUERY
      },
      _notInQuery: {
        description: 'This is the $notInQuery operator to specify a constraint to select the objects where a field do not equal to any of the ids in the result of a different query.',
        type: defaultGraphQLTypes.SUBQUERY
      }
    }
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLConstraintType);
  const classGraphQLConstraintsTypeName = `${className}Constraints`;
  const classGraphQLConstraintsType = new _graphql.GraphQLInputObjectType({
    name: classGraphQLConstraintsTypeName,
    description: `The ${classGraphQLConstraintsTypeName} input type is used in operations that involve filtering objects of ${className} class.`,
    fields: () => _objectSpread({}, classFields.reduce((fields, field) => {
      const type = mapConstraintType(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);

      if (type) {
        return _objectSpread({}, fields, {
          [field]: {
            description: `This is the object ${field}.`,
            type
          }
        });
      } else {
        return fields;
      }
    }, {}), {
      _or: {
        description: 'This is the $or operator to compound constraints.',
        type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLConstraintsType))
      },
      _and: {
        description: 'This is the $and operator to compound constraints.',
        type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLConstraintsType))
      },
      _nor: {
        description: 'This is the $nor operator to compound constraints.',
        type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLConstraintsType))
      }
    })
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLConstraintsType);
  const classGraphQLOrderTypeName = `${className}Order`;
  const classGraphQLOrderType = new _graphql.GraphQLEnumType({
    name: classGraphQLOrderTypeName,
    description: `The ${classGraphQLOrderTypeName} input type is used when sorting objects of the ${className} class.`,
    values: classFields.reduce((orderFields, field) => {
      return _objectSpread({}, orderFields, {
        [`${field}_ASC`]: {
          value: field
        },
        [`${field}_DESC`]: {
          value: `-${field}`
        }
      });
    }, {})
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLOrderType);
  const classGraphQLFindArgs = {
    where: {
      description: 'These are the conditions that the objects need to match in order to be found.',
      type: classGraphQLConstraintsType
    },
    order: {
      description: 'The fields to be used when sorting the data fetched.',
      type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLOrderType))
    },
    skip: defaultGraphQLTypes.SKIP_ATT,
    limit: defaultGraphQLTypes.LIMIT_ATT,
    readPreference: defaultGraphQLTypes.READ_PREFERENCE_ATT,
    includeReadPreference: defaultGraphQLTypes.INCLUDE_READ_PREFERENCE_ATT,
    subqueryReadPreference: defaultGraphQLTypes.SUBQUERY_READ_PREFERENCE_ATT
  };
  const classGraphQLOutputTypeName = `${className}Class`;

  const outputFields = () => {
    return classCustomFields.reduce((fields, field) => {
      const type = mapOutputType(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);

      if (parseClass.fields[field].type === 'Relation') {
        const targetParseClassTypes = parseGraphQLSchema.parseClassTypes[parseClass.fields[field].targetClass];
        const args = targetParseClassTypes ? targetParseClassTypes.classGraphQLFindArgs : undefined;
        return _objectSpread({}, fields, {
          [field]: {
            description: `This is the object ${field}.`,
            args,
            type,

            async resolve(source, args, context, queryInfo) {
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
                } = extractKeysAndInclude(selectedFields.filter(field => field.includes('.')).map(field => field.slice(field.indexOf('.') + 1)));
                return await objectsQueries.findObjects(source[field].className, _objectSpread({
                  _relatedTo: {
                    object: {
                      __type: 'Pointer',
                      className,
                      objectId: source.objectId
                    },
                    key: field
                  }
                }, where || {}), order, skip, limit, keys, include, false, readPreference, includeReadPreference, subqueryReadPreference, config, auth, info, selectedFields.map(field => field.split('.', 1)[0]));
              } catch (e) {
                parseGraphQLSchema.handleError(e);
              }
            }

          }
        });
      } else if (parseClass.fields[field].type === 'Polygon') {
        return _objectSpread({}, fields, {
          [field]: {
            description: `This is the object ${field}.`,
            type,

            async resolve(source) {
              if (source[field] && source[field].coordinates) {
                return source[field].coordinates.map(coordinate => ({
                  latitude: coordinate[0],
                  longitude: coordinate[1]
                }));
              } else {
                return null;
              }
            }

          }
        });
      } else if (type) {
        return _objectSpread({}, fields, {
          [field]: {
            description: `This is the object ${field}.`,
            type
          }
        });
      } else {
        return fields;
      }
    }, defaultGraphQLTypes.CLASS_FIELDS);
  };

  const classGraphQLOutputType = new _graphql.GraphQLObjectType({
    name: classGraphQLOutputTypeName,
    description: `The ${classGraphQLOutputTypeName} object type is used in operations that involve outputting objects of ${className} class.`,
    interfaces: [defaultGraphQLTypes.CLASS],
    fields: outputFields
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLOutputType);
  const classGraphQLFindResultTypeName = `${className}FindResult`;
  const classGraphQLFindResultType = new _graphql.GraphQLObjectType({
    name: classGraphQLFindResultTypeName,
    description: `The ${classGraphQLFindResultTypeName} object type is used in the ${className} find query to return the data of the matched objects.`,
    fields: {
      results: {
        description: 'This is the objects returned by the query',
        type: new _graphql.GraphQLNonNull(new _graphql.GraphQLList(new _graphql.GraphQLNonNull(classGraphQLOutputType)))
      },
      count: defaultGraphQLTypes.COUNT_ATT
    }
  });
  parseGraphQLSchema.graphQLTypes.push(classGraphQLFindResultType);
  parseGraphQLSchema.parseClassTypes[className] = {
    classGraphQLScalarType,
    classGraphQLRelationOpType,
    classGraphQLInputType,
    classGraphQLConstraintType,
    classGraphQLConstraintsType,
    classGraphQLFindArgs,
    classGraphQLOutputType,
    classGraphQLFindResultType
  };

  if (className === '_User') {
    const meType = new _graphql.GraphQLObjectType({
      name: 'Me',
      description: `The Me object type is used in operations that involve outputting the current user data.`,
      interfaces: [defaultGraphQLTypes.CLASS],
      fields: () => _objectSpread({}, outputFields(), {
        sessionToken: defaultGraphQLTypes.SESSION_TOKEN_ATT
      })
    });
    parseGraphQLSchema.meType = meType;
    parseGraphQLSchema.graphQLTypes.push(meType);
    const userSignUpInputTypeName = `_UserSignUpFields`;
    const userSignUpInputType = new _graphql.GraphQLInputObjectType({
      name: userSignUpInputTypeName,
      description: `The ${userSignUpInputTypeName} input type is used in operations that involve inputting objects of ${className} class when signing up.`,
      fields: () => classCustomFields.reduce((fields, field) => {
        const type = mapInputType(parseClass.fields[field].type, parseClass.fields[field].targetClass, parseGraphQLSchema.parseClassTypes);

        if (type) {
          return _objectSpread({}, fields, {
            [field]: {
              description: `This is the object ${field}.`,
              type: field === 'username' || field === 'password' ? new _graphql.GraphQLNonNull(type) : type
            }
          });
        } else {
          return fields;
        }
      }, {
        ACL: defaultGraphQLTypes.ACL_ATT
      })
    });
    parseGraphQLSchema.parseClassTypes['_User'].signUpInputType = userSignUpInputType;
    parseGraphQLSchema.graphQLTypes.push(userSignUpInputType);
  }
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvcGFyc2VDbGFzc1R5cGVzLmpzIl0sIm5hbWVzIjpbIm1hcElucHV0VHlwZSIsInBhcnNlVHlwZSIsInRhcmdldENsYXNzIiwicGFyc2VDbGFzc1R5cGVzIiwiR3JhcGhRTFN0cmluZyIsIkdyYXBoUUxGbG9hdCIsIkdyYXBoUUxCb29sZWFuIiwiR3JhcGhRTExpc3QiLCJkZWZhdWx0R3JhcGhRTFR5cGVzIiwiQU5ZIiwiT0JKRUNUIiwiREFURSIsImNsYXNzR3JhcGhRTFNjYWxhclR5cGUiLCJjbGFzc0dyYXBoUUxSZWxhdGlvbk9wVHlwZSIsIkZJTEUiLCJHRU9fUE9JTlQiLCJQT0xZR09OIiwiQllURVMiLCJ1bmRlZmluZWQiLCJtYXBPdXRwdXRUeXBlIiwiY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSIsIkdyYXBoUUxOb25OdWxsIiwiY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUiLCJGSU5EX1JFU1VMVCIsIkZJTEVfSU5GTyIsIkdFT19QT0lOVF9JTkZPIiwiUE9MWUdPTl9JTkZPIiwibWFwQ29uc3RyYWludFR5cGUiLCJTVFJJTkdfQ09OU1RSQUlOVCIsIk5VTUJFUl9DT05TVFJBSU5UIiwiQk9PTEVBTl9DT05TVFJBSU5UIiwiQVJSQVlfQ09OU1RSQUlOVCIsIk9CSkVDVF9DT05TVFJBSU5UIiwiREFURV9DT05TVFJBSU5UIiwiY2xhc3NHcmFwaFFMQ29uc3RyYWludFR5cGUiLCJGSUxFX0NPTlNUUkFJTlQiLCJHRU9fUE9JTlRfQ09OU1RSQUlOVCIsIlBPTFlHT05fQ09OU1RSQUlOVCIsIkJZVEVTX0NPTlNUUkFJTlQiLCJleHRyYWN0S2V5c0FuZEluY2x1ZGUiLCJzZWxlY3RlZEZpZWxkcyIsImZpbHRlciIsImZpZWxkIiwiaW5jbHVkZXMiLCJrZXlzIiwiaW5jbHVkZSIsImxlbmd0aCIsImpvaW4iLCJyZWR1Y2UiLCJmaWVsZHMiLCJzbGljZSIsInBvaW50SW5kZXgiLCJsYXN0SW5kZXhPZiIsImxhc3RGaWVsZCIsInB1c2giLCJsb2FkIiwicGFyc2VHcmFwaFFMU2NoZW1hIiwicGFyc2VDbGFzcyIsImNsYXNzTmFtZSIsImNsYXNzRmllbGRzIiwiT2JqZWN0IiwiY2xhc3NDdXN0b21GaWVsZHMiLCJDTEFTU19GSUVMRFMiLCJjbGFzc0dyYXBoUUxTY2FsYXJUeXBlTmFtZSIsInBhcnNlU2NhbGFyVmFsdWUiLCJ2YWx1ZSIsIl9fdHlwZSIsIm9iamVjdElkIiwiVHlwZVZhbGlkYXRpb25FcnJvciIsIkdyYXBoUUxTY2FsYXJUeXBlIiwibmFtZSIsImRlc2NyaXB0aW9uIiwicGFyc2VWYWx1ZSIsInNlcmlhbGl6ZSIsInBhcnNlTGl0ZXJhbCIsImFzdCIsImtpbmQiLCJLaW5kIiwiU1RSSU5HIiwiZmluZCIsImdyYXBoUUxUeXBlcyIsImNsYXNzR3JhcGhRTFJlbGF0aW9uT3BUeXBlTmFtZSIsIkdyYXBoUUxJbnB1dE9iamVjdFR5cGUiLCJfb3AiLCJ0eXBlIiwiUkVMQVRJT05fT1AiLCJvcHMiLCJvYmplY3RzIiwiY2xhc3NHcmFwaFFMSW5wdXRUeXBlTmFtZSIsImNsYXNzR3JhcGhRTElucHV0VHlwZSIsIkFDTCIsIkFDTF9BVFQiLCJjbGFzc0dyYXBoUUxDb25zdHJhaW50VHlwZU5hbWUiLCJfZXEiLCJfbmUiLCJfaW4iLCJfbmluIiwiX2V4aXN0cyIsIl9zZWxlY3QiLCJfZG9udFNlbGVjdCIsIl9pblF1ZXJ5IiwiU1VCUVVFUlkiLCJfbm90SW5RdWVyeSIsImNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUiLCJfb3IiLCJfYW5kIiwiX25vciIsImNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUiLCJjbGFzc0dyYXBoUUxPcmRlclR5cGUiLCJHcmFwaFFMRW51bVR5cGUiLCJ2YWx1ZXMiLCJvcmRlckZpZWxkcyIsImNsYXNzR3JhcGhRTEZpbmRBcmdzIiwid2hlcmUiLCJvcmRlciIsInNraXAiLCJTS0lQX0FUVCIsImxpbWl0IiwiTElNSVRfQVRUIiwicmVhZFByZWZlcmVuY2UiLCJSRUFEX1BSRUZFUkVOQ0VfQVRUIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwiSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRUIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsIlNVQlFVRVJZX1JFQURfUFJFRkVSRU5DRV9BVFQiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSIsIm91dHB1dEZpZWxkcyIsInRhcmdldFBhcnNlQ2xhc3NUeXBlcyIsImFyZ3MiLCJyZXNvbHZlIiwic291cmNlIiwiY29udGV4dCIsInF1ZXJ5SW5mbyIsImNvbmZpZyIsImF1dGgiLCJpbmZvIiwibWFwIiwiaW5kZXhPZiIsIm9iamVjdHNRdWVyaWVzIiwiZmluZE9iamVjdHMiLCJfcmVsYXRlZFRvIiwib2JqZWN0Iiwia2V5Iiwic3BsaXQiLCJlIiwiaGFuZGxlRXJyb3IiLCJjb29yZGluYXRlcyIsImNvb3JkaW5hdGUiLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsIkdyYXBoUUxPYmplY3RUeXBlIiwiaW50ZXJmYWNlcyIsIkNMQVNTIiwiY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGVOYW1lIiwicmVzdWx0cyIsImNvdW50IiwiQ09VTlRfQVRUIiwibWVUeXBlIiwic2Vzc2lvblRva2VuIiwiU0VTU0lPTl9UT0tFTl9BVFQiLCJ1c2VyU2lnblVwSW5wdXRUeXBlTmFtZSIsInVzZXJTaWduVXBJbnB1dFR5cGUiLCJzaWduVXBJbnB1dFR5cGUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFZQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7QUFFQSxNQUFNQSxZQUFZLEdBQUcsQ0FBQ0MsU0FBRCxFQUFZQyxXQUFaLEVBQXlCQyxlQUF6QixLQUE2QztBQUNoRSxVQUFRRixTQUFSO0FBQ0UsU0FBSyxRQUFMO0FBQ0UsYUFBT0csc0JBQVA7O0FBQ0YsU0FBSyxRQUFMO0FBQ0UsYUFBT0MscUJBQVA7O0FBQ0YsU0FBSyxTQUFMO0FBQ0UsYUFBT0MsdUJBQVA7O0FB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QUFBLFdBQVcsRUFBRyxPQUFNMEYsdUJBQXdCLHVFQUFzRXZHLFNBQVUseUJBRnZFO0FBR3JEVCxNQUFBQSxNQUFNLEVBQUUsTUFDTlksaUJBQWlCLENBQUNiLE1BQWxCLENBQ0UsQ0FBQ0MsTUFBRCxFQUFTUCxLQUFULEtBQW1CO0FBQ2pCLGNBQU0wQyxJQUFJLEdBQUdwRixZQUFZLENBQ3ZCeUQsVUFBVSxDQUFDUixNQUFYLENBQWtCUCxLQUFsQixFQUF5QjBDLElBREYsRUFFdkIzQixVQUFVLENBQUNSLE1BQVgsQ0FBa0JQLEtBQWxCLEVBQXlCeEMsV0FGRixFQUd2QnNELGtCQUFrQixDQUFDckQsZUFISSxDQUF6Qjs7QUFLQSxZQUFJaUYsSUFBSixFQUFVO0FBQ1IsbUNBQ0tuQyxNQURMO0FBRUUsYUFBQ1AsS0FBRCxHQUFTO0FBQ1A2QixjQUFBQSxXQUFXLEVBQUcsc0JBQXFCN0IsS0FBTSxHQURsQztBQUVQMEMsY0FBQUEsSUFBSSxFQUNGMUMsS0FBSyxLQUFLLFVBQVYsSUFBd0JBLEtBQUssS0FBSyxVQUFsQyxHQUNJLElBQUlyQix1QkFBSixDQUFtQitELElBQW5CLENBREosR0FFSUE7QUFMQztBQUZYO0FBVUQsU0FYRCxNQVdPO0FBQ0wsaUJBQU9uQyxNQUFQO0FBQ0Q7QUFDRixPQXJCSCxFQXNCRTtBQUNFeUMsUUFBQUEsR0FBRyxFQUFFbEYsbUJBQW1CLENBQUNtRjtBQUQzQixPQXRCRjtBQUptRCxLQUEzQixDQUE1QjtBQStCQW5DLElBQUFBLGtCQUFrQixDQUFDckQsZUFBbkIsQ0FDRSxPQURGLEVBRUVnSyxlQUZGLEdBRW9CRCxtQkFGcEI7QUFHQTFHLElBQUFBLGtCQUFrQixDQUFDd0IsWUFBbkIsQ0FBZ0MxQixJQUFoQyxDQUFxQzRHLG1CQUFyQztBQUNEO0FBQ0YsQ0E1YUQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBLaW5kLFxuICBHcmFwaFFMT2JqZWN0VHlwZSxcbiAgR3JhcGhRTFN0cmluZyxcbiAgR3JhcGhRTEZsb2F0LFxuICBHcmFwaFFMQm9vbGVhbixcbiAgR3JhcGhRTExpc3QsXG4gIEdyYXBoUUxJbnB1dE9iamVjdFR5cGUsXG4gIEdyYXBoUUxOb25OdWxsLFxuICBHcmFwaFFMU2NhbGFyVHlwZSxcbiAgR3JhcGhRTEVudW1UeXBlLFxufSBmcm9tICdncmFwaHFsJztcbmltcG9ydCBnZXRGaWVsZE5hbWVzIGZyb20gJ2dyYXBocWwtbGlzdC1maWVsZHMnO1xuaW1wb3J0ICogYXMgZGVmYXVsdEdyYXBoUUxUeXBlcyBmcm9tICcuL2RlZmF1bHRHcmFwaFFMVHlwZXMnO1xuaW1wb3J0ICogYXMgb2JqZWN0c1F1ZXJpZXMgZnJvbSAnLi9vYmplY3RzUXVlcmllcyc7XG5cbmNvbnN0IG1hcElucHV0VHlwZSA9IChwYXJzZVR5cGUsIHRhcmdldENsYXNzLCBwYXJzZUNsYXNzVHlwZXMpID0+IHtcbiAgc3dpdGNoIChwYXJzZVR5cGUpIHtcbiAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgcmV0dXJuIEdyYXBoUUxTdHJpbmc7XG4gICAgY2FzZSAnTnVtYmVyJzpcbiAgICAgIHJldHVybiBHcmFwaFFMRmxvYXQ7XG4gICAgY2FzZSAnQm9vbGVhbic6XG4gICAgICByZXR1cm4gR3JhcGhRTEJvb2xlYW47XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgcmV0dXJuIG5ldyBHcmFwaFFMTGlzdChkZWZhdWx0R3JhcGhRTFR5cGVzLkFOWSk7XG4gICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkRBVEU7XG4gICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICBpZiAocGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXSkge1xuICAgICAgICByZXR1cm4gcGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXS5jbGFzc0dyYXBoUUxTY2FsYXJUeXBlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuICAgICAgfVxuICAgIGNhc2UgJ1JlbGF0aW9uJzpcbiAgICAgIGlmIChwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTFJlbGF0aW9uT3BUeXBlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuICAgICAgfVxuICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuRklMRTtcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5HRU9fUE9JTlQ7XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5QT0xZR09OO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJZVEVTO1xuICAgIGNhc2UgJ0FDTCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cbn07XG5cbmNvbnN0IG1hcE91dHB1dFR5cGUgPSAocGFyc2VUeXBlLCB0YXJnZXRDbGFzcywgcGFyc2VDbGFzc1R5cGVzKSA9PiB7XG4gIHN3aXRjaCAocGFyc2VUeXBlKSB7XG4gICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgIHJldHVybiBHcmFwaFFMU3RyaW5nO1xuICAgIGNhc2UgJ051bWJlcic6XG4gICAgICByZXR1cm4gR3JhcGhRTEZsb2F0O1xuICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIEdyYXBoUUxCb29sZWFuO1xuICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgIHJldHVybiBuZXcgR3JhcGhRTExpc3QoZGVmYXVsdEdyYXBoUUxUeXBlcy5BTlkpO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1Q7XG4gICAgY2FzZSAnRGF0ZSc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5EQVRFO1xuICAgIGNhc2UgJ1BvaW50ZXInOlxuICAgICAgaWYgKHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10pIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMT3V0cHV0VHlwZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICAgIH1cbiAgICBjYXNlICdSZWxhdGlvbic6XG4gICAgICBpZiAocGFyc2VDbGFzc1R5cGVzW3RhcmdldENsYXNzXSkge1xuICAgICAgICByZXR1cm4gbmV3IEdyYXBoUUxOb25OdWxsKFxuICAgICAgICAgIHBhcnNlQ2xhc3NUeXBlc1t0YXJnZXRDbGFzc10uY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGVcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBuZXcgR3JhcGhRTE5vbk51bGwoZGVmYXVsdEdyYXBoUUxUeXBlcy5GSU5EX1JFU1VMVCk7XG4gICAgICB9XG4gICAgY2FzZSAnRmlsZSc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5GSUxFX0lORk87XG4gICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuR0VPX1BPSU5UX0lORk87XG4gICAgY2FzZSAnUG9seWdvbic6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5QT0xZR09OX0lORk87XG4gICAgY2FzZSAnQnl0ZXMnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuQllURVM7XG4gICAgY2FzZSAnQUNMJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVDtcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxufTtcblxuY29uc3QgbWFwQ29uc3RyYWludFR5cGUgPSAocGFyc2VUeXBlLCB0YXJnZXRDbGFzcywgcGFyc2VDbGFzc1R5cGVzKSA9PiB7XG4gIHN3aXRjaCAocGFyc2VUeXBlKSB7XG4gICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLlNUUklOR19DT05TVFJBSU5UO1xuICAgIGNhc2UgJ051bWJlcic6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5OVU1CRVJfQ09OU1RSQUlOVDtcbiAgICBjYXNlICdCb29sZWFuJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJPT0xFQU5fQ09OU1RSQUlOVDtcbiAgICBjYXNlICdBcnJheSc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5BUlJBWV9DT05TVFJBSU5UO1xuICAgIGNhc2UgJ09iamVjdCc6XG4gICAgICByZXR1cm4gZGVmYXVsdEdyYXBoUUxUeXBlcy5PQkpFQ1RfQ09OU1RSQUlOVDtcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkRBVEVfQ09OU1RSQUlOVDtcbiAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgIGlmIChwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUNsYXNzVHlwZXNbdGFyZ2V0Q2xhc3NdLmNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuT0JKRUNUO1xuICAgICAgfVxuICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuRklMRV9DT05TVFJBSU5UO1xuICAgIGNhc2UgJ0dlb1BvaW50JzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkdFT19QT0lOVF9DT05TVFJBSU5UO1xuICAgIGNhc2UgJ1BvbHlnb24nOlxuICAgICAgcmV0dXJuIGRlZmF1bHRHcmFwaFFMVHlwZXMuUE9MWUdPTl9DT05TVFJBSU5UO1xuICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLkJZVEVTX0NPTlNUUkFJTlQ7XG4gICAgY2FzZSAnQUNMJzpcbiAgICAgIHJldHVybiBkZWZhdWx0R3JhcGhRTFR5cGVzLk9CSkVDVF9DT05TVFJBSU5UO1xuICAgIGNhc2UgJ1JlbGF0aW9uJzpcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxufTtcblxuY29uc3QgZXh0cmFjdEtleXNBbmRJbmNsdWRlID0gc2VsZWN0ZWRGaWVsZHMgPT4ge1xuICBzZWxlY3RlZEZpZWxkcyA9IHNlbGVjdGVkRmllbGRzLmZpbHRlcihcbiAgICBmaWVsZCA9PiAhZmllbGQuaW5jbHVkZXMoJ19fdHlwZW5hbWUnKVxuICApO1xuICBsZXQga2V5cyA9IHVuZGVmaW5lZDtcbiAgbGV0IGluY2x1ZGUgPSB1bmRlZmluZWQ7XG4gIGlmIChzZWxlY3RlZEZpZWxkcyAmJiBzZWxlY3RlZEZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAga2V5cyA9IHNlbGVjdGVkRmllbGRzLmpvaW4oJywnKTtcbiAgICBpbmNsdWRlID0gc2VsZWN0ZWRGaWVsZHNcbiAgICAgIC5yZWR1Y2UoKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgICAgZmllbGRzID0gZmllbGRzLnNsaWNlKCk7XG4gICAgICAgIGxldCBwb2ludEluZGV4ID0gZmllbGQubGFzdEluZGV4T2YoJy4nKTtcbiAgICAgICAgd2hpbGUgKHBvaW50SW5kZXggPiAwKSB7XG4gICAgICAgICAgY29uc3QgbGFzdEZpZWxkID0gZmllbGQuc2xpY2UocG9pbnRJbmRleCArIDEpO1xuICAgICAgICAgIGZpZWxkID0gZmllbGQuc2xpY2UoMCwgcG9pbnRJbmRleCk7XG4gICAgICAgICAgaWYgKCFmaWVsZHMuaW5jbHVkZXMoZmllbGQpICYmIGxhc3RGaWVsZCAhPT0gJ29iamVjdElkJykge1xuICAgICAgICAgICAgZmllbGRzLnB1c2goZmllbGQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBwb2ludEluZGV4ID0gZmllbGQubGFzdEluZGV4T2YoJy4nKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgfSwgW10pXG4gICAgICAuam9pbignLCcpO1xuICB9XG4gIHJldHVybiB7IGtleXMsIGluY2x1ZGUgfTtcbn07XG5cbmNvbnN0IGxvYWQgPSAocGFyc2VHcmFwaFFMU2NoZW1hLCBwYXJzZUNsYXNzKSA9PiB7XG4gIGNvbnN0IGNsYXNzTmFtZSA9IHBhcnNlQ2xhc3MuY2xhc3NOYW1lO1xuXG4gIGNvbnN0IGNsYXNzRmllbGRzID0gT2JqZWN0LmtleXMocGFyc2VDbGFzcy5maWVsZHMpO1xuXG4gIGNvbnN0IGNsYXNzQ3VzdG9tRmllbGRzID0gY2xhc3NGaWVsZHMuZmlsdGVyKFxuICAgIGZpZWxkID0+ICFPYmplY3Qua2V5cyhkZWZhdWx0R3JhcGhRTFR5cGVzLkNMQVNTX0ZJRUxEUykuaW5jbHVkZXMoZmllbGQpXG4gICk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMU2NhbGFyVHlwZU5hbWUgPSBgJHtjbGFzc05hbWV9UG9pbnRlcmA7XG4gIGNvbnN0IHBhcnNlU2NhbGFyVmFsdWUgPSB2YWx1ZSA9PiB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIG9iamVjdElkOiB2YWx1ZSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInICYmXG4gICAgICB2YWx1ZS5jbGFzc05hbWUgPT09IGNsYXNzTmFtZSAmJlxuICAgICAgdHlwZW9mIHZhbHVlLm9iamVjdElkID09PSAnc3RyaW5nJ1xuICAgICkge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBkZWZhdWx0R3JhcGhRTFR5cGVzLlR5cGVWYWxpZGF0aW9uRXJyb3IoXG4gICAgICB2YWx1ZSxcbiAgICAgIGNsYXNzR3JhcGhRTFNjYWxhclR5cGVOYW1lXG4gICAgKTtcbiAgfTtcbiAgY29uc3QgY2xhc3NHcmFwaFFMU2NhbGFyVHlwZSA9IG5ldyBHcmFwaFFMU2NhbGFyVHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMU2NhbGFyVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxTY2FsYXJUeXBlTmFtZX0gaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSAke2NsYXNzTmFtZX0gcG9pbnRlcnMuYCxcbiAgICBwYXJzZVZhbHVlOiBwYXJzZVNjYWxhclZhbHVlLFxuICAgIHNlcmlhbGl6ZSh2YWx1ZSkge1xuICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgICB2YWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJyAmJlxuICAgICAgICB2YWx1ZS5jbGFzc05hbWUgPT09IGNsYXNzTmFtZSAmJlxuICAgICAgICB0eXBlb2YgdmFsdWUub2JqZWN0SWQgPT09ICdzdHJpbmcnXG4gICAgICApIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlLm9iamVjdElkO1xuICAgICAgfVxuXG4gICAgICB0aHJvdyBuZXcgZGVmYXVsdEdyYXBoUUxUeXBlcy5UeXBlVmFsaWRhdGlvbkVycm9yKFxuICAgICAgICB2YWx1ZSxcbiAgICAgICAgY2xhc3NHcmFwaFFMU2NhbGFyVHlwZU5hbWVcbiAgICAgICk7XG4gICAgfSxcbiAgICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgICAgIHJldHVybiBwYXJzZVNjYWxhclZhbHVlKGFzdC52YWx1ZSk7XG4gICAgICB9IGVsc2UgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgICBjb25zdCBfX3R5cGUgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ19fdHlwZScpO1xuICAgICAgICBjb25zdCBjbGFzc05hbWUgPSBhc3QuZmllbGRzLmZpbmQoXG4gICAgICAgICAgZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ2NsYXNzTmFtZSdcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3Qgb2JqZWN0SWQgPSBhc3QuZmllbGRzLmZpbmQoXG4gICAgICAgICAgZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ29iamVjdElkJ1xuICAgICAgICApO1xuICAgICAgICBpZiAoXG4gICAgICAgICAgX190eXBlICYmXG4gICAgICAgICAgX190eXBlLnZhbHVlICYmXG4gICAgICAgICAgY2xhc3NOYW1lICYmXG4gICAgICAgICAgY2xhc3NOYW1lLnZhbHVlICYmXG4gICAgICAgICAgb2JqZWN0SWQgJiZcbiAgICAgICAgICBvYmplY3RJZC52YWx1ZVxuICAgICAgICApIHtcbiAgICAgICAgICByZXR1cm4gcGFyc2VTY2FsYXJWYWx1ZSh7XG4gICAgICAgICAgICBfX3R5cGU6IF9fdHlwZS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLnZhbHVlLnZhbHVlLFxuICAgICAgICAgICAgb2JqZWN0SWQ6IG9iamVjdElkLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHRocm93IG5ldyBkZWZhdWx0R3JhcGhRTFR5cGVzLlR5cGVWYWxpZGF0aW9uRXJyb3IoXG4gICAgICAgIGFzdC5raW5kLFxuICAgICAgICBjbGFzc0dyYXBoUUxTY2FsYXJUeXBlTmFtZVxuICAgICAgKTtcbiAgICB9LFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKGNsYXNzR3JhcGhRTFNjYWxhclR5cGUpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTFJlbGF0aW9uT3BUeXBlTmFtZSA9IGAke2NsYXNzTmFtZX1SZWxhdGlvbk9wYDtcbiAgY29uc3QgY2xhc3NHcmFwaFFMUmVsYXRpb25PcFR5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMUmVsYXRpb25PcFR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMUmVsYXRpb25PcFR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgcmVsYXRpb25zIHdpdGggdGhlICR7Y2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT4gKHtcbiAgICAgIF9vcDoge1xuICAgICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG9wZXJhdGlvbiB0byBiZSBleGVjdXRlZC4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoZGVmYXVsdEdyYXBoUUxUeXBlcy5SRUxBVElPTl9PUCksXG4gICAgICB9LFxuICAgICAgb3BzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdJbiB0aGUgY2FzZSBvZiBhIEJhdGNoIG9wZXJhdGlvbiwgdGhpcyBpcyB0aGUgbGlzdCBvZiBvcGVyYXRpb25zIHRvIGJlIGV4ZWN1dGVkLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMUmVsYXRpb25PcFR5cGUpKSxcbiAgICAgIH0sXG4gICAgICBvYmplY3RzOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICdJbiB0aGUgY2FzZSBvZiBhIEFkZFJlbGF0aW9uIG9yIFJlbW92ZVJlbGF0aW9uIG9wZXJhdGlvbiwgdGhpcyBpcyB0aGUgbGlzdCBvZiBvYmplY3RzIHRvIGJlIGFkZGVkL3JlbW92ZWQuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxTY2FsYXJUeXBlKSksXG4gICAgICB9LFxuICAgIH0pLFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKGNsYXNzR3JhcGhRTFJlbGF0aW9uT3BUeXBlKTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxJbnB1dFR5cGVOYW1lID0gYCR7Y2xhc3NOYW1lfUZpZWxkc2A7XG4gIGNvbnN0IGNsYXNzR3JhcGhRTElucHV0VHlwZSA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgICBuYW1lOiBjbGFzc0dyYXBoUUxJbnB1dFR5cGVOYW1lLFxuICAgIGRlc2NyaXB0aW9uOiBgVGhlICR7Y2xhc3NHcmFwaFFMSW5wdXRUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGlucHV0dGluZyBvYmplY3RzIG9mICR7Y2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIGZpZWxkczogKCkgPT5cbiAgICAgIGNsYXNzQ3VzdG9tRmllbGRzLnJlZHVjZShcbiAgICAgICAgKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgICAgICBjb25zdCB0eXBlID0gbWFwSW5wdXRUeXBlKFxuICAgICAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUsXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAodHlwZSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBBQ0w6IGRlZmF1bHRHcmFwaFFMVHlwZXMuQUNMX0FUVCxcbiAgICAgICAgfVxuICAgICAgKSxcbiAgfSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5ncmFwaFFMVHlwZXMucHVzaChjbGFzc0dyYXBoUUxJbnB1dFR5cGUpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlTmFtZSA9IGAke2NsYXNzTmFtZX1Qb2ludGVyQ29uc3RyYWludGA7XG4gIGNvbnN0IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTENvbnN0cmFpbnRUeXBlTmFtZX0gaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgcG9pbnRlciBmaWVsZCB0byAke2NsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6IHtcbiAgICAgIF9lcTogZGVmYXVsdEdyYXBoUUxUeXBlcy5fZXEoY2xhc3NHcmFwaFFMU2NhbGFyVHlwZSksXG4gICAgICBfbmU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuX25lKGNsYXNzR3JhcGhRTFNjYWxhclR5cGUpLFxuICAgICAgX2luOiBkZWZhdWx0R3JhcGhRTFR5cGVzLl9pbihjbGFzc0dyYXBoUUxTY2FsYXJUeXBlKSxcbiAgICAgIF9uaW46IGRlZmF1bHRHcmFwaFFMVHlwZXMuX25pbihjbGFzc0dyYXBoUUxTY2FsYXJUeXBlKSxcbiAgICAgIF9leGlzdHM6IGRlZmF1bHRHcmFwaFFMVHlwZXMuX2V4aXN0cyxcbiAgICAgIF9zZWxlY3Q6IGRlZmF1bHRHcmFwaFFMVHlwZXMuX3NlbGVjdCxcbiAgICAgIF9kb250U2VsZWN0OiBkZWZhdWx0R3JhcGhRTFR5cGVzLl9kb250U2VsZWN0LFxuICAgICAgX2luUXVlcnk6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1RoaXMgaXMgdGhlICRpblF1ZXJ5IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSBhIGZpZWxkIGVxdWFscyB0byBhbnkgb2YgdGhlIGlkcyBpbiB0aGUgcmVzdWx0IG9mIGEgZGlmZmVyZW50IHF1ZXJ5LicsXG4gICAgICAgIHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuU1VCUVVFUlksXG4gICAgICB9LFxuICAgICAgX25vdEluUXVlcnk6IHtcbiAgICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICAgJ1RoaXMgaXMgdGhlICRub3RJblF1ZXJ5IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSBhIGZpZWxkIGRvIG5vdCBlcXVhbCB0byBhbnkgb2YgdGhlIGlkcyBpbiB0aGUgcmVzdWx0IG9mIGEgZGlmZmVyZW50IHF1ZXJ5LicsXG4gICAgICAgIHR5cGU6IGRlZmF1bHRHcmFwaFFMVHlwZXMuU1VCUVVFUlksXG4gICAgICB9LFxuICAgIH0sXG4gIH0pO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goY2xhc3NHcmFwaFFMQ29uc3RyYWludFR5cGUpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWUgPSBgJHtjbGFzc05hbWV9Q29uc3RyYWludHNgO1xuICBjb25zdCBjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZU5hbWV9IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBvZiAke2NsYXNzTmFtZX0gY2xhc3MuYCxcbiAgICBmaWVsZHM6ICgpID0+ICh7XG4gICAgICAuLi5jbGFzc0ZpZWxkcy5yZWR1Y2UoKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgICAgY29uc3QgdHlwZSA9IG1hcENvbnN0cmFpbnRUeXBlKFxuICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICk7XG4gICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgICB9XG4gICAgICB9LCB7fSksXG4gICAgICBfb3I6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSAkb3Igb3BlcmF0b3IgdG8gY29tcG91bmQgY29uc3RyYWludHMuJyxcbiAgICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChjbGFzc0dyYXBoUUxDb25zdHJhaW50c1R5cGUpKSxcbiAgICAgIH0sXG4gICAgICBfYW5kOiB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgJGFuZCBvcGVyYXRvciB0byBjb21wb3VuZCBjb25zdHJhaW50cy4nLFxuICAgICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSkpLFxuICAgICAgfSxcbiAgICAgIF9ub3I6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSAkbm9yIG9wZXJhdG9yIHRvIGNvbXBvdW5kIGNvbnN0cmFpbnRzLicsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlKSksXG4gICAgICB9LFxuICAgIH0pLFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKGNsYXNzR3JhcGhRTENvbnN0cmFpbnRzVHlwZSk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMT3JkZXJUeXBlTmFtZSA9IGAke2NsYXNzTmFtZX1PcmRlcmA7XG4gIGNvbnN0IGNsYXNzR3JhcGhRTE9yZGVyVHlwZSA9IG5ldyBHcmFwaFFMRW51bVR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTE9yZGVyVHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxPcmRlclR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgd2hlbiBzb3J0aW5nIG9iamVjdHMgb2YgdGhlICR7Y2xhc3NOYW1lfSBjbGFzcy5gLFxuICAgIHZhbHVlczogY2xhc3NGaWVsZHMucmVkdWNlKChvcmRlckZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIC4uLm9yZGVyRmllbGRzLFxuICAgICAgICBbYCR7ZmllbGR9X0FTQ2BdOiB7IHZhbHVlOiBmaWVsZCB9LFxuICAgICAgICBbYCR7ZmllbGR9X0RFU0NgXTogeyB2YWx1ZTogYC0ke2ZpZWxkfWAgfSxcbiAgICAgIH07XG4gICAgfSwge30pLFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKGNsYXNzR3JhcGhRTE9yZGVyVHlwZSk7XG5cbiAgY29uc3QgY2xhc3NHcmFwaFFMRmluZEFyZ3MgPSB7XG4gICAgd2hlcmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhlc2UgYXJlIHRoZSBjb25kaXRpb25zIHRoYXQgdGhlIG9iamVjdHMgbmVlZCB0byBtYXRjaCBpbiBvcmRlciB0byBiZSBmb3VuZC4nLFxuICAgICAgdHlwZTogY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlLFxuICAgIH0sXG4gICAgb3JkZXI6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIGZpZWxkcyB0byBiZSB1c2VkIHdoZW4gc29ydGluZyB0aGUgZGF0YSBmZXRjaGVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE9yZGVyVHlwZSkpLFxuICAgIH0sXG4gICAgc2tpcDogZGVmYXVsdEdyYXBoUUxUeXBlcy5TS0lQX0FUVCxcbiAgICBsaW1pdDogZGVmYXVsdEdyYXBoUUxUeXBlcy5MSU1JVF9BVFQsXG4gICAgcmVhZFByZWZlcmVuY2U6IGRlZmF1bHRHcmFwaFFMVHlwZXMuUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2U6IGRlZmF1bHRHcmFwaFFMVHlwZXMuSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRULFxuICAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U6IGRlZmF1bHRHcmFwaFFMVHlwZXMuU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgfTtcblxuICBjb25zdCBjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZSA9IGAke2NsYXNzTmFtZX1DbGFzc2A7XG4gIGNvbnN0IG91dHB1dEZpZWxkcyA9ICgpID0+IHtcbiAgICByZXR1cm4gY2xhc3NDdXN0b21GaWVsZHMucmVkdWNlKChmaWVsZHMsIGZpZWxkKSA9PiB7XG4gICAgICBjb25zdCB0eXBlID0gbWFwT3V0cHV0VHlwZShcbiAgICAgICAgcGFyc2VDbGFzcy5maWVsZHNbZmllbGRdLnR5cGUsXG4gICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50YXJnZXRDbGFzcyxcbiAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1xuICAgICAgKTtcbiAgICAgIGlmIChwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBjb25zdCB0YXJnZXRQYXJzZUNsYXNzVHlwZXMgPVxuICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbXG4gICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3NcbiAgICAgICAgICBdO1xuICAgICAgICBjb25zdCBhcmdzID0gdGFyZ2V0UGFyc2VDbGFzc1R5cGVzXG4gICAgICAgICAgPyB0YXJnZXRQYXJzZUNsYXNzVHlwZXMuY2xhc3NHcmFwaFFMRmluZEFyZ3NcbiAgICAgICAgICA6IHVuZGVmaW5lZDtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgIGFyZ3MsXG4gICAgICAgICAgICB0eXBlLFxuICAgICAgICAgICAgYXN5bmMgcmVzb2x2ZShzb3VyY2UsIGFyZ3MsIGNvbnRleHQsIHF1ZXJ5SW5mbykge1xuICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHtcbiAgICAgICAgICAgICAgICAgIHdoZXJlLFxuICAgICAgICAgICAgICAgICAgb3JkZXIsXG4gICAgICAgICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgICAgICAgbGltaXQsXG4gICAgICAgICAgICAgICAgICByZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZSxcbiAgICAgICAgICAgICAgICAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgfSA9IGFyZ3M7XG4gICAgICAgICAgICAgICAgY29uc3QgeyBjb25maWcsIGF1dGgsIGluZm8gfSA9IGNvbnRleHQ7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2VsZWN0ZWRGaWVsZHMgPSBnZXRGaWVsZE5hbWVzKHF1ZXJ5SW5mbyk7XG5cbiAgICAgICAgICAgICAgICBjb25zdCB7IGtleXMsIGluY2x1ZGUgfSA9IGV4dHJhY3RLZXlzQW5kSW5jbHVkZShcbiAgICAgICAgICAgICAgICAgIHNlbGVjdGVkRmllbGRzXG4gICAgICAgICAgICAgICAgICAgIC5maWx0ZXIoZmllbGQgPT4gZmllbGQuaW5jbHVkZXMoJy4nKSlcbiAgICAgICAgICAgICAgICAgICAgLm1hcChmaWVsZCA9PiBmaWVsZC5zbGljZShmaWVsZC5pbmRleE9mKCcuJykgKyAxKSlcbiAgICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIGF3YWl0IG9iamVjdHNRdWVyaWVzLmZpbmRPYmplY3RzKFxuICAgICAgICAgICAgICAgICAgc291cmNlW2ZpZWxkXS5jbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIF9yZWxhdGVkVG86IHtcbiAgICAgICAgICAgICAgICAgICAgICBvYmplY3Q6IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgb2JqZWN0SWQ6IHNvdXJjZS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgIGtleTogZmllbGQsXG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIC4uLih3aGVyZSB8fCB7fSksXG4gICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgb3JkZXIsXG4gICAgICAgICAgICAgICAgICBza2lwLFxuICAgICAgICAgICAgICAgICAgbGltaXQsXG4gICAgICAgICAgICAgICAgICBrZXlzLFxuICAgICAgICAgICAgICAgICAgaW5jbHVkZSxcbiAgICAgICAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2UsXG4gICAgICAgICAgICAgICAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICAgICAgY29uZmlnLFxuICAgICAgICAgICAgICAgICAgYXV0aCxcbiAgICAgICAgICAgICAgICAgIGluZm8sXG4gICAgICAgICAgICAgICAgICBzZWxlY3RlZEZpZWxkcy5tYXAoZmllbGQgPT4gZmllbGQuc3BsaXQoJy4nLCAxKVswXSlcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLmhhbmRsZUVycm9yKGUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2UgaWYgKHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAuLi5maWVsZHMsXG4gICAgICAgICAgW2ZpZWxkXToge1xuICAgICAgICAgICAgZGVzY3JpcHRpb246IGBUaGlzIGlzIHRoZSBvYmplY3QgJHtmaWVsZH0uYCxcbiAgICAgICAgICAgIHR5cGUsXG4gICAgICAgICAgICBhc3luYyByZXNvbHZlKHNvdXJjZSkge1xuICAgICAgICAgICAgICBpZiAoc291cmNlW2ZpZWxkXSAmJiBzb3VyY2VbZmllbGRdLmNvb3JkaW5hdGVzKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNvdXJjZVtmaWVsZF0uY29vcmRpbmF0ZXMubWFwKGNvb3JkaW5hdGUgPT4gKHtcbiAgICAgICAgICAgICAgICAgIGxhdGl0dWRlOiBjb29yZGluYXRlWzBdLFxuICAgICAgICAgICAgICAgICAgbG9uZ2l0dWRlOiBjb29yZGluYXRlWzFdLFxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9O1xuICAgICAgfSBlbHNlIGlmICh0eXBlKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgLi4uZmllbGRzLFxuICAgICAgICAgIFtmaWVsZF06IHtcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiBgVGhpcyBpcyB0aGUgb2JqZWN0ICR7ZmllbGR9LmAsXG4gICAgICAgICAgICB0eXBlLFxuICAgICAgICAgIH0sXG4gICAgICAgIH07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gZmllbGRzO1xuICAgICAgfVxuICAgIH0sIGRlZmF1bHRHcmFwaFFMVHlwZXMuQ0xBU1NfRklFTERTKTtcbiAgfTtcbiAgY29uc3QgY2xhc3NHcmFwaFFMT3V0cHV0VHlwZSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgbmFtZTogY2xhc3NHcmFwaFFMT3V0cHV0VHlwZU5hbWUsXG4gICAgZGVzY3JpcHRpb246IGBUaGUgJHtjbGFzc0dyYXBoUUxPdXRwdXRUeXBlTmFtZX0gb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBvdXRwdXR0aW5nIG9iamVjdHMgb2YgJHtjbGFzc05hbWV9IGNsYXNzLmAsXG4gICAgaW50ZXJmYWNlczogW2RlZmF1bHRHcmFwaFFMVHlwZXMuQ0xBU1NdLFxuICAgIGZpZWxkczogb3V0cHV0RmllbGRzLFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUpO1xuXG4gIGNvbnN0IGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlTmFtZSA9IGAke2NsYXNzTmFtZX1GaW5kUmVzdWx0YDtcbiAgY29uc3QgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgIG5hbWU6IGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlTmFtZSxcbiAgICBkZXNjcmlwdGlvbjogYFRoZSAke2NsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlTmFtZX0gb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiB0aGUgJHtjbGFzc05hbWV9IGZpbmQgcXVlcnkgdG8gcmV0dXJuIHRoZSBkYXRhIG9mIHRoZSBtYXRjaGVkIG9iamVjdHMuYCxcbiAgICBmaWVsZHM6IHtcbiAgICAgIHJlc3VsdHM6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBvYmplY3RzIHJldHVybmVkIGJ5IHRoZSBxdWVyeScsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChcbiAgICAgICAgICBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKGNsYXNzR3JhcGhRTE91dHB1dFR5cGUpKVxuICAgICAgICApLFxuICAgICAgfSxcbiAgICAgIGNvdW50OiBkZWZhdWx0R3JhcGhRTFR5cGVzLkNPVU5UX0FUVCxcbiAgICB9LFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKGNsYXNzR3JhcGhRTEZpbmRSZXN1bHRUeXBlKTtcblxuICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW2NsYXNzTmFtZV0gPSB7XG4gICAgY2xhc3NHcmFwaFFMU2NhbGFyVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxSZWxhdGlvbk9wVHlwZSxcbiAgICBjbGFzc0dyYXBoUUxJbnB1dFR5cGUsXG4gICAgY2xhc3NHcmFwaFFMQ29uc3RyYWludFR5cGUsXG4gICAgY2xhc3NHcmFwaFFMQ29uc3RyYWludHNUeXBlLFxuICAgIGNsYXNzR3JhcGhRTEZpbmRBcmdzLFxuICAgIGNsYXNzR3JhcGhRTE91dHB1dFR5cGUsXG4gICAgY2xhc3NHcmFwaFFMRmluZFJlc3VsdFR5cGUsXG4gIH07XG5cbiAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGNvbnN0IG1lVHlwZSA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gICAgICBuYW1lOiAnTWUnLFxuICAgICAgZGVzY3JpcHRpb246IGBUaGUgTWUgb2JqZWN0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBvdXRwdXR0aW5nIHRoZSBjdXJyZW50IHVzZXIgZGF0YS5gLFxuICAgICAgaW50ZXJmYWNlczogW2RlZmF1bHRHcmFwaFFMVHlwZXMuQ0xBU1NdLFxuICAgICAgZmllbGRzOiAoKSA9PiAoe1xuICAgICAgICAuLi5vdXRwdXRGaWVsZHMoKSxcbiAgICAgICAgc2Vzc2lvblRva2VuOiBkZWZhdWx0R3JhcGhRTFR5cGVzLlNFU1NJT05fVE9LRU5fQVRULFxuICAgICAgfSksXG4gICAgfSk7XG4gICAgcGFyc2VHcmFwaFFMU2NoZW1hLm1lVHlwZSA9IG1lVHlwZTtcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2gobWVUeXBlKTtcblxuICAgIGNvbnN0IHVzZXJTaWduVXBJbnB1dFR5cGVOYW1lID0gYF9Vc2VyU2lnblVwRmllbGRzYDtcbiAgICBjb25zdCB1c2VyU2lnblVwSW5wdXRUeXBlID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICAgICAgbmFtZTogdXNlclNpZ25VcElucHV0VHlwZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogYFRoZSAke3VzZXJTaWduVXBJbnB1dFR5cGVOYW1lfSBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgaW5wdXR0aW5nIG9iamVjdHMgb2YgJHtjbGFzc05hbWV9IGNsYXNzIHdoZW4gc2lnbmluZyB1cC5gLFxuICAgICAgZmllbGRzOiAoKSA9PlxuICAgICAgICBjbGFzc0N1c3RvbUZpZWxkcy5yZWR1Y2UoXG4gICAgICAgICAgKGZpZWxkcywgZmllbGQpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHR5cGUgPSBtYXBJbnB1dFR5cGUoXG4gICAgICAgICAgICAgIHBhcnNlQ2xhc3MuZmllbGRzW2ZpZWxkXS50eXBlLFxuICAgICAgICAgICAgICBwYXJzZUNsYXNzLmZpZWxkc1tmaWVsZF0udGFyZ2V0Q2xhc3MsXG4gICAgICAgICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAodHlwZSkge1xuICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIC4uLmZpZWxkcyxcbiAgICAgICAgICAgICAgICBbZmllbGRdOiB7XG4gICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogYFRoaXMgaXMgdGhlIG9iamVjdCAke2ZpZWxkfS5gLFxuICAgICAgICAgICAgICAgICAgdHlwZTpcbiAgICAgICAgICAgICAgICAgICAgZmllbGQgPT09ICd1c2VybmFtZScgfHwgZmllbGQgPT09ICdwYXNzd29yZCdcbiAgICAgICAgICAgICAgICAgICAgICA/IG5ldyBHcmFwaFFMTm9uTnVsbCh0eXBlKVxuICAgICAgICAgICAgICAgICAgICAgIDogdHlwZSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcmV0dXJuIGZpZWxkcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIEFDTDogZGVmYXVsdEdyYXBoUUxUeXBlcy5BQ0xfQVRULFxuICAgICAgICAgIH1cbiAgICAgICAgKSxcbiAgICB9KTtcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW1xuICAgICAgJ19Vc2VyJ1xuICAgIF0uc2lnblVwSW5wdXRUeXBlID0gdXNlclNpZ25VcElucHV0VHlwZTtcbiAgICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2godXNlclNpZ25VcElucHV0VHlwZSk7XG4gIH1cbn07XG5cbmV4cG9ydCB7IGV4dHJhY3RLZXlzQW5kSW5jbHVkZSwgbG9hZCB9O1xuIl19