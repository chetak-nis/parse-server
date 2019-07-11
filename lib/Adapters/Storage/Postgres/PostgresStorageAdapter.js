"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.PostgresStorageAdapter = void 0;

var _PostgresClient = require("./PostgresClient");

var _node = _interopRequireDefault(require("parse/node"));

var _lodash = _interopRequireDefault(require("lodash"));

var _sql = _interopRequireDefault(require("./sql"));

var _StorageAdapter = require("../StorageAdapter");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { keys.push.apply(keys, Object.getOwnPropertySymbols(object)); } if (enumerableOnly) keys = keys.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const PostgresRelationDoesNotExistError = '42P01';
const PostgresDuplicateRelationError = '42P07';
const PostgresDuplicateColumnError = '42701';
const PostgresMissingColumnError = '42703';
const PostgresDuplicateObjectError = '42710';
const PostgresUniqueIndexViolationError = '23505';
const PostgresTransactionAbortedError = '25P02';

const logger = require('../../../logger');

const debug = function (...args) {
  args = ['PG: ' + arguments[0]].concat(args.slice(1, args.length));
  const log = logger.getLogger();
  log.debug.apply(log, args);
};

const parseTypeToPostgresType = type => {
  switch (type.type) {
    case 'String':
      return 'text';

    case 'Date':
      return 'timestamp with time zone';

    case 'Object':
      return 'jsonb';

    case 'File':
      return 'text';

    case 'Boolean':
      return 'boolean';

    case 'Pointer':
      return 'char(10)';

    case 'Number':
      return 'double precision';

    case 'GeoPoint':
      return 'point';

    case 'Bytes':
      return 'jsonb';

    case 'Polygon':
      return 'polygon';

    case 'Array':
      if (type.contents && type.contents.type === 'String') {
        return 'text[]';
      } else {
        return 'jsonb';
      }

    default:
      throw `no type for ${JSON.stringify(type)} yet`;
  }
};

const ParseToPosgresComparator = {
  $gt: '>',
  $lt: '<',
  $gte: '>=',
  $lte: '<='
};
const mongoAggregateToPostgres = {
  $dayOfMonth: 'DAY',
  $dayOfWeek: 'DOW',
  $dayOfYear: 'DOY',
  $isoDayOfWeek: 'ISODOW',
  $isoWeekYear: 'ISOYEAR',
  $hour: 'HOUR',
  $minute: 'MINUTE',
  $second: 'SECOND',
  $millisecond: 'MILLISECONDS',
  $month: 'MONTH',
  $week: 'WEEK',
  $year: 'YEAR'
};

const toPostgresValue = value => {
  if (typeof value === 'object') {
    if (value.__type === 'Date') {
      return value.iso;
    }

    if (value.__type === 'File') {
      return value.name;
    }
  }

  return value;
};

const transformValue = value => {
  if (typeof value === 'object' && value.__type === 'Pointer') {
    return value.objectId;
  }

  return value;
}; // Duplicate from then mongo adapter...


const emptyCLPS = Object.freeze({
  find: {},
  get: {},
  create: {},
  update: {},
  delete: {},
  addField: {},
  protectedFields: {}
});
const defaultCLPS = Object.freeze({
  find: {
    '*': true
  },
  get: {
    '*': true
  },
  create: {
    '*': true
  },
  update: {
    '*': true
  },
  delete: {
    '*': true
  },
  addField: {
    '*': true
  },
  protectedFields: {
    '*': []
  }
});

const toParseSchema = schema => {
  if (schema.className === '_User') {
    delete schema.fields._hashed_password;
  }

  if (schema.fields) {
    delete schema.fields._wperm;
    delete schema.fields._rperm;
  }

  let clps = defaultCLPS;

  if (schema.classLevelPermissions) {
    clps = _objectSpread({}, emptyCLPS, {}, schema.classLevelPermissions);
  }

  let indexes = {};

  if (schema.indexes) {
    indexes = _objectSpread({}, schema.indexes);
  }

  return {
    className: schema.className,
    fields: schema.fields,
    classLevelPermissions: clps,
    indexes
  };
};

const toPostgresSchema = schema => {
  if (!schema) {
    return schema;
  }

  schema.fields = schema.fields || {};
  schema.fields._wperm = {
    type: 'Array',
    contents: {
      type: 'String'
    }
  };
  schema.fields._rperm = {
    type: 'Array',
    contents: {
      type: 'String'
    }
  };

  if (schema.className === '_User') {
    schema.fields._hashed_password = {
      type: 'String'
    };
    schema.fields._password_history = {
      type: 'Array'
    };
  }

  return schema;
};

const handleDotFields = object => {
  Object.keys(object).forEach(fieldName => {
    if (fieldName.indexOf('.') > -1) {
      const components = fieldName.split('.');
      const first = components.shift();
      object[first] = object[first] || {};
      let currentObj = object[first];
      let next;
      let value = object[fieldName];

      if (value && value.__op === 'Delete') {
        value = undefined;
      }
      /* eslint-disable no-cond-assign */


      while (next = components.shift()) {
        /* eslint-enable no-cond-assign */
        currentObj[next] = currentObj[next] || {};

        if (components.length === 0) {
          currentObj[next] = value;
        }

        currentObj = currentObj[next];
      }

      delete object[fieldName];
    }
  });
  return object;
};

const transformDotFieldToComponents = fieldName => {
  return fieldName.split('.').map((cmpt, index) => {
    if (index === 0) {
      return `"${cmpt}"`;
    }

    return `'${cmpt}'`;
  });
};

const transformDotField = fieldName => {
  if (fieldName.indexOf('.') === -1) {
    return `"${fieldName}"`;
  }

  const components = transformDotFieldToComponents(fieldName);
  let name = components.slice(0, components.length - 1).join('->');
  name += '->>' + components[components.length - 1];
  return name;
};

const transformAggregateField = fieldName => {
  if (typeof fieldName !== 'string') {
    return fieldName;
  }

  if (fieldName === '$_created_at') {
    return 'createdAt';
  }

  if (fieldName === '$_updated_at') {
    return 'updatedAt';
  }

  return fieldName.substr(1);
};

const validateKeys = object => {
  if (typeof object == 'object') {
    for (const key in object) {
      if (typeof object[key] == 'object') {
        validateKeys(object[key]);
      }

      if (key.includes('$') || key.includes('.')) {
        throw new _node.default.Error(_node.default.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
      }
    }
  }
}; // Returns the list of join tables on a schema


const joinTablesForSchema = schema => {
  const list = [];

  if (schema) {
    Object.keys(schema.fields).forEach(field => {
      if (schema.fields[field].type === 'Relation') {
        list.push(`_Join:${field}:${schema.className}`);
      }
    });
  }

  return list;
};

const buildWhereClause = ({
  schema,
  query,
  index,
  insensitive
}) => {
  const patterns = [];
  let values = [];
  const sorts = [];
  schema = toPostgresSchema(schema);

  for (const fieldName in query) {
    const isArrayField = schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array';
    const initialPatternsLength = patterns.length;
    const fieldValue = query[fieldName]; // nothingin the schema, it's gonna blow up

    if (!schema.fields[fieldName]) {
      // as it won't exist
      if (fieldValue && fieldValue.$exists === false) {
        continue;
      }
    }

    const authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);

    if (authDataMatch) {
      // TODO: Handle querying by _auth_data_provider, authData is stored in authData field
      continue;
    } else if (insensitive && (fieldName === 'username' || fieldName === 'email')) {
      patterns.push(`LOWER($${index}:name) = LOWER($${index + 1})`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (fieldName.indexOf('.') >= 0) {
      let name = transformDotField(fieldName);

      if (fieldValue === null) {
        patterns.push(`$${index}:raw IS NULL`);
        values.push(name);
        index += 1;
        continue;
      } else {
        if (fieldValue.$in) {
          const inPatterns = [];
          name = transformDotFieldToComponents(fieldName).join('->');
          fieldValue.$in.forEach(listElem => {
            if (typeof listElem === 'string') {
              if (listElem.includes('"') || listElem.includes("'")) {
                throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $in value; Strings with quotes cannot yet be safely escaped');
              }

              inPatterns.push(`"${listElem}"`);
            } else {
              inPatterns.push(`${listElem}`);
            }
          });
          patterns.push(`(${name})::jsonb @> '[${inPatterns.join()}]'::jsonb`);
        } else if (fieldValue.$regex) {// Handle later
        } else {
          patterns.push(`${name} = '${fieldValue}'`);
        }
      }
    } else if (fieldValue === null || fieldValue === undefined) {
      patterns.push(`$${index}:name IS NULL`);
      values.push(fieldName);
      index += 1;
      continue;
    } else if (typeof fieldValue === 'string') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (typeof fieldValue === 'boolean') {
      patterns.push(`$${index}:name = $${index + 1}`); // Can't cast boolean to double precision

      if (schema.fields[fieldName] && schema.fields[fieldName].type === 'Number') {
        // Should always return zero results
        const MAX_INT_PLUS_ONE = 9223372036854775808;
        values.push(fieldName, MAX_INT_PLUS_ONE);
      } else {
        values.push(fieldName, fieldValue);
      }

      index += 2;
    } else if (typeof fieldValue === 'number') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue);
      index += 2;
    } else if (['$or', '$nor', '$and'].includes(fieldName)) {
      const clauses = [];
      const clauseValues = [];
      fieldValue.forEach(subQuery => {
        const clause = buildWhereClause({
          schema,
          query: subQuery,
          index,
          insensitive
        });

        if (clause.pattern.length > 0) {
          clauses.push(clause.pattern);
          clauseValues.push(...clause.values);
          index += clause.values.length;
        }
      });
      const orOrAnd = fieldName === '$and' ? ' AND ' : ' OR ';
      const not = fieldName === '$nor' ? ' NOT ' : '';
      patterns.push(`${not}(${clauses.join(orOrAnd)})`);
      values.push(...clauseValues);
    }

    if (fieldValue.$ne !== undefined) {
      if (isArrayField) {
        fieldValue.$ne = JSON.stringify([fieldValue.$ne]);
        patterns.push(`NOT array_contains($${index}:name, $${index + 1})`);
      } else {
        if (fieldValue.$ne === null) {
          patterns.push(`$${index}:name IS NOT NULL`);
          values.push(fieldName);
          index += 1;
          continue;
        } else {
          // if not null, we need to manually exclude null
          if (fieldValue.$ne.__type === 'GeoPoint') {
            patterns.push(`($${index}:name <> POINT($${index + 1}, $${index + 2}) OR $${index}:name IS NULL)`);
          } else {
            patterns.push(`($${index}:name <> $${index + 1} OR $${index}:name IS NULL)`);
          }
        }
      }

      if (fieldValue.$ne.__type === 'GeoPoint') {
        const point = fieldValue.$ne;
        values.push(fieldName, point.longitude, point.latitude);
        index += 3;
      } else {
        // TODO: support arrays
        values.push(fieldName, fieldValue.$ne);
        index += 2;
      }
    }

    if (fieldValue.$eq !== undefined) {
      if (fieldValue.$eq === null) {
        patterns.push(`$${index}:name IS NULL`);
        values.push(fieldName);
        index += 1;
      } else {
        patterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.$eq);
        index += 2;
      }
    }

    const isInOrNin = Array.isArray(fieldValue.$in) || Array.isArray(fieldValue.$nin);

    if (Array.isArray(fieldValue.$in) && isArrayField && schema.fields[fieldName].contents && schema.fields[fieldName].contents.type === 'String') {
      const inPatterns = [];
      let allowNull = false;
      values.push(fieldName);
      fieldValue.$in.forEach((listElem, listIndex) => {
        if (listElem === null) {
          allowNull = true;
        } else {
          values.push(listElem);
          inPatterns.push(`$${index + 1 + listIndex - (allowNull ? 1 : 0)}`);
        }
      });

      if (allowNull) {
        patterns.push(`($${index}:name IS NULL OR $${index}:name && ARRAY[${inPatterns.join()}])`);
      } else {
        patterns.push(`$${index}:name && ARRAY[${inPatterns.join()}]`);
      }

      index = index + 1 + inPatterns.length;
    } else if (isInOrNin) {
      var createConstraint = (baseArray, notIn) => {
        const not = notIn ? ' NOT ' : '';

        if (baseArray.length > 0) {
          if (isArrayField) {
            patterns.push(`${not} array_contains($${index}:name, $${index + 1})`);
            values.push(fieldName, JSON.stringify(baseArray));
            index += 2;
          } else {
            // Handle Nested Dot Notation Above
            if (fieldName.indexOf('.') >= 0) {
              return;
            }

            const inPatterns = [];
            values.push(fieldName);
            baseArray.forEach((listElem, listIndex) => {
              if (listElem !== null) {
                values.push(listElem);
                inPatterns.push(`$${index + 1 + listIndex}`);
              }
            });
            patterns.push(`$${index}:name ${not} IN (${inPatterns.join()})`);
            index = index + 1 + inPatterns.length;
          }
        } else if (!notIn) {
          values.push(fieldName);
          patterns.push(`$${index}:name IS NULL`);
          index = index + 1;
        } else {
          // Handle empty array
          if (notIn) {
            patterns.push('1 = 1'); // Return all values
          } else {
            patterns.push('1 = 2'); // Return no values
          }
        }
      };

      if (fieldValue.$in) {
        createConstraint(_lodash.default.flatMap(fieldValue.$in, elt => elt), false);
      }

      if (fieldValue.$nin) {
        createConstraint(_lodash.default.flatMap(fieldValue.$nin, elt => elt), true);
      }
    } else if (typeof fieldValue.$in !== 'undefined') {
      throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $in value');
    } else if (typeof fieldValue.$nin !== 'undefined') {
      throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $nin value');
    }

    if (Array.isArray(fieldValue.$all) && isArrayField) {
      if (isAnyValueRegexStartsWith(fieldValue.$all)) {
        if (!isAllValuesRegexOrNone(fieldValue.$all)) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'All $all values must be of regex type or none: ' + fieldValue.$all);
        }

        for (let i = 0; i < fieldValue.$all.length; i += 1) {
          const value = processRegexPattern(fieldValue.$all[i].$regex);
          fieldValue.$all[i] = value.substring(1) + '%';
        }

        patterns.push(`array_contains_all_regex($${index}:name, $${index + 1}::jsonb)`);
      } else {
        patterns.push(`array_contains_all($${index}:name, $${index + 1}::jsonb)`);
      }

      values.push(fieldName, JSON.stringify(fieldValue.$all));
      index += 2;
    }

    if (typeof fieldValue.$exists !== 'undefined') {
      if (fieldValue.$exists) {
        patterns.push(`$${index}:name IS NOT NULL`);
      } else {
        patterns.push(`$${index}:name IS NULL`);
      }

      values.push(fieldName);
      index += 1;
    }

    if (fieldValue.$containedBy) {
      const arr = fieldValue.$containedBy;

      if (!(arr instanceof Array)) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $containedBy: should be an array`);
      }

      patterns.push(`$${index}:name <@ $${index + 1}::jsonb`);
      values.push(fieldName, JSON.stringify(arr));
      index += 2;
    }

    if (fieldValue.$text) {
      const search = fieldValue.$text.$search;
      let language = 'english';

      if (typeof search !== 'object') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $search, should be object`);
      }

      if (!search.$term || typeof search.$term !== 'string') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $term, should be string`);
      }

      if (search.$language && typeof search.$language !== 'string') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $language, should be string`);
      } else if (search.$language) {
        language = search.$language;
      }

      if (search.$caseSensitive && typeof search.$caseSensitive !== 'boolean') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $caseSensitive, should be boolean`);
      } else if (search.$caseSensitive) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $caseSensitive not supported, please use $regex or create a separate lower case column.`);
      }

      if (search.$diacriticSensitive && typeof search.$diacriticSensitive !== 'boolean') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $diacriticSensitive, should be boolean`);
      } else if (search.$diacriticSensitive === false) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, `bad $text: $diacriticSensitive - false not supported, install Postgres Unaccent Extension`);
      }

      patterns.push(`to_tsvector($${index}, $${index + 1}:name) @@ to_tsquery($${index + 2}, $${index + 3})`);
      values.push(language, fieldName, language, search.$term);
      index += 4;
    }

    if (fieldValue.$nearSphere) {
      const point = fieldValue.$nearSphere;
      const distance = fieldValue.$maxDistance;
      const distanceInKM = distance * 6371 * 1000;
      patterns.push(`ST_distance_sphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) <= $${index + 3}`);
      sorts.push(`ST_distance_sphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) ASC`);
      values.push(fieldName, point.longitude, point.latitude, distanceInKM);
      index += 4;
    }

    if (fieldValue.$within && fieldValue.$within.$box) {
      const box = fieldValue.$within.$box;
      const left = box[0].longitude;
      const bottom = box[0].latitude;
      const right = box[1].longitude;
      const top = box[1].latitude;
      patterns.push(`$${index}:name::point <@ $${index + 1}::box`);
      values.push(fieldName, `((${left}, ${bottom}), (${right}, ${top}))`);
      index += 2;
    }

    if (fieldValue.$geoWithin && fieldValue.$geoWithin.$centerSphere) {
      const centerSphere = fieldValue.$geoWithin.$centerSphere;

      if (!(centerSphere instanceof Array) || centerSphere.length < 2) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere should be an array of Parse.GeoPoint and distance');
      } // Get point, convert to geo point if necessary and validate


      let point = centerSphere[0];

      if (point instanceof Array && point.length === 2) {
        point = new _node.default.GeoPoint(point[1], point[0]);
      } else if (!GeoPointCoder.isValidJSON(point)) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere geo point invalid');
      }

      _node.default.GeoPoint._validate(point.latitude, point.longitude); // Get distance and validate


      const distance = centerSphere[1];

      if (isNaN(distance) || distance < 0) {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $centerSphere distance invalid');
      }

      const distanceInKM = distance * 6371 * 1000;
      patterns.push(`ST_distance_sphere($${index}:name::geometry, POINT($${index + 1}, $${index + 2})::geometry) <= $${index + 3}`);
      values.push(fieldName, point.longitude, point.latitude, distanceInKM);
      index += 4;
    }

    if (fieldValue.$geoWithin && fieldValue.$geoWithin.$polygon) {
      const polygon = fieldValue.$geoWithin.$polygon;
      let points;

      if (typeof polygon === 'object' && polygon.__type === 'Polygon') {
        if (!polygon.coordinates || polygon.coordinates.length < 3) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; Polygon.coordinates should contain at least 3 lon/lat pairs');
        }

        points = polygon.coordinates;
      } else if (polygon instanceof Array) {
        if (polygon.length < 3) {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value; $polygon should contain at least 3 GeoPoints');
        }

        points = polygon;
      } else {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, "bad $geoWithin value; $polygon should be Polygon object or Array of Parse.GeoPoint's");
      }

      points = points.map(point => {
        if (point instanceof Array && point.length === 2) {
          _node.default.GeoPoint._validate(point[1], point[0]);

          return `(${point[0]}, ${point[1]})`;
        }

        if (typeof point !== 'object' || point.__type !== 'GeoPoint') {
          throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoWithin value');
        } else {
          _node.default.GeoPoint._validate(point.latitude, point.longitude);
        }

        return `(${point.longitude}, ${point.latitude})`;
      }).join(', ');
      patterns.push(`$${index}:name::point <@ $${index + 1}::polygon`);
      values.push(fieldName, `(${points})`);
      index += 2;
    }

    if (fieldValue.$geoIntersects && fieldValue.$geoIntersects.$point) {
      const point = fieldValue.$geoIntersects.$point;

      if (typeof point !== 'object' || point.__type !== 'GeoPoint') {
        throw new _node.default.Error(_node.default.Error.INVALID_JSON, 'bad $geoIntersect value; $point should be GeoPoint');
      } else {
        _node.default.GeoPoint._validate(point.latitude, point.longitude);
      }

      patterns.push(`$${index}:name::polygon @> $${index + 1}::point`);
      values.push(fieldName, `(${point.longitude}, ${point.latitude})`);
      index += 2;
    }

    if (fieldValue.$regex) {
      let regex = fieldValue.$regex;
      let operator = '~';
      const opts = fieldValue.$options;

      if (opts) {
        if (opts.indexOf('i') >= 0) {
          operator = '~*';
        }

        if (opts.indexOf('x') >= 0) {
          regex = removeWhiteSpace(regex);
        }
      }

      const name = transformDotField(fieldName);
      regex = processRegexPattern(regex);
      patterns.push(`$${index}:raw ${operator} '$${index + 1}:raw'`);
      values.push(name, regex);
      index += 2;
    }

    if (fieldValue.__type === 'Pointer') {
      if (isArrayField) {
        patterns.push(`array_contains($${index}:name, $${index + 1})`);
        values.push(fieldName, JSON.stringify([fieldValue]));
        index += 2;
      } else {
        patterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.objectId);
        index += 2;
      }
    }

    if (fieldValue.__type === 'Date') {
      patterns.push(`$${index}:name = $${index + 1}`);
      values.push(fieldName, fieldValue.iso);
      index += 2;
    }

    if (fieldValue.__type === 'GeoPoint') {
      patterns.push(`$${index}:name ~= POINT($${index + 1}, $${index + 2})`);
      values.push(fieldName, fieldValue.longitude, fieldValue.latitude);
      index += 3;
    }

    if (fieldValue.__type === 'Polygon') {
      const value = convertPolygonToSQL(fieldValue.coordinates);
      patterns.push(`$${index}:name ~= $${index + 1}::polygon`);
      values.push(fieldName, value);
      index += 2;
    }

    Object.keys(ParseToPosgresComparator).forEach(cmp => {
      if (fieldValue[cmp] || fieldValue[cmp] === 0) {
        const pgComparator = ParseToPosgresComparator[cmp];
        patterns.push(`$${index}:name ${pgComparator} $${index + 1}`);
        values.push(fieldName, toPostgresValue(fieldValue[cmp]));
        index += 2;
      }
    });

    if (initialPatternsLength === patterns.length) {
      throw new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, `Postgres doesn't support this query type yet ${JSON.stringify(fieldValue)}`);
    }
  }

  values = values.map(transformValue);
  return {
    pattern: patterns.join(' AND '),
    values,
    sorts
  };
};

class PostgresStorageAdapter {
  // Private
  constructor({
    uri,
    collectionPrefix = '',
    databaseOptions
  }) {
    this._collectionPrefix = collectionPrefix;
    const {
      client,
      pgp
    } = (0, _PostgresClient.createClient)(uri, databaseOptions);
    this._client = client;
    this._pgp = pgp;
    this.canSortOnJoinTables = false;
  }

  handleShutdown() {
    if (!this._client) {
      return;
    }

    this._client.$pool.end();
  }

  _ensureSchemaCollectionExists(conn) {
    conn = conn || this._client;
    return conn.none('CREATE TABLE IF NOT EXISTS "_SCHEMA" ( "className" varChar(120), "schema" jsonb, "isParseClass" bool, PRIMARY KEY ("className") )').catch(error => {
      if (error.code === PostgresDuplicateRelationError || error.code === PostgresUniqueIndexViolationError || error.code === PostgresDuplicateObjectError) {// Table already exists, must have been created by a different request. Ignore error.
      } else {
        throw error;
      }
    });
  }

  classExists(name) {
    return this._client.one('SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = $1)', [name], a => a.exists);
  }

  setClassLevelPermissions(className, CLPs) {
    const self = this;
    return this._client.task('set-class-level-permissions', function* (t) {
      yield self._ensureSchemaCollectionExists(t);
      const values = [className, 'schema', 'classLevelPermissions', JSON.stringify(CLPs)];
      yield t.none(`UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className"=$1`, values);
    });
  }

  setIndexesWithSchemaFormat(className, submittedIndexes, existingIndexes = {}, fields, conn) {
    conn = conn || this._client;
    const self = this;

    if (submittedIndexes === undefined) {
      return Promise.resolve();
    }

    if (Object.keys(existingIndexes).length === 0) {
      existingIndexes = {
        _id_: {
          _id: 1
        }
      };
    }

    const deletedIndexes = [];
    const insertedIndexes = [];
    Object.keys(submittedIndexes).forEach(name => {
      const field = submittedIndexes[name];

      if (existingIndexes[name] && field.__op !== 'Delete') {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Index ${name} exists, cannot update.`);
      }

      if (!existingIndexes[name] && field.__op === 'Delete') {
        throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Index ${name} does not exist, cannot delete.`);
      }

      if (field.__op === 'Delete') {
        deletedIndexes.push(name);
        delete existingIndexes[name];
      } else {
        Object.keys(field).forEach(key => {
          if (!fields.hasOwnProperty(key)) {
            throw new _node.default.Error(_node.default.Error.INVALID_QUERY, `Field ${key} does not exist, cannot add index.`);
          }
        });
        existingIndexes[name] = field;
        insertedIndexes.push({
          key: field,
          name
        });
      }
    });
    return conn.tx('set-indexes-with-schema-format', function* (t) {
      if (insertedIndexes.length > 0) {
        yield self.createIndexes(className, insertedIndexes, t);
      }

      if (deletedIndexes.length > 0) {
        yield self.dropIndexes(className, deletedIndexes, t);
      }

      yield self._ensureSchemaCollectionExists(t);
      yield t.none('UPDATE "_SCHEMA" SET $2:name = json_object_set_key($2:name, $3::text, $4::jsonb) WHERE "className"=$1', [className, 'schema', 'indexes', JSON.stringify(existingIndexes)]);
    });
  }

  createClass(className, schema, conn) {
    conn = conn || this._client;
    return conn.tx('create-class', t => {
      const q1 = this.createTable(className, schema, t);
      const q2 = t.none('INSERT INTO "_SCHEMA" ("className", "schema", "isParseClass") VALUES ($<className>, $<schema>, true)', {
        className,
        schema
      });
      const q3 = this.setIndexesWithSchemaFormat(className, schema.indexes, {}, schema.fields, t);
      return t.batch([q1, q2, q3]);
    }).then(() => {
      return toParseSchema(schema);
    }).catch(err => {
      if (err.data[0].result.code === PostgresTransactionAbortedError) {
        err = err.data[1].result;
      }

      if (err.code === PostgresUniqueIndexViolationError && err.detail.includes(className)) {
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, `Class ${className} already exists.`);
      }

      throw err;
    });
  } // Just create a table, do not insert in schema


  createTable(className, schema, conn) {
    conn = conn || this._client;
    const self = this;
    debug('createTable', className, schema);
    const valuesArray = [];
    const patternsArray = [];
    const fields = Object.assign({}, schema.fields);

    if (className === '_User') {
      fields._email_verify_token_expires_at = {
        type: 'Date'
      };
      fields._email_verify_token = {
        type: 'String'
      };
      fields._account_lockout_expires_at = {
        type: 'Date'
      };
      fields._failed_login_count = {
        type: 'Number'
      };
      fields._perishable_token = {
        type: 'String'
      };
      fields._perishable_token_expires_at = {
        type: 'Date'
      };
      fields._password_changed_at = {
        type: 'Date'
      };
      fields._password_history = {
        type: 'Array'
      };
    }

    let index = 2;
    const relations = [];
    Object.keys(fields).forEach(fieldName => {
      const parseType = fields[fieldName]; // Skip when it's a relation
      // We'll create the tables later

      if (parseType.type === 'Relation') {
        relations.push(fieldName);
        return;
      }

      if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
        parseType.contents = {
          type: 'String'
        };
      }

      valuesArray.push(fieldName);
      valuesArray.push(parseTypeToPostgresType(parseType));
      patternsArray.push(`$${index}:name $${index + 1}:raw`);

      if (fieldName === 'objectId') {
        patternsArray.push(`PRIMARY KEY ($${index}:name)`);
      }

      index = index + 2;
    });
    const qs = `CREATE TABLE IF NOT EXISTS $1:name (${patternsArray.join()})`;
    const values = [className, ...valuesArray];
    debug(qs, values);
    return conn.task('create-table', function* (t) {
      try {
        yield self._ensureSchemaCollectionExists(t);
        yield t.none(qs, values);
      } catch (error) {
        if (error.code !== PostgresDuplicateRelationError) {
          throw error;
        } // ELSE: Table already exists, must have been created by a different request. Ignore the error.

      }

      yield t.tx('create-table-tx', tx => {
        return tx.batch(relations.map(fieldName => {
          return tx.none('CREATE TABLE IF NOT EXISTS $<joinTable:name> ("relatedId" varChar(120), "owningId" varChar(120), PRIMARY KEY("relatedId", "owningId") )', {
            joinTable: `_Join:${fieldName}:${className}`
          });
        }));
      });
    });
  }

  schemaUpgrade(className, schema, conn) {
    debug('schemaUpgrade', {
      className,
      schema
    });
    conn = conn || this._client;
    const self = this;
    return conn.tx('schema-upgrade', function* (t) {
      const columns = yield t.map('SELECT column_name FROM information_schema.columns WHERE table_name = $<className>', {
        className
      }, a => a.column_name);
      const newColumns = Object.keys(schema.fields).filter(item => columns.indexOf(item) === -1).map(fieldName => self.addFieldIfNotExists(className, fieldName, schema.fields[fieldName], t));
      yield t.batch(newColumns);
    });
  }

  addFieldIfNotExists(className, fieldName, type, conn) {
    // TODO: Must be revised for invalid logic...
    debug('addFieldIfNotExists', {
      className,
      fieldName,
      type
    });
    conn = conn || this._client;
    const self = this;
    return conn.tx('add-field-if-not-exists', function* (t) {
      if (type.type !== 'Relation') {
        try {
          yield t.none('ALTER TABLE $<className:name> ADD COLUMN $<fieldName:name> $<postgresType:raw>', {
            className,
            fieldName,
            postgresType: parseTypeToPostgresType(type)
          });
        } catch (error) {
          if (error.code === PostgresRelationDoesNotExistError) {
            return yield self.createClass(className, {
              fields: {
                [fieldName]: type
              }
            }, t);
          }

          if (error.code !== PostgresDuplicateColumnError) {
            throw error;
          } // Column already exists, created by other request. Carry on to see if it's the right type.

        }
      } else {
        yield t.none('CREATE TABLE IF NOT EXISTS $<joinTable:name> ("relatedId" varChar(120), "owningId" varChar(120), PRIMARY KEY("relatedId", "owningId") )', {
          joinTable: `_Join:${fieldName}:${className}`
        });
      }

      const result = yield t.any('SELECT "schema" FROM "_SCHEMA" WHERE "className" = $<className> and ("schema"::json->\'fields\'->$<fieldName>) is not null', {
        className,
        fieldName
      });

      if (result[0]) {
        throw 'Attempted to add a field that already exists';
      } else {
        const path = `{fields,${fieldName}}`;
        yield t.none('UPDATE "_SCHEMA" SET "schema"=jsonb_set("schema", $<path>, $<type>)  WHERE "className"=$<className>', {
          path,
          type,
          className
        });
      }
    });
  } // Drops a collection. Resolves with true if it was a Parse Schema (eg. _User, Custom, etc.)
  // and resolves with false if it wasn't (eg. a join table). Rejects if deletion was impossible.


  deleteClass(className) {
    const operations = [{
      query: `DROP TABLE IF EXISTS $1:name`,
      values: [className]
    }, {
      query: `DELETE FROM "_SCHEMA" WHERE "className" = $1`,
      values: [className]
    }];
    return this._client.tx(t => t.none(this._pgp.helpers.concat(operations))).then(() => className.indexOf('_Join:') != 0); // resolves with false when _Join table
  } // Delete all data known to this adapter. Used for testing.


  deleteAllClasses() {
    const now = new Date().getTime();
    const helpers = this._pgp.helpers;
    debug('deleteAllClasses');
    return this._client.task('delete-all-classes', function* (t) {
      try {
        const results = yield t.any('SELECT * FROM "_SCHEMA"');
        const joins = results.reduce((list, schema) => {
          return list.concat(joinTablesForSchema(schema.schema));
        }, []);
        const classes = ['_SCHEMA', '_PushStatus', '_JobStatus', '_JobSchedule', '_Hooks', '_GlobalConfig', '_Audience', ...results.map(result => result.className), ...joins];
        const queries = classes.map(className => ({
          query: 'DROP TABLE IF EXISTS $<className:name>',
          values: {
            className
          }
        }));
        yield t.tx(tx => tx.none(helpers.concat(queries)));
      } catch (error) {
        if (error.code !== PostgresRelationDoesNotExistError) {
          throw error;
        } // No _SCHEMA collection. Don't delete anything.

      }
    }).then(() => {
      debug(`deleteAllClasses done in ${new Date().getTime() - now}`);
    });
  } // Remove the column and all the data. For Relations, the _Join collection is handled
  // specially, this function does not delete _Join columns. It should, however, indicate
  // that the relation fields does not exist anymore. In mongo, this means removing it from
  // the _SCHEMA collection.  There should be no actual data in the collection under the same name
  // as the relation column, so it's fine to attempt to delete it. If the fields listed to be
  // deleted do not exist, this function should return successfully anyways. Checking for
  // attempts to delete non-existent fields is the responsibility of Parse Server.
  // This function is not obligated to delete fields atomically. It is given the field
  // names in a list so that databases that are capable of deleting fields atomically
  // may do so.
  // Returns a Promise.


  deleteFields(className, schema, fieldNames) {
    debug('deleteFields', className, fieldNames);
    fieldNames = fieldNames.reduce((list, fieldName) => {
      const field = schema.fields[fieldName];

      if (field.type !== 'Relation') {
        list.push(fieldName);
      }

      delete schema.fields[fieldName];
      return list;
    }, []);
    const values = [className, ...fieldNames];
    const columns = fieldNames.map((name, idx) => {
      return `$${idx + 2}:name`;
    }).join(', DROP COLUMN');
    return this._client.tx('delete-fields', function* (t) {
      yield t.none('UPDATE "_SCHEMA" SET "schema"=$<schema> WHERE "className"=$<className>', {
        schema,
        className
      });

      if (values.length > 1) {
        yield t.none(`ALTER TABLE $1:name DROP COLUMN ${columns}`, values);
      }
    });
  } // Return a promise for all schemas known to this adapter, in Parse format. In case the
  // schemas cannot be retrieved, returns a promise that rejects. Requirements for the
  // rejection reason are TBD.


  getAllClasses() {
    const self = this;
    return this._client.task('get-all-classes', function* (t) {
      yield self._ensureSchemaCollectionExists(t);
      return yield t.map('SELECT * FROM "_SCHEMA"', null, row => toParseSchema(_objectSpread({
        className: row.className
      }, row.schema)));
    });
  } // Return a promise for the schema with the given name, in Parse format. If
  // this adapter doesn't know about the schema, return a promise that rejects with
  // undefined as the reason.


  getClass(className) {
    debug('getClass', className);
    return this._client.any('SELECT * FROM "_SCHEMA" WHERE "className"=$<className>', {
      className
    }).then(result => {
      if (result.length !== 1) {
        throw undefined;
      }

      return result[0].schema;
    }).then(toParseSchema);
  } // TODO: remove the mongo format dependency in the return value


  createObject(className, schema, object) {
    debug('createObject', className, object);
    let columnsArray = [];
    const valuesArray = [];
    schema = toPostgresSchema(schema);
    const geoPoints = {};
    object = handleDotFields(object);
    validateKeys(object);
    Object.keys(object).forEach(fieldName => {
      if (object[fieldName] === null) {
        return;
      }

      var authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);

      if (authDataMatch) {
        var provider = authDataMatch[1];
        object['authData'] = object['authData'] || {};
        object['authData'][provider] = object[fieldName];
        delete object[fieldName];
        fieldName = 'authData';
      }

      columnsArray.push(fieldName);

      if (!schema.fields[fieldName] && className === '_User') {
        if (fieldName === '_email_verify_token' || fieldName === '_failed_login_count' || fieldName === '_perishable_token' || fieldName === '_password_history') {
          valuesArray.push(object[fieldName]);
        }

        if (fieldName === '_email_verify_token_expires_at') {
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
        }

        if (fieldName === '_account_lockout_expires_at' || fieldName === '_perishable_token_expires_at' || fieldName === '_password_changed_at') {
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }
        }

        return;
      }

      switch (schema.fields[fieldName].type) {
        case 'Date':
          if (object[fieldName]) {
            valuesArray.push(object[fieldName].iso);
          } else {
            valuesArray.push(null);
          }

          break;

        case 'Pointer':
          valuesArray.push(object[fieldName].objectId);
          break;

        case 'Array':
          if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
            valuesArray.push(object[fieldName]);
          } else {
            valuesArray.push(JSON.stringify(object[fieldName]));
          }

          break;

        case 'Object':
        case 'Bytes':
        case 'String':
        case 'Number':
        case 'Boolean':
          valuesArray.push(object[fieldName]);
          break;

        case 'File':
          valuesArray.push(object[fieldName].name);
          break;

        case 'Polygon':
          {
            const value = convertPolygonToSQL(object[fieldName].coordinates);
            valuesArray.push(value);
            break;
          }

        case 'GeoPoint':
          // pop the point and process later
          geoPoints[fieldName] = object[fieldName];
          columnsArray.pop();
          break;

        default:
          throw `Type ${schema.fields[fieldName].type} not supported yet`;
      }
    });
    columnsArray = columnsArray.concat(Object.keys(geoPoints));
    const initialValues = valuesArray.map((val, index) => {
      let termination = '';
      const fieldName = columnsArray[index];

      if (['_rperm', '_wperm'].indexOf(fieldName) >= 0) {
        termination = '::text[]';
      } else if (schema.fields[fieldName] && schema.fields[fieldName].type === 'Array') {
        termination = '::jsonb';
      }

      return `$${index + 2 + columnsArray.length}${termination}`;
    });
    const geoPointsInjects = Object.keys(geoPoints).map(key => {
      const value = geoPoints[key];
      valuesArray.push(value.longitude, value.latitude);
      const l = valuesArray.length + columnsArray.length;
      return `POINT($${l}, $${l + 1})`;
    });
    const columnsPattern = columnsArray.map((col, index) => `$${index + 2}:name`).join();
    const valuesPattern = initialValues.concat(geoPointsInjects).join();
    const qs = `INSERT INTO $1:name (${columnsPattern}) VALUES (${valuesPattern})`;
    const values = [className, ...columnsArray, ...valuesArray];
    debug(qs, values);
    return this._client.none(qs, values).then(() => ({
      ops: [object]
    })).catch(error => {
      if (error.code === PostgresUniqueIndexViolationError) {
        const err = new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
        err.underlyingError = error;

        if (error.constraint) {
          const matches = error.constraint.match(/unique_([a-zA-Z]+)/);

          if (matches && Array.isArray(matches)) {
            err.userInfo = {
              duplicated_field: matches[1]
            };
          }
        }

        error = err;
      }

      throw error;
    });
  } // Remove all objects that match the given Parse Query.
  // If no objects match, reject with OBJECT_NOT_FOUND. If objects are found and deleted, resolve with undefined.
  // If there is some other error, reject with INTERNAL_SERVER_ERROR.


  deleteObjectsByQuery(className, schema, query) {
    debug('deleteObjectsByQuery', className, query);
    const values = [className];
    const index = 2;
    const where = buildWhereClause({
      schema,
      index,
      query,
      insensitive: false
    });
    values.push(...where.values);

    if (Object.keys(query).length === 0) {
      where.pattern = 'TRUE';
    }

    const qs = `WITH deleted AS (DELETE FROM $1:name WHERE ${where.pattern} RETURNING *) SELECT count(*) FROM deleted`;
    debug(qs, values);
    return this._client.one(qs, values, a => +a.count).then(count => {
      if (count === 0) {
        throw new _node.default.Error(_node.default.Error.OBJECT_NOT_FOUND, 'Object not found.');
      } else {
        return count;
      }
    }).catch(error => {
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      } // ELSE: Don't delete anything if doesn't exist

    });
  } // Return value not currently well specified.


  findOneAndUpdate(className, schema, query, update) {
    debug('findOneAndUpdate', className, query, update);
    return this.updateObjectsByQuery(className, schema, query, update).then(val => val[0]);
  } // Apply the update to all objects that match the given Parse Query.


  updateObjectsByQuery(className, schema, query, update) {
    debug('updateObjectsByQuery', className, query, update);
    const updatePatterns = [];
    const values = [className];
    let index = 2;
    schema = toPostgresSchema(schema);

    const originalUpdate = _objectSpread({}, update); // Set flag for dot notation fields


    const dotNotationOptions = {};
    Object.keys(update).forEach(fieldName => {
      if (fieldName.indexOf('.') > -1) {
        const components = fieldName.split('.');
        const first = components.shift();
        dotNotationOptions[first] = true;
      } else {
        dotNotationOptions[fieldName] = false;
      }
    });
    update = handleDotFields(update); // Resolve authData first,
    // So we don't end up with multiple key updates

    for (const fieldName in update) {
      const authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);

      if (authDataMatch) {
        var provider = authDataMatch[1];
        const value = update[fieldName];
        delete update[fieldName];
        update['authData'] = update['authData'] || {};
        update['authData'][provider] = value;
      }
    }

    for (const fieldName in update) {
      const fieldValue = update[fieldName]; // Drop any undefined values.

      if (typeof fieldValue === 'undefined') {
        delete update[fieldName];
      } else if (fieldValue === null) {
        updatePatterns.push(`$${index}:name = NULL`);
        values.push(fieldName);
        index += 1;
      } else if (fieldName == 'authData') {
        // This recursively sets the json_object
        // Only 1 level deep
        const generate = (jsonb, key, value) => {
          return `json_object_set_key(COALESCE(${jsonb}, '{}'::jsonb), ${key}, ${value})::jsonb`;
        };

        const lastKey = `$${index}:name`;
        const fieldNameIndex = index;
        index += 1;
        values.push(fieldName);
        const update = Object.keys(fieldValue).reduce((lastKey, key) => {
          const str = generate(lastKey, `$${index}::text`, `$${index + 1}::jsonb`);
          index += 2;
          let value = fieldValue[key];

          if (value) {
            if (value.__op === 'Delete') {
              value = null;
            } else {
              value = JSON.stringify(value);
            }
          }

          values.push(key, value);
          return str;
        }, lastKey);
        updatePatterns.push(`$${fieldNameIndex}:name = ${update}`);
      } else if (fieldValue.__op === 'Increment') {
        updatePatterns.push(`$${index}:name = COALESCE($${index}:name, 0) + $${index + 1}`);
        values.push(fieldName, fieldValue.amount);
        index += 2;
      } else if (fieldValue.__op === 'Add') {
        updatePatterns.push(`$${index}:name = array_add(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldValue.__op === 'Delete') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, null);
        index += 2;
      } else if (fieldValue.__op === 'Remove') {
        updatePatterns.push(`$${index}:name = array_remove(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldValue.__op === 'AddUnique') {
        updatePatterns.push(`$${index}:name = array_add_unique(COALESCE($${index}:name, '[]'::jsonb), $${index + 1}::jsonb)`);
        values.push(fieldName, JSON.stringify(fieldValue.objects));
        index += 2;
      } else if (fieldName === 'updatedAt') {
        //TODO: stop special casing this. It should check for __type === 'Date' and use .iso
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'string') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'boolean') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (fieldValue.__type === 'Pointer') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue.objectId);
        index += 2;
      } else if (fieldValue.__type === 'Date') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, toPostgresValue(fieldValue));
        index += 2;
      } else if (fieldValue instanceof Date) {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (fieldValue.__type === 'File') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, toPostgresValue(fieldValue));
        index += 2;
      } else if (fieldValue.__type === 'GeoPoint') {
        updatePatterns.push(`$${index}:name = POINT($${index + 1}, $${index + 2})`);
        values.push(fieldName, fieldValue.longitude, fieldValue.latitude);
        index += 3;
      } else if (fieldValue.__type === 'Polygon') {
        const value = convertPolygonToSQL(fieldValue.coordinates);
        updatePatterns.push(`$${index}:name = $${index + 1}::polygon`);
        values.push(fieldName, value);
        index += 2;
      } else if (fieldValue.__type === 'Relation') {// noop
      } else if (typeof fieldValue === 'number') {
        updatePatterns.push(`$${index}:name = $${index + 1}`);
        values.push(fieldName, fieldValue);
        index += 2;
      } else if (typeof fieldValue === 'object' && schema.fields[fieldName] && schema.fields[fieldName].type === 'Object') {
        // Gather keys to increment
        const keysToIncrement = Object.keys(originalUpdate).filter(k => {
          // choose top level fields that have a delete operation set
          // Note that Object.keys is iterating over the **original** update object
          // and that some of the keys of the original update could be null or undefined:
          // (See the above check `if (fieldValue === null || typeof fieldValue == "undefined")`)
          const value = originalUpdate[k];
          return value && value.__op === 'Increment' && k.split('.').length === 2 && k.split('.')[0] === fieldName;
        }).map(k => k.split('.')[1]);
        let incrementPatterns = '';

        if (keysToIncrement.length > 0) {
          incrementPatterns = ' || ' + keysToIncrement.map(c => {
            const amount = fieldValue[c].amount;
            return `CONCAT('{"${c}":', COALESCE($${index}:name->>'${c}','0')::int + ${amount}, '}')::jsonb`;
          }).join(' || '); // Strip the keys

          keysToIncrement.forEach(key => {
            delete fieldValue[key];
          });
        }

        const keysToDelete = Object.keys(originalUpdate).filter(k => {
          // choose top level fields that have a delete operation set.
          const value = originalUpdate[k];
          return value && value.__op === 'Delete' && k.split('.').length === 2 && k.split('.')[0] === fieldName;
        }).map(k => k.split('.')[1]);
        const deletePatterns = keysToDelete.reduce((p, c, i) => {
          return p + ` - '$${index + 1 + i}:value'`;
        }, ''); // Override Object

        let updateObject = "'{}'::jsonb";

        if (dotNotationOptions[fieldName]) {
          // Merge Object
          updateObject = `COALESCE($${index}:name, '{}'::jsonb)`;
        }

        updatePatterns.push(`$${index}:name = (${updateObject} ${deletePatterns} ${incrementPatterns} || $${index + 1 + keysToDelete.length}::jsonb )`);
        values.push(fieldName, ...keysToDelete, JSON.stringify(fieldValue));
        index += 2 + keysToDelete.length;
      } else if (Array.isArray(fieldValue) && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array') {
        const expectedType = parseTypeToPostgresType(schema.fields[fieldName]);

        if (expectedType === 'text[]') {
          updatePatterns.push(`$${index}:name = $${index + 1}::text[]`);
          values.push(fieldName, fieldValue);
          index += 2;
        } else {
          updatePatterns.push(`$${index}:name = $${index + 1}::jsonb`);
          values.push(fieldName, JSON.stringify(fieldValue));
          index += 2;
        }
      } else {
        debug('Not supported update', fieldName, fieldValue);
        return Promise.reject(new _node.default.Error(_node.default.Error.OPERATION_FORBIDDEN, `Postgres doesn't support update ${JSON.stringify(fieldValue)} yet`));
      }
    }

    const where = buildWhereClause({
      schema,
      index,
      query,
      insensitive: false
    });
    values.push(...where.values);
    const whereClause = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const qs = `UPDATE $1:name SET ${updatePatterns.join()} ${whereClause} RETURNING *`;
    debug('update: ', qs, values);
    return this._client.any(qs, values);
  } // Hopefully, we can get rid of this. It's only used for config and hooks.


  upsertOneObject(className, schema, query, update) {
    debug('upsertOneObject', {
      className,
      query,
      update
    });
    const createValue = Object.assign({}, query, update);
    return this.createObject(className, schema, createValue).catch(error => {
      // ignore duplicate value errors as it's upsert
      if (error.code !== _node.default.Error.DUPLICATE_VALUE) {
        throw error;
      }

      return this.findOneAndUpdate(className, schema, query, update);
    });
  }

  find(className, schema, query, {
    skip,
    limit,
    sort,
    keys,
    insensitive
  }) {
    debug('find', className, query, {
      skip,
      limit,
      sort,
      keys,
      insensitive
    });
    const hasLimit = limit !== undefined;
    const hasSkip = skip !== undefined;
    let values = [className];
    const where = buildWhereClause({
      schema,
      query,
      index: 2,
      insensitive
    });
    values.push(...where.values);
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const limitPattern = hasLimit ? `LIMIT $${values.length + 1}` : '';

    if (hasLimit) {
      values.push(limit);
    }

    const skipPattern = hasSkip ? `OFFSET $${values.length + 1}` : '';

    if (hasSkip) {
      values.push(skip);
    }

    let sortPattern = '';

    if (sort) {
      const sortCopy = sort;
      const sorting = Object.keys(sort).map(key => {
        const transformKey = transformDotFieldToComponents(key).join('->'); // Using $idx pattern gives:  non-integer constant in ORDER BY

        if (sortCopy[key] === 1) {
          return `${transformKey} ASC`;
        }

        return `${transformKey} DESC`;
      }).join();
      sortPattern = sort !== undefined && Object.keys(sort).length > 0 ? `ORDER BY ${sorting}` : '';
    }

    if (where.sorts && Object.keys(where.sorts).length > 0) {
      sortPattern = `ORDER BY ${where.sorts.join()}`;
    }

    let columns = '*';

    if (keys) {
      // Exclude empty keys
      // Replace ACL by it's keys
      keys = keys.reduce((memo, key) => {
        if (key === 'ACL') {
          memo.push('_rperm');
          memo.push('_wperm');
        } else if (key.length > 0) {
          memo.push(key);
        }

        return memo;
      }, []);
      columns = keys.map((key, index) => {
        if (key === '$score') {
          return `ts_rank_cd(to_tsvector($${2}, $${3}:name), to_tsquery($${4}, $${5}), 32) as score`;
        }

        return `$${index + values.length + 1}:name`;
      }).join();
      values = values.concat(keys);
    }

    const qs = `SELECT ${columns} FROM $1:name ${wherePattern} ${sortPattern} ${limitPattern} ${skipPattern}`;
    debug(qs, values);
    return this._client.any(qs, values).catch(error => {
      // Query on non existing table, don't crash
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }

      return [];
    }).then(results => results.map(object => this.postgresObjectToParseObject(className, object, schema)));
  } // Converts from a postgres-format object to a REST-format object.
  // Does not strip out anything based on a lack of authentication.


  postgresObjectToParseObject(className, object, schema) {
    Object.keys(schema.fields).forEach(fieldName => {
      if (schema.fields[fieldName].type === 'Pointer' && object[fieldName]) {
        object[fieldName] = {
          objectId: object[fieldName],
          __type: 'Pointer',
          className: schema.fields[fieldName].targetClass
        };
      }

      if (schema.fields[fieldName].type === 'Relation') {
        object[fieldName] = {
          __type: 'Relation',
          className: schema.fields[fieldName].targetClass
        };
      }

      if (object[fieldName] && schema.fields[fieldName].type === 'GeoPoint') {
        object[fieldName] = {
          __type: 'GeoPoint',
          latitude: object[fieldName].y,
          longitude: object[fieldName].x
        };
      }

      if (object[fieldName] && schema.fields[fieldName].type === 'Polygon') {
        let coords = object[fieldName];
        coords = coords.substr(2, coords.length - 4).split('),(');
        coords = coords.map(point => {
          return [parseFloat(point.split(',')[1]), parseFloat(point.split(',')[0])];
        });
        object[fieldName] = {
          __type: 'Polygon',
          coordinates: coords
        };
      }

      if (object[fieldName] && schema.fields[fieldName].type === 'File') {
        object[fieldName] = {
          __type: 'File',
          name: object[fieldName]
        };
      }
    }); //TODO: remove this reliance on the mongo format. DB adapter shouldn't know there is a difference between created at and any other date field.

    if (object.createdAt) {
      object.createdAt = object.createdAt.toISOString();
    }

    if (object.updatedAt) {
      object.updatedAt = object.updatedAt.toISOString();
    }

    if (object.expiresAt) {
      object.expiresAt = {
        __type: 'Date',
        iso: object.expiresAt.toISOString()
      };
    }

    if (object._email_verify_token_expires_at) {
      object._email_verify_token_expires_at = {
        __type: 'Date',
        iso: object._email_verify_token_expires_at.toISOString()
      };
    }

    if (object._account_lockout_expires_at) {
      object._account_lockout_expires_at = {
        __type: 'Date',
        iso: object._account_lockout_expires_at.toISOString()
      };
    }

    if (object._perishable_token_expires_at) {
      object._perishable_token_expires_at = {
        __type: 'Date',
        iso: object._perishable_token_expires_at.toISOString()
      };
    }

    if (object._password_changed_at) {
      object._password_changed_at = {
        __type: 'Date',
        iso: object._password_changed_at.toISOString()
      };
    }

    for (const fieldName in object) {
      if (object[fieldName] === null) {
        delete object[fieldName];
      }

      if (object[fieldName] instanceof Date) {
        object[fieldName] = {
          __type: 'Date',
          iso: object[fieldName].toISOString()
        };
      }
    }

    return object;
  } // Create a unique index. Unique indexes on nullable fields are not allowed. Since we don't
  // currently know which fields are nullable and which aren't, we ignore that criteria.
  // As such, we shouldn't expose this function to users of parse until we have an out-of-band
  // Way of determining if a field is nullable. Undefined doesn't count against uniqueness,
  // which is why we use sparse indexes.


  ensureUniqueness(className, schema, fieldNames) {
    // Use the same name for every ensureUniqueness attempt, because postgres
    // Will happily create the same index with multiple names.
    const constraintName = `unique_${fieldNames.sort().join('_')}`;
    const constraintPatterns = fieldNames.map((fieldName, index) => `$${index + 3}:name`);
    const qs = `ALTER TABLE $1:name ADD CONSTRAINT $2:name UNIQUE (${constraintPatterns.join()})`;
    return this._client.none(qs, [className, constraintName, ...fieldNames]).catch(error => {
      if (error.code === PostgresDuplicateRelationError && error.message.includes(constraintName)) {// Index already exists. Ignore error.
      } else if (error.code === PostgresUniqueIndexViolationError && error.message.includes(constraintName)) {
        // Cast the error into the proper parse error
        throw new _node.default.Error(_node.default.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      } else {
        throw error;
      }
    });
  } // Executes a count.


  count(className, schema, query, readPreference, estimate = true) {
    debug('count', className, query, readPreference, estimate);
    const values = [className];
    const where = buildWhereClause({
      schema,
      query,
      index: 2,
      insensitive: false
    });
    values.push(...where.values);
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    let qs = '';

    if (where.pattern.length > 0 || !estimate) {
      qs = `SELECT count(*) FROM $1:name ${wherePattern}`;
    } else {
      qs = 'SELECT reltuples AS approximate_row_count FROM pg_class WHERE relname = $1';
    }

    return this._client.one(qs, values, a => {
      if (a.approximate_row_count != null) {
        return +a.approximate_row_count;
      } else {
        return +a.count;
      }
    }).catch(error => {
      if (error.code !== PostgresRelationDoesNotExistError) {
        throw error;
      }

      return 0;
    });
  }

  distinct(className, schema, query, fieldName) {
    debug('distinct', className, query);
    let field = fieldName;
    let column = fieldName;
    const isNested = fieldName.indexOf('.') >= 0;

    if (isNested) {
      field = transformDotFieldToComponents(fieldName).join('->');
      column = fieldName.split('.')[0];
    }

    const isArrayField = schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Array';
    const isPointerField = schema.fields && schema.fields[fieldName] && schema.fields[fieldName].type === 'Pointer';
    const values = [field, column, className];
    const where = buildWhereClause({
      schema,
      query,
      index: 4,
      insensitive: false
    });
    values.push(...where.values);
    const wherePattern = where.pattern.length > 0 ? `WHERE ${where.pattern}` : '';
    const transformer = isArrayField ? 'jsonb_array_elements' : 'ON';
    let qs = `SELECT DISTINCT ${transformer}($1:name) $2:name FROM $3:name ${wherePattern}`;

    if (isNested) {
      qs = `SELECT DISTINCT ${transformer}($1:raw) $2:raw FROM $3:name ${wherePattern}`;
    }

    debug(qs, values);
    return this._client.any(qs, values).catch(error => {
      if (error.code === PostgresMissingColumnError) {
        return [];
      }

      throw error;
    }).then(results => {
      if (!isNested) {
        results = results.filter(object => object[field] !== null);
        return results.map(object => {
          if (!isPointerField) {
            return object[field];
          }

          return {
            __type: 'Pointer',
            className: schema.fields[fieldName].targetClass,
            objectId: object[field]
          };
        });
      }

      const child = fieldName.split('.')[1];
      return results.map(object => object[column][child]);
    }).then(results => results.map(object => this.postgresObjectToParseObject(className, object, schema)));
  }

  aggregate(className, schema, pipeline) {
    debug('aggregate', className, pipeline);
    const values = [className];
    let index = 2;
    let columns = [];
    let countField = null;
    let groupValues = null;
    let wherePattern = '';
    let limitPattern = '';
    let skipPattern = '';
    let sortPattern = '';
    let groupPattern = '';

    for (let i = 0; i < pipeline.length; i += 1) {
      const stage = pipeline[i];

      if (stage.$group) {
        for (const field in stage.$group) {
          const value = stage.$group[field];

          if (value === null || value === undefined) {
            continue;
          }

          if (field === '_id' && typeof value === 'string' && value !== '') {
            columns.push(`$${index}:name AS "objectId"`);
            groupPattern = `GROUP BY $${index}:name`;
            values.push(transformAggregateField(value));
            index += 1;
            continue;
          }

          if (field === '_id' && typeof value === 'object' && Object.keys(value).length !== 0) {
            groupValues = value;
            const groupByFields = [];

            for (const alias in value) {
              const operation = Object.keys(value[alias])[0];
              const source = transformAggregateField(value[alias][operation]);

              if (mongoAggregateToPostgres[operation]) {
                if (!groupByFields.includes(`"${source}"`)) {
                  groupByFields.push(`"${source}"`);
                }

                columns.push(`EXTRACT(${mongoAggregateToPostgres[operation]} FROM $${index}:name AT TIME ZONE 'UTC') AS $${index + 1}:name`);
                values.push(source, alias);
                index += 2;
              }
            }

            groupPattern = `GROUP BY $${index}:raw`;
            values.push(groupByFields.join());
            index += 1;
            continue;
          }

          if (typeof value === 'object') {
            if (value.$sum) {
              if (typeof value.$sum === 'string') {
                columns.push(`SUM($${index}:name) AS $${index + 1}:name`);
                values.push(transformAggregateField(value.$sum), field);
                index += 2;
              } else {
                countField = field;
                columns.push(`COUNT(*) AS $${index}:name`);
                values.push(field);
                index += 1;
              }
            }

            if (value.$max) {
              columns.push(`MAX($${index}:name) AS $${index + 1}:name`);
              values.push(transformAggregateField(value.$max), field);
              index += 2;
            }

            if (value.$min) {
              columns.push(`MIN($${index}:name) AS $${index + 1}:name`);
              values.push(transformAggregateField(value.$min), field);
              index += 2;
            }

            if (value.$avg) {
              columns.push(`AVG($${index}:name) AS $${index + 1}:name`);
              values.push(transformAggregateField(value.$avg), field);
              index += 2;
            }
          }
        }
      } else {
        columns.push('*');
      }

      if (stage.$project) {
        if (columns.includes('*')) {
          columns = [];
        }

        for (const field in stage.$project) {
          const value = stage.$project[field];

          if (value === 1 || value === true) {
            columns.push(`$${index}:name`);
            values.push(field);
            index += 1;
          }
        }
      }

      if (stage.$match) {
        const patterns = [];
        const orOrAnd = stage.$match.hasOwnProperty('$or') ? ' OR ' : ' AND ';

        if (stage.$match.$or) {
          const collapse = {};
          stage.$match.$or.forEach(element => {
            for (const key in element) {
              collapse[key] = element[key];
            }
          });
          stage.$match = collapse;
        }

        for (const field in stage.$match) {
          const value = stage.$match[field];
          const matchPatterns = [];
          Object.keys(ParseToPosgresComparator).forEach(cmp => {
            if (value[cmp]) {
              const pgComparator = ParseToPosgresComparator[cmp];
              matchPatterns.push(`$${index}:name ${pgComparator} $${index + 1}`);
              values.push(field, toPostgresValue(value[cmp]));
              index += 2;
            }
          });

          if (matchPatterns.length > 0) {
            patterns.push(`(${matchPatterns.join(' AND ')})`);
          }

          if (schema.fields[field] && schema.fields[field].type && matchPatterns.length === 0) {
            patterns.push(`$${index}:name = $${index + 1}`);
            values.push(field, value);
            index += 2;
          }
        }

        wherePattern = patterns.length > 0 ? `WHERE ${patterns.join(` ${orOrAnd} `)}` : '';
      }

      if (stage.$limit) {
        limitPattern = `LIMIT $${index}`;
        values.push(stage.$limit);
        index += 1;
      }

      if (stage.$skip) {
        skipPattern = `OFFSET $${index}`;
        values.push(stage.$skip);
        index += 1;
      }

      if (stage.$sort) {
        const sort = stage.$sort;
        const keys = Object.keys(sort);
        const sorting = keys.map(key => {
          const transformer = sort[key] === 1 ? 'ASC' : 'DESC';
          const order = `$${index}:name ${transformer}`;
          index += 1;
          return order;
        }).join();
        values.push(...keys);
        sortPattern = sort !== undefined && sorting.length > 0 ? `ORDER BY ${sorting}` : '';
      }
    }

    const qs = `SELECT ${columns.join()} FROM $1:name ${wherePattern} ${sortPattern} ${limitPattern} ${skipPattern} ${groupPattern}`;
    debug(qs, values);
    return this._client.map(qs, values, a => this.postgresObjectToParseObject(className, a, schema)).then(results => {
      results.forEach(result => {
        if (!result.hasOwnProperty('objectId')) {
          result.objectId = null;
        }

        if (groupValues) {
          result.objectId = {};

          for (const key in groupValues) {
            result.objectId[key] = result[key];
            delete result[key];
          }
        }

        if (countField) {
          result[countField] = parseInt(result[countField], 10);
        }
      });
      return results;
    });
  }

  performInitialization({
    VolatileClassesSchemas
  }) {
    // TODO: This method needs to be rewritten to make proper use of connections (@vitaly-t)
    debug('performInitialization');
    const promises = VolatileClassesSchemas.map(schema => {
      return this.createTable(schema.className, schema).catch(err => {
        if (err.code === PostgresDuplicateRelationError || err.code === _node.default.Error.INVALID_CLASS_NAME) {
          return Promise.resolve();
        }

        throw err;
      }).then(() => this.schemaUpgrade(schema.className, schema));
    });
    return Promise.all(promises).then(() => {
      return this._client.tx('perform-initialization', t => {
        return t.batch([t.none(_sql.default.misc.jsonObjectSetKeys), t.none(_sql.default.array.add), t.none(_sql.default.array.addUnique), t.none(_sql.default.array.remove), t.none(_sql.default.array.containsAll), t.none(_sql.default.array.containsAllRegex), t.none(_sql.default.array.contains)]);
      });
    }).then(data => {
      debug(`initializationDone in ${data.duration}`);
    }).catch(error => {
      /* eslint-disable no-console */
      console.error(error);
    });
  }

  createIndexes(className, indexes, conn) {
    return (conn || this._client).tx(t => t.batch(indexes.map(i => {
      return t.none('CREATE INDEX $1:name ON $2:name ($3:name)', [i.name, className, i.key]);
    })));
  }

  createIndexesIfNeeded(className, fieldName, type, conn) {
    return (conn || this._client).none('CREATE INDEX $1:name ON $2:name ($3:name)', [fieldName, className, type]);
  }

  dropIndexes(className, indexes, conn) {
    const queries = indexes.map(i => ({
      query: 'DROP INDEX $1:name',
      values: i
    }));
    return (conn || this._client).tx(t => t.none(this._pgp.helpers.concat(queries)));
  }

  getIndexes(className) {
    const qs = 'SELECT * FROM pg_indexes WHERE tablename = ${className}';
    return this._client.any(qs, {
      className
    });
  }

  updateSchemaWithIndexes() {
    return Promise.resolve();
  } // Used for testing purposes


  updateEstimatedCount(className) {
    return this._client.none('ANALYZE $1:name', [className]);
  }

}

exports.PostgresStorageAdapter = PostgresStorageAdapter;

function convertPolygonToSQL(polygon) {
  if (polygon.length < 3) {
    throw new _node.default.Error(_node.default.Error.INVALID_JSON, `Polygon must have at least 3 values`);
  }

  if (polygon[0][0] !== polygon[polygon.length - 1][0] || polygon[0][1] !== polygon[polygon.length - 1][1]) {
    polygon.push(polygon[0]);
  }

  const unique = polygon.filter((item, index, ar) => {
    let foundIndex = -1;

    for (let i = 0; i < ar.length; i += 1) {
      const pt = ar[i];

      if (pt[0] === item[0] && pt[1] === item[1]) {
        foundIndex = i;
        break;
      }
    }

    return foundIndex === index;
  });

  if (unique.length < 3) {
    throw new _node.default.Error(_node.default.Error.INTERNAL_SERVER_ERROR, 'GeoJSON: Loop must have at least 3 different vertices');
  }

  const points = polygon.map(point => {
    _node.default.GeoPoint._validate(parseFloat(point[1]), parseFloat(point[0]));

    return `(${point[1]}, ${point[0]})`;
  }).join(', ');
  return `(${points})`;
}

function removeWhiteSpace(regex) {
  if (!regex.endsWith('\n')) {
    regex += '\n';
  } // remove non escaped comments


  return regex.replace(/([^\\])#.*\n/gim, '$1') // remove lines starting with a comment
  .replace(/^#.*\n/gim, '') // remove non escaped whitespace
  .replace(/([^\\])\s+/gim, '$1') // remove whitespace at the beginning of a line
  .replace(/^\s+/, '').trim();
}

function processRegexPattern(s) {
  if (s && s.startsWith('^')) {
    // regex for startsWith
    return '^' + literalizeRegexPart(s.slice(1));
  } else if (s && s.endsWith('$')) {
    // regex for endsWith
    return literalizeRegexPart(s.slice(0, s.length - 1)) + '$';
  } // regex for contains


  return literalizeRegexPart(s);
}

function isStartsWithRegex(value) {
  if (!value || typeof value !== 'string' || !value.startsWith('^')) {
    return false;
  }

  const matches = value.match(/\^\\Q.*\\E/);
  return !!matches;
}

function isAllValuesRegexOrNone(values) {
  if (!values || !Array.isArray(values) || values.length === 0) {
    return true;
  }

  const firstValuesIsRegex = isStartsWithRegex(values[0].$regex);

  if (values.length === 1) {
    return firstValuesIsRegex;
  }

  for (let i = 1, length = values.length; i < length; ++i) {
    if (firstValuesIsRegex !== isStartsWithRegex(values[i].$regex)) {
      return false;
    }
  }

  return true;
}

function isAnyValueRegexStartsWith(values) {
  return values.some(function (value) {
    return isStartsWithRegex(value.$regex);
  });
}

function createLiteralRegex(remaining) {
  return remaining.split('').map(c => {
    const regex = RegExp('[0-9 ]|\\p{L}', 'u'); // Support all unicode letter chars

    if (c.match(regex) !== null) {
      // don't escape alphanumeric characters
      return c;
    } // escape everything else (single quotes with single quotes, everything else with a backslash)


    return c === `'` ? `''` : `\\${c}`;
  }).join('');
}

function literalizeRegexPart(s) {
  const matcher1 = /\\Q((?!\\E).*)\\E$/;
  const result1 = s.match(matcher1);

  if (result1 && result1.length > 1 && result1.index > -1) {
    // process regex that has a beginning and an end specified for the literal text
    const prefix = s.substr(0, result1.index);
    const remaining = result1[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  } // process regex that has a beginning specified for the literal text


  const matcher2 = /\\Q((?!\\E).*)$/;
  const result2 = s.match(matcher2);

  if (result2 && result2.length > 1 && result2.index > -1) {
    const prefix = s.substr(0, result2.index);
    const remaining = result2[1];
    return literalizeRegexPart(prefix) + createLiteralRegex(remaining);
  } // remove all instances of \Q and \E from the remaining text & escape single quotes


  return s.replace(/([^\\])(\\E)/, '$1').replace(/([^\\])(\\Q)/, '$1').replace(/^\\E/, '').replace(/^\\Q/, '').replace(/([^'])'/, `$1''`).replace(/^'([^'])/, `''$1`);
}

var GeoPointCoder = {
  isValidJSON(value) {
    return typeof value === 'object' && value !== null && value.__type === 'GeoPoint';
  }

};
var _default = PostgresStorageAdapter;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9BZGFwdGVycy9TdG9yYWdlL1Bvc3RncmVzL1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXIuanMiXSwibmFtZXMiOlsiUG9zdGdyZXNSZWxhdGlvbkRvZXNOb3RFeGlzdEVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVDb2x1bW5FcnJvciIsIlBvc3RncmVzTWlzc2luZ0NvbHVtbkVycm9yIiwiUG9zdGdyZXNEdXBsaWNhdGVPYmplY3RFcnJvciIsIlBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciIsIlBvc3RncmVzVHJhbnNhY3Rpb25BYm9ydGVkRXJyb3IiLCJsb2dnZXIiLCJyZXF1aXJlIiwiZGVidWciLCJhcmdzIiwiYXJndW1lbnRzIiwiY29uY2F0Iiwic2xpY2UiLCJsZW5ndGgiLCJsb2ciLCJnZXRMb2dnZXIiLCJhcHBseSIsInBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlIiwidHlwZSIsImNvbnRlbnRzIiwiSlNPTiIsInN0cmluZ2lmeSIsIlBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvciIsIiRndCIsIiRsdCIsIiRndGUiLCIkbHRlIiwibW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzIiwiJGRheU9mTW9udGgiLCIkZGF5T2ZXZWVrIiwiJGRheU9mWWVhciIsIiRpc29EYXlPZldlZWsiLCIkaXNvV2Vla1llYXIiLCIkaG91ciIsIiRtaW51dGUiLCIkc2Vjb25kIiwiJG1pbGxpc2Vjb25kIiwiJG1vbnRoIiwiJHdlZWsiLCIkeWVhciIsInRvUG9zdGdyZXNWYWx1ZSIsInZhbHVlIiwiX190eXBlIiwiaXNvIiwibmFtZSIsInRyYW5zZm9ybVZhbHVlIiwib2JqZWN0SWQiLCJlbXB0eUNMUFMiLCJPYmplY3QiLCJmcmVlemUiLCJmaW5kIiwiZ2V0IiwiY3JlYXRlIiwidXBkYXRlIiwiZGVsZXRlIiwiYWRkRmllbGQiLCJwcm90ZWN0ZWRGaWVsZHMiLCJkZWZhdWx0Q0xQUyIsInRvUGFyc2VTY2hlbWEiLCJzY2hlbWEiLCJjbGFzc05hbWUiLCJmaWVsZHMiLCJfaGFzaGVkX3Bhc3N3b3JkIiwiX3dwZXJtIiwiX3JwZXJtIiwiY2xwcyIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImluZGV4ZXMiLCJ0b1Bvc3RncmVzU2NoZW1hIiwiX3Bhc3N3b3JkX2hpc3RvcnkiLCJoYW5kbGVEb3RGaWVsZHMiLCJvYmplY3QiLCJrZXlzIiwiZm9yRWFjaCIsImZpZWxkTmFtZSIsImluZGV4T2YiLCJjb21wb25lbnRzIiwic3BsaXQiLCJmaXJzdCIsInNoaWZ0IiwiY3VycmVudE9iaiIsIm5leHQiLCJfX29wIiwidW5kZWZpbmVkIiwidHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMiLCJtYXAiLCJjbXB0IiwiaW5kZXgiLCJ0cmFuc2Zvcm1Eb3RGaWVsZCIsImpvaW4iLCJ0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCIsInN1YnN0ciIsInZhbGlkYXRlS2V5cyIsImtleSIsImluY2x1ZGVzIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfTkVTVEVEX0tFWSIsImpvaW5UYWJsZXNGb3JTY2hlbWEiLCJsaXN0IiwiZmllbGQiLCJwdXNoIiwiYnVpbGRXaGVyZUNsYXVzZSIsInF1ZXJ5IiwiaW5zZW5zaXRpdmUiLCJwYXR0ZXJucyIsInZhbHVlcyIsInNvcnRzIiwiaXNBcnJheUZpZWxkIiwiaW5pdGlhbFBhdHRlcm5zTGVuZ3RoIiwiZmllbGRWYWx1ZSIsIiRleGlzdHMiLCJhdXRoRGF0YU1hdGNoIiwibWF0Y2giLCIkaW4iLCJpblBhdHRlcm5zIiwibGlzdEVsZW0iLCJJTlZBTElEX0pTT04iLCIkcmVnZXgiLCJNQVhfSU5UX1BMVVNfT05FIiwiY2xhdXNlcyIsImNsYXVzZVZhbHVlcyIsInN1YlF1ZXJ5IiwiY2xhdXNlIiwicGF0dGVybiIsIm9yT3JBbmQiLCJub3QiLCIkbmUiLCJwb2ludCIsImxvbmdpdHVkZSIsImxhdGl0dWRlIiwiJGVxIiwiaXNJbk9yTmluIiwiQXJyYXkiLCJpc0FycmF5IiwiJG5pbiIsImFsbG93TnVsbCIsImxpc3RJbmRleCIsImNyZWF0ZUNvbnN0cmFpbnQiLCJiYXNlQXJyYXkiLCJub3RJbiIsIl8iLCJmbGF0TWFwIiwiZWx0IiwiJGFsbCIsImlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgiLCJpc0FsbFZhbHVlc1JlZ2V4T3JOb25lIiwiaSIsInByb2Nlc3NSZWdleFBhdHRlcm4iLCJzdWJzdHJpbmciLCIkY29udGFpbmVkQnkiLCJhcnIiLCIkdGV4dCIsInNlYXJjaCIsIiRzZWFyY2giLCJsYW5ndWFnZSIsIiR0ZXJtIiwiJGxhbmd1YWdlIiwiJGNhc2VTZW5zaXRpdmUiLCIkZGlhY3JpdGljU2Vuc2l0aXZlIiwiJG5lYXJTcGhlcmUiLCJkaXN0YW5jZSIsIiRtYXhEaXN0YW5jZSIsImRpc3RhbmNlSW5LTSIsIiR3aXRoaW4iLCIkYm94IiwiYm94IiwibGVmdCIsImJvdHRvbSIsInJpZ2h0IiwidG9wIiwiJGdlb1dpdGhpbiIsIiRjZW50ZXJTcGhlcmUiLCJjZW50ZXJTcGhlcmUiLCJHZW9Qb2ludCIsIkdlb1BvaW50Q29kZXIiLCJpc1ZhbGlkSlNPTiIsIl92YWxpZGF0ZSIsImlzTmFOIiwiJHBvbHlnb24iLCJwb2x5Z29uIiwicG9pbnRzIiwiY29vcmRpbmF0ZXMiLCIkZ2VvSW50ZXJzZWN0cyIsIiRwb2ludCIsInJlZ2V4Iiwib3BlcmF0b3IiLCJvcHRzIiwiJG9wdGlvbnMiLCJyZW1vdmVXaGl0ZVNwYWNlIiwiY29udmVydFBvbHlnb25Ub1NRTCIsImNtcCIsInBnQ29tcGFyYXRvciIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJQb3N0Z3Jlc1N0b3JhZ2VBZGFwdGVyIiwiY29uc3RydWN0b3IiLCJ1cmkiLCJjb2xsZWN0aW9uUHJlZml4IiwiZGF0YWJhc2VPcHRpb25zIiwiX2NvbGxlY3Rpb25QcmVmaXgiLCJjbGllbnQiLCJwZ3AiLCJfY2xpZW50IiwiX3BncCIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJoYW5kbGVTaHV0ZG93biIsIiRwb29sIiwiZW5kIiwiX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHMiLCJjb25uIiwibm9uZSIsImNhdGNoIiwiZXJyb3IiLCJjb2RlIiwiY2xhc3NFeGlzdHMiLCJvbmUiLCJhIiwiZXhpc3RzIiwic2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiQ0xQcyIsInNlbGYiLCJ0YXNrIiwidCIsInNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0Iiwic3VibWl0dGVkSW5kZXhlcyIsImV4aXN0aW5nSW5kZXhlcyIsIlByb21pc2UiLCJyZXNvbHZlIiwiX2lkXyIsIl9pZCIsImRlbGV0ZWRJbmRleGVzIiwiaW5zZXJ0ZWRJbmRleGVzIiwiSU5WQUxJRF9RVUVSWSIsImhhc093blByb3BlcnR5IiwidHgiLCJjcmVhdGVJbmRleGVzIiwiZHJvcEluZGV4ZXMiLCJjcmVhdGVDbGFzcyIsInExIiwiY3JlYXRlVGFibGUiLCJxMiIsInEzIiwiYmF0Y2giLCJ0aGVuIiwiZXJyIiwiZGF0YSIsInJlc3VsdCIsImRldGFpbCIsIkRVUExJQ0FURV9WQUxVRSIsInZhbHVlc0FycmF5IiwicGF0dGVybnNBcnJheSIsImFzc2lnbiIsIl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCIsIl9lbWFpbF92ZXJpZnlfdG9rZW4iLCJfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQiLCJfZmFpbGVkX2xvZ2luX2NvdW50IiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiX3Bhc3N3b3JkX2NoYW5nZWRfYXQiLCJyZWxhdGlvbnMiLCJwYXJzZVR5cGUiLCJxcyIsImpvaW5UYWJsZSIsInNjaGVtYVVwZ3JhZGUiLCJjb2x1bW5zIiwiY29sdW1uX25hbWUiLCJuZXdDb2x1bW5zIiwiZmlsdGVyIiwiaXRlbSIsImFkZEZpZWxkSWZOb3RFeGlzdHMiLCJwb3N0Z3Jlc1R5cGUiLCJhbnkiLCJwYXRoIiwiZGVsZXRlQ2xhc3MiLCJvcGVyYXRpb25zIiwiaGVscGVycyIsImRlbGV0ZUFsbENsYXNzZXMiLCJub3ciLCJEYXRlIiwiZ2V0VGltZSIsInJlc3VsdHMiLCJqb2lucyIsInJlZHVjZSIsImNsYXNzZXMiLCJxdWVyaWVzIiwiZGVsZXRlRmllbGRzIiwiZmllbGROYW1lcyIsImlkeCIsImdldEFsbENsYXNzZXMiLCJyb3ciLCJnZXRDbGFzcyIsImNyZWF0ZU9iamVjdCIsImNvbHVtbnNBcnJheSIsImdlb1BvaW50cyIsInByb3ZpZGVyIiwicG9wIiwiaW5pdGlhbFZhbHVlcyIsInZhbCIsInRlcm1pbmF0aW9uIiwiZ2VvUG9pbnRzSW5qZWN0cyIsImwiLCJjb2x1bW5zUGF0dGVybiIsImNvbCIsInZhbHVlc1BhdHRlcm4iLCJvcHMiLCJ1bmRlcmx5aW5nRXJyb3IiLCJjb25zdHJhaW50IiwibWF0Y2hlcyIsInVzZXJJbmZvIiwiZHVwbGljYXRlZF9maWVsZCIsImRlbGV0ZU9iamVjdHNCeVF1ZXJ5Iiwid2hlcmUiLCJjb3VudCIsIk9CSkVDVF9OT1RfRk9VTkQiLCJmaW5kT25lQW5kVXBkYXRlIiwidXBkYXRlT2JqZWN0c0J5UXVlcnkiLCJ1cGRhdGVQYXR0ZXJucyIsIm9yaWdpbmFsVXBkYXRlIiwiZG90Tm90YXRpb25PcHRpb25zIiwiZ2VuZXJhdGUiLCJqc29uYiIsImxhc3RLZXkiLCJmaWVsZE5hbWVJbmRleCIsInN0ciIsImFtb3VudCIsIm9iamVjdHMiLCJrZXlzVG9JbmNyZW1lbnQiLCJrIiwiaW5jcmVtZW50UGF0dGVybnMiLCJjIiwia2V5c1RvRGVsZXRlIiwiZGVsZXRlUGF0dGVybnMiLCJwIiwidXBkYXRlT2JqZWN0IiwiZXhwZWN0ZWRUeXBlIiwicmVqZWN0Iiwid2hlcmVDbGF1c2UiLCJ1cHNlcnRPbmVPYmplY3QiLCJjcmVhdGVWYWx1ZSIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJoYXNMaW1pdCIsImhhc1NraXAiLCJ3aGVyZVBhdHRlcm4iLCJsaW1pdFBhdHRlcm4iLCJza2lwUGF0dGVybiIsInNvcnRQYXR0ZXJuIiwic29ydENvcHkiLCJzb3J0aW5nIiwidHJhbnNmb3JtS2V5IiwibWVtbyIsInBvc3RncmVzT2JqZWN0VG9QYXJzZU9iamVjdCIsInRhcmdldENsYXNzIiwieSIsIngiLCJjb29yZHMiLCJwYXJzZUZsb2F0IiwiY3JlYXRlZEF0IiwidG9JU09TdHJpbmciLCJ1cGRhdGVkQXQiLCJleHBpcmVzQXQiLCJlbnN1cmVVbmlxdWVuZXNzIiwiY29uc3RyYWludE5hbWUiLCJjb25zdHJhaW50UGF0dGVybnMiLCJtZXNzYWdlIiwicmVhZFByZWZlcmVuY2UiLCJlc3RpbWF0ZSIsImFwcHJveGltYXRlX3Jvd19jb3VudCIsImRpc3RpbmN0IiwiY29sdW1uIiwiaXNOZXN0ZWQiLCJpc1BvaW50ZXJGaWVsZCIsInRyYW5zZm9ybWVyIiwiY2hpbGQiLCJhZ2dyZWdhdGUiLCJwaXBlbGluZSIsImNvdW50RmllbGQiLCJncm91cFZhbHVlcyIsImdyb3VwUGF0dGVybiIsInN0YWdlIiwiJGdyb3VwIiwiZ3JvdXBCeUZpZWxkcyIsImFsaWFzIiwib3BlcmF0aW9uIiwic291cmNlIiwiJHN1bSIsIiRtYXgiLCIkbWluIiwiJGF2ZyIsIiRwcm9qZWN0IiwiJG1hdGNoIiwiJG9yIiwiY29sbGFwc2UiLCJlbGVtZW50IiwibWF0Y2hQYXR0ZXJucyIsIiRsaW1pdCIsIiRza2lwIiwiJHNvcnQiLCJvcmRlciIsInBhcnNlSW50IiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsInByb21pc2VzIiwiSU5WQUxJRF9DTEFTU19OQU1FIiwiYWxsIiwic3FsIiwibWlzYyIsImpzb25PYmplY3RTZXRLZXlzIiwiYXJyYXkiLCJhZGQiLCJhZGRVbmlxdWUiLCJyZW1vdmUiLCJjb250YWluc0FsbCIsImNvbnRhaW5zQWxsUmVnZXgiLCJjb250YWlucyIsImR1cmF0aW9uIiwiY29uc29sZSIsImNyZWF0ZUluZGV4ZXNJZk5lZWRlZCIsImdldEluZGV4ZXMiLCJ1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcyIsInVwZGF0ZUVzdGltYXRlZENvdW50IiwidW5pcXVlIiwiYXIiLCJmb3VuZEluZGV4IiwicHQiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJlbmRzV2l0aCIsInJlcGxhY2UiLCJ0cmltIiwicyIsInN0YXJ0c1dpdGgiLCJsaXRlcmFsaXplUmVnZXhQYXJ0IiwiaXNTdGFydHNXaXRoUmVnZXgiLCJmaXJzdFZhbHVlc0lzUmVnZXgiLCJzb21lIiwiY3JlYXRlTGl0ZXJhbFJlZ2V4IiwicmVtYWluaW5nIiwiUmVnRXhwIiwibWF0Y2hlcjEiLCJyZXN1bHQxIiwicHJlZml4IiwibWF0Y2hlcjIiLCJyZXN1bHQyIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQ0E7O0FBRUE7O0FBRUE7O0FBQ0E7O0FBaUJBOzs7Ozs7Ozs7O0FBZkEsTUFBTUEsaUNBQWlDLEdBQUcsT0FBMUM7QUFDQSxNQUFNQyw4QkFBOEIsR0FBRyxPQUF2QztBQUNBLE1BQU1DLDRCQUE0QixHQUFHLE9BQXJDO0FBQ0EsTUFBTUMsMEJBQTBCLEdBQUcsT0FBbkM7QUFDQSxNQUFNQyw0QkFBNEIsR0FBRyxPQUFyQztBQUNBLE1BQU1DLGlDQUFpQyxHQUFHLE9BQTFDO0FBQ0EsTUFBTUMsK0JBQStCLEdBQUcsT0FBeEM7O0FBQ0EsTUFBTUMsTUFBTSxHQUFHQyxPQUFPLENBQUMsaUJBQUQsQ0FBdEI7O0FBRUEsTUFBTUMsS0FBSyxHQUFHLFVBQVMsR0FBR0MsSUFBWixFQUF1QjtBQUNuQ0EsRUFBQUEsSUFBSSxHQUFHLENBQUMsU0FBU0MsU0FBUyxDQUFDLENBQUQsQ0FBbkIsRUFBd0JDLE1BQXhCLENBQStCRixJQUFJLENBQUNHLEtBQUwsQ0FBVyxDQUFYLEVBQWNILElBQUksQ0FBQ0ksTUFBbkIsQ0FBL0IsQ0FBUDtBQUNBLFFBQU1DLEdBQUcsR0FBR1IsTUFBTSxDQUFDUyxTQUFQLEVBQVo7QUFDQUQsRUFBQUEsR0FBRyxDQUFDTixLQUFKLENBQVVRLEtBQVYsQ0FBZ0JGLEdBQWhCLEVBQXFCTCxJQUFyQjtBQUNELENBSkQ7O0FBU0EsTUFBTVEsdUJBQXVCLEdBQUdDLElBQUksSUFBSTtBQUN0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LENBRUksY0FGSixFQUVvQixJQUZwQixFQUdKQSxPQUhJLENBR0ksTUFISixFQUdZLEVBSFosRUFJSkEsT0FKSSxDQUlJLE1BSkosRUFJWSxFQUpaLEVBS0pBLE9BTEksQ0FLSSxTQUxKLEVBS2dCLE1BTGhCLEVBTUpBLE9BTkksQ0FNSSxVQU5KLEVBTWlCLE1BTmpCLENBQVA7QUFPRDs7QUFFRCxJQUFJN1AsYUFBYSxHQUFHO0FBQ2xCQyxFQUFBQSxXQUFXLENBQUN2SSxLQUFELEVBQVE7QUFDakIsV0FDRSxPQUFPQSxLQUFQLEtBQWlCLFFBQWpCLElBQTZCQSxLQUFLLEtBQUssSUFBdkMsSUFBK0NBLEtBQUssQ0FBQ0MsTUFBTixLQUFpQixVQURsRTtBQUdEOztBQUxpQixDQUFwQjtlQVFld0osc0IiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAZmxvd1xuaW1wb3J0IHsgY3JlYXRlQ2xpZW50IH0gZnJvbSAnLi9Qb3N0Z3Jlc0NsaWVudCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBzcWwgZnJvbSAnLi9zcWwnO1xuXG5jb25zdCBQb3N0Z3Jlc1JlbGF0aW9uRG9lc05vdEV4aXN0RXJyb3IgPSAnNDJQMDEnO1xuY29uc3QgUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yID0gJzQyUDA3JztcbmNvbnN0IFBvc3RncmVzRHVwbGljYXRlQ29sdW1uRXJyb3IgPSAnNDI3MDEnO1xuY29uc3QgUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IgPSAnNDI3MDMnO1xuY29uc3QgUG9zdGdyZXNEdXBsaWNhdGVPYmplY3RFcnJvciA9ICc0MjcxMCc7XG5jb25zdCBQb3N0Z3Jlc1VuaXF1ZUluZGV4VmlvbGF0aW9uRXJyb3IgPSAnMjM1MDUnO1xuY29uc3QgUG9zdGdyZXNUcmFuc2FjdGlvbkFib3J0ZWRFcnJvciA9ICcyNVAwMic7XG5jb25zdCBsb2dnZXIgPSByZXF1aXJlKCcuLi8uLi8uLi9sb2dnZXInKTtcblxuY29uc3QgZGVidWcgPSBmdW5jdGlvbiguLi5hcmdzOiBhbnkpIHtcbiAgYXJncyA9IFsnUEc6ICcgKyBhcmd1bWVudHNbMF1dLmNvbmNhdChhcmdzLnNsaWNlKDEsIGFyZ3MubGVuZ3RoKSk7XG4gIGNvbnN0IGxvZyA9IGxvZ2dlci5nZXRMb2dnZXIoKTtcbiAgbG9nLmRlYnVnLmFwcGx5KGxvZywgYXJncyk7XG59O1xuXG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCB0eXBlIHsgU2NoZW1hVHlwZSwgUXVlcnlUeXBlLCBRdWVyeU9wdGlvbnMgfSBmcm9tICcuLi9TdG9yYWdlQWRhcHRlcic7XG5cbmNvbnN0IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlID0gdHlwZSA9PiB7XG4gIHN3aXRjaCAodHlwZS50eXBlKSB7XG4gICAgY2FzZSAnU3RyaW5nJzpcbiAgICAgIHJldHVybiAndGV4dCc7XG4gICAgY2FzZSAnRGF0ZSc6XG4gICAgICByZXR1cm4gJ3RpbWVzdGFtcCB3aXRoIHRpbWUgem9uZSc7XG4gICAgY2FzZSAnT2JqZWN0JzpcbiAgICAgIHJldHVybiAnanNvbmInO1xuICAgIGNhc2UgJ0ZpbGUnOlxuICAgICAgcmV0dXJuICd0ZXh0JztcbiAgICBjYXNlICdCb29sZWFuJzpcbiAgICAgIHJldHVybiAnYm9vbGVhbic7XG4gICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICByZXR1cm4gJ2NoYXIoMTApJztcbiAgICBjYXNlICdOdW1iZXInOlxuICAgICAgcmV0dXJuICdkb3VibGUgcHJlY2lzaW9uJztcbiAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICByZXR1cm4gJ3BvaW50JztcbiAgICBjYXNlICdCeXRlcyc6XG4gICAgICByZXR1cm4gJ2pzb25iJztcbiAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgIHJldHVybiAncG9seWdvbic7XG4gICAgY2FzZSAnQXJyYXknOlxuICAgICAgaWYgKHR5cGUuY29udGVudHMgJiYgdHlwZS5jb250ZW50cy50eXBlID09PSAnU3RyaW5nJykge1xuICAgICAgICByZXR1cm4gJ3RleHRbXSc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gJ2pzb25iJztcbiAgICAgIH1cbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgYG5vIHR5cGUgZm9yICR7SlNPTi5zdHJpbmdpZnkodHlwZSl9IHlldGA7XG4gIH1cbn07XG5cbmNvbnN0IFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvciA9IHtcbiAgJGd0OiAnPicsXG4gICRsdDogJzwnLFxuICAkZ3RlOiAnPj0nLFxuICAkbHRlOiAnPD0nLFxufTtcblxuY29uc3QgbW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzID0ge1xuICAkZGF5T2ZNb250aDogJ0RBWScsXG4gICRkYXlPZldlZWs6ICdET1cnLFxuICAkZGF5T2ZZZWFyOiAnRE9ZJyxcbiAgJGlzb0RheU9mV2VlazogJ0lTT0RPVycsXG4gICRpc29XZWVrWWVhcjogJ0lTT1lFQVInLFxuICAkaG91cjogJ0hPVVInLFxuICAkbWludXRlOiAnTUlOVVRFJyxcbiAgJHNlY29uZDogJ1NFQ09ORCcsXG4gICRtaWxsaXNlY29uZDogJ01JTExJU0VDT05EUycsXG4gICRtb250aDogJ01PTlRIJyxcbiAgJHdlZWs6ICdXRUVLJyxcbiAgJHllYXI6ICdZRUFSJyxcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICBpZiAodmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgIHJldHVybiB2YWx1ZS5pc287XG4gICAgfVxuICAgIGlmICh2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJykge1xuICAgICAgcmV0dXJuIHZhbHVlLm5hbWU7XG4gICAgfVxuICB9XG4gIHJldHVybiB2YWx1ZTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybVZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZS5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgIHJldHVybiB2YWx1ZS5vYmplY3RJZDtcbiAgfVxuICByZXR1cm4gdmFsdWU7XG59O1xuXG4vLyBEdXBsaWNhdGUgZnJvbSB0aGVuIG1vbmdvIGFkYXB0ZXIuLi5cbmNvbnN0IGVtcHR5Q0xQUyA9IE9iamVjdC5mcmVlemUoe1xuICBmaW5kOiB7fSxcbiAgZ2V0OiB7fSxcbiAgY3JlYXRlOiB7fSxcbiAgdXBkYXRlOiB7fSxcbiAgZGVsZXRlOiB7fSxcbiAgYWRkRmllbGQ6IHt9LFxuICBwcm90ZWN0ZWRGaWVsZHM6IHt9LFxufSk7XG5cbmNvbnN0IGRlZmF1bHRDTFBTID0gT2JqZWN0LmZyZWV6ZSh7XG4gIGZpbmQ6IHsgJyonOiB0cnVlIH0sXG4gIGdldDogeyAnKic6IHRydWUgfSxcbiAgY3JlYXRlOiB7ICcqJzogdHJ1ZSB9LFxuICB1cGRhdGU6IHsgJyonOiB0cnVlIH0sXG4gIGRlbGV0ZTogeyAnKic6IHRydWUgfSxcbiAgYWRkRmllbGQ6IHsgJyonOiB0cnVlIH0sXG4gIHByb3RlY3RlZEZpZWxkczogeyAnKic6IFtdIH0sXG59KTtcblxuY29uc3QgdG9QYXJzZVNjaGVtYSA9IHNjaGVtYSA9PiB7XG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZDtcbiAgfVxuICBpZiAoc2NoZW1hLmZpZWxkcykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl93cGVybTtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fcnBlcm07XG4gIH1cbiAgbGV0IGNscHMgPSBkZWZhdWx0Q0xQUztcbiAgaWYgKHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMpIHtcbiAgICBjbHBzID0geyAuLi5lbXB0eUNMUFMsIC4uLnNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMgfTtcbiAgfVxuICBsZXQgaW5kZXhlcyA9IHt9O1xuICBpZiAoc2NoZW1hLmluZGV4ZXMpIHtcbiAgICBpbmRleGVzID0geyAuLi5zY2hlbWEuaW5kZXhlcyB9O1xuICB9XG4gIHJldHVybiB7XG4gICAgY2xhc3NOYW1lOiBzY2hlbWEuY2xhc3NOYW1lLFxuICAgIGZpZWxkczogc2NoZW1hLmZpZWxkcyxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGNscHMsXG4gICAgaW5kZXhlcyxcbiAgfTtcbn07XG5cbmNvbnN0IHRvUG9zdGdyZXNTY2hlbWEgPSBzY2hlbWEgPT4ge1xuICBpZiAoIXNjaGVtYSkge1xuICAgIHJldHVybiBzY2hlbWE7XG4gIH1cbiAgc2NoZW1hLmZpZWxkcyA9IHNjaGVtYS5maWVsZHMgfHwge307XG4gIHNjaGVtYS5maWVsZHMuX3dwZXJtID0geyB0eXBlOiAnQXJyYXknLCBjb250ZW50czogeyB0eXBlOiAnU3RyaW5nJyB9IH07XG4gIHNjaGVtYS5maWVsZHMuX3JwZXJtID0geyB0eXBlOiAnQXJyYXknLCBjb250ZW50czogeyB0eXBlOiAnU3RyaW5nJyB9IH07XG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgIHNjaGVtYS5maWVsZHMuX3Bhc3N3b3JkX2hpc3RvcnkgPSB7IHR5cGU6ICdBcnJheScgfTtcbiAgfVxuICByZXR1cm4gc2NoZW1hO1xufTtcblxuY29uc3QgaGFuZGxlRG90RmllbGRzID0gb2JqZWN0ID0+IHtcbiAgT2JqZWN0LmtleXMob2JqZWN0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPiAtMSkge1xuICAgICAgY29uc3QgY29tcG9uZW50cyA9IGZpZWxkTmFtZS5zcGxpdCgnLicpO1xuICAgICAgY29uc3QgZmlyc3QgPSBjb21wb25lbnRzLnNoaWZ0KCk7XG4gICAgICBvYmplY3RbZmlyc3RdID0gb2JqZWN0W2ZpcnN0XSB8fCB7fTtcbiAgICAgIGxldCBjdXJyZW50T2JqID0gb2JqZWN0W2ZpcnN0XTtcbiAgICAgIGxldCBuZXh0O1xuICAgICAgbGV0IHZhbHVlID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICBpZiAodmFsdWUgJiYgdmFsdWUuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdmFsdWUgPSB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25kLWFzc2lnbiAqL1xuICAgICAgd2hpbGUgKChuZXh0ID0gY29tcG9uZW50cy5zaGlmdCgpKSkge1xuICAgICAgICAvKiBlc2xpbnQtZW5hYmxlIG5vLWNvbmQtYXNzaWduICovXG4gICAgICAgIGN1cnJlbnRPYmpbbmV4dF0gPSBjdXJyZW50T2JqW25leHRdIHx8IHt9O1xuICAgICAgICBpZiAoY29tcG9uZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjdXJyZW50T2JqW25leHRdID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgICAgY3VycmVudE9iaiA9IGN1cnJlbnRPYmpbbmV4dF07XG4gICAgICB9XG4gICAgICBkZWxldGUgb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIG9iamVjdDtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybURvdEZpZWxkVG9Db21wb25lbnRzID0gZmllbGROYW1lID0+IHtcbiAgcmV0dXJuIGZpZWxkTmFtZS5zcGxpdCgnLicpLm1hcCgoY21wdCwgaW5kZXgpID0+IHtcbiAgICBpZiAoaW5kZXggPT09IDApIHtcbiAgICAgIHJldHVybiBgXCIke2NtcHR9XCJgO1xuICAgIH1cbiAgICByZXR1cm4gYCcke2NtcHR9J2A7XG4gIH0pO1xufTtcblxuY29uc3QgdHJhbnNmb3JtRG90RmllbGQgPSBmaWVsZE5hbWUgPT4ge1xuICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA9PT0gLTEpIHtcbiAgICByZXR1cm4gYFwiJHtmaWVsZE5hbWV9XCJgO1xuICB9XG4gIGNvbnN0IGNvbXBvbmVudHMgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpO1xuICBsZXQgbmFtZSA9IGNvbXBvbmVudHMuc2xpY2UoMCwgY29tcG9uZW50cy5sZW5ndGggLSAxKS5qb2luKCctPicpO1xuICBuYW1lICs9ICctPj4nICsgY29tcG9uZW50c1tjb21wb25lbnRzLmxlbmd0aCAtIDFdO1xuICByZXR1cm4gbmFtZTtcbn07XG5cbmNvbnN0IHRyYW5zZm9ybUFnZ3JlZ2F0ZUZpZWxkID0gZmllbGROYW1lID0+IHtcbiAgaWYgKHR5cGVvZiBmaWVsZE5hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGZpZWxkTmFtZTtcbiAgfVxuICBpZiAoZmllbGROYW1lID09PSAnJF9jcmVhdGVkX2F0Jykge1xuICAgIHJldHVybiAnY3JlYXRlZEF0JztcbiAgfVxuICBpZiAoZmllbGROYW1lID09PSAnJF91cGRhdGVkX2F0Jykge1xuICAgIHJldHVybiAndXBkYXRlZEF0JztcbiAgfVxuICByZXR1cm4gZmllbGROYW1lLnN1YnN0cigxKTtcbn07XG5cbmNvbnN0IHZhbGlkYXRlS2V5cyA9IG9iamVjdCA9PiB7XG4gIGlmICh0eXBlb2Ygb2JqZWN0ID09ICdvYmplY3QnKSB7XG4gICAgZm9yIChjb25zdCBrZXkgaW4gb2JqZWN0KSB7XG4gICAgICBpZiAodHlwZW9mIG9iamVjdFtrZXldID09ICdvYmplY3QnKSB7XG4gICAgICAgIHZhbGlkYXRlS2V5cyhvYmplY3Rba2V5XSk7XG4gICAgICB9XG5cbiAgICAgIGlmIChrZXkuaW5jbHVkZXMoJyQnKSB8fCBrZXkuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9ORVNURURfS0VZLFxuICAgICAgICAgIFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIlxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuLy8gUmV0dXJucyB0aGUgbGlzdCBvZiBqb2luIHRhYmxlcyBvbiBhIHNjaGVtYVxuY29uc3Qgam9pblRhYmxlc0ZvclNjaGVtYSA9IHNjaGVtYSA9PiB7XG4gIGNvbnN0IGxpc3QgPSBbXTtcbiAgaWYgKHNjaGVtYSkge1xuICAgIE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZvckVhY2goZmllbGQgPT4ge1xuICAgICAgaWYgKHNjaGVtYS5maWVsZHNbZmllbGRdLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgbGlzdC5wdXNoKGBfSm9pbjoke2ZpZWxkfToke3NjaGVtYS5jbGFzc05hbWV9YCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIGxpc3Q7XG59O1xuXG5pbnRlcmZhY2UgV2hlcmVDbGF1c2Uge1xuICBwYXR0ZXJuOiBzdHJpbmc7XG4gIHZhbHVlczogQXJyYXk8YW55PjtcbiAgc29ydHM6IEFycmF5PGFueT47XG59XG5cbmNvbnN0IGJ1aWxkV2hlcmVDbGF1c2UgPSAoe1xuICBzY2hlbWEsXG4gIHF1ZXJ5LFxuICBpbmRleCxcbiAgaW5zZW5zaXRpdmUsXG59KTogV2hlcmVDbGF1c2UgPT4ge1xuICBjb25zdCBwYXR0ZXJucyA9IFtdO1xuICBsZXQgdmFsdWVzID0gW107XG4gIGNvbnN0IHNvcnRzID0gW107XG5cbiAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBxdWVyeSkge1xuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknO1xuICAgIGNvbnN0IGluaXRpYWxQYXR0ZXJuc0xlbmd0aCA9IHBhdHRlcm5zLmxlbmd0aDtcbiAgICBjb25zdCBmaWVsZFZhbHVlID0gcXVlcnlbZmllbGROYW1lXTtcblxuICAgIC8vIG5vdGhpbmdpbiB0aGUgc2NoZW1hLCBpdCdzIGdvbm5hIGJsb3cgdXBcbiAgICBpZiAoIXNjaGVtYS5maWVsZHNbZmllbGROYW1lXSkge1xuICAgICAgLy8gYXMgaXQgd29uJ3QgZXhpc3RcbiAgICAgIGlmIChmaWVsZFZhbHVlICYmIGZpZWxkVmFsdWUuJGV4aXN0cyA9PT0gZmFsc2UpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgYXV0aERhdGFNYXRjaCA9IGZpZWxkTmFtZS5tYXRjaCgvXl9hdXRoX2RhdGFfKFthLXpBLVowLTlfXSspJC8pO1xuICAgIGlmIChhdXRoRGF0YU1hdGNoKSB7XG4gICAgICAvLyBUT0RPOiBIYW5kbGUgcXVlcnlpbmcgYnkgX2F1dGhfZGF0YV9wcm92aWRlciwgYXV0aERhdGEgaXMgc3RvcmVkIGluIGF1dGhEYXRhIGZpZWxkXG4gICAgICBjb250aW51ZTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgaW5zZW5zaXRpdmUgJiZcbiAgICAgIChmaWVsZE5hbWUgPT09ICd1c2VybmFtZScgfHwgZmllbGROYW1lID09PSAnZW1haWwnKVxuICAgICkge1xuICAgICAgcGF0dGVybnMucHVzaChgTE9XRVIoJCR7aW5kZXh9Om5hbWUpID0gTE9XRVIoJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+PSAwKSB7XG4gICAgICBsZXQgbmFtZSA9IHRyYW5zZm9ybURvdEZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICBpZiAoZmllbGRWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06cmF3IElTIE5VTExgKTtcbiAgICAgICAgdmFsdWVzLnB1c2gobmFtZSk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGZpZWxkVmFsdWUuJGluKSB7XG4gICAgICAgICAgY29uc3QgaW5QYXR0ZXJucyA9IFtdO1xuICAgICAgICAgIG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZFRvQ29tcG9uZW50cyhmaWVsZE5hbWUpLmpvaW4oJy0+Jyk7XG4gICAgICAgICAgZmllbGRWYWx1ZS4kaW4uZm9yRWFjaChsaXN0RWxlbSA9PiB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGxpc3RFbGVtID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICBpZiAobGlzdEVsZW0uaW5jbHVkZXMoJ1wiJykgfHwgbGlzdEVsZW0uaW5jbHVkZXMoXCInXCIpKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAgICAgJ2JhZCAkaW4gdmFsdWU7IFN0cmluZ3Mgd2l0aCBxdW90ZXMgY2Fubm90IHlldCBiZSBzYWZlbHkgZXNjYXBlZCdcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGluUGF0dGVybnMucHVzaChgXCIke2xpc3RFbGVtfVwiYCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBpblBhdHRlcm5zLnB1c2goYCR7bGlzdEVsZW19YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcGF0dGVybnMucHVzaChgKCR7bmFtZX0pOjpqc29uYiBAPiAnWyR7aW5QYXR0ZXJucy5qb2luKCl9XSc6Ompzb25iYCk7XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS4kcmVnZXgpIHtcbiAgICAgICAgICAvLyBIYW5kbGUgbGF0ZXJcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwYXR0ZXJucy5wdXNoKGAke25hbWV9ID0gJyR7ZmllbGRWYWx1ZX0nYCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwgfHwgZmllbGRWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgaW5kZXggKz0gMTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdib29sZWFuJykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAvLyBDYW4ndCBjYXN0IGJvb2xlYW4gdG8gZG91YmxlIHByZWNpc2lvblxuICAgICAgaWYgKFxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdOdW1iZXInXG4gICAgICApIHtcbiAgICAgICAgLy8gU2hvdWxkIGFsd2F5cyByZXR1cm4gemVybyByZXN1bHRzXG4gICAgICAgIGNvbnN0IE1BWF9JTlRfUExVU19PTkUgPSA5MjIzMzcyMDM2ODU0Nzc1ODA4O1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIE1BWF9JTlRfUExVU19PTkUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIH1cbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ251bWJlcicpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfSBlbHNlIGlmIChbJyRvcicsICckbm9yJywgJyRhbmQnXS5pbmNsdWRlcyhmaWVsZE5hbWUpKSB7XG4gICAgICBjb25zdCBjbGF1c2VzID0gW107XG4gICAgICBjb25zdCBjbGF1c2VWYWx1ZXMgPSBbXTtcbiAgICAgIGZpZWxkVmFsdWUuZm9yRWFjaChzdWJRdWVyeSA9PiB7XG4gICAgICAgIGNvbnN0IGNsYXVzZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICBxdWVyeTogc3ViUXVlcnksXG4gICAgICAgICAgaW5kZXgsXG4gICAgICAgICAgaW5zZW5zaXRpdmUsXG4gICAgICAgIH0pO1xuICAgICAgICBpZiAoY2xhdXNlLnBhdHRlcm4ubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGNsYXVzZXMucHVzaChjbGF1c2UucGF0dGVybik7XG4gICAgICAgICAgY2xhdXNlVmFsdWVzLnB1c2goLi4uY2xhdXNlLnZhbHVlcyk7XG4gICAgICAgICAgaW5kZXggKz0gY2xhdXNlLnZhbHVlcy5sZW5ndGg7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBvck9yQW5kID0gZmllbGROYW1lID09PSAnJGFuZCcgPyAnIEFORCAnIDogJyBPUiAnO1xuICAgICAgY29uc3Qgbm90ID0gZmllbGROYW1lID09PSAnJG5vcicgPyAnIE5PVCAnIDogJyc7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCR7bm90fSgke2NsYXVzZXMuam9pbihvck9yQW5kKX0pYCk7XG4gICAgICB2YWx1ZXMucHVzaCguLi5jbGF1c2VWYWx1ZXMpO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRuZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgIGZpZWxkVmFsdWUuJG5lID0gSlNPTi5zdHJpbmdpZnkoW2ZpZWxkVmFsdWUuJG5lXSk7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYE5PVCBhcnJheV9jb250YWlucygkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfSlgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZSA9PT0gbnVsbCkge1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5PVCBOVUxMYCk7XG4gICAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIGlmIG5vdCBudWxsLCB3ZSBuZWVkIHRvIG1hbnVhbGx5IGV4Y2x1ZGUgbnVsbFxuICAgICAgICAgIGlmIChmaWVsZFZhbHVlLiRuZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgICAgIGAoJCR7aW5kZXh9Om5hbWUgPD4gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7aW5kZXggK1xuICAgICAgICAgICAgICAgIDJ9KSBPUiAkJHtpbmRleH06bmFtZSBJUyBOVUxMKWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgICAgIGAoJCR7aW5kZXh9Om5hbWUgPD4gJCR7aW5kZXggKyAxfSBPUiAkJHtpbmRleH06bmFtZSBJUyBOVUxMKWBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kbmUuX190eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIGNvbnN0IHBvaW50ID0gZmllbGRWYWx1ZS4kbmU7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgcG9pbnQubG9uZ2l0dWRlLCBwb2ludC5sYXRpdHVkZSk7XG4gICAgICAgIGluZGV4ICs9IDM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBUT0RPOiBzdXBwb3J0IGFycmF5c1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuJG5lKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKGZpZWxkVmFsdWUuJGVxICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRlcSA9PT0gbnVsbCkge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSBJUyBOVUxMYCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIGluZGV4ICs9IDE7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX1gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLiRlcSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IGlzSW5Pck5pbiA9XG4gICAgICBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJGluKSB8fCBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUuJG5pbik7XG4gICAgaWYgKFxuICAgICAgQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRpbikgJiZcbiAgICAgIGlzQXJyYXlGaWVsZCAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmNvbnRlbnRzICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0uY29udGVudHMudHlwZSA9PT0gJ1N0cmluZydcbiAgICApIHtcbiAgICAgIGNvbnN0IGluUGF0dGVybnMgPSBbXTtcbiAgICAgIGxldCBhbGxvd051bGwgPSBmYWxzZTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBmaWVsZFZhbHVlLiRpbi5mb3JFYWNoKChsaXN0RWxlbSwgbGlzdEluZGV4KSA9PiB7XG4gICAgICAgIGlmIChsaXN0RWxlbSA9PT0gbnVsbCkge1xuICAgICAgICAgIGFsbG93TnVsbCA9IHRydWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsdWVzLnB1c2gobGlzdEVsZW0pO1xuICAgICAgICAgIGluUGF0dGVybnMucHVzaChgJCR7aW5kZXggKyAxICsgbGlzdEluZGV4IC0gKGFsbG93TnVsbCA/IDEgOiAwKX1gKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoYWxsb3dOdWxsKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCgkJHtpbmRleH06bmFtZSBJUyBOVUxMIE9SICQke2luZGV4fTpuYW1lICYmIEFSUkFZWyR7aW5QYXR0ZXJucy5qb2luKCl9XSlgXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSAmJiBBUlJBWVske2luUGF0dGVybnMuam9pbigpfV1gKTtcbiAgICAgIH1cbiAgICAgIGluZGV4ID0gaW5kZXggKyAxICsgaW5QYXR0ZXJucy5sZW5ndGg7XG4gICAgfSBlbHNlIGlmIChpc0luT3JOaW4pIHtcbiAgICAgIHZhciBjcmVhdGVDb25zdHJhaW50ID0gKGJhc2VBcnJheSwgbm90SW4pID0+IHtcbiAgICAgICAgY29uc3Qgbm90ID0gbm90SW4gPyAnIE5PVCAnIDogJyc7XG4gICAgICAgIGlmIChiYXNlQXJyYXkubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGlmIChpc0FycmF5RmllbGQpIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgICAgIGAke25vdH0gYXJyYXlfY29udGFpbnMoJCR7aW5kZXh9Om5hbWUsICQke2luZGV4ICsgMX0pYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoYmFzZUFycmF5KSk7XG4gICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBIYW5kbGUgTmVzdGVkIERvdCBOb3RhdGlvbiBBYm92ZVxuICAgICAgICAgICAgaWYgKGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMCkge1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBpblBhdHRlcm5zID0gW107XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgICAgYmFzZUFycmF5LmZvckVhY2goKGxpc3RFbGVtLCBsaXN0SW5kZXgpID0+IHtcbiAgICAgICAgICAgICAgaWYgKGxpc3RFbGVtICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2gobGlzdEVsZW0pO1xuICAgICAgICAgICAgICAgIGluUGF0dGVybnMucHVzaChgJCR7aW5kZXggKyAxICsgbGlzdEluZGV4fWApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICR7bm90fSBJTiAoJHtpblBhdHRlcm5zLmpvaW4oKX0pYCk7XG4gICAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMSArIGluUGF0dGVybnMubGVuZ3RoO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICghbm90SW4pIHtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgICAgICBpbmRleCA9IGluZGV4ICsgMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBIYW5kbGUgZW1wdHkgYXJyYXlcbiAgICAgICAgICBpZiAobm90SW4pIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAxJyk7IC8vIFJldHVybiBhbGwgdmFsdWVzXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goJzEgPSAyJyk7IC8vIFJldHVybiBubyB2YWx1ZXNcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kaW4pIHtcbiAgICAgICAgY3JlYXRlQ29uc3RyYWludChfLmZsYXRNYXAoZmllbGRWYWx1ZS4kaW4sIGVsdCA9PiBlbHQpLCBmYWxzZSk7XG4gICAgICB9XG4gICAgICBpZiAoZmllbGRWYWx1ZS4kbmluKSB7XG4gICAgICAgIGNyZWF0ZUNvbnN0cmFpbnQoXy5mbGF0TWFwKGZpZWxkVmFsdWUuJG5pbiwgZWx0ID0+IGVsdCksIHRydWUpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGluICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2JhZCAkaW4gdmFsdWUnKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlLiRuaW4gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnYmFkICRuaW4gdmFsdWUnKTtcbiAgICB9XG5cbiAgICBpZiAoQXJyYXkuaXNBcnJheShmaWVsZFZhbHVlLiRhbGwpICYmIGlzQXJyYXlGaWVsZCkge1xuICAgICAgaWYgKGlzQW55VmFsdWVSZWdleFN0YXJ0c1dpdGgoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgICBpZiAoIWlzQWxsVmFsdWVzUmVnZXhPck5vbmUoZmllbGRWYWx1ZS4kYWxsKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICdBbGwgJGFsbCB2YWx1ZXMgbXVzdCBiZSBvZiByZWdleCB0eXBlIG9yIG5vbmU6ICcgKyBmaWVsZFZhbHVlLiRhbGxcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZFZhbHVlLiRhbGwubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHByb2Nlc3NSZWdleFBhdHRlcm4oZmllbGRWYWx1ZS4kYWxsW2ldLiRyZWdleCk7XG4gICAgICAgICAgZmllbGRWYWx1ZS4kYWxsW2ldID0gdmFsdWUuc3Vic3RyaW5nKDEpICsgJyUnO1xuICAgICAgICB9XG4gICAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYGFycmF5X2NvbnRhaW5zX2FsbF9yZWdleCgkJHtpbmRleH06bmFtZSwgJCR7aW5kZXggKyAxfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgICBgYXJyYXlfY29udGFpbnNfYWxsKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUuJGFsbCkpO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAodHlwZW9mIGZpZWxkVmFsdWUuJGV4aXN0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIGlmIChmaWVsZFZhbHVlLiRleGlzdHMpIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgSVMgTk9UIE5VTExgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lIElTIE5VTExgKTtcbiAgICAgIH1cbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICBpbmRleCArPSAxO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRjb250YWluZWRCeSkge1xuICAgICAgY29uc3QgYXJyID0gZmllbGRWYWx1ZS4kY29udGFpbmVkQnk7XG4gICAgICBpZiAoIShhcnIgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICRjb250YWluZWRCeTogc2hvdWxkIGJlIGFuIGFycmF5YFxuICAgICAgICApO1xuICAgICAgfVxuXG4gICAgICBwYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA8QCAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBKU09OLnN0cmluZ2lmeShhcnIpKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHRleHQpIHtcbiAgICAgIGNvbnN0IHNlYXJjaCA9IGZpZWxkVmFsdWUuJHRleHQuJHNlYXJjaDtcbiAgICAgIGxldCBsYW5ndWFnZSA9ICdlbmdsaXNoJztcbiAgICAgIGlmICh0eXBlb2Ygc2VhcmNoICE9PSAnb2JqZWN0Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICRzZWFyY2gsIHNob3VsZCBiZSBvYmplY3RgXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoIXNlYXJjaC4kdGVybSB8fCB0eXBlb2Ygc2VhcmNoLiR0ZXJtICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGBiYWQgJHRleHQ6ICR0ZXJtLCBzaG91bGQgYmUgc3RyaW5nYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgaWYgKHNlYXJjaC4kbGFuZ3VhZ2UgJiYgdHlwZW9mIHNlYXJjaC4kbGFuZ3VhZ2UgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGxhbmd1YWdlLCBzaG91bGQgYmUgc3RyaW5nYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGxhbmd1YWdlKSB7XG4gICAgICAgIGxhbmd1YWdlID0gc2VhcmNoLiRsYW5ndWFnZTtcbiAgICAgIH1cbiAgICAgIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUgJiYgdHlwZW9mIHNlYXJjaC4kY2FzZVNlbnNpdGl2ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGNhc2VTZW5zaXRpdmUsIHNob3VsZCBiZSBib29sZWFuYFxuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChzZWFyY2guJGNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkY2FzZVNlbnNpdGl2ZSBub3Qgc3VwcG9ydGVkLCBwbGVhc2UgdXNlICRyZWdleCBvciBjcmVhdGUgYSBzZXBhcmF0ZSBsb3dlciBjYXNlIGNvbHVtbi5gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoXG4gICAgICAgIHNlYXJjaC4kZGlhY3JpdGljU2Vuc2l0aXZlICYmXG4gICAgICAgIHR5cGVvZiBzZWFyY2guJGRpYWNyaXRpY1NlbnNpdGl2ZSAhPT0gJ2Jvb2xlYW4nXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgYmFkICR0ZXh0OiAkZGlhY3JpdGljU2Vuc2l0aXZlLCBzaG91bGQgYmUgYm9vbGVhbmBcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoc2VhcmNoLiRkaWFjcml0aWNTZW5zaXRpdmUgPT09IGZhbHNlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYGJhZCAkdGV4dDogJGRpYWNyaXRpY1NlbnNpdGl2ZSAtIGZhbHNlIG5vdCBzdXBwb3J0ZWQsIGluc3RhbGwgUG9zdGdyZXMgVW5hY2NlbnQgRXh0ZW5zaW9uYFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcGF0dGVybnMucHVzaChcbiAgICAgICAgYHRvX3RzdmVjdG9yKCQke2luZGV4fSwgJCR7aW5kZXggKyAxfTpuYW1lKSBAQCB0b190c3F1ZXJ5KCQke2luZGV4ICtcbiAgICAgICAgICAyfSwgJCR7aW5kZXggKyAzfSlgXG4gICAgICApO1xuICAgICAgdmFsdWVzLnB1c2gobGFuZ3VhZ2UsIGZpZWxkTmFtZSwgbGFuZ3VhZ2UsIHNlYXJjaC4kdGVybSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRuZWFyU3BoZXJlKSB7XG4gICAgICBjb25zdCBwb2ludCA9IGZpZWxkVmFsdWUuJG5lYXJTcGhlcmU7XG4gICAgICBjb25zdCBkaXN0YW5jZSA9IGZpZWxkVmFsdWUuJG1heERpc3RhbmNlO1xuICAgICAgY29uc3QgZGlzdGFuY2VJbktNID0gZGlzdGFuY2UgKiA2MzcxICogMTAwMDtcbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGBTVF9kaXN0YW5jZV9zcGhlcmUoJCR7aW5kZXh9Om5hbWU6Omdlb21ldHJ5LCBQT0lOVCgkJHtpbmRleCArXG4gICAgICAgICAgMX0sICQke2luZGV4ICsgMn0pOjpnZW9tZXRyeSkgPD0gJCR7aW5kZXggKyAzfWBcbiAgICAgICk7XG4gICAgICBzb3J0cy5wdXNoKFxuICAgICAgICBgU1RfZGlzdGFuY2Vfc3BoZXJlKCQke2luZGV4fTpuYW1lOjpnZW9tZXRyeSwgUE9JTlQoJCR7aW5kZXggK1xuICAgICAgICAgIDF9LCAkJHtpbmRleCArIDJ9KTo6Z2VvbWV0cnkpIEFTQ2BcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUsIGRpc3RhbmNlSW5LTSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiR3aXRoaW4gJiYgZmllbGRWYWx1ZS4kd2l0aGluLiRib3gpIHtcbiAgICAgIGNvbnN0IGJveCA9IGZpZWxkVmFsdWUuJHdpdGhpbi4kYm94O1xuICAgICAgY29uc3QgbGVmdCA9IGJveFswXS5sb25naXR1ZGU7XG4gICAgICBjb25zdCBib3R0b20gPSBib3hbMF0ubGF0aXR1ZGU7XG4gICAgICBjb25zdCByaWdodCA9IGJveFsxXS5sb25naXR1ZGU7XG4gICAgICBjb25zdCB0b3AgPSBib3hbMV0ubGF0aXR1ZGU7XG5cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2ludCA8QCAkJHtpbmRleCArIDF9Ojpib3hgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgoJHtsZWZ0fSwgJHtib3R0b219KSwgKCR7cmlnaHR9LCAke3RvcH0pKWApO1xuICAgICAgaW5kZXggKz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvV2l0aGluICYmIGZpZWxkVmFsdWUuJGdlb1dpdGhpbi4kY2VudGVyU3BoZXJlKSB7XG4gICAgICBjb25zdCBjZW50ZXJTcGhlcmUgPSBmaWVsZFZhbHVlLiRnZW9XaXRoaW4uJGNlbnRlclNwaGVyZTtcbiAgICAgIGlmICghKGNlbnRlclNwaGVyZSBpbnN0YW5jZW9mIEFycmF5KSB8fCBjZW50ZXJTcGhlcmUubGVuZ3RoIDwgMikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBzaG91bGQgYmUgYW4gYXJyYXkgb2YgUGFyc2UuR2VvUG9pbnQgYW5kIGRpc3RhbmNlJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gR2V0IHBvaW50LCBjb252ZXJ0IHRvIGdlbyBwb2ludCBpZiBuZWNlc3NhcnkgYW5kIHZhbGlkYXRlXG4gICAgICBsZXQgcG9pbnQgPSBjZW50ZXJTcGhlcmVbMF07XG4gICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgcG9pbnQgPSBuZXcgUGFyc2UuR2VvUG9pbnQocG9pbnRbMV0sIHBvaW50WzBdKTtcbiAgICAgIH0gZWxzZSBpZiAoIUdlb1BvaW50Q29kZXIuaXNWYWxpZEpTT04ocG9pbnQpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkY2VudGVyU3BoZXJlIGdlbyBwb2ludCBpbnZhbGlkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgUGFyc2UuR2VvUG9pbnQuX3ZhbGlkYXRlKHBvaW50LmxhdGl0dWRlLCBwb2ludC5sb25naXR1ZGUpO1xuICAgICAgLy8gR2V0IGRpc3RhbmNlIGFuZCB2YWxpZGF0ZVxuICAgICAgY29uc3QgZGlzdGFuY2UgPSBjZW50ZXJTcGhlcmVbMV07XG4gICAgICBpZiAoaXNOYU4oZGlzdGFuY2UpIHx8IGRpc3RhbmNlIDwgMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZTsgJGNlbnRlclNwaGVyZSBkaXN0YW5jZSBpbnZhbGlkJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgY29uc3QgZGlzdGFuY2VJbktNID0gZGlzdGFuY2UgKiA2MzcxICogMTAwMDtcbiAgICAgIHBhdHRlcm5zLnB1c2goXG4gICAgICAgIGBTVF9kaXN0YW5jZV9zcGhlcmUoJCR7aW5kZXh9Om5hbWU6Omdlb21ldHJ5LCBQT0lOVCgkJHtpbmRleCArXG4gICAgICAgICAgMX0sICQke2luZGV4ICsgMn0pOjpnZW9tZXRyeSkgPD0gJCR7aW5kZXggKyAzfWBcbiAgICAgICk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIHBvaW50LmxvbmdpdHVkZSwgcG9pbnQubGF0aXR1ZGUsIGRpc3RhbmNlSW5LTSk7XG4gICAgICBpbmRleCArPSA0O1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLiRnZW9XaXRoaW4gJiYgZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRwb2x5Z29uKSB7XG4gICAgICBjb25zdCBwb2x5Z29uID0gZmllbGRWYWx1ZS4kZ2VvV2l0aGluLiRwb2x5Z29uO1xuICAgICAgbGV0IHBvaW50cztcbiAgICAgIGlmICh0eXBlb2YgcG9seWdvbiA9PT0gJ29iamVjdCcgJiYgcG9seWdvbi5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICBpZiAoIXBvbHlnb24uY29vcmRpbmF0ZXMgfHwgcG9seWdvbi5jb29yZGluYXRlcy5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyBQb2x5Z29uLmNvb3JkaW5hdGVzIHNob3VsZCBjb250YWluIGF0IGxlYXN0IDMgbG9uL2xhdCBwYWlycydcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHBvaW50cyA9IHBvbHlnb24uY29vcmRpbmF0ZXM7XG4gICAgICB9IGVsc2UgaWYgKHBvbHlnb24gaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICBpZiAocG9seWdvbi5sZW5ndGggPCAzKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgJ2JhZCAkZ2VvV2l0aGluIHZhbHVlOyAkcG9seWdvbiBzaG91bGQgY29udGFpbiBhdCBsZWFzdCAzIEdlb1BvaW50cydcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHBvaW50cyA9IHBvbHlnb247XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIFwiYmFkICRnZW9XaXRoaW4gdmFsdWU7ICRwb2x5Z29uIHNob3VsZCBiZSBQb2x5Z29uIG9iamVjdCBvciBBcnJheSBvZiBQYXJzZS5HZW9Qb2ludCdzXCJcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHBvaW50cyA9IHBvaW50c1xuICAgICAgICAubWFwKHBvaW50ID0+IHtcbiAgICAgICAgICBpZiAocG9pbnQgaW5zdGFuY2VvZiBBcnJheSAmJiBwb2ludC5sZW5ndGggPT09IDIpIHtcbiAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludFsxXSwgcG9pbnRbMF0pO1xuICAgICAgICAgICAgcmV0dXJuIGAoJHtwb2ludFswXX0sICR7cG9pbnRbMV19KWA7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh0eXBlb2YgcG9pbnQgIT09ICdvYmplY3QnIHx8IHBvaW50Ll9fdHlwZSAhPT0gJ0dlb1BvaW50Jykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICdiYWQgJGdlb1dpdGhpbiB2YWx1ZSdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAoJHtwb2ludC5sb25naXR1ZGV9LCAke3BvaW50LmxhdGl0dWRlfSlgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbignLCAnKTtcblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWU6OnBvaW50IDxAICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgYCgke3BvaW50c30pYCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cbiAgICBpZiAoZmllbGRWYWx1ZS4kZ2VvSW50ZXJzZWN0cyAmJiBmaWVsZFZhbHVlLiRnZW9JbnRlcnNlY3RzLiRwb2ludCkge1xuICAgICAgY29uc3QgcG9pbnQgPSBmaWVsZFZhbHVlLiRnZW9JbnRlcnNlY3RzLiRwb2ludDtcbiAgICAgIGlmICh0eXBlb2YgcG9pbnQgIT09ICdvYmplY3QnIHx8IHBvaW50Ll9fdHlwZSAhPT0gJ0dlb1BvaW50Jykge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICdiYWQgJGdlb0ludGVyc2VjdCB2YWx1ZTsgJHBvaW50IHNob3VsZCBiZSBHZW9Qb2ludCdcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwb2ludC5sYXRpdHVkZSwgcG9pbnQubG9uZ2l0dWRlKTtcbiAgICAgIH1cbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lOjpwb2x5Z29uIEA+ICQke2luZGV4ICsgMX06OnBvaW50YCk7XG4gICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGAoJHtwb2ludC5sb25naXR1ZGV9LCAke3BvaW50LmxhdGl0dWRlfSlgKTtcbiAgICAgIGluZGV4ICs9IDI7XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuJHJlZ2V4KSB7XG4gICAgICBsZXQgcmVnZXggPSBmaWVsZFZhbHVlLiRyZWdleDtcbiAgICAgIGxldCBvcGVyYXRvciA9ICd+JztcbiAgICAgIGNvbnN0IG9wdHMgPSBmaWVsZFZhbHVlLiRvcHRpb25zO1xuICAgICAgaWYgKG9wdHMpIHtcbiAgICAgICAgaWYgKG9wdHMuaW5kZXhPZignaScpID49IDApIHtcbiAgICAgICAgICBvcGVyYXRvciA9ICd+Kic7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG9wdHMuaW5kZXhPZigneCcpID49IDApIHtcbiAgICAgICAgICByZWdleCA9IHJlbW92ZVdoaXRlU3BhY2UocmVnZXgpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG5hbWUgPSB0cmFuc2Zvcm1Eb3RGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgcmVnZXggPSBwcm9jZXNzUmVnZXhQYXR0ZXJuKHJlZ2V4KTtcblxuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9OnJhdyAke29wZXJhdG9yfSAnJCR7aW5kZXggKyAxfTpyYXcnYCk7XG4gICAgICB2YWx1ZXMucHVzaChuYW1lLCByZWdleCk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICBpZiAoaXNBcnJheUZpZWxkKSB7XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYGFycmF5X2NvbnRhaW5zKCQke2luZGV4fTpuYW1lLCAkJHtpbmRleCArIDF9KWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KFtmaWVsZFZhbHVlXSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmlzbyk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIGlmIChmaWVsZFZhbHVlLl9fdHlwZSA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgfj0gUE9JTlQoJCR7aW5kZXggKyAxfSwgJCR7aW5kZXggKyAyfSlgKTtcbiAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5sb25naXR1ZGUsIGZpZWxkVmFsdWUubGF0aXR1ZGUpO1xuICAgICAgaW5kZXggKz0gMztcbiAgICB9XG5cbiAgICBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKGZpZWxkVmFsdWUuY29vcmRpbmF0ZXMpO1xuICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgfj0gJCR7aW5kZXggKyAxfTo6cG9seWdvbmApO1xuICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB2YWx1ZSk7XG4gICAgICBpbmRleCArPSAyO1xuICAgIH1cblxuICAgIE9iamVjdC5rZXlzKFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcikuZm9yRWFjaChjbXAgPT4ge1xuICAgICAgaWYgKGZpZWxkVmFsdWVbY21wXSB8fCBmaWVsZFZhbHVlW2NtcF0gPT09IDApIHtcbiAgICAgICAgY29uc3QgcGdDb21wYXJhdG9yID0gUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yW2NtcF07XG4gICAgICAgIHBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lICR7cGdDb21wYXJhdG9yfSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWVbY21wXSkpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgaWYgKGluaXRpYWxQYXR0ZXJuc0xlbmd0aCA9PT0gcGF0dGVybnMubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgIGBQb3N0Z3JlcyBkb2Vzbid0IHN1cHBvcnQgdGhpcyBxdWVyeSB0eXBlIHlldCAke0pTT04uc3RyaW5naWZ5KFxuICAgICAgICAgIGZpZWxkVmFsdWVcbiAgICAgICAgKX1gXG4gICAgICApO1xuICAgIH1cbiAgfVxuICB2YWx1ZXMgPSB2YWx1ZXMubWFwKHRyYW5zZm9ybVZhbHVlKTtcbiAgcmV0dXJuIHsgcGF0dGVybjogcGF0dGVybnMuam9pbignIEFORCAnKSwgdmFsdWVzLCBzb3J0cyB9O1xufTtcblxuZXhwb3J0IGNsYXNzIFBvc3RncmVzU3RvcmFnZUFkYXB0ZXIgaW1wbGVtZW50cyBTdG9yYWdlQWRhcHRlciB7XG4gIGNhblNvcnRPbkpvaW5UYWJsZXM6IGJvb2xlYW47XG5cbiAgLy8gUHJpdmF0ZVxuICBfY29sbGVjdGlvblByZWZpeDogc3RyaW5nO1xuICBfY2xpZW50OiBhbnk7XG4gIF9wZ3A6IGFueTtcblxuICBjb25zdHJ1Y3Rvcih7IHVyaSwgY29sbGVjdGlvblByZWZpeCA9ICcnLCBkYXRhYmFzZU9wdGlvbnMgfTogYW55KSB7XG4gICAgdGhpcy5fY29sbGVjdGlvblByZWZpeCA9IGNvbGxlY3Rpb25QcmVmaXg7XG4gICAgY29uc3QgeyBjbGllbnQsIHBncCB9ID0gY3JlYXRlQ2xpZW50KHVyaSwgZGF0YWJhc2VPcHRpb25zKTtcbiAgICB0aGlzLl9jbGllbnQgPSBjbGllbnQ7XG4gICAgdGhpcy5fcGdwID0gcGdwO1xuICAgIHRoaXMuY2FuU29ydE9uSm9pblRhYmxlcyA9IGZhbHNlO1xuICB9XG5cbiAgaGFuZGxlU2h1dGRvd24oKSB7XG4gICAgaWYgKCF0aGlzLl9jbGllbnQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5fY2xpZW50LiRwb29sLmVuZCgpO1xuICB9XG5cbiAgX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHMoY29ubjogYW55KSB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIHJldHVybiBjb25uXG4gICAgICAubm9uZShcbiAgICAgICAgJ0NSRUFURSBUQUJMRSBJRiBOT1QgRVhJU1RTIFwiX1NDSEVNQVwiICggXCJjbGFzc05hbWVcIiB2YXJDaGFyKDEyMCksIFwic2NoZW1hXCIganNvbmIsIFwiaXNQYXJzZUNsYXNzXCIgYm9vbCwgUFJJTUFSWSBLRVkgKFwiY2xhc3NOYW1lXCIpICknXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yIHx8XG4gICAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yIHx8XG4gICAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNEdXBsaWNhdGVPYmplY3RFcnJvclxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBUYWJsZSBhbHJlYWR5IGV4aXN0cywgbXVzdCBoYXZlIGJlZW4gY3JlYXRlZCBieSBhIGRpZmZlcmVudCByZXF1ZXN0LiBJZ25vcmUgZXJyb3IuXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgY2xhc3NFeGlzdHMobmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5vbmUoXG4gICAgICAnU0VMRUNUIEVYSVNUUyAoU0VMRUNUIDEgRlJPTSBpbmZvcm1hdGlvbl9zY2hlbWEudGFibGVzIFdIRVJFIHRhYmxlX25hbWUgPSAkMSknLFxuICAgICAgW25hbWVdLFxuICAgICAgYSA9PiBhLmV4aXN0c1xuICAgICk7XG4gIH1cblxuICBzZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIENMUHM6IGFueSkge1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQudGFzaygnc2V0LWNsYXNzLWxldmVsLXBlcm1pc3Npb25zJywgZnVuY3Rpb24qKHQpIHtcbiAgICAgIHlpZWxkIHNlbGYuX2Vuc3VyZVNjaGVtYUNvbGxlY3Rpb25FeGlzdHModCk7XG4gICAgICBjb25zdCB2YWx1ZXMgPSBbXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgJ3NjaGVtYScsXG4gICAgICAgICdjbGFzc0xldmVsUGVybWlzc2lvbnMnLFxuICAgICAgICBKU09OLnN0cmluZ2lmeShDTFBzKSxcbiAgICAgIF07XG4gICAgICB5aWVsZCB0Lm5vbmUoXG4gICAgICAgIGBVUERBVEUgXCJfU0NIRU1BXCIgU0VUICQyOm5hbWUgPSBqc29uX29iamVjdF9zZXRfa2V5KCQyOm5hbWUsICQzOjp0ZXh0LCAkNDo6anNvbmIpIFdIRVJFIFwiY2xhc3NOYW1lXCI9JDFgLFxuICAgICAgICB2YWx1ZXNcbiAgICAgICk7XG4gICAgfSk7XG4gIH1cblxuICBzZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzdWJtaXR0ZWRJbmRleGVzOiBhbnksXG4gICAgZXhpc3RpbmdJbmRleGVzOiBhbnkgPSB7fSxcbiAgICBmaWVsZHM6IGFueSxcbiAgICBjb25uOiA/YW55XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbm4gPSBjb25uIHx8IHRoaXMuX2NsaWVudDtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICBpZiAoc3VibWl0dGVkSW5kZXhlcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIGlmIChPYmplY3Qua2V5cyhleGlzdGluZ0luZGV4ZXMpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgZXhpc3RpbmdJbmRleGVzID0geyBfaWRfOiB7IF9pZDogMSB9IH07XG4gICAgfVxuICAgIGNvbnN0IGRlbGV0ZWRJbmRleGVzID0gW107XG4gICAgY29uc3QgaW5zZXJ0ZWRJbmRleGVzID0gW107XG4gICAgT2JqZWN0LmtleXMoc3VibWl0dGVkSW5kZXhlcykuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgIGNvbnN0IGZpZWxkID0gc3VibWl0dGVkSW5kZXhlc1tuYW1lXTtcbiAgICAgIGlmIChleGlzdGluZ0luZGV4ZXNbbmFtZV0gJiYgZmllbGQuX19vcCAhPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgYEluZGV4ICR7bmFtZX0gZXhpc3RzLCBjYW5ub3QgdXBkYXRlLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmICghZXhpc3RpbmdJbmRleGVzW25hbWVdICYmIGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAgIGBJbmRleCAke25hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICBkZWxldGVkSW5kZXhlcy5wdXNoKG5hbWUpO1xuICAgICAgICBkZWxldGUgZXhpc3RpbmdJbmRleGVzW25hbWVdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgT2JqZWN0LmtleXMoZmllbGQpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICBpZiAoIWZpZWxkcy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAgICAgICAgIGBGaWVsZCAke2tleX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBhZGQgaW5kZXguYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICBleGlzdGluZ0luZGV4ZXNbbmFtZV0gPSBmaWVsZDtcbiAgICAgICAgaW5zZXJ0ZWRJbmRleGVzLnB1c2goe1xuICAgICAgICAgIGtleTogZmllbGQsXG4gICAgICAgICAgbmFtZSxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIGNvbm4udHgoJ3NldC1pbmRleGVzLXdpdGgtc2NoZW1hLWZvcm1hdCcsIGZ1bmN0aW9uKih0KSB7XG4gICAgICBpZiAoaW5zZXJ0ZWRJbmRleGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgeWllbGQgc2VsZi5jcmVhdGVJbmRleGVzKGNsYXNzTmFtZSwgaW5zZXJ0ZWRJbmRleGVzLCB0KTtcbiAgICAgIH1cbiAgICAgIGlmIChkZWxldGVkSW5kZXhlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHlpZWxkIHNlbGYuZHJvcEluZGV4ZXMoY2xhc3NOYW1lLCBkZWxldGVkSW5kZXhlcywgdCk7XG4gICAgICB9XG4gICAgICB5aWVsZCBzZWxmLl9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKHQpO1xuICAgICAgeWllbGQgdC5ub25lKFxuICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCAkMjpuYW1lID0ganNvbl9vYmplY3Rfc2V0X2tleSgkMjpuYW1lLCAkMzo6dGV4dCwgJDQ6Ompzb25iKSBXSEVSRSBcImNsYXNzTmFtZVwiPSQxJyxcbiAgICAgICAgW2NsYXNzTmFtZSwgJ3NjaGVtYScsICdpbmRleGVzJywgSlNPTi5zdHJpbmdpZnkoZXhpc3RpbmdJbmRleGVzKV1cbiAgICAgICk7XG4gICAgfSk7XG4gIH1cblxuICBjcmVhdGVDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiA/YW55KSB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIHJldHVybiBjb25uXG4gICAgICAudHgoJ2NyZWF0ZS1jbGFzcycsIHQgPT4ge1xuICAgICAgICBjb25zdCBxMSA9IHRoaXMuY3JlYXRlVGFibGUoY2xhc3NOYW1lLCBzY2hlbWEsIHQpO1xuICAgICAgICBjb25zdCBxMiA9IHQubm9uZShcbiAgICAgICAgICAnSU5TRVJUIElOVE8gXCJfU0NIRU1BXCIgKFwiY2xhc3NOYW1lXCIsIFwic2NoZW1hXCIsIFwiaXNQYXJzZUNsYXNzXCIpIFZBTFVFUyAoJDxjbGFzc05hbWU+LCAkPHNjaGVtYT4sIHRydWUpJyxcbiAgICAgICAgICB7IGNsYXNzTmFtZSwgc2NoZW1hIH1cbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgcTMgPSB0aGlzLnNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KFxuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICBzY2hlbWEuaW5kZXhlcyxcbiAgICAgICAgICB7fSxcbiAgICAgICAgICBzY2hlbWEuZmllbGRzLFxuICAgICAgICAgIHRcbiAgICAgICAgKTtcbiAgICAgICAgcmV0dXJuIHQuYmF0Y2goW3ExLCBxMiwgcTNdKTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiB0b1BhcnNlU2NoZW1hKHNjaGVtYSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVyciA9PiB7XG4gICAgICAgIGlmIChlcnIuZGF0YVswXS5yZXN1bHQuY29kZSA9PT0gUG9zdGdyZXNUcmFuc2FjdGlvbkFib3J0ZWRFcnJvcikge1xuICAgICAgICAgIGVyciA9IGVyci5kYXRhWzFdLnJlc3VsdDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoXG4gICAgICAgICAgZXJyLmNvZGUgPT09IFBvc3RncmVzVW5pcXVlSW5kZXhWaW9sYXRpb25FcnJvciAmJlxuICAgICAgICAgIGVyci5kZXRhaWwuaW5jbHVkZXMoY2xhc3NOYW1lKVxuICAgICAgICApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGFscmVhZHkgZXhpc3RzLmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycjtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gSnVzdCBjcmVhdGUgYSB0YWJsZSwgZG8gbm90IGluc2VydCBpbiBzY2hlbWFcbiAgY3JlYXRlVGFibGUoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogU2NoZW1hVHlwZSwgY29ubjogYW55KSB7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIGRlYnVnKCdjcmVhdGVUYWJsZScsIGNsYXNzTmFtZSwgc2NoZW1hKTtcbiAgICBjb25zdCB2YWx1ZXNBcnJheSA9IFtdO1xuICAgIGNvbnN0IHBhdHRlcm5zQXJyYXkgPSBbXTtcbiAgICBjb25zdCBmaWVsZHMgPSBPYmplY3QuYXNzaWduKHt9LCBzY2hlbWEuZmllbGRzKTtcbiAgICBpZiAoY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICBmaWVsZHMuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fZW1haWxfdmVyaWZ5X3Rva2VuID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgICAgZmllbGRzLl9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX2ZhaWxlZF9sb2dpbl9jb3VudCA9IHsgdHlwZTogJ051bWJlcicgfTtcbiAgICAgIGZpZWxkcy5fcGVyaXNoYWJsZV90b2tlbiA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgICAgIGZpZWxkcy5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0ID0geyB0eXBlOiAnRGF0ZScgfTtcbiAgICAgIGZpZWxkcy5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IHsgdHlwZTogJ0RhdGUnIH07XG4gICAgICBmaWVsZHMuX3Bhc3N3b3JkX2hpc3RvcnkgPSB7IHR5cGU6ICdBcnJheScgfTtcbiAgICB9XG4gICAgbGV0IGluZGV4ID0gMjtcbiAgICBjb25zdCByZWxhdGlvbnMgPSBbXTtcbiAgICBPYmplY3Qua2V5cyhmaWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGNvbnN0IHBhcnNlVHlwZSA9IGZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgLy8gU2tpcCB3aGVuIGl0J3MgYSByZWxhdGlvblxuICAgICAgLy8gV2UnbGwgY3JlYXRlIHRoZSB0YWJsZXMgbGF0ZXJcbiAgICAgIGlmIChwYXJzZVR5cGUudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZWxhdGlvbnMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAoWydfcnBlcm0nLCAnX3dwZXJtJ10uaW5kZXhPZihmaWVsZE5hbWUpID49IDApIHtcbiAgICAgICAgcGFyc2VUeXBlLmNvbnRlbnRzID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICAgICAgfVxuICAgICAgdmFsdWVzQXJyYXkucHVzaChmaWVsZE5hbWUpO1xuICAgICAgdmFsdWVzQXJyYXkucHVzaChwYXJzZVR5cGVUb1Bvc3RncmVzVHlwZShwYXJzZVR5cGUpKTtcbiAgICAgIHBhdHRlcm5zQXJyYXkucHVzaChgJCR7aW5kZXh9Om5hbWUgJCR7aW5kZXggKyAxfTpyYXdgKTtcbiAgICAgIGlmIChmaWVsZE5hbWUgPT09ICdvYmplY3RJZCcpIHtcbiAgICAgICAgcGF0dGVybnNBcnJheS5wdXNoKGBQUklNQVJZIEtFWSAoJCR7aW5kZXh9Om5hbWUpYCk7XG4gICAgICB9XG4gICAgICBpbmRleCA9IGluZGV4ICsgMjtcbiAgICB9KTtcbiAgICBjb25zdCBxcyA9IGBDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkMTpuYW1lICgke3BhdHRlcm5zQXJyYXkuam9pbigpfSlgO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWUsIC4uLnZhbHVlc0FycmF5XTtcblxuICAgIGRlYnVnKHFzLCB2YWx1ZXMpO1xuICAgIHJldHVybiBjb25uLnRhc2soJ2NyZWF0ZS10YWJsZScsIGZ1bmN0aW9uKih0KSB7XG4gICAgICB0cnkge1xuICAgICAgICB5aWVsZCBzZWxmLl9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKHQpO1xuICAgICAgICB5aWVsZCB0Lm5vbmUocXMsIHZhbHVlcyk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNEdXBsaWNhdGVSZWxhdGlvbkVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gRUxTRTogVGFibGUgYWxyZWFkeSBleGlzdHMsIG11c3QgaGF2ZSBiZWVuIGNyZWF0ZWQgYnkgYSBkaWZmZXJlbnQgcmVxdWVzdC4gSWdub3JlIHRoZSBlcnJvci5cbiAgICAgIH1cbiAgICAgIHlpZWxkIHQudHgoJ2NyZWF0ZS10YWJsZS10eCcsIHR4ID0+IHtcbiAgICAgICAgcmV0dXJuIHR4LmJhdGNoKFxuICAgICAgICAgIHJlbGF0aW9ucy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgIHJldHVybiB0eC5ub25lKFxuICAgICAgICAgICAgICAnQ1JFQVRFIFRBQkxFIElGIE5PVCBFWElTVFMgJDxqb2luVGFibGU6bmFtZT4gKFwicmVsYXRlZElkXCIgdmFyQ2hhcigxMjApLCBcIm93bmluZ0lkXCIgdmFyQ2hhcigxMjApLCBQUklNQVJZIEtFWShcInJlbGF0ZWRJZFwiLCBcIm93bmluZ0lkXCIpICknLFxuICAgICAgICAgICAgICB7IGpvaW5UYWJsZTogYF9Kb2luOiR7ZmllbGROYW1lfToke2NsYXNzTmFtZX1gIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgc2NoZW1hVXBncmFkZShjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBjb25uOiBhbnkpIHtcbiAgICBkZWJ1Zygnc2NoZW1hVXBncmFkZScsIHsgY2xhc3NOYW1lLCBzY2hlbWEgfSk7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuXG4gICAgcmV0dXJuIGNvbm4udHgoJ3NjaGVtYS11cGdyYWRlJywgZnVuY3Rpb24qKHQpIHtcbiAgICAgIGNvbnN0IGNvbHVtbnMgPSB5aWVsZCB0Lm1hcChcbiAgICAgICAgJ1NFTEVDVCBjb2x1bW5fbmFtZSBGUk9NIGluZm9ybWF0aW9uX3NjaGVtYS5jb2x1bW5zIFdIRVJFIHRhYmxlX25hbWUgPSAkPGNsYXNzTmFtZT4nLFxuICAgICAgICB7IGNsYXNzTmFtZSB9LFxuICAgICAgICBhID0+IGEuY29sdW1uX25hbWVcbiAgICAgICk7XG4gICAgICBjb25zdCBuZXdDb2x1bW5zID0gT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcylcbiAgICAgICAgLmZpbHRlcihpdGVtID0+IGNvbHVtbnMuaW5kZXhPZihpdGVtKSA9PT0gLTEpXG4gICAgICAgIC5tYXAoZmllbGROYW1lID0+XG4gICAgICAgICAgc2VsZi5hZGRGaWVsZElmTm90RXhpc3RzKFxuICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLFxuICAgICAgICAgICAgdFxuICAgICAgICAgIClcbiAgICAgICAgKTtcblxuICAgICAgeWllbGQgdC5iYXRjaChuZXdDb2x1bW5zKTtcbiAgICB9KTtcbiAgfVxuXG4gIGFkZEZpZWxkSWZOb3RFeGlzdHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgdHlwZTogYW55LFxuICAgIGNvbm46IGFueVxuICApIHtcbiAgICAvLyBUT0RPOiBNdXN0IGJlIHJldmlzZWQgZm9yIGludmFsaWQgbG9naWMuLi5cbiAgICBkZWJ1ZygnYWRkRmllbGRJZk5vdEV4aXN0cycsIHsgY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUgfSk7XG4gICAgY29ubiA9IGNvbm4gfHwgdGhpcy5fY2xpZW50O1xuICAgIGNvbnN0IHNlbGYgPSB0aGlzO1xuICAgIHJldHVybiBjb25uLnR4KCdhZGQtZmllbGQtaWYtbm90LWV4aXN0cycsIGZ1bmN0aW9uKih0KSB7XG4gICAgICBpZiAodHlwZS50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgeWllbGQgdC5ub25lKFxuICAgICAgICAgICAgJ0FMVEVSIFRBQkxFICQ8Y2xhc3NOYW1lOm5hbWU+IEFERCBDT0xVTU4gJDxmaWVsZE5hbWU6bmFtZT4gJDxwb3N0Z3Jlc1R5cGU6cmF3PicsXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgICAgICBwb3N0Z3Jlc1R5cGU6IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHR5cGUpLFxuICAgICAgICAgICAgfVxuICAgICAgICAgICk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgICAgcmV0dXJuIHlpZWxkIHNlbGYuY3JlYXRlQ2xhc3MoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgeyBmaWVsZHM6IHsgW2ZpZWxkTmFtZV06IHR5cGUgfSB9LFxuICAgICAgICAgICAgICB0XG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZXJyb3IuY29kZSAhPT0gUG9zdGdyZXNEdXBsaWNhdGVDb2x1bW5FcnJvcikge1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIENvbHVtbiBhbHJlYWR5IGV4aXN0cywgY3JlYXRlZCBieSBvdGhlciByZXF1ZXN0LiBDYXJyeSBvbiB0byBzZWUgaWYgaXQncyB0aGUgcmlnaHQgdHlwZS5cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgeWllbGQgdC5ub25lKFxuICAgICAgICAgICdDUkVBVEUgVEFCTEUgSUYgTk9UIEVYSVNUUyAkPGpvaW5UYWJsZTpuYW1lPiAoXCJyZWxhdGVkSWRcIiB2YXJDaGFyKDEyMCksIFwib3duaW5nSWRcIiB2YXJDaGFyKDEyMCksIFBSSU1BUlkgS0VZKFwicmVsYXRlZElkXCIsIFwib3duaW5nSWRcIikgKScsXG4gICAgICAgICAgeyBqb2luVGFibGU6IGBfSm9pbjoke2ZpZWxkTmFtZX06JHtjbGFzc05hbWV9YCB9XG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHJlc3VsdCA9IHlpZWxkIHQuYW55KFxuICAgICAgICAnU0VMRUNUIFwic2NoZW1hXCIgRlJPTSBcIl9TQ0hFTUFcIiBXSEVSRSBcImNsYXNzTmFtZVwiID0gJDxjbGFzc05hbWU+IGFuZCAoXCJzY2hlbWFcIjo6anNvbi0+XFwnZmllbGRzXFwnLT4kPGZpZWxkTmFtZT4pIGlzIG5vdCBudWxsJyxcbiAgICAgICAgeyBjbGFzc05hbWUsIGZpZWxkTmFtZSB9XG4gICAgICApO1xuXG4gICAgICBpZiAocmVzdWx0WzBdKSB7XG4gICAgICAgIHRocm93ICdBdHRlbXB0ZWQgdG8gYWRkIGEgZmllbGQgdGhhdCBhbHJlYWR5IGV4aXN0cyc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zdCBwYXRoID0gYHtmaWVsZHMsJHtmaWVsZE5hbWV9fWA7XG4gICAgICAgIHlpZWxkIHQubm9uZShcbiAgICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCBcInNjaGVtYVwiPWpzb25iX3NldChcInNjaGVtYVwiLCAkPHBhdGg+LCAkPHR5cGU+KSAgV0hFUkUgXCJjbGFzc05hbWVcIj0kPGNsYXNzTmFtZT4nLFxuICAgICAgICAgIHsgcGF0aCwgdHlwZSwgY2xhc3NOYW1lIH1cbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8vIERyb3BzIGEgY29sbGVjdGlvbi4gUmVzb2x2ZXMgd2l0aCB0cnVlIGlmIGl0IHdhcyBhIFBhcnNlIFNjaGVtYSAoZWcuIF9Vc2VyLCBDdXN0b20sIGV0Yy4pXG4gIC8vIGFuZCByZXNvbHZlcyB3aXRoIGZhbHNlIGlmIGl0IHdhc24ndCAoZWcuIGEgam9pbiB0YWJsZSkuIFJlamVjdHMgaWYgZGVsZXRpb24gd2FzIGltcG9zc2libGUuXG4gIGRlbGV0ZUNsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3Qgb3BlcmF0aW9ucyA9IFtcbiAgICAgIHsgcXVlcnk6IGBEUk9QIFRBQkxFIElGIEVYSVNUUyAkMTpuYW1lYCwgdmFsdWVzOiBbY2xhc3NOYW1lXSB9LFxuICAgICAge1xuICAgICAgICBxdWVyeTogYERFTEVURSBGUk9NIFwiX1NDSEVNQVwiIFdIRVJFIFwiY2xhc3NOYW1lXCIgPSAkMWAsXG4gICAgICAgIHZhbHVlczogW2NsYXNzTmFtZV0sXG4gICAgICB9LFxuICAgIF07XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLnR4KHQgPT4gdC5ub25lKHRoaXMuX3BncC5oZWxwZXJzLmNvbmNhdChvcGVyYXRpb25zKSkpXG4gICAgICAudGhlbigoKSA9PiBjbGFzc05hbWUuaW5kZXhPZignX0pvaW46JykgIT0gMCk7IC8vIHJlc29sdmVzIHdpdGggZmFsc2Ugd2hlbiBfSm9pbiB0YWJsZVxuICB9XG5cbiAgLy8gRGVsZXRlIGFsbCBkYXRhIGtub3duIHRvIHRoaXMgYWRhcHRlci4gVXNlZCBmb3IgdGVzdGluZy5cbiAgZGVsZXRlQWxsQ2xhc3NlcygpIHtcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICBjb25zdCBoZWxwZXJzID0gdGhpcy5fcGdwLmhlbHBlcnM7XG4gICAgZGVidWcoJ2RlbGV0ZUFsbENsYXNzZXMnKTtcblxuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC50YXNrKCdkZWxldGUtYWxsLWNsYXNzZXMnLCBmdW5jdGlvbioodCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHJlc3VsdHMgPSB5aWVsZCB0LmFueSgnU0VMRUNUICogRlJPTSBcIl9TQ0hFTUFcIicpO1xuICAgICAgICAgIGNvbnN0IGpvaW5zID0gcmVzdWx0cy5yZWR1Y2UoKGxpc3Q6IEFycmF5PHN0cmluZz4sIHNjaGVtYTogYW55KSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gbGlzdC5jb25jYXQoam9pblRhYmxlc0ZvclNjaGVtYShzY2hlbWEuc2NoZW1hKSk7XG4gICAgICAgICAgfSwgW10pO1xuICAgICAgICAgIGNvbnN0IGNsYXNzZXMgPSBbXG4gICAgICAgICAgICAnX1NDSEVNQScsXG4gICAgICAgICAgICAnX1B1c2hTdGF0dXMnLFxuICAgICAgICAgICAgJ19Kb2JTdGF0dXMnLFxuICAgICAgICAgICAgJ19Kb2JTY2hlZHVsZScsXG4gICAgICAgICAgICAnX0hvb2tzJyxcbiAgICAgICAgICAgICdfR2xvYmFsQ29uZmlnJyxcbiAgICAgICAgICAgICdfQXVkaWVuY2UnLFxuICAgICAgICAgICAgLi4ucmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5jbGFzc05hbWUpLFxuICAgICAgICAgICAgLi4uam9pbnMsXG4gICAgICAgICAgXTtcbiAgICAgICAgICBjb25zdCBxdWVyaWVzID0gY2xhc3Nlcy5tYXAoY2xhc3NOYW1lID0+ICh7XG4gICAgICAgICAgICBxdWVyeTogJ0RST1AgVEFCTEUgSUYgRVhJU1RTICQ8Y2xhc3NOYW1lOm5hbWU+JyxcbiAgICAgICAgICAgIHZhbHVlczogeyBjbGFzc05hbWUgfSxcbiAgICAgICAgICB9KSk7XG4gICAgICAgICAgeWllbGQgdC50eCh0eCA9PiB0eC5ub25lKGhlbHBlcnMuY29uY2F0KHF1ZXJpZXMpKSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIE5vIF9TQ0hFTUEgY29sbGVjdGlvbi4gRG9uJ3QgZGVsZXRlIGFueXRoaW5nLlxuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBkZWJ1ZyhgZGVsZXRlQWxsQ2xhc3NlcyBkb25lIGluICR7bmV3IERhdGUoKS5nZXRUaW1lKCkgLSBub3d9YCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFJlbW92ZSB0aGUgY29sdW1uIGFuZCBhbGwgdGhlIGRhdGEuIEZvciBSZWxhdGlvbnMsIHRoZSBfSm9pbiBjb2xsZWN0aW9uIGlzIGhhbmRsZWRcbiAgLy8gc3BlY2lhbGx5LCB0aGlzIGZ1bmN0aW9uIGRvZXMgbm90IGRlbGV0ZSBfSm9pbiBjb2x1bW5zLiBJdCBzaG91bGQsIGhvd2V2ZXIsIGluZGljYXRlXG4gIC8vIHRoYXQgdGhlIHJlbGF0aW9uIGZpZWxkcyBkb2VzIG5vdCBleGlzdCBhbnltb3JlLiBJbiBtb25nbywgdGhpcyBtZWFucyByZW1vdmluZyBpdCBmcm9tXG4gIC8vIHRoZSBfU0NIRU1BIGNvbGxlY3Rpb24uICBUaGVyZSBzaG91bGQgYmUgbm8gYWN0dWFsIGRhdGEgaW4gdGhlIGNvbGxlY3Rpb24gdW5kZXIgdGhlIHNhbWUgbmFtZVxuICAvLyBhcyB0aGUgcmVsYXRpb24gY29sdW1uLCBzbyBpdCdzIGZpbmUgdG8gYXR0ZW1wdCB0byBkZWxldGUgaXQuIElmIHRoZSBmaWVsZHMgbGlzdGVkIHRvIGJlXG4gIC8vIGRlbGV0ZWQgZG8gbm90IGV4aXN0LCB0aGlzIGZ1bmN0aW9uIHNob3VsZCByZXR1cm4gc3VjY2Vzc2Z1bGx5IGFueXdheXMuIENoZWNraW5nIGZvclxuICAvLyBhdHRlbXB0cyB0byBkZWxldGUgbm9uLWV4aXN0ZW50IGZpZWxkcyBpcyB0aGUgcmVzcG9uc2liaWxpdHkgb2YgUGFyc2UgU2VydmVyLlxuXG4gIC8vIFRoaXMgZnVuY3Rpb24gaXMgbm90IG9ibGlnYXRlZCB0byBkZWxldGUgZmllbGRzIGF0b21pY2FsbHkuIEl0IGlzIGdpdmVuIHRoZSBmaWVsZFxuICAvLyBuYW1lcyBpbiBhIGxpc3Qgc28gdGhhdCBkYXRhYmFzZXMgdGhhdCBhcmUgY2FwYWJsZSBvZiBkZWxldGluZyBmaWVsZHMgYXRvbWljYWxseVxuICAvLyBtYXkgZG8gc28uXG5cbiAgLy8gUmV0dXJucyBhIFByb21pc2UuXG4gIGRlbGV0ZUZpZWxkcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgZmllbGROYW1lczogc3RyaW5nW11cbiAgKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgZGVidWcoJ2RlbGV0ZUZpZWxkcycsIGNsYXNzTmFtZSwgZmllbGROYW1lcyk7XG4gICAgZmllbGROYW1lcyA9IGZpZWxkTmFtZXMucmVkdWNlKChsaXN0OiBBcnJheTxzdHJpbmc+LCBmaWVsZE5hbWU6IHN0cmluZykgPT4ge1xuICAgICAgY29uc3QgZmllbGQgPSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICBpZiAoZmllbGQudHlwZSAhPT0gJ1JlbGF0aW9uJykge1xuICAgICAgICBsaXN0LnB1c2goZmllbGROYW1lKTtcbiAgICAgIH1cbiAgICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICByZXR1cm4gbGlzdDtcbiAgICB9LCBbXSk7XG5cbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lLCAuLi5maWVsZE5hbWVzXTtcbiAgICBjb25zdCBjb2x1bW5zID0gZmllbGROYW1lc1xuICAgICAgLm1hcCgobmFtZSwgaWR4KSA9PiB7XG4gICAgICAgIHJldHVybiBgJCR7aWR4ICsgMn06bmFtZWA7XG4gICAgICB9KVxuICAgICAgLmpvaW4oJywgRFJPUCBDT0xVTU4nKTtcblxuICAgIHJldHVybiB0aGlzLl9jbGllbnQudHgoJ2RlbGV0ZS1maWVsZHMnLCBmdW5jdGlvbioodCkge1xuICAgICAgeWllbGQgdC5ub25lKFxuICAgICAgICAnVVBEQVRFIFwiX1NDSEVNQVwiIFNFVCBcInNjaGVtYVwiPSQ8c2NoZW1hPiBXSEVSRSBcImNsYXNzTmFtZVwiPSQ8Y2xhc3NOYW1lPicsXG4gICAgICAgIHsgc2NoZW1hLCBjbGFzc05hbWUgfVxuICAgICAgKTtcbiAgICAgIGlmICh2YWx1ZXMubGVuZ3RoID4gMSkge1xuICAgICAgICB5aWVsZCB0Lm5vbmUoYEFMVEVSIFRBQkxFICQxOm5hbWUgRFJPUCBDT0xVTU4gJHtjb2x1bW5zfWAsIHZhbHVlcyk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyBSZXR1cm4gYSBwcm9taXNlIGZvciBhbGwgc2NoZW1hcyBrbm93biB0byB0aGlzIGFkYXB0ZXIsIGluIFBhcnNlIGZvcm1hdC4gSW4gY2FzZSB0aGVcbiAgLy8gc2NoZW1hcyBjYW5ub3QgYmUgcmV0cmlldmVkLCByZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlamVjdHMuIFJlcXVpcmVtZW50cyBmb3IgdGhlXG4gIC8vIHJlamVjdGlvbiByZWFzb24gYXJlIFRCRC5cbiAgZ2V0QWxsQ2xhc3NlcygpIHtcbiAgICBjb25zdCBzZWxmID0gdGhpcztcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50LnRhc2soJ2dldC1hbGwtY2xhc3NlcycsIGZ1bmN0aW9uKih0KSB7XG4gICAgICB5aWVsZCBzZWxmLl9lbnN1cmVTY2hlbWFDb2xsZWN0aW9uRXhpc3RzKHQpO1xuICAgICAgcmV0dXJuIHlpZWxkIHQubWFwKCdTRUxFQ1QgKiBGUk9NIFwiX1NDSEVNQVwiJywgbnVsbCwgcm93ID0+XG4gICAgICAgIHRvUGFyc2VTY2hlbWEoeyBjbGFzc05hbWU6IHJvdy5jbGFzc05hbWUsIC4uLnJvdy5zY2hlbWEgfSlcbiAgICAgICk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBSZXR1cm4gYSBwcm9taXNlIGZvciB0aGUgc2NoZW1hIHdpdGggdGhlIGdpdmVuIG5hbWUsIGluIFBhcnNlIGZvcm1hdC4gSWZcbiAgLy8gdGhpcyBhZGFwdGVyIGRvZXNuJ3Qga25vdyBhYm91dCB0aGUgc2NoZW1hLCByZXR1cm4gYSBwcm9taXNlIHRoYXQgcmVqZWN0cyB3aXRoXG4gIC8vIHVuZGVmaW5lZCBhcyB0aGUgcmVhc29uLlxuICBnZXRDbGFzcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIGRlYnVnKCdnZXRDbGFzcycsIGNsYXNzTmFtZSk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLmFueSgnU0VMRUNUICogRlJPTSBcIl9TQ0hFTUFcIiBXSEVSRSBcImNsYXNzTmFtZVwiPSQ8Y2xhc3NOYW1lPicsIHtcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgfSlcbiAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmIChyZXN1bHQubGVuZ3RoICE9PSAxKSB7XG4gICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXN1bHRbMF0uc2NoZW1hO1xuICAgICAgfSlcbiAgICAgIC50aGVuKHRvUGFyc2VTY2hlbWEpO1xuICB9XG5cbiAgLy8gVE9ETzogcmVtb3ZlIHRoZSBtb25nbyBmb3JtYXQgZGVwZW5kZW5jeSBpbiB0aGUgcmV0dXJuIHZhbHVlXG4gIGNyZWF0ZU9iamVjdChjbGFzc05hbWU6IHN0cmluZywgc2NoZW1hOiBTY2hlbWFUeXBlLCBvYmplY3Q6IGFueSkge1xuICAgIGRlYnVnKCdjcmVhdGVPYmplY3QnLCBjbGFzc05hbWUsIG9iamVjdCk7XG4gICAgbGV0IGNvbHVtbnNBcnJheSA9IFtdO1xuICAgIGNvbnN0IHZhbHVlc0FycmF5ID0gW107XG4gICAgc2NoZW1hID0gdG9Qb3N0Z3Jlc1NjaGVtYShzY2hlbWEpO1xuICAgIGNvbnN0IGdlb1BvaW50cyA9IHt9O1xuXG4gICAgb2JqZWN0ID0gaGFuZGxlRG90RmllbGRzKG9iamVjdCk7XG5cbiAgICB2YWxpZGF0ZUtleXMob2JqZWN0KTtcblxuICAgIE9iamVjdC5rZXlzKG9iamVjdCkuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdID09PSBudWxsKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHZhciBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgICB2YXIgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICBvYmplY3RbJ2F1dGhEYXRhJ10gPSBvYmplY3RbJ2F1dGhEYXRhJ10gfHwge307XG4gICAgICAgIG9iamVjdFsnYXV0aERhdGEnXVtwcm92aWRlcl0gPSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgICAgZGVsZXRlIG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICBmaWVsZE5hbWUgPSAnYXV0aERhdGEnO1xuICAgICAgfVxuXG4gICAgICBjb2x1bW5zQXJyYXkucHVzaChmaWVsZE5hbWUpO1xuICAgICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiYgY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICBmaWVsZE5hbWUgPT09ICdfZW1haWxfdmVyaWZ5X3Rva2VuJyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19mYWlsZWRfbG9naW5fY291bnQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3BlcmlzaGFibGVfdG9rZW4nIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3Bhc3N3b3JkX2hpc3RvcnknXG4gICAgICAgICkge1xuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcpIHtcbiAgICAgICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0uaXNvKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChudWxsKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoXG4gICAgICAgICAgZmllbGROYW1lID09PSAnX2FjY291bnRfbG9ja291dF9leHBpcmVzX2F0JyB8fFxuICAgICAgICAgIGZpZWxkTmFtZSA9PT0gJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnIHx8XG4gICAgICAgICAgZmllbGROYW1lID09PSAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnXG4gICAgICAgICkge1xuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBzd2l0Y2ggKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlKSB7XG4gICAgICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5pc28pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG51bGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaChvYmplY3RbZmllbGROYW1lXS5vYmplY3RJZCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgICAgICBpZiAoWydfcnBlcm0nLCAnX3dwZXJtJ10uaW5kZXhPZihmaWVsZE5hbWUpID49IDApIHtcbiAgICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKEpTT04uc3RyaW5naWZ5KG9iamVjdFtmaWVsZE5hbWVdKSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdPYmplY3QnOlxuICAgICAgICBjYXNlICdCeXRlcyc6XG4gICAgICAgIGNhc2UgJ1N0cmluZyc6XG4gICAgICAgIGNhc2UgJ051bWJlcic6XG4gICAgICAgIGNhc2UgJ0Jvb2xlYW4nOlxuICAgICAgICAgIHZhbHVlc0FycmF5LnB1c2gob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdGaWxlJzpcbiAgICAgICAgICB2YWx1ZXNBcnJheS5wdXNoKG9iamVjdFtmaWVsZE5hbWVdLm5hbWUpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdQb2x5Z29uJzoge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gY29udmVydFBvbHlnb25Ub1NRTChvYmplY3RbZmllbGROYW1lXS5jb29yZGluYXRlcyk7XG4gICAgICAgICAgdmFsdWVzQXJyYXkucHVzaCh2YWx1ZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgICAgIC8vIHBvcCB0aGUgcG9pbnQgYW5kIHByb2Nlc3MgbGF0ZXJcbiAgICAgICAgICBnZW9Qb2ludHNbZmllbGROYW1lXSA9IG9iamVjdFtmaWVsZE5hbWVdO1xuICAgICAgICAgIGNvbHVtbnNBcnJheS5wb3AoKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICB0aHJvdyBgVHlwZSAke3NjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlfSBub3Qgc3VwcG9ydGVkIHlldGA7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBjb2x1bW5zQXJyYXkgPSBjb2x1bW5zQXJyYXkuY29uY2F0KE9iamVjdC5rZXlzKGdlb1BvaW50cykpO1xuICAgIGNvbnN0IGluaXRpYWxWYWx1ZXMgPSB2YWx1ZXNBcnJheS5tYXAoKHZhbCwgaW5kZXgpID0+IHtcbiAgICAgIGxldCB0ZXJtaW5hdGlvbiA9ICcnO1xuICAgICAgY29uc3QgZmllbGROYW1lID0gY29sdW1uc0FycmF5W2luZGV4XTtcbiAgICAgIGlmIChbJ19ycGVybScsICdfd3Blcm0nXS5pbmRleE9mKGZpZWxkTmFtZSkgPj0gMCkge1xuICAgICAgICB0ZXJtaW5hdGlvbiA9ICc6OnRleHRbXSc7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdBcnJheSdcbiAgICAgICkge1xuICAgICAgICB0ZXJtaW5hdGlvbiA9ICc6Ompzb25iJztcbiAgICAgIH1cbiAgICAgIHJldHVybiBgJCR7aW5kZXggKyAyICsgY29sdW1uc0FycmF5Lmxlbmd0aH0ke3Rlcm1pbmF0aW9ufWA7XG4gICAgfSk7XG4gICAgY29uc3QgZ2VvUG9pbnRzSW5qZWN0cyA9IE9iamVjdC5rZXlzKGdlb1BvaW50cykubWFwKGtleSA9PiB7XG4gICAgICBjb25zdCB2YWx1ZSA9IGdlb1BvaW50c1trZXldO1xuICAgICAgdmFsdWVzQXJyYXkucHVzaCh2YWx1ZS5sb25naXR1ZGUsIHZhbHVlLmxhdGl0dWRlKTtcbiAgICAgIGNvbnN0IGwgPSB2YWx1ZXNBcnJheS5sZW5ndGggKyBjb2x1bW5zQXJyYXkubGVuZ3RoO1xuICAgICAgcmV0dXJuIGBQT0lOVCgkJHtsfSwgJCR7bCArIDF9KWA7XG4gICAgfSk7XG5cbiAgICBjb25zdCBjb2x1bW5zUGF0dGVybiA9IGNvbHVtbnNBcnJheVxuICAgICAgLm1hcCgoY29sLCBpbmRleCkgPT4gYCQke2luZGV4ICsgMn06bmFtZWApXG4gICAgICAuam9pbigpO1xuICAgIGNvbnN0IHZhbHVlc1BhdHRlcm4gPSBpbml0aWFsVmFsdWVzLmNvbmNhdChnZW9Qb2ludHNJbmplY3RzKS5qb2luKCk7XG5cbiAgICBjb25zdCBxcyA9IGBJTlNFUlQgSU5UTyAkMTpuYW1lICgke2NvbHVtbnNQYXR0ZXJufSkgVkFMVUVTICgke3ZhbHVlc1BhdHRlcm59KWA7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZSwgLi4uY29sdW1uc0FycmF5LCAuLi52YWx1ZXNBcnJheV07XG4gICAgZGVidWcocXMsIHZhbHVlcyk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLm5vbmUocXMsIHZhbHVlcylcbiAgICAgIC50aGVuKCgpID0+ICh7IG9wczogW29iamVjdF0gfSkpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yKSB7XG4gICAgICAgICAgY29uc3QgZXJyID0gbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgICBlcnIudW5kZXJseWluZ0Vycm9yID0gZXJyb3I7XG4gICAgICAgICAgaWYgKGVycm9yLmNvbnN0cmFpbnQpIHtcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBlcnJvci5jb25zdHJhaW50Lm1hdGNoKC91bmlxdWVfKFthLXpBLVpdKykvKTtcbiAgICAgICAgICAgIGlmIChtYXRjaGVzICYmIEFycmF5LmlzQXJyYXkobWF0Y2hlcykpIHtcbiAgICAgICAgICAgICAgZXJyLnVzZXJJbmZvID0geyBkdXBsaWNhdGVkX2ZpZWxkOiBtYXRjaGVzWzFdIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGVycm9yID0gZXJyO1xuICAgICAgICB9XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBSZW1vdmUgYWxsIG9iamVjdHMgdGhhdCBtYXRjaCB0aGUgZ2l2ZW4gUGFyc2UgUXVlcnkuXG4gIC8vIElmIG5vIG9iamVjdHMgbWF0Y2gsIHJlamVjdCB3aXRoIE9CSkVDVF9OT1RfRk9VTkQuIElmIG9iamVjdHMgYXJlIGZvdW5kIGFuZCBkZWxldGVkLCByZXNvbHZlIHdpdGggdW5kZWZpbmVkLlxuICAvLyBJZiB0aGVyZSBpcyBzb21lIG90aGVyIGVycm9yLCByZWplY3Qgd2l0aCBJTlRFUk5BTF9TRVJWRVJfRVJST1IuXG4gIGRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHNjaGVtYTogU2NoZW1hVHlwZSxcbiAgICBxdWVyeTogUXVlcnlUeXBlXG4gICkge1xuICAgIGRlYnVnKCdkZWxldGVPYmplY3RzQnlRdWVyeScsIGNsYXNzTmFtZSwgcXVlcnkpO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGNvbnN0IGluZGV4ID0gMjtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgaW5kZXgsXG4gICAgICBxdWVyeSxcbiAgICAgIGluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuICAgIGlmIChPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09PSAwKSB7XG4gICAgICB3aGVyZS5wYXR0ZXJuID0gJ1RSVUUnO1xuICAgIH1cbiAgICBjb25zdCBxcyA9IGBXSVRIIGRlbGV0ZWQgQVMgKERFTEVURSBGUk9NICQxOm5hbWUgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufSBSRVRVUk5JTkcgKikgU0VMRUNUIGNvdW50KCopIEZST00gZGVsZXRlZGA7XG4gICAgZGVidWcocXMsIHZhbHVlcyk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLm9uZShxcywgdmFsdWVzLCBhID0+ICthLmNvdW50KVxuICAgICAgLnRoZW4oY291bnQgPT4ge1xuICAgICAgICBpZiAoY291bnQgPT09IDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICAgJ09iamVjdCBub3QgZm91bmQuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGNvdW50O1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIC8vIEVMU0U6IERvbid0IGRlbGV0ZSBhbnl0aGluZyBpZiBkb2Vzbid0IGV4aXN0XG4gICAgICB9KTtcbiAgfVxuICAvLyBSZXR1cm4gdmFsdWUgbm90IGN1cnJlbnRseSB3ZWxsIHNwZWNpZmllZC5cbiAgZmluZE9uZUFuZFVwZGF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICB1cGRhdGU6IGFueVxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGRlYnVnKCdmaW5kT25lQW5kVXBkYXRlJywgY2xhc3NOYW1lLCBxdWVyeSwgdXBkYXRlKTtcbiAgICByZXR1cm4gdGhpcy51cGRhdGVPYmplY3RzQnlRdWVyeShjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHVwZGF0ZSkudGhlbihcbiAgICAgIHZhbCA9PiB2YWxbMF1cbiAgICApO1xuICB9XG5cbiAgLy8gQXBwbHkgdGhlIHVwZGF0ZSB0byBhbGwgb2JqZWN0cyB0aGF0IG1hdGNoIHRoZSBnaXZlbiBQYXJzZSBRdWVyeS5cbiAgdXBkYXRlT2JqZWN0c0J5UXVlcnkoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnlcbiAgKTogUHJvbWlzZTxbYW55XT4ge1xuICAgIGRlYnVnKCd1cGRhdGVPYmplY3RzQnlRdWVyeScsIGNsYXNzTmFtZSwgcXVlcnksIHVwZGF0ZSk7XG4gICAgY29uc3QgdXBkYXRlUGF0dGVybnMgPSBbXTtcbiAgICBjb25zdCB2YWx1ZXMgPSBbY2xhc3NOYW1lXTtcbiAgICBsZXQgaW5kZXggPSAyO1xuICAgIHNjaGVtYSA9IHRvUG9zdGdyZXNTY2hlbWEoc2NoZW1hKTtcblxuICAgIGNvbnN0IG9yaWdpbmFsVXBkYXRlID0geyAuLi51cGRhdGUgfTtcblxuICAgIC8vIFNldCBmbGFnIGZvciBkb3Qgbm90YXRpb24gZmllbGRzXG4gICAgY29uc3QgZG90Tm90YXRpb25PcHRpb25zID0ge307XG4gICAgT2JqZWN0LmtleXModXBkYXRlKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+IC0xKSB7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSBmaWVsZE5hbWUuc3BsaXQoJy4nKTtcbiAgICAgICAgY29uc3QgZmlyc3QgPSBjb21wb25lbnRzLnNoaWZ0KCk7XG4gICAgICAgIGRvdE5vdGF0aW9uT3B0aW9uc1tmaXJzdF0gPSB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZG90Tm90YXRpb25PcHRpb25zW2ZpZWxkTmFtZV0gPSBmYWxzZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB1cGRhdGUgPSBoYW5kbGVEb3RGaWVsZHModXBkYXRlKTtcbiAgICAvLyBSZXNvbHZlIGF1dGhEYXRhIGZpcnN0LFxuICAgIC8vIFNvIHdlIGRvbid0IGVuZCB1cCB3aXRoIG11bHRpcGxlIGtleSB1cGRhdGVzXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gdXBkYXRlKSB7XG4gICAgICBjb25zdCBhdXRoRGF0YU1hdGNoID0gZmllbGROYW1lLm1hdGNoKC9eX2F1dGhfZGF0YV8oW2EtekEtWjAtOV9dKykkLyk7XG4gICAgICBpZiAoYXV0aERhdGFNYXRjaCkge1xuICAgICAgICB2YXIgcHJvdmlkZXIgPSBhdXRoRGF0YU1hdGNoWzFdO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgICBkZWxldGUgdXBkYXRlW2ZpZWxkTmFtZV07XG4gICAgICAgIHVwZGF0ZVsnYXV0aERhdGEnXSA9IHVwZGF0ZVsnYXV0aERhdGEnXSB8fCB7fTtcbiAgICAgICAgdXBkYXRlWydhdXRoRGF0YSddW3Byb3ZpZGVyXSA9IHZhbHVlO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIHVwZGF0ZSkge1xuICAgICAgY29uc3QgZmllbGRWYWx1ZSA9IHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgLy8gRHJvcCBhbnkgdW5kZWZpbmVkIHZhbHVlcy5cbiAgICAgIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgZGVsZXRlIHVwZGF0ZVtmaWVsZE5hbWVdO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlID09PSBudWxsKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gTlVMTGApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZE5hbWUgPT0gJ2F1dGhEYXRhJykge1xuICAgICAgICAvLyBUaGlzIHJlY3Vyc2l2ZWx5IHNldHMgdGhlIGpzb25fb2JqZWN0XG4gICAgICAgIC8vIE9ubHkgMSBsZXZlbCBkZWVwXG4gICAgICAgIGNvbnN0IGdlbmVyYXRlID0gKGpzb25iOiBzdHJpbmcsIGtleTogc3RyaW5nLCB2YWx1ZTogYW55KSA9PiB7XG4gICAgICAgICAgcmV0dXJuIGBqc29uX29iamVjdF9zZXRfa2V5KENPQUxFU0NFKCR7anNvbmJ9LCAne30nOjpqc29uYiksICR7a2V5fSwgJHt2YWx1ZX0pOjpqc29uYmA7XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGxhc3RLZXkgPSBgJCR7aW5kZXh9Om5hbWVgO1xuICAgICAgICBjb25zdCBmaWVsZE5hbWVJbmRleCA9IGluZGV4O1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICBjb25zdCB1cGRhdGUgPSBPYmplY3Qua2V5cyhmaWVsZFZhbHVlKS5yZWR1Y2UoXG4gICAgICAgICAgKGxhc3RLZXk6IHN0cmluZywga2V5OiBzdHJpbmcpID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHN0ciA9IGdlbmVyYXRlKFxuICAgICAgICAgICAgICBsYXN0S2V5LFxuICAgICAgICAgICAgICBgJCR7aW5kZXh9Ojp0ZXh0YCxcbiAgICAgICAgICAgICAgYCQke2luZGV4ICsgMX06Ompzb25iYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICBsZXQgdmFsdWUgPSBmaWVsZFZhbHVlW2tleV07XG4gICAgICAgICAgICBpZiAodmFsdWUpIHtcbiAgICAgICAgICAgICAgaWYgKHZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICAgICAgdmFsdWUgPSBudWxsO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhbHVlID0gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChrZXksIHZhbHVlKTtcbiAgICAgICAgICAgIHJldHVybiBzdHI7XG4gICAgICAgICAgfSxcbiAgICAgICAgICBsYXN0S2V5XG4gICAgICAgICk7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2ZpZWxkTmFtZUluZGV4fTpuYW1lID0gJHt1cGRhdGV9YCk7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0luY3JlbWVudCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgMCkgKyAkJHtpbmRleCArIDF9YFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUuYW1vdW50KTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX29wID09PSAnQWRkJykge1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9IGFycmF5X2FkZChDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ1tdJzo6anNvbmIpLCAkJHtpbmRleCArXG4gICAgICAgICAgICAxfTo6anNvbmIpYFxuICAgICAgICApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUub2JqZWN0cykpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIG51bGwpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChmaWVsZFZhbHVlLl9fb3AgPT09ICdSZW1vdmUnKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goXG4gICAgICAgICAgYCQke2luZGV4fTpuYW1lID0gYXJyYXlfcmVtb3ZlKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke2luZGV4ICtcbiAgICAgICAgICAgIDF9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS5vYmplY3RzKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX19vcCA9PT0gJ0FkZFVuaXF1ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBhcnJheV9hZGRfdW5pcXVlKENPQUxFU0NFKCQke2luZGV4fTpuYW1lLCAnW10nOjpqc29uYiksICQke2luZGV4ICtcbiAgICAgICAgICAgIDF9Ojpqc29uYilgXG4gICAgICAgICk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZS5vYmplY3RzKSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkTmFtZSA9PT0gJ3VwZGF0ZWRBdCcpIHtcbiAgICAgICAgLy9UT0RPOiBzdG9wIHNwZWNpYWwgY2FzaW5nIHRoaXMuIEl0IHNob3VsZCBjaGVjayBmb3IgX190eXBlID09PSAnRGF0ZScgYW5kIHVzZSAuaXNvXG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZmllbGRWYWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWVsZFZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZS5vYmplY3RJZCk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnRmlsZScpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgdG9Qb3N0Z3Jlc1ZhbHVlKGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgIH0gZWxzZSBpZiAoZmllbGRWYWx1ZS5fX3R5cGUgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChcbiAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgPSBQT0lOVCgkJHtpbmRleCArIDF9LCAkJHtpbmRleCArIDJ9KWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCBmaWVsZFZhbHVlLmxvbmdpdHVkZSwgZmllbGRWYWx1ZS5sYXRpdHVkZSk7XG4gICAgICAgIGluZGV4ICs9IDM7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUG9seWdvbicpIHtcbiAgICAgICAgY29uc3QgdmFsdWUgPSBjb252ZXJ0UG9seWdvblRvU1FMKGZpZWxkVmFsdWUuY29vcmRpbmF0ZXMpO1xuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKGAkJHtpbmRleH06bmFtZSA9ICQke2luZGV4ICsgMX06OnBvbHlnb25gKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCB2YWx1ZSk7XG4gICAgICAgIGluZGV4ICs9IDI7XG4gICAgICB9IGVsc2UgaWYgKGZpZWxkVmFsdWUuX190eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIC8vIG5vb3BcbiAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpZWxkVmFsdWUgPT09ICdudW1iZXInKSB7XG4gICAgICAgIHVwZGF0ZVBhdHRlcm5zLnB1c2goYCQke2luZGV4fTpuYW1lID0gJCR7aW5kZXggKyAxfWApO1xuICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICBpbmRleCArPSAyO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgdHlwZW9mIGZpZWxkVmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ09iamVjdCdcbiAgICAgICkge1xuICAgICAgICAvLyBHYXRoZXIga2V5cyB0byBpbmNyZW1lbnRcbiAgICAgICAgY29uc3Qga2V5c1RvSW5jcmVtZW50ID0gT2JqZWN0LmtleXMob3JpZ2luYWxVcGRhdGUpXG4gICAgICAgICAgLmZpbHRlcihrID0+IHtcbiAgICAgICAgICAgIC8vIGNob29zZSB0b3AgbGV2ZWwgZmllbGRzIHRoYXQgaGF2ZSBhIGRlbGV0ZSBvcGVyYXRpb24gc2V0XG4gICAgICAgICAgICAvLyBOb3RlIHRoYXQgT2JqZWN0LmtleXMgaXMgaXRlcmF0aW5nIG92ZXIgdGhlICoqb3JpZ2luYWwqKiB1cGRhdGUgb2JqZWN0XG4gICAgICAgICAgICAvLyBhbmQgdGhhdCBzb21lIG9mIHRoZSBrZXlzIG9mIHRoZSBvcmlnaW5hbCB1cGRhdGUgY291bGQgYmUgbnVsbCBvciB1bmRlZmluZWQ6XG4gICAgICAgICAgICAvLyAoU2VlIHRoZSBhYm92ZSBjaGVjayBgaWYgKGZpZWxkVmFsdWUgPT09IG51bGwgfHwgdHlwZW9mIGZpZWxkVmFsdWUgPT0gXCJ1bmRlZmluZWRcIilgKVxuICAgICAgICAgICAgY29uc3QgdmFsdWUgPSBvcmlnaW5hbFVwZGF0ZVtrXTtcbiAgICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICAgIHZhbHVlICYmXG4gICAgICAgICAgICAgIHZhbHVlLl9fb3AgPT09ICdJbmNyZW1lbnQnICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKS5sZW5ndGggPT09IDIgJiZcbiAgICAgICAgICAgICAgay5zcGxpdCgnLicpWzBdID09PSBmaWVsZE5hbWVcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAubWFwKGsgPT4gay5zcGxpdCgnLicpWzFdKTtcblxuICAgICAgICBsZXQgaW5jcmVtZW50UGF0dGVybnMgPSAnJztcbiAgICAgICAgaWYgKGtleXNUb0luY3JlbWVudC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgaW5jcmVtZW50UGF0dGVybnMgPVxuICAgICAgICAgICAgJyB8fCAnICtcbiAgICAgICAgICAgIGtleXNUb0luY3JlbWVudFxuICAgICAgICAgICAgICAubWFwKGMgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGFtb3VudCA9IGZpZWxkVmFsdWVbY10uYW1vdW50O1xuICAgICAgICAgICAgICAgIHJldHVybiBgQ09OQ0FUKCd7XCIke2N9XCI6JywgQ09BTEVTQ0UoJCR7aW5kZXh9Om5hbWUtPj4nJHtjfScsJzAnKTo6aW50ICsgJHthbW91bnR9LCAnfScpOjpqc29uYmA7XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC5qb2luKCcgfHwgJyk7XG4gICAgICAgICAgLy8gU3RyaXAgdGhlIGtleXNcbiAgICAgICAgICBrZXlzVG9JbmNyZW1lbnQuZm9yRWFjaChrZXkgPT4ge1xuICAgICAgICAgICAgZGVsZXRlIGZpZWxkVmFsdWVba2V5XTtcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGtleXNUb0RlbGV0ZTogQXJyYXk8c3RyaW5nPiA9IE9iamVjdC5rZXlzKG9yaWdpbmFsVXBkYXRlKVxuICAgICAgICAgIC5maWx0ZXIoayA9PiB7XG4gICAgICAgICAgICAvLyBjaG9vc2UgdG9wIGxldmVsIGZpZWxkcyB0aGF0IGhhdmUgYSBkZWxldGUgb3BlcmF0aW9uIHNldC5cbiAgICAgICAgICAgIGNvbnN0IHZhbHVlID0gb3JpZ2luYWxVcGRhdGVba107XG4gICAgICAgICAgICByZXR1cm4gKFxuICAgICAgICAgICAgICB2YWx1ZSAmJlxuICAgICAgICAgICAgICB2YWx1ZS5fX29wID09PSAnRGVsZXRlJyAmJlxuICAgICAgICAgICAgICBrLnNwbGl0KCcuJykubGVuZ3RoID09PSAyICYmXG4gICAgICAgICAgICAgIGsuc3BsaXQoJy4nKVswXSA9PT0gZmllbGROYW1lXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLm1hcChrID0+IGsuc3BsaXQoJy4nKVsxXSk7XG5cbiAgICAgICAgY29uc3QgZGVsZXRlUGF0dGVybnMgPSBrZXlzVG9EZWxldGUucmVkdWNlKFxuICAgICAgICAgIChwOiBzdHJpbmcsIGM6IHN0cmluZywgaTogbnVtYmVyKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gcCArIGAgLSAnJCR7aW5kZXggKyAxICsgaX06dmFsdWUnYDtcbiAgICAgICAgICB9LFxuICAgICAgICAgICcnXG4gICAgICAgICk7XG4gICAgICAgIC8vIE92ZXJyaWRlIE9iamVjdFxuICAgICAgICBsZXQgdXBkYXRlT2JqZWN0ID0gXCIne30nOjpqc29uYlwiO1xuXG4gICAgICAgIGlmIChkb3ROb3RhdGlvbk9wdGlvbnNbZmllbGROYW1lXSkge1xuICAgICAgICAgIC8vIE1lcmdlIE9iamVjdFxuICAgICAgICAgIHVwZGF0ZU9iamVjdCA9IGBDT0FMRVNDRSgkJHtpbmRleH06bmFtZSwgJ3t9Jzo6anNvbmIpYDtcbiAgICAgICAgfVxuICAgICAgICB1cGRhdGVQYXR0ZXJucy5wdXNoKFxuICAgICAgICAgIGAkJHtpbmRleH06bmFtZSA9ICgke3VwZGF0ZU9iamVjdH0gJHtkZWxldGVQYXR0ZXJuc30gJHtpbmNyZW1lbnRQYXR0ZXJuc30gfHwgJCR7aW5kZXggK1xuICAgICAgICAgICAgMSArXG4gICAgICAgICAgICBrZXlzVG9EZWxldGUubGVuZ3RofTo6anNvbmIgKWBcbiAgICAgICAgKTtcbiAgICAgICAgdmFsdWVzLnB1c2goZmllbGROYW1lLCAuLi5rZXlzVG9EZWxldGUsIEpTT04uc3RyaW5naWZ5KGZpZWxkVmFsdWUpKTtcbiAgICAgICAgaW5kZXggKz0gMiArIGtleXNUb0RlbGV0ZS5sZW5ndGg7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICBBcnJheS5pc0FycmF5KGZpZWxkVmFsdWUpICYmXG4gICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PT0gJ0FycmF5J1xuICAgICAgKSB7XG4gICAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHBhcnNlVHlwZVRvUG9zdGdyZXNUeXBlKHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSk7XG4gICAgICAgIGlmIChleHBlY3RlZFR5cGUgPT09ICd0ZXh0W10nKSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojp0ZXh0W11gKTtcbiAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZE5hbWUsIGZpZWxkVmFsdWUpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdXBkYXRlUGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9Ojpqc29uYmApO1xuICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkTmFtZSwgSlNPTi5zdHJpbmdpZnkoZmllbGRWYWx1ZSkpO1xuICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRlYnVnKCdOb3Qgc3VwcG9ydGVkIHVwZGF0ZScsIGZpZWxkTmFtZSwgZmllbGRWYWx1ZSk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgYFBvc3RncmVzIGRvZXNuJ3Qgc3VwcG9ydCB1cGRhdGUgJHtKU09OLnN0cmluZ2lmeShmaWVsZFZhbHVlKX0geWV0YFxuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgaW5kZXgsXG4gICAgICBxdWVyeSxcbiAgICAgIGluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVDbGF1c2UgPVxuICAgICAgd2hlcmUucGF0dGVybi5sZW5ndGggPiAwID8gYFdIRVJFICR7d2hlcmUucGF0dGVybn1gIDogJyc7XG4gICAgY29uc3QgcXMgPSBgVVBEQVRFICQxOm5hbWUgU0VUICR7dXBkYXRlUGF0dGVybnMuam9pbigpfSAke3doZXJlQ2xhdXNlfSBSRVRVUk5JTkcgKmA7XG4gICAgZGVidWcoJ3VwZGF0ZTogJywgcXMsIHZhbHVlcyk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5hbnkocXMsIHZhbHVlcyk7XG4gIH1cblxuICAvLyBIb3BlZnVsbHksIHdlIGNhbiBnZXQgcmlkIG9mIHRoaXMuIEl0J3Mgb25seSB1c2VkIGZvciBjb25maWcgYW5kIGhvb2tzLlxuICB1cHNlcnRPbmVPYmplY3QoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgdXBkYXRlOiBhbnlcbiAgKSB7XG4gICAgZGVidWcoJ3Vwc2VydE9uZU9iamVjdCcsIHsgY2xhc3NOYW1lLCBxdWVyeSwgdXBkYXRlIH0pO1xuICAgIGNvbnN0IGNyZWF0ZVZhbHVlID0gT2JqZWN0LmFzc2lnbih7fSwgcXVlcnksIHVwZGF0ZSk7XG4gICAgcmV0dXJuIHRoaXMuY3JlYXRlT2JqZWN0KGNsYXNzTmFtZSwgc2NoZW1hLCBjcmVhdGVWYWx1ZSkuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgLy8gaWdub3JlIGR1cGxpY2F0ZSB2YWx1ZSBlcnJvcnMgYXMgaXQncyB1cHNlcnRcbiAgICAgIGlmIChlcnJvci5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5maW5kT25lQW5kVXBkYXRlKGNsYXNzTmFtZSwgc2NoZW1hLCBxdWVyeSwgdXBkYXRlKTtcbiAgICB9KTtcbiAgfVxuXG4gIGZpbmQoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIHF1ZXJ5OiBRdWVyeVR5cGUsXG4gICAgeyBza2lwLCBsaW1pdCwgc29ydCwga2V5cywgaW5zZW5zaXRpdmUgfTogUXVlcnlPcHRpb25zXG4gICkge1xuICAgIGRlYnVnKCdmaW5kJywgY2xhc3NOYW1lLCBxdWVyeSwgeyBza2lwLCBsaW1pdCwgc29ydCwga2V5cywgaW5zZW5zaXRpdmUgfSk7XG4gICAgY29uc3QgaGFzTGltaXQgPSBsaW1pdCAhPT0gdW5kZWZpbmVkO1xuICAgIGNvbnN0IGhhc1NraXAgPSBza2lwICE9PSB1bmRlZmluZWQ7XG4gICAgbGV0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGNvbnN0IHdoZXJlID0gYnVpbGRXaGVyZUNsYXVzZSh7IHNjaGVtYSwgcXVlcnksIGluZGV4OiAyLCBpbnNlbnNpdGl2ZSB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVQYXR0ZXJuID1cbiAgICAgIHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IGxpbWl0UGF0dGVybiA9IGhhc0xpbWl0ID8gYExJTUlUICQke3ZhbHVlcy5sZW5ndGggKyAxfWAgOiAnJztcbiAgICBpZiAoaGFzTGltaXQpIHtcbiAgICAgIHZhbHVlcy5wdXNoKGxpbWl0KTtcbiAgICB9XG4gICAgY29uc3Qgc2tpcFBhdHRlcm4gPSBoYXNTa2lwID8gYE9GRlNFVCAkJHt2YWx1ZXMubGVuZ3RoICsgMX1gIDogJyc7XG4gICAgaWYgKGhhc1NraXApIHtcbiAgICAgIHZhbHVlcy5wdXNoKHNraXApO1xuICAgIH1cblxuICAgIGxldCBzb3J0UGF0dGVybiA9ICcnO1xuICAgIGlmIChzb3J0KSB7XG4gICAgICBjb25zdCBzb3J0Q29weTogYW55ID0gc29ydDtcbiAgICAgIGNvbnN0IHNvcnRpbmcgPSBPYmplY3Qua2V5cyhzb3J0KVxuICAgICAgICAubWFwKGtleSA9PiB7XG4gICAgICAgICAgY29uc3QgdHJhbnNmb3JtS2V5ID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoa2V5KS5qb2luKCctPicpO1xuICAgICAgICAgIC8vIFVzaW5nICRpZHggcGF0dGVybiBnaXZlczogIG5vbi1pbnRlZ2VyIGNvbnN0YW50IGluIE9SREVSIEJZXG4gICAgICAgICAgaWYgKHNvcnRDb3B5W2tleV0gPT09IDEpIHtcbiAgICAgICAgICAgIHJldHVybiBgJHt0cmFuc2Zvcm1LZXl9IEFTQ2A7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBgJHt0cmFuc2Zvcm1LZXl9IERFU0NgO1xuICAgICAgICB9KVxuICAgICAgICAuam9pbigpO1xuICAgICAgc29ydFBhdHRlcm4gPVxuICAgICAgICBzb3J0ICE9PSB1bmRlZmluZWQgJiYgT2JqZWN0LmtleXMoc29ydCkubGVuZ3RoID4gMFxuICAgICAgICAgID8gYE9SREVSIEJZICR7c29ydGluZ31gXG4gICAgICAgICAgOiAnJztcbiAgICB9XG4gICAgaWYgKHdoZXJlLnNvcnRzICYmIE9iamVjdC5rZXlzKCh3aGVyZS5zb3J0czogYW55KSkubGVuZ3RoID4gMCkge1xuICAgICAgc29ydFBhdHRlcm4gPSBgT1JERVIgQlkgJHt3aGVyZS5zb3J0cy5qb2luKCl9YDtcbiAgICB9XG5cbiAgICBsZXQgY29sdW1ucyA9ICcqJztcbiAgICBpZiAoa2V5cykge1xuICAgICAgLy8gRXhjbHVkZSBlbXB0eSBrZXlzXG4gICAgICAvLyBSZXBsYWNlIEFDTCBieSBpdCdzIGtleXNcbiAgICAgIGtleXMgPSBrZXlzLnJlZHVjZSgobWVtbywga2V5KSA9PiB7XG4gICAgICAgIGlmIChrZXkgPT09ICdBQ0wnKSB7XG4gICAgICAgICAgbWVtby5wdXNoKCdfcnBlcm0nKTtcbiAgICAgICAgICBtZW1vLnB1c2goJ193cGVybScpO1xuICAgICAgICB9IGVsc2UgaWYgKGtleS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgbWVtby5wdXNoKGtleSk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICB9LCBbXSk7XG4gICAgICBjb2x1bW5zID0ga2V5c1xuICAgICAgICAubWFwKChrZXksIGluZGV4KSA9PiB7XG4gICAgICAgICAgaWYgKGtleSA9PT0gJyRzY29yZScpIHtcbiAgICAgICAgICAgIHJldHVybiBgdHNfcmFua19jZCh0b190c3ZlY3RvcigkJHsyfSwgJCR7M306bmFtZSksIHRvX3RzcXVlcnkoJCR7NH0sICQkezV9KSwgMzIpIGFzIHNjb3JlYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIGAkJHtpbmRleCArIHZhbHVlcy5sZW5ndGggKyAxfTpuYW1lYDtcbiAgICAgICAgfSlcbiAgICAgICAgLmpvaW4oKTtcbiAgICAgIHZhbHVlcyA9IHZhbHVlcy5jb25jYXQoa2V5cyk7XG4gICAgfVxuXG4gICAgY29uc3QgcXMgPSBgU0VMRUNUICR7Y29sdW1uc30gRlJPTSAkMTpuYW1lICR7d2hlcmVQYXR0ZXJufSAke3NvcnRQYXR0ZXJufSAke2xpbWl0UGF0dGVybn0gJHtza2lwUGF0dGVybn1gO1xuICAgIGRlYnVnKHFzLCB2YWx1ZXMpO1xuICAgIHJldHVybiB0aGlzLl9jbGllbnRcbiAgICAgIC5hbnkocXMsIHZhbHVlcylcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIC8vIFF1ZXJ5IG9uIG5vbiBleGlzdGluZyB0YWJsZSwgZG9uJ3QgY3Jhc2hcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBbXTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+XG4gICAgICAgIHJlc3VsdHMubWFwKG9iamVjdCA9PlxuICAgICAgICAgIHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpXG4gICAgICAgIClcbiAgICAgICk7XG4gIH1cblxuICAvLyBDb252ZXJ0cyBmcm9tIGEgcG9zdGdyZXMtZm9ybWF0IG9iamVjdCB0byBhIFJFU1QtZm9ybWF0IG9iamVjdC5cbiAgLy8gRG9lcyBub3Qgc3RyaXAgb3V0IGFueXRoaW5nIGJhc2VkIG9uIGEgbGFjayBvZiBhdXRoZW50aWNhdGlvbi5cbiAgcG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3Q6IGFueSwgc2NoZW1hOiBhbnkpIHtcbiAgICBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJyAmJiBvYmplY3RbZmllbGROYW1lXSkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBvYmplY3RJZDogb2JqZWN0W2ZpZWxkTmFtZV0sXG4gICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnUmVsYXRpb24nLFxuICAgICAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0ge1xuICAgICAgICAgIF9fdHlwZTogJ0dlb1BvaW50JyxcbiAgICAgICAgICBsYXRpdHVkZTogb2JqZWN0W2ZpZWxkTmFtZV0ueSxcbiAgICAgICAgICBsb25naXR1ZGU6IG9iamVjdFtmaWVsZE5hbWVdLngsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2x5Z29uJykge1xuICAgICAgICBsZXQgY29vcmRzID0gb2JqZWN0W2ZpZWxkTmFtZV07XG4gICAgICAgIGNvb3JkcyA9IGNvb3Jkcy5zdWJzdHIoMiwgY29vcmRzLmxlbmd0aCAtIDQpLnNwbGl0KCcpLCgnKTtcbiAgICAgICAgY29vcmRzID0gY29vcmRzLm1hcChwb2ludCA9PiB7XG4gICAgICAgICAgcmV0dXJuIFtcbiAgICAgICAgICAgIHBhcnNlRmxvYXQocG9pbnQuc3BsaXQoJywnKVsxXSksXG4gICAgICAgICAgICBwYXJzZUZsb2F0KHBvaW50LnNwbGl0KCcsJylbMF0pLFxuICAgICAgICAgIF07XG4gICAgICAgIH0pO1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX3R5cGU6ICdQb2x5Z29uJyxcbiAgICAgICAgICBjb29yZGluYXRlczogY29vcmRzLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnRmlsZScpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnRmlsZScsXG4gICAgICAgICAgbmFtZTogb2JqZWN0W2ZpZWxkTmFtZV0sXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfSk7XG4gICAgLy9UT0RPOiByZW1vdmUgdGhpcyByZWxpYW5jZSBvbiB0aGUgbW9uZ28gZm9ybWF0LiBEQiBhZGFwdGVyIHNob3VsZG4ndCBrbm93IHRoZXJlIGlzIGEgZGlmZmVyZW5jZSBiZXR3ZWVuIGNyZWF0ZWQgYXQgYW5kIGFueSBvdGhlciBkYXRlIGZpZWxkLlxuICAgIGlmIChvYmplY3QuY3JlYXRlZEF0KSB7XG4gICAgICBvYmplY3QuY3JlYXRlZEF0ID0gb2JqZWN0LmNyZWF0ZWRBdC50b0lTT1N0cmluZygpO1xuICAgIH1cbiAgICBpZiAob2JqZWN0LnVwZGF0ZWRBdCkge1xuICAgICAgb2JqZWN0LnVwZGF0ZWRBdCA9IG9iamVjdC51cGRhdGVkQXQudG9JU09TdHJpbmcoKTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5leHBpcmVzQXQpIHtcbiAgICAgIG9iamVjdC5leHBpcmVzQXQgPSB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IG9iamVjdC5leHBpcmVzQXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0KSB7XG4gICAgICBvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBvYmplY3QuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cbiAgICBpZiAob2JqZWN0Ll9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCkge1xuICAgICAgb2JqZWN0Ll9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0Ll9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdC50b0lTT1N0cmluZygpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKG9iamVjdC5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0KSB7XG4gICAgICBvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0Ll9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChvYmplY3QuX3Bhc3N3b3JkX2NoYW5nZWRfYXQpIHtcbiAgICAgIG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogb2JqZWN0Ll9wYXNzd29yZF9jaGFuZ2VkX2F0LnRvSVNPU3RyaW5nKCksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIG9iamVjdCkge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdID09PSBudWxsKSB7XG4gICAgICAgIGRlbGV0ZSBvYmplY3RbZmllbGROYW1lXTtcbiAgICAgIH1cbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgICAgb2JqZWN0W2ZpZWxkTmFtZV0gPSB7XG4gICAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgICAgaXNvOiBvYmplY3RbZmllbGROYW1lXS50b0lTT1N0cmluZygpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICAvLyBDcmVhdGUgYSB1bmlxdWUgaW5kZXguIFVuaXF1ZSBpbmRleGVzIG9uIG51bGxhYmxlIGZpZWxkcyBhcmUgbm90IGFsbG93ZWQuIFNpbmNlIHdlIGRvbid0XG4gIC8vIGN1cnJlbnRseSBrbm93IHdoaWNoIGZpZWxkcyBhcmUgbnVsbGFibGUgYW5kIHdoaWNoIGFyZW4ndCwgd2UgaWdub3JlIHRoYXQgY3JpdGVyaWEuXG4gIC8vIEFzIHN1Y2gsIHdlIHNob3VsZG4ndCBleHBvc2UgdGhpcyBmdW5jdGlvbiB0byB1c2VycyBvZiBwYXJzZSB1bnRpbCB3ZSBoYXZlIGFuIG91dC1vZi1iYW5kXG4gIC8vIFdheSBvZiBkZXRlcm1pbmluZyBpZiBhIGZpZWxkIGlzIG51bGxhYmxlLiBVbmRlZmluZWQgZG9lc24ndCBjb3VudCBhZ2FpbnN0IHVuaXF1ZW5lc3MsXG4gIC8vIHdoaWNoIGlzIHdoeSB3ZSB1c2Ugc3BhcnNlIGluZGV4ZXMuXG4gIGVuc3VyZVVuaXF1ZW5lc3MoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc2NoZW1hOiBTY2hlbWFUeXBlLFxuICAgIGZpZWxkTmFtZXM6IHN0cmluZ1tdXG4gICkge1xuICAgIC8vIFVzZSB0aGUgc2FtZSBuYW1lIGZvciBldmVyeSBlbnN1cmVVbmlxdWVuZXNzIGF0dGVtcHQsIGJlY2F1c2UgcG9zdGdyZXNcbiAgICAvLyBXaWxsIGhhcHBpbHkgY3JlYXRlIHRoZSBzYW1lIGluZGV4IHdpdGggbXVsdGlwbGUgbmFtZXMuXG4gICAgY29uc3QgY29uc3RyYWludE5hbWUgPSBgdW5pcXVlXyR7ZmllbGROYW1lcy5zb3J0KCkuam9pbignXycpfWA7XG4gICAgY29uc3QgY29uc3RyYWludFBhdHRlcm5zID0gZmllbGROYW1lcy5tYXAoXG4gICAgICAoZmllbGROYW1lLCBpbmRleCkgPT4gYCQke2luZGV4ICsgM306bmFtZWBcbiAgICApO1xuICAgIGNvbnN0IHFzID0gYEFMVEVSIFRBQkxFICQxOm5hbWUgQUREIENPTlNUUkFJTlQgJDI6bmFtZSBVTklRVUUgKCR7Y29uc3RyYWludFBhdHRlcm5zLmpvaW4oKX0pYDtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAubm9uZShxcywgW2NsYXNzTmFtZSwgY29uc3RyYWludE5hbWUsIC4uLmZpZWxkTmFtZXNdKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgIGVycm9yLmNvZGUgPT09IFBvc3RncmVzRHVwbGljYXRlUmVsYXRpb25FcnJvciAmJlxuICAgICAgICAgIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoY29uc3RyYWludE5hbWUpXG4gICAgICAgICkge1xuICAgICAgICAgIC8vIEluZGV4IGFscmVhZHkgZXhpc3RzLiBJZ25vcmUgZXJyb3IuXG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNVbmlxdWVJbmRleFZpb2xhdGlvbkVycm9yICYmXG4gICAgICAgICAgZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhjb25zdHJhaW50TmFtZSlcbiAgICAgICAgKSB7XG4gICAgICAgICAgLy8gQ2FzdCB0aGUgZXJyb3IgaW50byB0aGUgcHJvcGVyIHBhcnNlIGVycm9yXG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFLFxuICAgICAgICAgICAgJ0EgZHVwbGljYXRlIHZhbHVlIGZvciBhIGZpZWxkIHdpdGggdW5pcXVlIHZhbHVlcyB3YXMgcHJvdmlkZWQnXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICAvLyBFeGVjdXRlcyBhIGNvdW50LlxuICBjb3VudChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICByZWFkUHJlZmVyZW5jZT86IHN0cmluZyxcbiAgICBlc3RpbWF0ZT86IGJvb2xlYW4gPSB0cnVlXG4gICkge1xuICAgIGRlYnVnKCdjb3VudCcsIGNsYXNzTmFtZSwgcXVlcnksIHJlYWRQcmVmZXJlbmNlLCBlc3RpbWF0ZSk7XG4gICAgY29uc3QgdmFsdWVzID0gW2NsYXNzTmFtZV07XG4gICAgY29uc3Qgd2hlcmUgPSBidWlsZFdoZXJlQ2xhdXNlKHtcbiAgICAgIHNjaGVtYSxcbiAgICAgIHF1ZXJ5LFxuICAgICAgaW5kZXg6IDIsXG4gICAgICBpbnNlbnNpdGl2ZTogZmFsc2UsXG4gICAgfSk7XG4gICAgdmFsdWVzLnB1c2goLi4ud2hlcmUudmFsdWVzKTtcblxuICAgIGNvbnN0IHdoZXJlUGF0dGVybiA9XG4gICAgICB3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgPyBgV0hFUkUgJHt3aGVyZS5wYXR0ZXJufWAgOiAnJztcbiAgICBsZXQgcXMgPSAnJztcblxuICAgIGlmICh3aGVyZS5wYXR0ZXJuLmxlbmd0aCA+IDAgfHwgIWVzdGltYXRlKSB7XG4gICAgICBxcyA9IGBTRUxFQ1QgY291bnQoKikgRlJPTSAkMTpuYW1lICR7d2hlcmVQYXR0ZXJufWA7XG4gICAgfSBlbHNlIHtcbiAgICAgIHFzID1cbiAgICAgICAgJ1NFTEVDVCByZWx0dXBsZXMgQVMgYXBwcm94aW1hdGVfcm93X2NvdW50IEZST00gcGdfY2xhc3MgV0hFUkUgcmVsbmFtZSA9ICQxJztcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAub25lKHFzLCB2YWx1ZXMsIGEgPT4ge1xuICAgICAgICBpZiAoYS5hcHByb3hpbWF0ZV9yb3dfY291bnQgIT0gbnVsbCkge1xuICAgICAgICAgIHJldHVybiArYS5hcHByb3hpbWF0ZV9yb3dfY291bnQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuICthLmNvdW50O1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFBvc3RncmVzUmVsYXRpb25Eb2VzTm90RXhpc3RFcnJvcikge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAwO1xuICAgICAgfSk7XG4gIH1cblxuICBkaXN0aW5jdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzY2hlbWE6IFNjaGVtYVR5cGUsXG4gICAgcXVlcnk6IFF1ZXJ5VHlwZSxcbiAgICBmaWVsZE5hbWU6IHN0cmluZ1xuICApIHtcbiAgICBkZWJ1ZygnZGlzdGluY3QnLCBjbGFzc05hbWUsIHF1ZXJ5KTtcbiAgICBsZXQgZmllbGQgPSBmaWVsZE5hbWU7XG4gICAgbGV0IGNvbHVtbiA9IGZpZWxkTmFtZTtcbiAgICBjb25zdCBpc05lc3RlZCA9IGZpZWxkTmFtZS5pbmRleE9mKCcuJykgPj0gMDtcbiAgICBpZiAoaXNOZXN0ZWQpIHtcbiAgICAgIGZpZWxkID0gdHJhbnNmb3JtRG90RmllbGRUb0NvbXBvbmVudHMoZmllbGROYW1lKS5qb2luKCctPicpO1xuICAgICAgY29sdW1uID0gZmllbGROYW1lLnNwbGl0KCcuJylbMF07XG4gICAgfVxuICAgIGNvbnN0IGlzQXJyYXlGaWVsZCA9XG4gICAgICBzY2hlbWEuZmllbGRzICYmXG4gICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50eXBlID09PSAnQXJyYXknO1xuICAgIGNvbnN0IGlzUG9pbnRlckZpZWxkID1cbiAgICAgIHNjaGVtYS5maWVsZHMgJiZcbiAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdQb2ludGVyJztcbiAgICBjb25zdCB2YWx1ZXMgPSBbZmllbGQsIGNvbHVtbiwgY2xhc3NOYW1lXTtcbiAgICBjb25zdCB3aGVyZSA9IGJ1aWxkV2hlcmVDbGF1c2Uoe1xuICAgICAgc2NoZW1hLFxuICAgICAgcXVlcnksXG4gICAgICBpbmRleDogNCxcbiAgICAgIGluc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICB2YWx1ZXMucHVzaCguLi53aGVyZS52YWx1ZXMpO1xuXG4gICAgY29uc3Qgd2hlcmVQYXR0ZXJuID1cbiAgICAgIHdoZXJlLnBhdHRlcm4ubGVuZ3RoID4gMCA/IGBXSEVSRSAke3doZXJlLnBhdHRlcm59YCA6ICcnO1xuICAgIGNvbnN0IHRyYW5zZm9ybWVyID0gaXNBcnJheUZpZWxkID8gJ2pzb25iX2FycmF5X2VsZW1lbnRzJyA6ICdPTic7XG4gICAgbGV0IHFzID0gYFNFTEVDVCBESVNUSU5DVCAke3RyYW5zZm9ybWVyfSgkMTpuYW1lKSAkMjpuYW1lIEZST00gJDM6bmFtZSAke3doZXJlUGF0dGVybn1gO1xuICAgIGlmIChpc05lc3RlZCkge1xuICAgICAgcXMgPSBgU0VMRUNUIERJU1RJTkNUICR7dHJhbnNmb3JtZXJ9KCQxOnJhdykgJDI6cmF3IEZST00gJDM6bmFtZSAke3doZXJlUGF0dGVybn1gO1xuICAgIH1cbiAgICBkZWJ1ZyhxcywgdmFsdWVzKTtcbiAgICByZXR1cm4gdGhpcy5fY2xpZW50XG4gICAgICAuYW55KHFzLCB2YWx1ZXMpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PT0gUG9zdGdyZXNNaXNzaW5nQ29sdW1uRXJyb3IpIHtcbiAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH1cbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9KVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmICghaXNOZXN0ZWQpIHtcbiAgICAgICAgICByZXN1bHRzID0gcmVzdWx0cy5maWx0ZXIob2JqZWN0ID0+IG9iamVjdFtmaWVsZF0gIT09IG51bGwpO1xuICAgICAgICAgIHJldHVybiByZXN1bHRzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgICAgaWYgKCFpc1BvaW50ZXJGaWVsZCkge1xuICAgICAgICAgICAgICByZXR1cm4gb2JqZWN0W2ZpZWxkXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICBjbGFzc05hbWU6IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyxcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IG9iamVjdFtmaWVsZF0sXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGNoaWxkID0gZmllbGROYW1lLnNwbGl0KCcuJylbMV07XG4gICAgICAgIHJldHVybiByZXN1bHRzLm1hcChvYmplY3QgPT4gb2JqZWN0W2NvbHVtbl1bY2hpbGRdKTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXN1bHRzID0+XG4gICAgICAgIHJlc3VsdHMubWFwKG9iamVjdCA9PlxuICAgICAgICAgIHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgb2JqZWN0LCBzY2hlbWEpXG4gICAgICAgIClcbiAgICAgICk7XG4gIH1cblxuICBhZ2dyZWdhdGUoY2xhc3NOYW1lOiBzdHJpbmcsIHNjaGVtYTogYW55LCBwaXBlbGluZTogYW55KSB7XG4gICAgZGVidWcoJ2FnZ3JlZ2F0ZScsIGNsYXNzTmFtZSwgcGlwZWxpbmUpO1xuICAgIGNvbnN0IHZhbHVlcyA9IFtjbGFzc05hbWVdO1xuICAgIGxldCBpbmRleDogbnVtYmVyID0gMjtcbiAgICBsZXQgY29sdW1uczogc3RyaW5nW10gPSBbXTtcbiAgICBsZXQgY291bnRGaWVsZCA9IG51bGw7XG4gICAgbGV0IGdyb3VwVmFsdWVzID0gbnVsbDtcbiAgICBsZXQgd2hlcmVQYXR0ZXJuID0gJyc7XG4gICAgbGV0IGxpbWl0UGF0dGVybiA9ICcnO1xuICAgIGxldCBza2lwUGF0dGVybiA9ICcnO1xuICAgIGxldCBzb3J0UGF0dGVybiA9ICcnO1xuICAgIGxldCBncm91cFBhdHRlcm4gPSAnJztcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHBpcGVsaW5lLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb25zdCBzdGFnZSA9IHBpcGVsaW5lW2ldO1xuICAgICAgaWYgKHN0YWdlLiRncm91cCkge1xuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIGluIHN0YWdlLiRncm91cCkge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gc3RhZ2UuJGdyb3VwW2ZpZWxkXTtcbiAgICAgICAgICBpZiAodmFsdWUgPT09IG51bGwgfHwgdmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChmaWVsZCA9PT0gJ19pZCcgJiYgdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyAmJiB2YWx1ZSAhPT0gJycpIHtcbiAgICAgICAgICAgIGNvbHVtbnMucHVzaChgJCR7aW5kZXh9Om5hbWUgQVMgXCJvYmplY3RJZFwiYCk7XG4gICAgICAgICAgICBncm91cFBhdHRlcm4gPSBgR1JPVVAgQlkgJCR7aW5kZXh9Om5hbWVgO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUpKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgZmllbGQgPT09ICdfaWQnICYmXG4gICAgICAgICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICAgICAgICBPYmplY3Qua2V5cyh2YWx1ZSkubGVuZ3RoICE9PSAwXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBncm91cFZhbHVlcyA9IHZhbHVlO1xuICAgICAgICAgICAgY29uc3QgZ3JvdXBCeUZpZWxkcyA9IFtdO1xuICAgICAgICAgICAgZm9yIChjb25zdCBhbGlhcyBpbiB2YWx1ZSkge1xuICAgICAgICAgICAgICBjb25zdCBvcGVyYXRpb24gPSBPYmplY3Qua2V5cyh2YWx1ZVthbGlhc10pWzBdO1xuICAgICAgICAgICAgICBjb25zdCBzb3VyY2UgPSB0cmFuc2Zvcm1BZ2dyZWdhdGVGaWVsZCh2YWx1ZVthbGlhc11bb3BlcmF0aW9uXSk7XG4gICAgICAgICAgICAgIGlmIChtb25nb0FnZ3JlZ2F0ZVRvUG9zdGdyZXNbb3BlcmF0aW9uXSkge1xuICAgICAgICAgICAgICAgIGlmICghZ3JvdXBCeUZpZWxkcy5pbmNsdWRlcyhgXCIke3NvdXJjZX1cImApKSB7XG4gICAgICAgICAgICAgICAgICBncm91cEJ5RmllbGRzLnB1c2goYFwiJHtzb3VyY2V9XCJgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY29sdW1ucy5wdXNoKFxuICAgICAgICAgICAgICAgICAgYEVYVFJBQ1QoJHtcbiAgICAgICAgICAgICAgICAgICAgbW9uZ29BZ2dyZWdhdGVUb1Bvc3RncmVzW29wZXJhdGlvbl1cbiAgICAgICAgICAgICAgICAgIH0gRlJPTSAkJHtpbmRleH06bmFtZSBBVCBUSU1FIFpPTkUgJ1VUQycpIEFTICQke2luZGV4ICtcbiAgICAgICAgICAgICAgICAgICAgMX06bmFtZWBcbiAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHNvdXJjZSwgYWxpYXMpO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDI7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGdyb3VwUGF0dGVybiA9IGBHUk9VUCBCWSAkJHtpbmRleH06cmF3YDtcbiAgICAgICAgICAgIHZhbHVlcy5wdXNoKGdyb3VwQnlGaWVsZHMuam9pbigpKTtcbiAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgIGlmICh2YWx1ZS4kc3VtKSB7XG4gICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUuJHN1bSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYFNVTSgkJHtpbmRleH06bmFtZSkgQVMgJCR7aW5kZXggKyAxfTpuYW1lYCk7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUuJHN1bSksIGZpZWxkKTtcbiAgICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvdW50RmllbGQgPSBmaWVsZDtcbiAgICAgICAgICAgICAgICBjb2x1bW5zLnB1c2goYENPVU5UKCopIEFTICQke2luZGV4fTpuYW1lYCk7XG4gICAgICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGQpO1xuICAgICAgICAgICAgICAgIGluZGV4ICs9IDE7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWx1ZS4kbWF4KSB7XG4gICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgTUFYKCQke2luZGV4fTpuYW1lKSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUuJG1heCksIGZpZWxkKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWx1ZS4kbWluKSB7XG4gICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgTUlOKCQke2luZGV4fTpuYW1lKSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUuJG1pbiksIGZpZWxkKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICh2YWx1ZS4kYXZnKSB7XG4gICAgICAgICAgICAgIGNvbHVtbnMucHVzaChgQVZHKCQke2luZGV4fTpuYW1lKSBBUyAkJHtpbmRleCArIDF9Om5hbWVgKTtcbiAgICAgICAgICAgICAgdmFsdWVzLnB1c2godHJhbnNmb3JtQWdncmVnYXRlRmllbGQodmFsdWUuJGF2ZyksIGZpZWxkKTtcbiAgICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbHVtbnMucHVzaCgnKicpO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRwcm9qZWN0KSB7XG4gICAgICAgIGlmIChjb2x1bW5zLmluY2x1ZGVzKCcqJykpIHtcbiAgICAgICAgICBjb2x1bW5zID0gW107XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzdGFnZS4kcHJvamVjdCkge1xuICAgICAgICAgIGNvbnN0IHZhbHVlID0gc3RhZ2UuJHByb2plY3RbZmllbGRdO1xuICAgICAgICAgIGlmICh2YWx1ZSA9PT0gMSB8fCB2YWx1ZSA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgY29sdW1ucy5wdXNoKGAkJHtpbmRleH06bmFtZWApO1xuICAgICAgICAgICAgdmFsdWVzLnB1c2goZmllbGQpO1xuICAgICAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kbWF0Y2gpIHtcbiAgICAgICAgY29uc3QgcGF0dGVybnMgPSBbXTtcbiAgICAgICAgY29uc3Qgb3JPckFuZCA9IHN0YWdlLiRtYXRjaC5oYXNPd25Qcm9wZXJ0eSgnJG9yJykgPyAnIE9SICcgOiAnIEFORCAnO1xuXG4gICAgICAgIGlmIChzdGFnZS4kbWF0Y2guJG9yKSB7XG4gICAgICAgICAgY29uc3QgY29sbGFwc2UgPSB7fTtcbiAgICAgICAgICBzdGFnZS4kbWF0Y2guJG9yLmZvckVhY2goZWxlbWVudCA9PiB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBlbGVtZW50KSB7XG4gICAgICAgICAgICAgIGNvbGxhcHNlW2tleV0gPSBlbGVtZW50W2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgc3RhZ2UuJG1hdGNoID0gY29sbGFwc2U7XG4gICAgICAgIH1cbiAgICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzdGFnZS4kbWF0Y2gpIHtcbiAgICAgICAgICBjb25zdCB2YWx1ZSA9IHN0YWdlLiRtYXRjaFtmaWVsZF07XG4gICAgICAgICAgY29uc3QgbWF0Y2hQYXR0ZXJucyA9IFtdO1xuICAgICAgICAgIE9iamVjdC5rZXlzKFBhcnNlVG9Qb3NncmVzQ29tcGFyYXRvcikuZm9yRWFjaChjbXAgPT4ge1xuICAgICAgICAgICAgaWYgKHZhbHVlW2NtcF0pIHtcbiAgICAgICAgICAgICAgY29uc3QgcGdDb21wYXJhdG9yID0gUGFyc2VUb1Bvc2dyZXNDb21wYXJhdG9yW2NtcF07XG4gICAgICAgICAgICAgIG1hdGNoUGF0dGVybnMucHVzaChcbiAgICAgICAgICAgICAgICBgJCR7aW5kZXh9Om5hbWUgJHtwZ0NvbXBhcmF0b3J9ICQke2luZGV4ICsgMX1gXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIHZhbHVlcy5wdXNoKGZpZWxkLCB0b1Bvc3RncmVzVmFsdWUodmFsdWVbY21wXSkpO1xuICAgICAgICAgICAgICBpbmRleCArPSAyO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICAgIGlmIChtYXRjaFBhdHRlcm5zLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHBhdHRlcm5zLnB1c2goYCgke21hdGNoUGF0dGVybnMuam9pbignIEFORCAnKX0pYCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGRdICYmXG4gICAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlICYmXG4gICAgICAgICAgICBtYXRjaFBhdHRlcm5zLmxlbmd0aCA9PT0gMFxuICAgICAgICAgICkge1xuICAgICAgICAgICAgcGF0dGVybnMucHVzaChgJCR7aW5kZXh9Om5hbWUgPSAkJHtpbmRleCArIDF9YCk7XG4gICAgICAgICAgICB2YWx1ZXMucHVzaChmaWVsZCwgdmFsdWUpO1xuICAgICAgICAgICAgaW5kZXggKz0gMjtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgd2hlcmVQYXR0ZXJuID1cbiAgICAgICAgICBwYXR0ZXJucy5sZW5ndGggPiAwID8gYFdIRVJFICR7cGF0dGVybnMuam9pbihgICR7b3JPckFuZH0gYCl9YCA6ICcnO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRsaW1pdCkge1xuICAgICAgICBsaW1pdFBhdHRlcm4gPSBgTElNSVQgJCR7aW5kZXh9YDtcbiAgICAgICAgdmFsdWVzLnB1c2goc3RhZ2UuJGxpbWl0KTtcbiAgICAgICAgaW5kZXggKz0gMTtcbiAgICAgIH1cbiAgICAgIGlmIChzdGFnZS4kc2tpcCkge1xuICAgICAgICBza2lwUGF0dGVybiA9IGBPRkZTRVQgJCR7aW5kZXh9YDtcbiAgICAgICAgdmFsdWVzLnB1c2goc3RhZ2UuJHNraXApO1xuICAgICAgICBpbmRleCArPSAxO1xuICAgICAgfVxuICAgICAgaWYgKHN0YWdlLiRzb3J0KSB7XG4gICAgICAgIGNvbnN0IHNvcnQgPSBzdGFnZS4kc29ydDtcbiAgICAgICAgY29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKHNvcnQpO1xuICAgICAgICBjb25zdCBzb3J0aW5nID0ga2V5c1xuICAgICAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgICAgIGNvbnN0IHRyYW5zZm9ybWVyID0gc29ydFtrZXldID09PSAxID8gJ0FTQycgOiAnREVTQyc7XG4gICAgICAgICAgICBjb25zdCBvcmRlciA9IGAkJHtpbmRleH06bmFtZSAke3RyYW5zZm9ybWVyfWA7XG4gICAgICAgICAgICBpbmRleCArPSAxO1xuICAgICAgICAgICAgcmV0dXJuIG9yZGVyO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLmpvaW4oKTtcbiAgICAgICAgdmFsdWVzLnB1c2goLi4ua2V5cyk7XG4gICAgICAgIHNvcnRQYXR0ZXJuID1cbiAgICAgICAgICBzb3J0ICE9PSB1bmRlZmluZWQgJiYgc29ydGluZy5sZW5ndGggPiAwID8gYE9SREVSIEJZICR7c29ydGluZ31gIDogJyc7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgcXMgPSBgU0VMRUNUICR7Y29sdW1ucy5qb2luKCl9IEZST00gJDE6bmFtZSAke3doZXJlUGF0dGVybn0gJHtzb3J0UGF0dGVybn0gJHtsaW1pdFBhdHRlcm59ICR7c2tpcFBhdHRlcm59ICR7Z3JvdXBQYXR0ZXJufWA7XG4gICAgZGVidWcocXMsIHZhbHVlcyk7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudFxuICAgICAgLm1hcChxcywgdmFsdWVzLCBhID0+XG4gICAgICAgIHRoaXMucG9zdGdyZXNPYmplY3RUb1BhcnNlT2JqZWN0KGNsYXNzTmFtZSwgYSwgc2NoZW1hKVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIHJlc3VsdHMuZm9yRWFjaChyZXN1bHQgPT4ge1xuICAgICAgICAgIGlmICghcmVzdWx0Lmhhc093blByb3BlcnR5KCdvYmplY3RJZCcpKSB7XG4gICAgICAgICAgICByZXN1bHQub2JqZWN0SWQgPSBudWxsO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZ3JvdXBWYWx1ZXMpIHtcbiAgICAgICAgICAgIHJlc3VsdC5vYmplY3RJZCA9IHt9O1xuICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gZ3JvdXBWYWx1ZXMpIHtcbiAgICAgICAgICAgICAgcmVzdWx0Lm9iamVjdElkW2tleV0gPSByZXN1bHRba2V5XTtcbiAgICAgICAgICAgICAgZGVsZXRlIHJlc3VsdFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoY291bnRGaWVsZCkge1xuICAgICAgICAgICAgcmVzdWx0W2NvdW50RmllbGRdID0gcGFyc2VJbnQocmVzdWx0W2NvdW50RmllbGRdLCAxMCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgICB9KTtcbiAgfVxuXG4gIHBlcmZvcm1Jbml0aWFsaXphdGlvbih7IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMgfTogYW55KSB7XG4gICAgLy8gVE9ETzogVGhpcyBtZXRob2QgbmVlZHMgdG8gYmUgcmV3cml0dGVuIHRvIG1ha2UgcHJvcGVyIHVzZSBvZiBjb25uZWN0aW9ucyAoQHZpdGFseS10KVxuICAgIGRlYnVnKCdwZXJmb3JtSW5pdGlhbGl6YXRpb24nKTtcbiAgICBjb25zdCBwcm9taXNlcyA9IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMubWFwKHNjaGVtYSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jcmVhdGVUYWJsZShzY2hlbWEuY2xhc3NOYW1lLCBzY2hlbWEpXG4gICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIGVyci5jb2RlID09PSBQb3N0Z3Jlc0R1cGxpY2F0ZVJlbGF0aW9uRXJyb3IgfHxcbiAgICAgICAgICAgIGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUVcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB0aGlzLnNjaGVtYVVwZ3JhZGUoc2NoZW1hLmNsYXNzTmFtZSwgc2NoZW1hKSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gdGhpcy5fY2xpZW50LnR4KCdwZXJmb3JtLWluaXRpYWxpemF0aW9uJywgdCA9PiB7XG4gICAgICAgICAgcmV0dXJuIHQuYmF0Y2goW1xuICAgICAgICAgICAgdC5ub25lKHNxbC5taXNjLmpzb25PYmplY3RTZXRLZXlzKSxcbiAgICAgICAgICAgIHQubm9uZShzcWwuYXJyYXkuYWRkKSxcbiAgICAgICAgICAgIHQubm9uZShzcWwuYXJyYXkuYWRkVW5pcXVlKSxcbiAgICAgICAgICAgIHQubm9uZShzcWwuYXJyYXkucmVtb3ZlKSxcbiAgICAgICAgICAgIHQubm9uZShzcWwuYXJyYXkuY29udGFpbnNBbGwpLFxuICAgICAgICAgICAgdC5ub25lKHNxbC5hcnJheS5jb250YWluc0FsbFJlZ2V4KSxcbiAgICAgICAgICAgIHQubm9uZShzcWwuYXJyYXkuY29udGFpbnMpLFxuICAgICAgICAgIF0pO1xuICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAudGhlbihkYXRhID0+IHtcbiAgICAgICAgZGVidWcoYGluaXRpYWxpemF0aW9uRG9uZSBpbiAke2RhdGEuZHVyYXRpb259YCk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgY3JlYXRlSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZywgaW5kZXhlczogYW55LCBjb25uOiA/YW55KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIChjb25uIHx8IHRoaXMuX2NsaWVudCkudHgodCA9PlxuICAgICAgdC5iYXRjaChcbiAgICAgICAgaW5kZXhlcy5tYXAoaSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHQubm9uZSgnQ1JFQVRFIElOREVYICQxOm5hbWUgT04gJDI6bmFtZSAoJDM6bmFtZSknLCBbXG4gICAgICAgICAgICBpLm5hbWUsXG4gICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICBpLmtleSxcbiAgICAgICAgICBdKTtcbiAgICAgICAgfSlcbiAgICAgIClcbiAgICApO1xuICB9XG5cbiAgY3JlYXRlSW5kZXhlc0lmTmVlZGVkKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkTmFtZTogc3RyaW5nLFxuICAgIHR5cGU6IGFueSxcbiAgICBjb25uOiA/YW55XG4gICk6IFByb21pc2U8dm9pZD4ge1xuICAgIHJldHVybiAoY29ubiB8fCB0aGlzLl9jbGllbnQpLm5vbmUoXG4gICAgICAnQ1JFQVRFIElOREVYICQxOm5hbWUgT04gJDI6bmFtZSAoJDM6bmFtZSknLFxuICAgICAgW2ZpZWxkTmFtZSwgY2xhc3NOYW1lLCB0eXBlXVxuICAgICk7XG4gIH1cblxuICBkcm9wSW5kZXhlcyhjbGFzc05hbWU6IHN0cmluZywgaW5kZXhlczogYW55LCBjb25uOiBhbnkpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBxdWVyaWVzID0gaW5kZXhlcy5tYXAoaSA9PiAoe1xuICAgICAgcXVlcnk6ICdEUk9QIElOREVYICQxOm5hbWUnLFxuICAgICAgdmFsdWVzOiBpLFxuICAgIH0pKTtcbiAgICByZXR1cm4gKGNvbm4gfHwgdGhpcy5fY2xpZW50KS50eCh0ID0+XG4gICAgICB0Lm5vbmUodGhpcy5fcGdwLmhlbHBlcnMuY29uY2F0KHF1ZXJpZXMpKVxuICAgICk7XG4gIH1cblxuICBnZXRJbmRleGVzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgcXMgPSAnU0VMRUNUICogRlJPTSBwZ19pbmRleGVzIFdIRVJFIHRhYmxlbmFtZSA9ICR7Y2xhc3NOYW1lfSc7XG4gICAgcmV0dXJuIHRoaXMuX2NsaWVudC5hbnkocXMsIHsgY2xhc3NOYW1lIH0pO1xuICB9XG5cbiAgdXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gVXNlZCBmb3IgdGVzdGluZyBwdXJwb3Nlc1xuICB1cGRhdGVFc3RpbWF0ZWRDb3VudChjbGFzc05hbWU6IHN0cmluZykge1xuICAgIHJldHVybiB0aGlzLl9jbGllbnQubm9uZSgnQU5BTFlaRSAkMTpuYW1lJywgW2NsYXNzTmFtZV0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNvbnZlcnRQb2x5Z29uVG9TUUwocG9seWdvbikge1xuICBpZiAocG9seWdvbi5sZW5ndGggPCAzKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgYFBvbHlnb24gbXVzdCBoYXZlIGF0IGxlYXN0IDMgdmFsdWVzYFxuICAgICk7XG4gIH1cbiAgaWYgKFxuICAgIHBvbHlnb25bMF1bMF0gIT09IHBvbHlnb25bcG9seWdvbi5sZW5ndGggLSAxXVswXSB8fFxuICAgIHBvbHlnb25bMF1bMV0gIT09IHBvbHlnb25bcG9seWdvbi5sZW5ndGggLSAxXVsxXVxuICApIHtcbiAgICBwb2x5Z29uLnB1c2gocG9seWdvblswXSk7XG4gIH1cbiAgY29uc3QgdW5pcXVlID0gcG9seWdvbi5maWx0ZXIoKGl0ZW0sIGluZGV4LCBhcikgPT4ge1xuICAgIGxldCBmb3VuZEluZGV4ID0gLTE7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhci5sZW5ndGg7IGkgKz0gMSkge1xuICAgICAgY29uc3QgcHQgPSBhcltpXTtcbiAgICAgIGlmIChwdFswXSA9PT0gaXRlbVswXSAmJiBwdFsxXSA9PT0gaXRlbVsxXSkge1xuICAgICAgICBmb3VuZEluZGV4ID0gaTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmb3VuZEluZGV4ID09PSBpbmRleDtcbiAgfSk7XG4gIGlmICh1bmlxdWUubGVuZ3RoIDwgMykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUixcbiAgICAgICdHZW9KU09OOiBMb29wIG11c3QgaGF2ZSBhdCBsZWFzdCAzIGRpZmZlcmVudCB2ZXJ0aWNlcydcbiAgICApO1xuICB9XG4gIGNvbnN0IHBvaW50cyA9IHBvbHlnb25cbiAgICAubWFwKHBvaW50ID0+IHtcbiAgICAgIFBhcnNlLkdlb1BvaW50Ll92YWxpZGF0ZShwYXJzZUZsb2F0KHBvaW50WzFdKSwgcGFyc2VGbG9hdChwb2ludFswXSkpO1xuICAgICAgcmV0dXJuIGAoJHtwb2ludFsxXX0sICR7cG9pbnRbMF19KWA7XG4gICAgfSlcbiAgICAuam9pbignLCAnKTtcbiAgcmV0dXJuIGAoJHtwb2ludHN9KWA7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZVdoaXRlU3BhY2UocmVnZXgpIHtcbiAgaWYgKCFyZWdleC5lbmRzV2l0aCgnXFxuJykpIHtcbiAgICByZWdleCArPSAnXFxuJztcbiAgfVxuXG4gIC8vIHJlbW92ZSBub24gZXNjYXBlZCBjb21tZW50c1xuICByZXR1cm4gKFxuICAgIHJlZ2V4XG4gICAgICAucmVwbGFjZSgvKFteXFxcXF0pIy4qXFxuL2dpbSwgJyQxJylcbiAgICAgIC8vIHJlbW92ZSBsaW5lcyBzdGFydGluZyB3aXRoIGEgY29tbWVudFxuICAgICAgLnJlcGxhY2UoL14jLipcXG4vZ2ltLCAnJylcbiAgICAgIC8vIHJlbW92ZSBub24gZXNjYXBlZCB3aGl0ZXNwYWNlXG4gICAgICAucmVwbGFjZSgvKFteXFxcXF0pXFxzKy9naW0sICckMScpXG4gICAgICAvLyByZW1vdmUgd2hpdGVzcGFjZSBhdCB0aGUgYmVnaW5uaW5nIG9mIGEgbGluZVxuICAgICAgLnJlcGxhY2UoL15cXHMrLywgJycpXG4gICAgICAudHJpbSgpXG4gICk7XG59XG5cbmZ1bmN0aW9uIHByb2Nlc3NSZWdleFBhdHRlcm4ocykge1xuICBpZiAocyAmJiBzLnN0YXJ0c1dpdGgoJ14nKSkge1xuICAgIC8vIHJlZ2V4IGZvciBzdGFydHNXaXRoXG4gICAgcmV0dXJuICdeJyArIGxpdGVyYWxpemVSZWdleFBhcnQocy5zbGljZSgxKSk7XG4gIH0gZWxzZSBpZiAocyAmJiBzLmVuZHNXaXRoKCckJykpIHtcbiAgICAvLyByZWdleCBmb3IgZW5kc1dpdGhcbiAgICByZXR1cm4gbGl0ZXJhbGl6ZVJlZ2V4UGFydChzLnNsaWNlKDAsIHMubGVuZ3RoIC0gMSkpICsgJyQnO1xuICB9XG5cbiAgLy8gcmVnZXggZm9yIGNvbnRhaW5zXG4gIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHMpO1xufVxuXG5mdW5jdGlvbiBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZSkge1xuICBpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycgfHwgIXZhbHVlLnN0YXJ0c1dpdGgoJ14nKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGNvbnN0IG1hdGNoZXMgPSB2YWx1ZS5tYXRjaCgvXFxeXFxcXFEuKlxcXFxFLyk7XG4gIHJldHVybiAhIW1hdGNoZXM7XG59XG5cbmZ1bmN0aW9uIGlzQWxsVmFsdWVzUmVnZXhPck5vbmUodmFsdWVzKSB7XG4gIGlmICghdmFsdWVzIHx8ICFBcnJheS5pc0FycmF5KHZhbHVlcykgfHwgdmFsdWVzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgY29uc3QgZmlyc3RWYWx1ZXNJc1JlZ2V4ID0gaXNTdGFydHNXaXRoUmVnZXgodmFsdWVzWzBdLiRyZWdleCk7XG4gIGlmICh2YWx1ZXMubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGZpcnN0VmFsdWVzSXNSZWdleDtcbiAgfVxuXG4gIGZvciAobGV0IGkgPSAxLCBsZW5ndGggPSB2YWx1ZXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyArK2kpIHtcbiAgICBpZiAoZmlyc3RWYWx1ZXNJc1JlZ2V4ICE9PSBpc1N0YXJ0c1dpdGhSZWdleCh2YWx1ZXNbaV0uJHJlZ2V4KSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpc0FueVZhbHVlUmVnZXhTdGFydHNXaXRoKHZhbHVlcykge1xuICByZXR1cm4gdmFsdWVzLnNvbWUoZnVuY3Rpb24odmFsdWUpIHtcbiAgICByZXR1cm4gaXNTdGFydHNXaXRoUmVnZXgodmFsdWUuJHJlZ2V4KTtcbiAgfSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpIHtcbiAgcmV0dXJuIHJlbWFpbmluZ1xuICAgIC5zcGxpdCgnJylcbiAgICAubWFwKGMgPT4ge1xuICAgICAgY29uc3QgcmVnZXggPSBSZWdFeHAoJ1swLTkgXXxcXFxccHtMfScsICd1Jyk7IC8vIFN1cHBvcnQgYWxsIHVuaWNvZGUgbGV0dGVyIGNoYXJzXG4gICAgICBpZiAoYy5tYXRjaChyZWdleCkgIT09IG51bGwpIHtcbiAgICAgICAgLy8gZG9uJ3QgZXNjYXBlIGFscGhhbnVtZXJpYyBjaGFyYWN0ZXJzXG4gICAgICAgIHJldHVybiBjO1xuICAgICAgfVxuICAgICAgLy8gZXNjYXBlIGV2ZXJ5dGhpbmcgZWxzZSAoc2luZ2xlIHF1b3RlcyB3aXRoIHNpbmdsZSBxdW90ZXMsIGV2ZXJ5dGhpbmcgZWxzZSB3aXRoIGEgYmFja3NsYXNoKVxuICAgICAgcmV0dXJuIGMgPT09IGAnYCA/IGAnJ2AgOiBgXFxcXCR7Y31gO1xuICAgIH0pXG4gICAgLmpvaW4oJycpO1xufVxuXG5mdW5jdGlvbiBsaXRlcmFsaXplUmVnZXhQYXJ0KHM6IHN0cmluZykge1xuICBjb25zdCBtYXRjaGVyMSA9IC9cXFxcUSgoPyFcXFxcRSkuKilcXFxcRSQvO1xuICBjb25zdCByZXN1bHQxOiBhbnkgPSBzLm1hdGNoKG1hdGNoZXIxKTtcbiAgaWYgKHJlc3VsdDEgJiYgcmVzdWx0MS5sZW5ndGggPiAxICYmIHJlc3VsdDEuaW5kZXggPiAtMSkge1xuICAgIC8vIHByb2Nlc3MgcmVnZXggdGhhdCBoYXMgYSBiZWdpbm5pbmcgYW5kIGFuIGVuZCBzcGVjaWZpZWQgZm9yIHRoZSBsaXRlcmFsIHRleHRcbiAgICBjb25zdCBwcmVmaXggPSBzLnN1YnN0cigwLCByZXN1bHQxLmluZGV4KTtcbiAgICBjb25zdCByZW1haW5pbmcgPSByZXN1bHQxWzFdO1xuXG4gICAgcmV0dXJuIGxpdGVyYWxpemVSZWdleFBhcnQocHJlZml4KSArIGNyZWF0ZUxpdGVyYWxSZWdleChyZW1haW5pbmcpO1xuICB9XG5cbiAgLy8gcHJvY2VzcyByZWdleCB0aGF0IGhhcyBhIGJlZ2lubmluZyBzcGVjaWZpZWQgZm9yIHRoZSBsaXRlcmFsIHRleHRcbiAgY29uc3QgbWF0Y2hlcjIgPSAvXFxcXFEoKD8hXFxcXEUpLiopJC87XG4gIGNvbnN0IHJlc3VsdDI6IGFueSA9IHMubWF0Y2gobWF0Y2hlcjIpO1xuICBpZiAocmVzdWx0MiAmJiByZXN1bHQyLmxlbmd0aCA+IDEgJiYgcmVzdWx0Mi5pbmRleCA+IC0xKSB7XG4gICAgY29uc3QgcHJlZml4ID0gcy5zdWJzdHIoMCwgcmVzdWx0Mi5pbmRleCk7XG4gICAgY29uc3QgcmVtYWluaW5nID0gcmVzdWx0MlsxXTtcblxuICAgIHJldHVybiBsaXRlcmFsaXplUmVnZXhQYXJ0KHByZWZpeCkgKyBjcmVhdGVMaXRlcmFsUmVnZXgocmVtYWluaW5nKTtcbiAgfVxuXG4gIC8vIHJlbW92ZSBhbGwgaW5zdGFuY2VzIG9mIFxcUSBhbmQgXFxFIGZyb20gdGhlIHJlbWFpbmluZyB0ZXh0ICYgZXNjYXBlIHNpbmdsZSBxdW90ZXNcbiAgcmV0dXJuIHNcbiAgICAucmVwbGFjZSgvKFteXFxcXF0pKFxcXFxFKS8sICckMScpXG4gICAgLnJlcGxhY2UoLyhbXlxcXFxdKShcXFxcUSkvLCAnJDEnKVxuICAgIC5yZXBsYWNlKC9eXFxcXEUvLCAnJylcbiAgICAucmVwbGFjZSgvXlxcXFxRLywgJycpXG4gICAgLnJlcGxhY2UoLyhbXiddKScvLCBgJDEnJ2ApXG4gICAgLnJlcGxhY2UoL14nKFteJ10pLywgYCcnJDFgKTtcbn1cblxudmFyIEdlb1BvaW50Q29kZXIgPSB7XG4gIGlzVmFsaWRKU09OKHZhbHVlKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUgIT09IG51bGwgJiYgdmFsdWUuX190eXBlID09PSAnR2VvUG9pbnQnXG4gICAgKTtcbiAgfSxcbn07XG5cbmV4cG9ydCBkZWZhdWx0IFBvc3RncmVzU3RvcmFnZUFkYXB0ZXI7XG4iXX0=