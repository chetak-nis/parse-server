"use strict";

var _node = require("parse/node");

var _lodash = _interopRequireDefault(require("lodash"));

var _intersect = _interopRequireDefault(require("intersect"));

var _deepcopy = _interopRequireDefault(require("deepcopy"));

var _logger = _interopRequireDefault(require("../logger"));

var SchemaController = _interopRequireWildcard(require("./SchemaController"));

var _StorageAdapter = require("../Adapters/Storage/StorageAdapter");

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(source, true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(source).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }

function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }

function addWriteACL(query, acl) {
  const newQuery = _lodash.default.cloneDeep(query); //Can't be any existing '_wperm' query, we don't allow client queries on that, no need to $and


  newQuery._wperm = {
    $in: [null, ...acl]
  };
  return newQuery;
}

function addReadACL(query, acl) {
  const newQuery = _lodash.default.cloneDeep(query); //Can't be any existing '_rperm' query, we don't allow client queries on that, no need to $and


  newQuery._rperm = {
    $in: [null, '*', ...acl]
  };
  return newQuery;
} // Transforms a REST API formatted ACL object to our two-field mongo format.


const transformObjectACL = (_ref) => {
  let {
    ACL
  } = _ref,
      result = _objectWithoutProperties(_ref, ["ACL"]);

  if (!ACL) {
    return result;
  }

  result._wperm = [];
  result._rperm = [];

  for (const entry in ACL) {
    if (ACL[entry].read) {
      result._rperm.push(entry);
    }

    if (ACL[entry].write) {
      result._wperm.push(entry);
    }
  }

  return result;
};

const specialQuerykeys = ['$and', '$or', '$nor', '_rperm', '_wperm', '_perishable_token', '_email_verify_token', '_email_verify_token_expires_at', '_account_lockout_expires_at', '_failed_login_count', '_auth_data_anonymous'];

const isSpecialQueryKey = key => {
  return specialQuerykeys.indexOf(key) >= 0;
};

const validateQuery = (query, skipMongoDBServer13732Workaround) => {
  if (query.ACL) {
    throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Cannot query on ACL.');
  }

  if (query.$or) {
    if (query.$or instanceof Array) {
      query.$or.forEach(el => validateQuery(el, skipMongoDBServer13732Workaround));

      if (!skipMongoDBServer13732Workaround) {
        /* In MongoDB 3.2 & 3.4, $or queries which are not alone at the top
         * level of the query can not make efficient use of indexes due to a
         * long standing bug known as SERVER-13732.
         *
         * This bug was fixed in MongoDB version 3.6.
         *
         * For versions pre-3.6, the below logic produces a substantial
         * performance improvement inside the database by avoiding the bug.
         *
         * For versions 3.6 and above, there is no performance improvement and
         * the logic is unnecessary. Some query patterns are even slowed by
         * the below logic, due to the bug having been fixed and better
         * query plans being chosen.
         *
         * When versions before 3.4 are no longer supported by this project,
         * this logic, and the accompanying `skipMongoDBServer13732Workaround`
         * flag, can be removed.
         *
         * This block restructures queries in which $or is not the sole top
         * level element by moving all other top-level predicates inside every
         * subdocument of the $or predicate, allowing MongoDB's query planner
         * to make full use of the most relevant indexes.
         *
         * EG:      {$or: [{a: 1}, {a: 2}], b: 2}
         * Becomes: {$or: [{a: 1, b: 2}, {a: 2, b: 2}]}
         *
         * The only exceptions are $near and $nearSphere operators, which are
         * constrained to only 1 operator per query. As a result, these ops
         * remain at the top level
         *
         * https://jira.mongodb.org/browse/SERVER-13732
         * https://github.com/parse-community/parse-server/issues/3767
         */
        Object.keys(query).forEach(key => {
          const noCollisions = !query.$or.some(subq => subq.hasOwnProperty(key));
          let hasNears = false;

          if (query[key] != null && typeof query[key] == 'object') {
            hasNears = '$near' in query[key] || '$nearSphere' in query[key];
          }

          if (key != '$or' && noCollisions && !hasNears) {
            query.$or.forEach(subquery => {
              subquery[key] = query[key];
            });
            delete query[key];
          }
        });
        query.$or.forEach(el => validateQuery(el, skipMongoDBServer13732Workaround));
      }
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $or format - use an array value.');
    }
  }

  if (query.$and) {
    if (query.$and instanceof Array) {
      query.$and.forEach(el => validateQuery(el, skipMongoDBServer13732Workaround));
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $and format - use an array value.');
    }
  }

  if (query.$nor) {
    if (query.$nor instanceof Array && query.$nor.length > 0) {
      query.$nor.forEach(el => validateQuery(el, skipMongoDBServer13732Workaround));
    } else {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, 'Bad $nor format - use an array of at least 1 value.');
    }
  }

  Object.keys(query).forEach(key => {
    if (query && query[key] && query[key].$regex) {
      if (typeof query[key].$options === 'string') {
        if (!query[key].$options.match(/^[imxs]+$/)) {
          throw new _node.Parse.Error(_node.Parse.Error.INVALID_QUERY, `Bad $options value for query: ${query[key].$options}`);
        }
      }
    }

    if (!isSpecialQueryKey(key) && !key.match(/^[a-zA-Z][a-zA-Z0-9_\.]*$/)) {
      throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid key name: ${key}`);
    }
  });
}; // Filters out any data that shouldn't be on this REST-formatted object.


const filterSensitiveData = (isMaster, aclGroup, className, protectedFields, object) => {
  protectedFields && protectedFields.forEach(k => delete object[k]);

  if (className !== '_User' || className !== 'AdminUser') {
    return object;
  }

  object.password = object._hashed_password;
  delete object._hashed_password;
  delete object.sessionToken;

  if (isMaster) {
    return object;
  }

  delete object._email_verify_token;
  delete object._perishable_token;
  delete object._perishable_token_expires_at;
  delete object._tombstone;
  delete object._email_verify_token_expires_at;
  delete object._failed_login_count;
  delete object._account_lockout_expires_at;
  delete object._password_changed_at;
  delete object._password_history;

  if (aclGroup.indexOf(object.objectId) > -1) {
    return object;
  }

  delete object.authData;
  return object;
};

// Runs an update on the database.
// Returns a promise for an object with the new values for field
// modifications that don't know their results ahead of time, like
// 'increment'.
// Options:
//   acl:  a list of strings. If the object to be updated has an ACL,
//         one of the provided strings must provide the caller with
//         write permissions.
const specialKeysForUpdate = ['_hashed_password', '_perishable_token', '_email_verify_token', '_email_verify_token_expires_at', '_account_lockout_expires_at', '_failed_login_count', '_perishable_token_expires_at', '_password_changed_at', '_password_history'];

const isSpecialUpdateKey = key => {
  return specialKeysForUpdate.indexOf(key) >= 0;
};

function expandResultOnKeyPath(object, key, value) {
  if (key.indexOf('.') < 0) {
    object[key] = value[key];
    return object;
  }

  const path = key.split('.');
  const firstKey = path[0];
  const nextPath = path.slice(1).join('.');
  object[firstKey] = expandResultOnKeyPath(object[firstKey] || {}, nextPath, value[firstKey]);
  delete object[key];
  return object;
}

function sanitizeDatabaseResult(originalObject, result) {
  const response = {};

  if (!result) {
    return Promise.resolve(response);
  }

  Object.keys(originalObject).forEach(key => {
    const keyUpdate = originalObject[key]; // determine if that was an op

    if (keyUpdate && typeof keyUpdate === 'object' && keyUpdate.__op && ['Add', 'AddUnique', 'Remove', 'Increment'].indexOf(keyUpdate.__op) > -1) {
      // only valid ops that produce an actionable result
      // the op may have happend on a keypath
      expandResultOnKeyPath(response, key, result);
    }
  });
  return Promise.resolve(response);
}

function joinTableName(className, key) {
  return `_Join:${key}:${className}`;
}

const flattenUpdateOperatorsForCreate = object => {
  for (const key in object) {
    if (object[key] && object[key].__op) {
      switch (object[key].__op) {
        case 'Increment':
          if (typeof object[key].amount !== 'number') {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }

          object[key] = object[key].amount;
          break;

        case 'Add':
          if (!(object[key].objects instanceof Array)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }

          object[key] = object[key].objects;
          break;

        case 'AddUnique':
          if (!(object[key].objects instanceof Array)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }

          object[key] = object[key].objects;
          break;

        case 'Remove':
          if (!(object[key].objects instanceof Array)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_JSON, 'objects to add must be an array');
          }

          object[key] = [];
          break;

        case 'Delete':
          delete object[key];
          break;

        default:
          throw new _node.Parse.Error(_node.Parse.Error.COMMAND_UNAVAILABLE, `The ${object[key].__op} operator is not supported yet.`);
      }
    }
  }
};

const transformAuthData = (className, object, schema) => {
  if (object.authData && (className === '_User' || className === 'AdminUser')) {
    Object.keys(object.authData).forEach(provider => {
      const providerData = object.authData[provider];
      const fieldName = `_auth_data_${provider}`;

      if (providerData == null) {
        object[fieldName] = {
          __op: 'Delete'
        };
      } else {
        object[fieldName] = providerData;
        schema.fields[fieldName] = {
          type: 'Object'
        };
      }
    });
    delete object.authData;
  }
}; // Transforms a Database format ACL to a REST API format ACL


const untransformObjectACL = (_ref2) => {
  let {
    _rperm,
    _wperm
  } = _ref2,
      output = _objectWithoutProperties(_ref2, ["_rperm", "_wperm"]);

  if (_rperm || _wperm) {
    output.ACL = {};

    (_rperm || []).forEach(entry => {
      if (!output.ACL[entry]) {
        output.ACL[entry] = {
          read: true
        };
      } else {
        output.ACL[entry]['read'] = true;
      }
    });

    (_wperm || []).forEach(entry => {
      if (!output.ACL[entry]) {
        output.ACL[entry] = {
          write: true
        };
      } else {
        output.ACL[entry]['write'] = true;
      }
    });
  }

  return output;
};
/**
 * When querying, the fieldName may be compound, extract the root fieldName
 *     `temperature.celsius` becomes `temperature`
 * @param {string} fieldName that may be a compound field name
 * @returns {string} the root name of the field
 */


const getRootFieldName = fieldName => {
  return fieldName.split('.')[0];
};

const relationSchema = {
  fields: {
    relatedId: {
      type: 'String'
    },
    owningId: {
      type: 'String'
    }
  }
};

class DatabaseController {
  constructor(adapter, schemaCache, skipMongoDBServer13732Workaround) {
    this.adapter = adapter;
    this.schemaCache = schemaCache; // We don't want a mutable this.schema, because then you could have
    // one request that uses different schemas for different parts of
    // it. Instead, use loadSchema to get a schema.

    this.schemaPromise = null;
    this.skipMongoDBServer13732Workaround = skipMongoDBServer13732Workaround;
  }

  collectionExists(className) {
    return this.adapter.classExists(className);
  }

  purgeCollection(className) {
    return this.loadSchema().then(schemaController => schemaController.getOneSchema(className)).then(schema => this.adapter.deleteObjectsByQuery(className, schema, {}));
  }

  validateClassName(className) {
    if (!SchemaController.classNameIsValid(className)) {
      return Promise.reject(new _node.Parse.Error(_node.Parse.Error.INVALID_CLASS_NAME, 'invalid className: ' + className));
    }

    return Promise.resolve();
  } // Returns a promise for a schemaController.


  loadSchema(options = {
    clearCache: false
  }) {
    if (this.schemaPromise != null) {
      return this.schemaPromise;
    }

    this.schemaPromise = SchemaController.load(this.adapter, this.schemaCache, options);
    this.schemaPromise.then(() => delete this.schemaPromise, () => delete this.schemaPromise);
    return this.loadSchema(options);
  }

  loadSchemaIfNeeded(schemaController, options = {
    clearCache: false
  }) {
    return schemaController ? Promise.resolve(schemaController) : this.loadSchema(options);
  } // Returns a promise for the classname that is related to the given
  // classname through the key.
  // TODO: make this not in the DatabaseController interface


  redirectClassNameForKey(className, key) {
    return this.loadSchema().then(schema => {
      var t = schema.getExpectedType(className, key);

      if (t != null && typeof t !== 'string' && t.type === 'Relation') {
        return t.targetClass;
      }

      return className;
    });
  } // Uses the schema to validate the object (REST API format).
  // Returns a promise that resolves to the new schema.
  // This does not update this.schema, because in a situation like a
  // batch request, that could confuse other users of the schema.


  validateObject(className, object, query, {
    acl
  }) {
    let schema;
    const isMaster = acl === undefined;
    var aclGroup = acl || [];
    return this.loadSchema().then(s => {
      schema = s;

      if (isMaster) {
        return Promise.resolve();
      }

      return this.canAddField(schema, className, object, aclGroup);
    }).then(() => {
      return schema.validateObject(className, object, query);
    });
  }

  update(className, query, update, {
    acl,
    many,
    upsert
  } = {}, skipSanitization = false, validateOnly = false, validSchemaController) {
    const originalQuery = query;
    const originalUpdate = update; // Make a copy of the object, so we don't mutate the incoming data.

    update = (0, _deepcopy.default)(update);
    var relationUpdates = [];
    var isMaster = acl === undefined;
    var aclGroup = acl || [];
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'update')).then(() => {
        relationUpdates = this.collectRelationUpdates(className, originalQuery.objectId, update);

        if (!isMaster) {
          query = this.addPointerPermissions(schemaController, className, 'update', query, aclGroup);
        }

        if (!query) {
          return Promise.resolve();
        }

        if (acl) {
          query = addWriteACL(query, acl);
        }

        validateQuery(query, this.skipMongoDBServer13732Workaround);
        return schemaController.getOneSchema(className, true).catch(error => {
          // If the schema doesn't exist, pretend it exists with no fields. This behavior
          // will likely need revisiting.
          if (error === undefined) {
            return {
              fields: {}
            };
          }

          throw error;
        }).then(schema => {
          Object.keys(update).forEach(fieldName => {
            if (fieldName.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name for update: ${fieldName}`);
            }

            const rootFieldName = getRootFieldName(fieldName);

            if (!SchemaController.fieldNameIsValid(rootFieldName) && !isSpecialUpdateKey(rootFieldName)) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name for update: ${fieldName}`);
            }
          });

          for (const updateOperation in update) {
            if (update[updateOperation] && typeof update[updateOperation] === 'object' && Object.keys(update[updateOperation]).some(innerKey => innerKey.includes('$') || innerKey.includes('.'))) {
              throw new _node.Parse.Error(_node.Parse.Error.INVALID_NESTED_KEY, "Nested keys should not contain the '$' or '.' characters");
            }
          }

          update = transformObjectACL(update);
          transformAuthData(className, update, schema);

          if (validateOnly) {
            return this.adapter.find(className, schema, query, {}).then(result => {
              if (!result || !result.length) {
                throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
              }

              return {};
            });
          }

          if (many) {
            return this.adapter.updateObjectsByQuery(className, schema, query, update);
          } else if (upsert) {
            return this.adapter.upsertOneObject(className, schema, query, update);
          } else {
            return this.adapter.findOneAndUpdate(className, schema, query, update);
          }
        });
      }).then(result => {
        if (!result) {
          throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
        }

        if (validateOnly) {
          return result;
        }

        return this.handleRelationUpdates(className, originalQuery.objectId, update, relationUpdates).then(() => {
          return result;
        });
      }).then(result => {
        if (skipSanitization) {
          return Promise.resolve(result);
        }

        return sanitizeDatabaseResult(originalUpdate, result);
      });
    });
  } // Collect all relation-updating operations from a REST-format update.
  // Returns a list of all relation updates to perform
  // This mutates update.


  collectRelationUpdates(className, objectId, update) {
    var ops = [];
    var deleteMe = [];
    objectId = update.objectId || objectId;

    var process = (op, key) => {
      if (!op) {
        return;
      }

      if (op.__op == 'AddRelation') {
        ops.push({
          key,
          op
        });
        deleteMe.push(key);
      }

      if (op.__op == 'RemoveRelation') {
        ops.push({
          key,
          op
        });
        deleteMe.push(key);
      }

      if (op.__op == 'Batch') {
        for (var x of op.ops) {
          process(x, key);
        }
      }
    };

    for (const key in update) {
      process(update[key], key);
    }

    for (const key of deleteMe) {
      delete update[key];
    }

    return ops;
  } // Processes relation-updating operations from a REST-format update.
  // Returns a promise that resolves when all updates have been performed


  handleRelationUpdates(className, objectId, update, ops) {
    var pending = [];
    objectId = update.objectId || objectId;
    ops.forEach(({
      key,
      op
    }) => {
      if (!op) {
        return;
      }

      if (op.__op == 'AddRelation') {
        for (const object of op.objects) {
          pending.push(this.addRelation(key, className, objectId, object.objectId));
        }
      }

      if (op.__op == 'RemoveRelation') {
        for (const object of op.objects) {
          pending.push(this.removeRelation(key, className, objectId, object.objectId));
        }
      }
    });
    return Promise.all(pending);
  } // Adds a relation.
  // Returns a promise that resolves successfully iff the add was successful.


  addRelation(key, fromClassName, fromId, toId) {
    const doc = {
      relatedId: toId,
      owningId: fromId
    };
    return this.adapter.upsertOneObject(`_Join:${key}:${fromClassName}`, relationSchema, doc, doc);
  } // Removes a relation.
  // Returns a promise that resolves successfully iff the remove was
  // successful.


  removeRelation(key, fromClassName, fromId, toId) {
    var doc = {
      relatedId: toId,
      owningId: fromId
    };
    return this.adapter.deleteObjectsByQuery(`_Join:${key}:${fromClassName}`, relationSchema, doc).catch(error => {
      // We don't care if they try to delete a non-existent relation.
      if (error.code == _node.Parse.Error.OBJECT_NOT_FOUND) {
        return;
      }

      throw error;
    });
  } // Removes objects matches this query from the database.
  // Returns a promise that resolves successfully iff the object was
  // deleted.
  // Options:
  //   acl:  a list of strings. If the object to be updated has an ACL,
  //         one of the provided strings must provide the caller with
  //         write permissions.


  destroy(className, query, {
    acl
  } = {}, validSchemaController) {
    const isMaster = acl === undefined;
    const aclGroup = acl || [];
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'delete')).then(() => {
        if (!isMaster) {
          query = this.addPointerPermissions(schemaController, className, 'delete', query, aclGroup);

          if (!query) {
            throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
          }
        } // delete by query


        if (acl) {
          query = addWriteACL(query, acl);
        }

        validateQuery(query, this.skipMongoDBServer13732Workaround);
        return schemaController.getOneSchema(className).catch(error => {
          // If the schema doesn't exist, pretend it exists with no fields. This behavior
          // will likely need revisiting.
          if (error === undefined) {
            return {
              fields: {}
            };
          }

          throw error;
        }).then(parseFormatSchema => this.adapter.deleteObjectsByQuery(className, parseFormatSchema, query)).catch(error => {
          // When deleting sessions while changing passwords, don't throw an error if they don't have any sessions.
          if (className === '_Session' && error.code === _node.Parse.Error.OBJECT_NOT_FOUND) {
            return Promise.resolve({});
          }

          throw error;
        });
      });
    });
  } // Inserts an object into the database.
  // Returns a promise that resolves successfully iff the object saved.


  create(className, object, {
    acl
  } = {}, validateOnly = false, validSchemaController) {
    // Make a copy of the object, so we don't mutate the incoming data.
    const originalObject = object;
    object = transformObjectACL(object);
    object.createdAt = {
      iso: object.createdAt,
      __type: 'Date'
    };
    object.updatedAt = {
      iso: object.updatedAt,
      __type: 'Date'
    };
    var isMaster = acl === undefined;
    var aclGroup = acl || [];
    const relationUpdates = this.collectRelationUpdates(className, null, object);
    return this.validateClassName(className).then(() => this.loadSchemaIfNeeded(validSchemaController)).then(schemaController => {
      return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, 'create')).then(() => schemaController.enforceClassExists(className)).then(() => schemaController.getOneSchema(className, true)).then(schema => {
        transformAuthData(className, object, schema);
        flattenUpdateOperatorsForCreate(object);

        if (validateOnly) {
          return {};
        }

        return this.adapter.createObject(className, SchemaController.convertSchemaToAdapterSchema(schema), object);
      }).then(result => {
        if (validateOnly) {
          return originalObject;
        }

        return this.handleRelationUpdates(className, object.objectId, object, relationUpdates).then(() => {
          return sanitizeDatabaseResult(originalObject, result.ops[0]);
        });
      });
    });
  }

  canAddField(schema, className, object, aclGroup) {
    const classSchema = schema.schemaData[className];

    if (!classSchema) {
      return Promise.resolve();
    }

    const fields = Object.keys(object);
    const schemaFields = Object.keys(classSchema.fields);
    const newKeys = fields.filter(field => {
      // Skip fields that are unset
      if (object[field] && object[field].__op && object[field].__op === 'Delete') {
        return false;
      }

      return schemaFields.indexOf(field) < 0;
    });

    if (newKeys.length > 0) {
      return schema.validatePermission(className, aclGroup, 'addField');
    }

    return Promise.resolve();
  } // Won't delete collections in the system namespace

  /**
   * Delete all classes and clears the schema cache
   *
   * @param {boolean} fast set to true if it's ok to just delete rows and not indexes
   * @returns {Promise<void>} when the deletions completes
   */


  deleteEverything(fast = false) {
    this.schemaPromise = null;
    return Promise.all([this.adapter.deleteAllClasses(fast), this.schemaCache.clear()]);
  } // Returns a promise for a list of related ids given an owning id.
  // className here is the owning className.


  relatedIds(className, key, owningId, queryOptions) {
    const {
      skip,
      limit,
      sort
    } = queryOptions;
    const findOptions = {};

    if (sort && sort.createdAt && this.adapter.canSortOnJoinTables) {
      findOptions.sort = {
        _id: sort.createdAt
      };
      findOptions.limit = limit;
      findOptions.skip = skip;
      queryOptions.skip = 0;
    }

    return this.adapter.find(joinTableName(className, key), relationSchema, {
      owningId
    }, findOptions).then(results => results.map(result => result.relatedId));
  } // Returns a promise for a list of owning ids given some related ids.
  // className here is the owning className.


  owningIds(className, key, relatedIds) {
    return this.adapter.find(joinTableName(className, key), relationSchema, {
      relatedId: {
        $in: relatedIds
      }
    }, {}).then(results => results.map(result => result.owningId));
  } // Modifies query so that it no longer has $in on relation fields, or
  // equal-to-pointer constraints on relation fields.
  // Returns a promise that resolves when query is mutated


  reduceInRelation(className, query, schema) {
    // Search for an in-relation or equal-to-relation
    // Make it sequential for now, not sure of paralleization side effects
    if (query['$or']) {
      const ors = query['$or'];
      return Promise.all(ors.map((aQuery, index) => {
        return this.reduceInRelation(className, aQuery, schema).then(aQuery => {
          query['$or'][index] = aQuery;
        });
      })).then(() => {
        return Promise.resolve(query);
      });
    }

    const promises = Object.keys(query).map(key => {
      const t = schema.getExpectedType(className, key);

      if (!t || t.type !== 'Relation') {
        return Promise.resolve(query);
      }

      let queries = null;

      if (query[key] && (query[key]['$in'] || query[key]['$ne'] || query[key]['$nin'] || query[key].__type == 'Pointer')) {
        // Build the list of queries
        queries = Object.keys(query[key]).map(constraintKey => {
          let relatedIds;
          let isNegation = false;

          if (constraintKey === 'objectId') {
            relatedIds = [query[key].objectId];
          } else if (constraintKey == '$in') {
            relatedIds = query[key]['$in'].map(r => r.objectId);
          } else if (constraintKey == '$nin') {
            isNegation = true;
            relatedIds = query[key]['$nin'].map(r => r.objectId);
          } else if (constraintKey == '$ne') {
            isNegation = true;
            relatedIds = [query[key]['$ne'].objectId];
          } else {
            return;
          }

          return {
            isNegation,
            relatedIds
          };
        });
      } else {
        queries = [{
          isNegation: false,
          relatedIds: []
        }];
      } // remove the current queryKey as we don,t need it anymore


      delete query[key]; // execute each query independently to build the list of
      // $in / $nin

      const promises = queries.map(q => {
        if (!q) {
          return Promise.resolve();
        }

        return this.owningIds(className, key, q.relatedIds).then(ids => {
          if (q.isNegation) {
            this.addNotInObjectIdsIds(ids, query);
          } else {
            this.addInObjectIdsIds(ids, query);
          }

          return Promise.resolve();
        });
      });
      return Promise.all(promises).then(() => {
        return Promise.resolve();
      });
    });
    return Promise.all(promises).then(() => {
      return Promise.resolve(query);
    });
  } // Modifies query so that it no longer has $relatedTo
  // Returns a promise that resolves when query is mutated


  reduceRelationKeys(className, query, queryOptions) {
    if (query['$or']) {
      return Promise.all(query['$or'].map(aQuery => {
        return this.reduceRelationKeys(className, aQuery, queryOptions);
      }));
    }

    var relatedTo = query['$relatedTo'];

    if (relatedTo) {
      return this.relatedIds(relatedTo.object.className, relatedTo.key, relatedTo.object.objectId, queryOptions).then(ids => {
        delete query['$relatedTo'];
        this.addInObjectIdsIds(ids, query);
        return this.reduceRelationKeys(className, query, queryOptions);
      }).then(() => {});
    }
  }

  addInObjectIdsIds(ids = null, query) {
    const idsFromString = typeof query.objectId === 'string' ? [query.objectId] : null;
    const idsFromEq = query.objectId && query.objectId['$eq'] ? [query.objectId['$eq']] : null;
    const idsFromIn = query.objectId && query.objectId['$in'] ? query.objectId['$in'] : null; // -disable-next

    const allIds = [idsFromString, idsFromEq, idsFromIn, ids].filter(list => list !== null);
    const totalLength = allIds.reduce((memo, list) => memo + list.length, 0);
    let idsIntersection = [];

    if (totalLength > 125) {
      idsIntersection = _intersect.default.big(allIds);
    } else {
      idsIntersection = (0, _intersect.default)(allIds);
    } // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.


    if (!('objectId' in query)) {
      query.objectId = {
        $in: undefined
      };
    } else if (typeof query.objectId === 'string') {
      query.objectId = {
        $in: undefined,
        $eq: query.objectId
      };
    }

    query.objectId['$in'] = idsIntersection;
    return query;
  }

  addNotInObjectIdsIds(ids = [], query) {
    const idsFromNin = query.objectId && query.objectId['$nin'] ? query.objectId['$nin'] : [];
    let allIds = [...idsFromNin, ...ids].filter(list => list !== null); // make a set and spread to remove duplicates

    allIds = [...new Set(allIds)]; // Need to make sure we don't clobber existing shorthand $eq constraints on objectId.

    if (!('objectId' in query)) {
      query.objectId = {
        $nin: undefined
      };
    } else if (typeof query.objectId === 'string') {
      query.objectId = {
        $nin: undefined,
        $eq: query.objectId
      };
    }

    query.objectId['$nin'] = allIds;
    return query;
  } // Runs a query on the database.
  // Returns a promise that resolves to a list of items.
  // Options:
  //   skip    number of results to skip.
  //   limit   limit to this number of results.
  //   sort    an object where keys are the fields to sort by.
  //           the value is +1 for ascending, -1 for descending.
  //   count   run a count instead of returning results.
  //   acl     restrict this operation with an ACL for the provided array
  //           of user objectIds and roles. acl: null means no user.
  //           when this field is not present, don't do anything regarding ACLs.
  //  insensitive make string comparisons case insensitive
  // TODO: make userIds not needed here. The db adapter shouldn't know
  // anything about users, ideally. Then, improve the format of the ACL
  // arg to work like the others.


  find(className, query, {
    skip,
    limit,
    acl,
    sort = {},
    count,
    keys,
    op,
    distinct,
    pipeline,
    readPreference,
    insensitive = false
  } = {}, auth = {}, validSchemaController) {
    const isMaster = acl === undefined;
    const aclGroup = acl || [];
    op = op || (typeof query.objectId == 'string' && Object.keys(query).length === 1 ? 'get' : 'find'); // Count operation if counting

    op = count === true ? 'count' : op;
    let classExists = true;
    return this.loadSchemaIfNeeded(validSchemaController).then(schemaController => {
      //Allow volatile classes if querying with Master (for _PushStatus)
      //TODO: Move volatile classes concept into mongo adapter, postgres adapter shouldn't care
      //that api.parse.com breaks when _PushStatus exists in mongo.
      return schemaController.getOneSchema(className, isMaster).catch(error => {
        // Behavior for non-existent classes is kinda weird on Parse.com. Probably doesn't matter too much.
        // For now, pretend the class exists but has no objects,
        if (error === undefined) {
          classExists = false;
          return {
            fields: {}
          };
        }

        throw error;
      }).then(schema => {
        // Parse.com treats queries on _created_at and _updated_at as if they were queries on createdAt and updatedAt,
        // so duplicate that behavior here. If both are specified, the correct behavior to match Parse.com is to
        // use the one that appears first in the sort list.
        if (sort._created_at) {
          sort.createdAt = sort._created_at;
          delete sort._created_at;
        }

        if (sort._updated_at) {
          sort.updatedAt = sort._updated_at;
          delete sort._updated_at;
        }

        const queryOptions = {
          skip,
          limit,
          sort,
          keys,
          readPreference,
          insensitive
        };
        Object.keys(sort).forEach(fieldName => {
          if (fieldName.match(/^authData\.([a-zA-Z0-9_]+)\.id$/)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Cannot sort by ${fieldName}`);
          }

          const rootFieldName = getRootFieldName(fieldName);

          if (!SchemaController.fieldNameIsValid(rootFieldName)) {
            throw new _node.Parse.Error(_node.Parse.Error.INVALID_KEY_NAME, `Invalid field name: ${fieldName}.`);
          }
        });
        return (isMaster ? Promise.resolve() : schemaController.validatePermission(className, aclGroup, op)).then(() => this.reduceRelationKeys(className, query, queryOptions)).then(() => this.reduceInRelation(className, query, schemaController)).then(() => {
          let protectedFields;

          if (!isMaster) {
            query = this.addPointerPermissions(schemaController, className, op, query, aclGroup); // ProtectedFields is generated before executing the query so we
            // can optimize the query using Mongo Projection at a later stage.

            protectedFields = this.addProtectedFields(schemaController, className, query, aclGroup, auth);
          }

          if (!query) {
            if (op === 'get') {
              throw new _node.Parse.Error(_node.Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
            } else {
              return [];
            }
          }

          if (!isMaster) {
            if (op === 'update' || op === 'delete') {
              query = addWriteACL(query, aclGroup);
            } else {
              query = addReadACL(query, aclGroup);
            }
          }

          validateQuery(query, this.skipMongoDBServer13732Workaround);

          if (count) {
            if (!classExists) {
              return 0;
            } else {
              return this.adapter.count(className, schema, query, readPreference);
            }
          } else if (distinct) {
            if (!classExists) {
              return [];
            } else {
              return this.adapter.distinct(className, schema, query, distinct);
            }
          } else if (pipeline) {
            if (!classExists) {
              return [];
            } else {
              return this.adapter.aggregate(className, schema, pipeline, readPreference);
            }
          } else {
            return this.adapter.find(className, schema, query, queryOptions).then(objects => objects.map(object => {
              object = untransformObjectACL(object);
              return filterSensitiveData(isMaster, aclGroup, className, protectedFields, object);
            })).catch(error => {
              throw new _node.Parse.Error(_node.Parse.Error.INTERNAL_SERVER_ERROR, error);
            });
          }
        });
      });
    });
  }

  deleteSchema(className) {
    return this.loadSchema({
      clearCache: true
    }).then(schemaController => schemaController.getOneSchema(className, true)).catch(error => {
      if (error === undefined) {
        return {
          fields: {}
        };
      } else {
        throw error;
      }
    }).then(schema => {
      return this.collectionExists(className).then(() => this.adapter.count(className, {
        fields: {}
      }, null, '', false)).then(count => {
        if (count > 0) {
          throw new _node.Parse.Error(255, `Class ${className} is not empty, contains ${count} objects, cannot drop schema.`);
        }

        return this.adapter.deleteClass(className);
      }).then(wasParseCollection => {
        if (wasParseCollection) {
          const relationFieldNames = Object.keys(schema.fields).filter(fieldName => schema.fields[fieldName].type === 'Relation');
          return Promise.all(relationFieldNames.map(name => this.adapter.deleteClass(joinTableName(className, name)))).then(() => {
            return;
          });
        } else {
          return Promise.resolve();
        }
      });
    });
  }

  addPointerPermissions(schema, className, operation, query, aclGroup = []) {
    // Check if class has public permission for operation
    // If the BaseCLP pass, let go through
    if (schema.testPermissionsForClassName(className, aclGroup, operation)) {
      return query;
    }

    const perms = schema.getClassLevelPermissions(className);
    const field = ['get', 'find'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields';
    const userACL = aclGroup.filter(acl => {
      return acl.indexOf('role:') != 0 && acl != '*';
    }); // the ACL should have exactly 1 user

    if (perms && perms[field] && perms[field].length > 0) {
      // No user set return undefined
      // If the length is > 1, that means we didn't de-dupe users correctly
      if (userACL.length != 1) {
        return;
      }

      const userId = userACL[0];
      const userPointer = {
        __type: 'Pointer',
        className: '_User',
        objectId: userId
      };
      const permFields = perms[field];
      const ors = permFields.map(key => {
        const q = {
          [key]: userPointer
        }; // if we already have a constraint on the key, use the $and

        if (query.hasOwnProperty(key)) {
          return {
            $and: [q, query]
          };
        } // otherwise just add the constaint


        return Object.assign({}, query, {
          [`${key}`]: userPointer
        });
      });

      if (ors.length > 1) {
        return {
          $or: ors
        };
      }

      return ors[0];
    } else {
      return query;
    }
  }

  addProtectedFields(schema, className, query = {}, aclGroup = [], auth = {}) {
    const perms = schema.getClassLevelPermissions(className);
    if (!perms) return null;
    const protectedFields = perms.protectedFields;
    if (!protectedFields) return null;
    if (aclGroup.indexOf(query.objectId) > -1) return null;
    if (Object.keys(query).length === 0 && auth && auth.user && aclGroup.indexOf(auth.user.id) > -1) return null;
    let protectedKeys = Object.values(protectedFields).reduce((acc, val) => acc.concat(val), []); //.flat();

    [...(auth.userRoles || [])].forEach(role => {
      const fields = protectedFields[role];

      if (fields) {
        protectedKeys = protectedKeys.filter(v => fields.includes(v));
      }
    });
    return protectedKeys;
  } // TODO: create indexes on first creation of a _User object. Otherwise it's impossible to
  // have a Parse app without it having a _User collection.


  performInitialization() {
    const requiredUserFields = {
      fields: _objectSpread({}, SchemaController.defaultColumns._Default, {}, SchemaController.defaultColumns._User)
    };
    const requiredRoleFields = {
      fields: _objectSpread({}, SchemaController.defaultColumns._Default, {}, SchemaController.defaultColumns._Role)
    };
    const userClassPromise = this.loadSchema().then(schema => schema.enforceClassExists('_User'));
    const roleClassPromise = this.loadSchema().then(schema => schema.enforceClassExists('_Role'));
    const usernameUniqueness = userClassPromise.then(() => this.adapter.ensureUniqueness('_User', requiredUserFields, ['username'])).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for usernames: ', error);

      throw error;
    });
    const emailUniqueness = userClassPromise.then(() => this.adapter.ensureUniqueness('_User', requiredUserFields, ['email'])).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for user email addresses: ', error);

      throw error;
    });
    const roleUniqueness = roleClassPromise.then(() => this.adapter.ensureUniqueness('_Role', requiredRoleFields, ['name'])).catch(error => {
      _logger.default.warn('Unable to ensure uniqueness for role name: ', error);

      throw error;
    });
    const indexPromise = this.adapter.updateSchemaWithIndexes(); // Create tables for volatile classes

    const adapterInit = this.adapter.performInitialization({
      VolatileClassesSchemas: SchemaController.VolatileClassesSchemas
    });
    return Promise.all([usernameUniqueness, emailUniqueness, roleUniqueness, adapterInit, indexPromise]);
  }

}

module.exports = DatabaseController; // Expose validateQuery for tests

module.exports._validateQuery = validateQuery;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9EYXRhYmFzZUNvbnRyb2xsZXIuanMiXSwibmFtZXMiOlsiYWRkV3JpdGVBQ0wiLCJxdWVyeSIsImFjbCIsIm5ld1F1ZXJ5IiwiXyIsImNsb25lRGVlcCIsIl93cGVybSIsIiRpbiIsImFkZFJlYWRBQ0wiLCJfcnBlcm0iLCJ0cmFuc2Zvcm1PYmplY3RBQ0wiLCJBQ0wiLCJyZXN1bHQiLCJlbnRyeSIsInJlYWQiLCJwdXNoIiwid3JpdGUiLCJzcGVjaWFsUXVlcnlrZXlzIiwiaXNTcGVjaWFsUXVlcnlLZXkiLCJrZXkiLCJpbmRleE9mIiwidmFsaWRhdGVRdWVyeSIsInNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kIiwiUGFyc2UiLCJFcnJvciIsIklOVkFMSURfUVVFUlkiLCIkb3IiLCJBcnJheSIsImZvckVhY2giLCJlbCIsIk9iamVjdCIsImtleXMiLCJub0NvbGxpc2lvbnMiLCJzb21lIiwic3VicSIsImhhc093blByb3BlcnR5IiwiaGFzTmVhcnMiLCJzdWJxdWVyeSIsIiRhbmQiLCIkbm9yIiwibGVuZ3RoIiwiJHJlZ2V4IiwiJG9wdGlvbnMiLCJtYXRjaCIsIklOVkFMSURfS0VZX05BTUUiLCJmaWx0ZXJTZW5zaXRpdmVEYXRhIiwiaXNNYXN0ZXIiLCJhY2xHcm91cCIsImNsYXNzTmFtZSIsInByb3RlY3RlZEZpZWxkcyIsIm9iamVjdCIsImsiLCJwYXNzd29yZCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJzZXNzaW9uVG9rZW4iLCJfZW1haWxfdmVyaWZ5X3Rva2VuIiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiX3RvbWJzdG9uZSIsIl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCIsIl9mYWlsZWRfbG9naW5fY291bnQiLCJfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsIl9wYXNzd29yZF9oaXN0b3J5Iiwib2JqZWN0SWQiLCJhdXRoRGF0YSIsInNwZWNpYWxLZXlzRm9yVXBkYXRlIiwiaXNTcGVjaWFsVXBkYXRlS2V5IiwiZXhwYW5kUmVzdWx0T25LZXlQYXRoIiwidmFsdWUiLCJwYXRoIiwic3BsaXQiLCJmaXJzdEtleSIsIm5leHRQYXRoIiwic2xpY2UiLCJqb2luIiwic2FuaXRpemVEYXRhYmFzZVJlc3VsdCIsIm9yaWdpbmFsT2JqZWN0IiwicmVzcG9uc2UiLCJQcm9taXNlIiwicmVzb2x2ZSIsImtleVVwZGF0ZSIsIl9fb3AiLCJqb2luVGFibGVOYW1lIiwiZmxhdHRlblVwZGF0ZU9wZXJhdG9yc0ZvckNyZWF0ZSIsImFtb3VudCIsIklOVkFMSURfSlNPTiIsIm9iamVjdHMiLCJDT01NQU5EX1VOQVZBSUxBQkxFIiwidHJhbnNmb3JtQXV0aERhdGEiLCJzY2hlbWEiLCJwcm92aWRlciIsInByb3ZpZGVyRGF0YSIsImZpZWxkTmFtZSIsImZpZWxkcyIsInR5cGUiLCJ1bnRyYW5zZm9ybU9iamVjdEFDTCIsIm91dHB1dCIsImdldFJvb3RGaWVsZE5hbWUiLCJyZWxhdGlvblNjaGVtYSIsInJlbGF0ZWRJZCIsIm93bmluZ0lkIiwiRGF0YWJhc2VDb250cm9sbGVyIiwiY29uc3RydWN0b3IiLCJhZGFwdGVyIiwic2NoZW1hQ2FjaGUiLCJzY2hlbWFQcm9taXNlIiwiY29sbGVjdGlvbkV4aXN0cyIsImNsYXNzRXhpc3RzIiwicHVyZ2VDb2xsZWN0aW9uIiwibG9hZFNjaGVtYSIsInRoZW4iLCJzY2hlbWFDb250cm9sbGVyIiwiZ2V0T25lU2NoZW1hIiwiZGVsZXRlT2JqZWN0c0J5UXVlcnkiLCJ2YWxpZGF0ZUNsYXNzTmFtZSIsIlNjaGVtYUNvbnRyb2xsZXIiLCJjbGFzc05hbWVJc1ZhbGlkIiwicmVqZWN0IiwiSU5WQUxJRF9DTEFTU19OQU1FIiwib3B0aW9ucyIsImNsZWFyQ2FjaGUiLCJsb2FkIiwibG9hZFNjaGVtYUlmTmVlZGVkIiwicmVkaXJlY3RDbGFzc05hbWVGb3JLZXkiLCJ0IiwiZ2V0RXhwZWN0ZWRUeXBlIiwidGFyZ2V0Q2xhc3MiLCJ2YWxpZGF0ZU9iamVjdCIsInVuZGVmaW5lZCIsInMiLCJjYW5BZGRGaWVsZCIsInVwZGF0ZSIsIm1hbnkiLCJ1cHNlcnQiLCJza2lwU2FuaXRpemF0aW9uIiwidmFsaWRhdGVPbmx5IiwidmFsaWRTY2hlbWFDb250cm9sbGVyIiwib3JpZ2luYWxRdWVyeSIsIm9yaWdpbmFsVXBkYXRlIiwicmVsYXRpb25VcGRhdGVzIiwidmFsaWRhdGVQZXJtaXNzaW9uIiwiY29sbGVjdFJlbGF0aW9uVXBkYXRlcyIsImFkZFBvaW50ZXJQZXJtaXNzaW9ucyIsImNhdGNoIiwiZXJyb3IiLCJyb290RmllbGROYW1lIiwiZmllbGROYW1lSXNWYWxpZCIsInVwZGF0ZU9wZXJhdGlvbiIsImlubmVyS2V5IiwiaW5jbHVkZXMiLCJJTlZBTElEX05FU1RFRF9LRVkiLCJmaW5kIiwiT0JKRUNUX05PVF9GT1VORCIsInVwZGF0ZU9iamVjdHNCeVF1ZXJ5IiwidXBzZXJ0T25lT2JqZWN0IiwiZmluZE9uZUFuZFVwZGF0ZSIsImhhbmRsZVJlbGF0aW9uVXBkYXRlcyIsIm9wcyIsImRlbGV0ZU1lIiwicHJvY2VzcyIsIm9wIiwieCIsInBlbmRpbmciLCJhZGRSZWxhdGlvbiIsInJlbW92ZVJlbGF0aW9uIiwiYWxsIiwiZnJvbUNsYXNzTmFtZSIsImZyb21JZCIsInRvSWQiLCJkb2MiLCJjb2RlIiwiZGVzdHJveSIsInBhcnNlRm9ybWF0U2NoZW1hIiwiY3JlYXRlIiwiY3JlYXRlZEF0IiwiaXNvIiwiX190eXBlIiwidXBkYXRlZEF0IiwiZW5mb3JjZUNsYXNzRXhpc3RzIiwiY3JlYXRlT2JqZWN0IiwiY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSIsImNsYXNzU2NoZW1hIiwic2NoZW1hRGF0YSIsInNjaGVtYUZpZWxkcyIsIm5ld0tleXMiLCJmaWx0ZXIiLCJmaWVsZCIsImRlbGV0ZUV2ZXJ5dGhpbmciLCJmYXN0IiwiZGVsZXRlQWxsQ2xhc3NlcyIsImNsZWFyIiwicmVsYXRlZElkcyIsInF1ZXJ5T3B0aW9ucyIsInNraXAiLCJsaW1pdCIsInNvcnQiLCJmaW5kT3B0aW9ucyIsImNhblNvcnRPbkpvaW5UYWJsZXMiLCJfaWQiLCJyZXN1bHRzIiwibWFwIiwib3duaW5nSWRzIiwicmVkdWNlSW5SZWxhdGlvbiIsIm9ycyIsImFRdWVyeSIsImluZGV4IiwicHJvbWlzZXMiLCJxdWVyaWVzIiwiY29uc3RyYWludEtleSIsImlzTmVnYXRpb24iLCJyIiwicSIsImlkcyIsImFkZE5vdEluT2JqZWN0SWRzSWRzIiwiYWRkSW5PYmplY3RJZHNJZHMiLCJyZWR1Y2VSZWxhdGlvbktleXMiLCJyZWxhdGVkVG8iLCJpZHNGcm9tU3RyaW5nIiwiaWRzRnJvbUVxIiwiaWRzRnJvbUluIiwiYWxsSWRzIiwibGlzdCIsInRvdGFsTGVuZ3RoIiwicmVkdWNlIiwibWVtbyIsImlkc0ludGVyc2VjdGlvbiIsImludGVyc2VjdCIsImJpZyIsIiRlcSIsImlkc0Zyb21OaW4iLCJTZXQiLCIkbmluIiwiY291bnQiLCJkaXN0aW5jdCIsInBpcGVsaW5lIiwicmVhZFByZWZlcmVuY2UiLCJpbnNlbnNpdGl2ZSIsImF1dGgiLCJfY3JlYXRlZF9hdCIsIl91cGRhdGVkX2F0IiwiYWRkUHJvdGVjdGVkRmllbGRzIiwiYWdncmVnYXRlIiwiSU5URVJOQUxfU0VSVkVSX0VSUk9SIiwiZGVsZXRlU2NoZW1hIiwiZGVsZXRlQ2xhc3MiLCJ3YXNQYXJzZUNvbGxlY3Rpb24iLCJyZWxhdGlvbkZpZWxkTmFtZXMiLCJuYW1lIiwib3BlcmF0aW9uIiwidGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lIiwicGVybXMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJ1c2VyQUNMIiwidXNlcklkIiwidXNlclBvaW50ZXIiLCJwZXJtRmllbGRzIiwiYXNzaWduIiwidXNlciIsImlkIiwicHJvdGVjdGVkS2V5cyIsInZhbHVlcyIsImFjYyIsInZhbCIsImNvbmNhdCIsInVzZXJSb2xlcyIsInJvbGUiLCJ2IiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwicmVxdWlyZWRVc2VyRmllbGRzIiwiZGVmYXVsdENvbHVtbnMiLCJfRGVmYXVsdCIsIl9Vc2VyIiwicmVxdWlyZWRSb2xlRmllbGRzIiwiX1JvbGUiLCJ1c2VyQ2xhc3NQcm9taXNlIiwicm9sZUNsYXNzUHJvbWlzZSIsInVzZXJuYW1lVW5pcXVlbmVzcyIsImVuc3VyZVVuaXF1ZW5lc3MiLCJsb2dnZXIiLCJ3YXJuIiwiZW1haWxVbmlxdWVuZXNzIiwicm9sZVVuaXF1ZW5lc3MiLCJpbmRleFByb21pc2UiLCJ1cGRhdGVTY2hlbWFXaXRoSW5kZXhlcyIsImFkYXB0ZXJJbml0IiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsIm1vZHVsZSIsImV4cG9ydHMiLCJfdmFsaWRhdGVRdWVyeSJdLCJtYXBwaW5ncyI6Ijs7QUFLQTs7QUFFQTs7QUFFQTs7QUFFQTs7QUFDQTs7QUFDQTs7QUFDQTs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBTUEsU0FBU0EsV0FBVCxDQUFxQkMsS0FBckIsRUFBNEJDLEdBQTVCLEVBQWlDO0FBQy9CLFFBQU1DLFFBQVEsR0FBR0MsZ0JBQUVDLFNBQUYsQ0FBWUosS0FBWixDQUFqQixDQUQrQixDQUUvQjs7O0FBQ0FFLEVBQUFBLFFBQVEsQ0FBQ0csTUFBVCxHQUFrQjtBQUFFQyxJQUFBQSxHQUFHLEVBQUUsQ0FBQyxJQUFELEVBQU8sR0FBR0wsR0FBVjtBQUFQLEdBQWxCO0FBQ0EsU0FBT0MsUUFBUDtBQUNEOztBQUVELFNBQVNLLFVBQVQsQ0FBb0JQLEtBQXBCLEVBQTJCQyxHQUEzQixFQUFnQztBQUM5QixRQUFNQyxRQUFRLEdBQUdDLGdCQUFFQyxTQUFGLENBQVlKLEtBQVosQ0FBakIsQ0FEOEIsQ0FFOUI7OztBQUNBRSxFQUFBQSxRQUFRLENBQUNNLE1BQVQsR0FBa0I7QUFBRUYsSUFBQUEsR0FBRyxFQUFFLENBQUMsSUFBRCxFQUFPLEdBQVAsRUFBWSxHQUFHTCxHQUFmO0FBQVAsR0FBbEI7QUFDQSxTQUFPQyxRQUFQO0FBQ0QsQyxDQUVE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LEtBQTNEOztBQUNBLFlBQU1BLEtBQU47QUFDRCxLQVBvQixDQUF2QjtBQVNBLFVBQU0wSSxZQUFZLEdBQUcsS0FBS25MLE9BQUwsQ0FBYW9MLHVCQUFiLEVBQXJCLENBbkRzQixDQXFEdEI7O0FBQ0EsVUFBTUMsV0FBVyxHQUFHLEtBQUtyTCxPQUFMLENBQWFvSyxxQkFBYixDQUFtQztBQUNyRGtCLE1BQUFBLHNCQUFzQixFQUFFMUssZ0JBQWdCLENBQUMwSztBQURZLEtBQW5DLENBQXBCO0FBR0EsV0FBTy9NLE9BQU8sQ0FBQ3VGLEdBQVIsQ0FBWSxDQUNqQitHLGtCQURpQixFQUVqQkksZUFGaUIsRUFHakJDLGNBSGlCLEVBSWpCRyxXQUppQixFQUtqQkYsWUFMaUIsQ0FBWixDQUFQO0FBT0Q7O0FBaHJDc0I7O0FBcXJDekJJLE1BQU0sQ0FBQ0MsT0FBUCxHQUFpQjFMLGtCQUFqQixDLENBQ0E7O0FBQ0F5TCxNQUFNLENBQUNDLE9BQVAsQ0FBZUMsY0FBZixHQUFnQzVRLGFBQWhDIiwic291cmNlc0NvbnRlbnQiOlsi77u/Ly8gQGZsb3dcbi8vIEEgZGF0YWJhc2UgYWRhcHRlciB0aGF0IHdvcmtzIHdpdGggZGF0YSBleHBvcnRlZCBmcm9tIHRoZSBob3N0ZWRcbi8vIFBhcnNlIGRhdGFiYXNlLlxuXG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCB7IFBhcnNlIH0gZnJvbSAncGFyc2Uvbm9kZSc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBpbnRlcnNlY3QgZnJvbSAnaW50ZXJzZWN0Jztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCAqIGFzIFNjaGVtYUNvbnRyb2xsZXIgZnJvbSAnLi9TY2hlbWFDb250cm9sbGVyJztcbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgdHlwZSB7XG4gIFF1ZXJ5T3B0aW9ucyxcbiAgRnVsbFF1ZXJ5T3B0aW9ucyxcbn0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5cbmZ1bmN0aW9uIGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2wpIHtcbiAgY29uc3QgbmV3UXVlcnkgPSBfLmNsb25lRGVlcChxdWVyeSk7XG4gIC8vQ2FuJ3QgYmUgYW55IGV4aXN0aW5nICdfd3Blcm0nIHF1ZXJ5LCB3ZSBkb24ndCBhbGxvdyBjbGllbnQgcXVlcmllcyBvbiB0aGF0LCBubyBuZWVkIHRvICRhbmRcbiAgbmV3UXVlcnkuX3dwZXJtID0geyAkaW46IFtudWxsLCAuLi5hY2xdIH07XG4gIHJldHVybiBuZXdRdWVyeTtcbn1cblxuZnVuY3Rpb24gYWRkUmVhZEFDTChxdWVyeSwgYWNsKSB7XG4gIGNvbnN0IG5ld1F1ZXJ5ID0gXy5jbG9uZURlZXAocXVlcnkpO1xuICAvL0Nhbid0IGJlIGFueSBleGlzdGluZyAnX3JwZXJtJyBxdWVyeSwgd2UgZG9uJ3QgYWxsb3cgY2xpZW50IHF1ZXJpZXMgb24gdGhhdCwgbm8gbmVlZCB0byAkYW5kXG4gIG5ld1F1ZXJ5Ll9ycGVybSA9IHsgJGluOiBbbnVsbCwgJyonLCAuLi5hY2xdIH07XG4gIHJldHVybiBuZXdRdWVyeTtcbn1cblxuLy8gVHJhbnNmb3JtcyBhIFJFU1QgQVBJIGZvcm1hdHRlZCBBQ0wgb2JqZWN0IHRvIG91ciB0d28tZmllbGQgbW9uZ28gZm9ybWF0LlxuY29uc3QgdHJhbnNmb3JtT2JqZWN0QUNMID0gKHsgQUNMLCAuLi5yZXN1bHQgfSkgPT4ge1xuICBpZiAoIUFDTCkge1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICByZXN1bHQuX3dwZXJtID0gW107XG4gIHJlc3VsdC5fcnBlcm0gPSBbXTtcblxuICBmb3IgKGNvbnN0IGVudHJ5IGluIEFDTCkge1xuICAgIGlmIChBQ0xbZW50cnldLnJlYWQpIHtcbiAgICAgIHJlc3VsdC5fcnBlcm0ucHVzaChlbnRyeSk7XG4gICAgfVxuICAgIGlmIChBQ0xbZW50cnldLndyaXRlKSB7XG4gICAgICByZXN1bHQuX3dwZXJtLnB1c2goZW50cnkpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufTtcblxuY29uc3Qgc3BlY2lhbFF1ZXJ5a2V5cyA9IFtcbiAgJyRhbmQnLFxuICAnJG9yJyxcbiAgJyRub3InLFxuICAnX3JwZXJtJyxcbiAgJ193cGVybScsXG4gICdfcGVyaXNoYWJsZV90b2tlbicsXG4gICdfZW1haWxfdmVyaWZ5X3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCcsXG4gICdfYWNjb3VudF9sb2Nrb3V0X2V4cGlyZXNfYXQnLFxuICAnX2ZhaWxlZF9sb2dpbl9jb3VudCcsXG4gICdfYXV0aF9kYXRhX2Fub255bW91cycsXG5dO1xuXG5jb25zdCBpc1NwZWNpYWxRdWVyeUtleSA9IGtleSA9PiB7XG4gIHJldHVybiBzcGVjaWFsUXVlcnlrZXlzLmluZGV4T2Yoa2V5KSA+PSAwO1xufTtcblxuY29uc3QgdmFsaWRhdGVRdWVyeSA9IChcbiAgcXVlcnk6IGFueSxcbiAgc2tpcE1vbmdvREJTZXJ2ZXIxMzczMldvcmthcm91bmQ6IGJvb2xlYW5cbik6IHZvaWQgPT4ge1xuICBpZiAocXVlcnkuQUNMKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksICdDYW5ub3QgcXVlcnkgb24gQUNMLicpO1xuICB9XG5cbiAgaWYgKHF1ZXJ5LiRvcikge1xuICAgIGlmIChxdWVyeS4kb3IgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgcXVlcnkuJG9yLmZvckVhY2goZWwgPT5cbiAgICAgICAgdmFsaWRhdGVRdWVyeShlbCwgc2tpcE1vbmdvREJTZXJ2ZXIxMzczMldvcmthcm91bmQpXG4gICAgICApO1xuXG4gICAgICBpZiAoIXNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kKSB7XG4gICAgICAgIC8qIEluIE1vbmdvREIgMy4yICYgMy40LCAkb3IgcXVlcmllcyB3aGljaCBhcmUgbm90IGFsb25lIGF0IHRoZSB0b3BcbiAgICAgICAgICogbGV2ZWwgb2YgdGhlIHF1ZXJ5IGNhbiBub3QgbWFrZSBlZmZpY2llbnQgdXNlIG9mIGluZGV4ZXMgZHVlIHRvIGFcbiAgICAgICAgICogbG9uZyBzdGFuZGluZyBidWcga25vd24gYXMgU0VSVkVSLTEzNzMyLlxuICAgICAgICAgKlxuICAgICAgICAgKiBUaGlzIGJ1ZyB3YXMgZml4ZWQgaW4gTW9uZ29EQiB2ZXJzaW9uIDMuNi5cbiAgICAgICAgICpcbiAgICAgICAgICogRm9yIHZlcnNpb25zIHByZS0zLjYsIHRoZSBiZWxvdyBsb2dpYyBwcm9kdWNlcyBhIHN1YnN0YW50aWFsXG4gICAgICAgICAqIHBlcmZvcm1hbmNlIGltcHJvdmVtZW50IGluc2lkZSB0aGUgZGF0YWJhc2UgYnkgYXZvaWRpbmcgdGhlIGJ1Zy5cbiAgICAgICAgICpcbiAgICAgICAgICogRm9yIHZlcnNpb25zIDMuNiBhbmQgYWJvdmUsIHRoZXJlIGlzIG5vIHBlcmZvcm1hbmNlIGltcHJvdmVtZW50IGFuZFxuICAgICAgICAgKiB0aGUgbG9naWMgaXMgdW5uZWNlc3NhcnkuIFNvbWUgcXVlcnkgcGF0dGVybnMgYXJlIGV2ZW4gc2xvd2VkIGJ5XG4gICAgICAgICAqIHRoZSBiZWxvdyBsb2dpYywgZHVlIHRvIHRoZSBidWcgaGF2aW5nIGJlZW4gZml4ZWQgYW5kIGJldHRlclxuICAgICAgICAgKiBxdWVyeSBwbGFucyBiZWluZyBjaG9zZW4uXG4gICAgICAgICAqXG4gICAgICAgICAqIFdoZW4gdmVyc2lvbnMgYmVmb3JlIDMuNCBhcmUgbm8gbG9uZ2VyIHN1cHBvcnRlZCBieSB0aGlzIHByb2plY3QsXG4gICAgICAgICAqIHRoaXMgbG9naWMsIGFuZCB0aGUgYWNjb21wYW55aW5nIGBza2lwTW9uZ29EQlNlcnZlcjEzNzMyV29ya2Fyb3VuZGBcbiAgICAgICAgICogZmxhZywgY2FuIGJlIHJlbW92ZWQuXG4gICAgICAgICAqXG4gICAgICAgICAqIFRoaXMgYmxvY2sgcmVzdHJ1Y3R1cmVzIHF1ZXJpZXMgaW4gd2hpY2ggJG9yIGlzIG5vdCB0aGUgc29sZSB0b3BcbiAgICAgICAgICogbGV2ZWwgZWxlbWVudCBieSBtb3ZpbmcgYWxsIG90aGVyIHRvcC1sZXZlbCBwcmVkaWNhdGVzIGluc2lkZSBldmVyeVxuICAgICAgICAgKiBzdWJkb2N1bWVudCBvZiB0aGUgJG9yIHByZWRpY2F0ZSwgYWxsb3dpbmcgTW9uZ29EQidzIHF1ZXJ5IHBsYW5uZXJcbiAgICAgICAgICogdG8gbWFrZSBmdWxsIHVzZSBvZiB0aGUgbW9zdCByZWxldmFudCBpbmRleGVzLlxuICAgICAgICAgKlxuICAgICAgICAgKiBFRzogICAgICB7JG9yOiBbe2E6IDF9LCB7YTogMn1dLCBiOiAyfVxuICAgICAgICAgKiBCZWNvbWVzOiB7JG9yOiBbe2E6IDEsIGI6IDJ9LCB7YTogMiwgYjogMn1dfVxuICAgICAgICAgKlxuICAgICAgICAgKiBUaGUgb25seSBleGNlcHRpb25zIGFyZSAkbmVhciBhbmQgJG5lYXJTcGhlcmUgb3BlcmF0b3JzLCB3aGljaCBhcmVcbiAgICAgICAgICogY29uc3RyYWluZWQgdG8gb25seSAxIG9wZXJhdG9yIHBlciBxdWVyeS4gQXMgYSByZXN1bHQsIHRoZXNlIG9wc1xuICAgICAgICAgKiByZW1haW4gYXQgdGhlIHRvcCBsZXZlbFxuICAgICAgICAgKlxuICAgICAgICAgKiBodHRwczovL2ppcmEubW9uZ29kYi5vcmcvYnJvd3NlL1NFUlZFUi0xMzczMlxuICAgICAgICAgKiBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvMzc2N1xuICAgICAgICAgKi9cbiAgICAgICAgT2JqZWN0LmtleXMocXVlcnkpLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgICBjb25zdCBub0NvbGxpc2lvbnMgPSAhcXVlcnkuJG9yLnNvbWUoc3VicSA9PlxuICAgICAgICAgICAgc3VicS5oYXNPd25Qcm9wZXJ0eShrZXkpXG4gICAgICAgICAgKTtcbiAgICAgICAgICBsZXQgaGFzTmVhcnMgPSBmYWxzZTtcbiAgICAgICAgICBpZiAocXVlcnlba2V5XSAhPSBudWxsICYmIHR5cGVvZiBxdWVyeVtrZXldID09ICdvYmplY3QnKSB7XG4gICAgICAgICAgICBoYXNOZWFycyA9ICckbmVhcicgaW4gcXVlcnlba2V5XSB8fCAnJG5lYXJTcGhlcmUnIGluIHF1ZXJ5W2tleV07XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChrZXkgIT0gJyRvcicgJiYgbm9Db2xsaXNpb25zICYmICFoYXNOZWFycykge1xuICAgICAgICAgICAgcXVlcnkuJG9yLmZvckVhY2goc3VicXVlcnkgPT4ge1xuICAgICAgICAgICAgICBzdWJxdWVyeVtrZXldID0gcXVlcnlba2V5XTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgZGVsZXRlIHF1ZXJ5W2tleV07XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcXVlcnkuJG9yLmZvckVhY2goZWwgPT5cbiAgICAgICAgICB2YWxpZGF0ZVF1ZXJ5KGVsLCBza2lwTW9uZ29EQlNlcnZlcjEzNzMyV29ya2Fyb3VuZClcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgICAnQmFkICRvciBmb3JtYXQgLSB1c2UgYW4gYXJyYXkgdmFsdWUuJ1xuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBpZiAocXVlcnkuJGFuZCkge1xuICAgIGlmIChxdWVyeS4kYW5kIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgIHF1ZXJ5LiRhbmQuZm9yRWFjaChlbCA9PlxuICAgICAgICB2YWxpZGF0ZVF1ZXJ5KGVsLCBza2lwTW9uZ29EQlNlcnZlcjEzNzMyV29ya2Fyb3VuZClcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgJ0JhZCAkYW5kIGZvcm1hdCAtIHVzZSBhbiBhcnJheSB2YWx1ZS4nXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIGlmIChxdWVyeS4kbm9yKSB7XG4gICAgaWYgKHF1ZXJ5LiRub3IgaW5zdGFuY2VvZiBBcnJheSAmJiBxdWVyeS4kbm9yLmxlbmd0aCA+IDApIHtcbiAgICAgIHF1ZXJ5LiRub3IuZm9yRWFjaChlbCA9PlxuICAgICAgICB2YWxpZGF0ZVF1ZXJ5KGVsLCBza2lwTW9uZ29EQlNlcnZlcjEzNzMyV29ya2Fyb3VuZClcbiAgICAgICk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgJ0JhZCAkbm9yIGZvcm1hdCAtIHVzZSBhbiBhcnJheSBvZiBhdCBsZWFzdCAxIHZhbHVlLidcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgT2JqZWN0LmtleXMocXVlcnkpLmZvckVhY2goa2V5ID0+IHtcbiAgICBpZiAocXVlcnkgJiYgcXVlcnlba2V5XSAmJiBxdWVyeVtrZXldLiRyZWdleCkge1xuICAgICAgaWYgKHR5cGVvZiBxdWVyeVtrZXldLiRvcHRpb25zID09PSAnc3RyaW5nJykge1xuICAgICAgICBpZiAoIXF1ZXJ5W2tleV0uJG9wdGlvbnMubWF0Y2goL15baW14c10rJC8pKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICAgICAgIGBCYWQgJG9wdGlvbnMgdmFsdWUgZm9yIHF1ZXJ5OiAke3F1ZXJ5W2tleV0uJG9wdGlvbnN9YFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKCFpc1NwZWNpYWxRdWVyeUtleShrZXkpICYmICFrZXkubWF0Y2goL15bYS16QS1aXVthLXpBLVowLTlfXFwuXSokLykpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgYEludmFsaWQga2V5IG5hbWU6ICR7a2V5fWBcbiAgICAgICk7XG4gICAgfVxuICB9KTtcbn07XG5cbi8vIEZpbHRlcnMgb3V0IGFueSBkYXRhIHRoYXQgc2hvdWxkbid0IGJlIG9uIHRoaXMgUkVTVC1mb3JtYXR0ZWQgb2JqZWN0LlxuY29uc3QgZmlsdGVyU2Vuc2l0aXZlRGF0YSA9IChcbiAgaXNNYXN0ZXIsXG4gIGFjbEdyb3VwLFxuICBjbGFzc05hbWUsXG4gIHByb3RlY3RlZEZpZWxkcyxcbiAgb2JqZWN0XG4pID0+IHtcbiAgcHJvdGVjdGVkRmllbGRzICYmIHByb3RlY3RlZEZpZWxkcy5mb3JFYWNoKGsgPT4gZGVsZXRlIG9iamVjdFtrXSk7XG5cbiAgaWYgKGNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCBjbGFzc05hbWUgIT09ICdBZG1pblVzZXInKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIG9iamVjdC5wYXNzd29yZCA9IG9iamVjdC5faGFzaGVkX3Bhc3N3b3JkO1xuICBkZWxldGUgb2JqZWN0Ll9oYXNoZWRfcGFzc3dvcmQ7XG5cbiAgZGVsZXRlIG9iamVjdC5zZXNzaW9uVG9rZW47XG5cbiAgaWYgKGlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICBkZWxldGUgb2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW47XG4gIGRlbGV0ZSBvYmplY3QuX3BlcmlzaGFibGVfdG9rZW47XG4gIGRlbGV0ZSBvYmplY3QuX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdDtcbiAgZGVsZXRlIG9iamVjdC5fdG9tYnN0b25lO1xuICBkZWxldGUgb2JqZWN0Ll9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdDtcbiAgZGVsZXRlIG9iamVjdC5fZmFpbGVkX2xvZ2luX2NvdW50O1xuICBkZWxldGUgb2JqZWN0Ll9hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdDtcbiAgZGVsZXRlIG9iamVjdC5fcGFzc3dvcmRfY2hhbmdlZF9hdDtcbiAgZGVsZXRlIG9iamVjdC5fcGFzc3dvcmRfaGlzdG9yeTtcblxuICBpZiAoYWNsR3JvdXAuaW5kZXhPZihvYmplY3Qub2JqZWN0SWQpID4gLTEpIHtcbiAgICByZXR1cm4gb2JqZWN0O1xuICB9XG4gIGRlbGV0ZSBvYmplY3QuYXV0aERhdGE7XG4gIHJldHVybiBvYmplY3Q7XG59O1xuXG5pbXBvcnQgdHlwZSB7IExvYWRTY2hlbWFPcHRpb25zIH0gZnJvbSAnLi90eXBlcyc7XG5cbi8vIFJ1bnMgYW4gdXBkYXRlIG9uIHRoZSBkYXRhYmFzZS5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhbiBvYmplY3Qgd2l0aCB0aGUgbmV3IHZhbHVlcyBmb3IgZmllbGRcbi8vIG1vZGlmaWNhdGlvbnMgdGhhdCBkb24ndCBrbm93IHRoZWlyIHJlc3VsdHMgYWhlYWQgb2YgdGltZSwgbGlrZVxuLy8gJ2luY3JlbWVudCcuXG4vLyBPcHRpb25zOlxuLy8gICBhY2w6ICBhIGxpc3Qgb2Ygc3RyaW5ncy4gSWYgdGhlIG9iamVjdCB0byBiZSB1cGRhdGVkIGhhcyBhbiBBQ0wsXG4vLyAgICAgICAgIG9uZSBvZiB0aGUgcHJvdmlkZWQgc3RyaW5ncyBtdXN0IHByb3ZpZGUgdGhlIGNhbGxlciB3aXRoXG4vLyAgICAgICAgIHdyaXRlIHBlcm1pc3Npb25zLlxuY29uc3Qgc3BlY2lhbEtleXNGb3JVcGRhdGUgPSBbXG4gICdfaGFzaGVkX3Bhc3N3b3JkJyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuJyxcbiAgJ19lbWFpbF92ZXJpZnlfdG9rZW4nLFxuICAnX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0JyxcbiAgJ19hY2NvdW50X2xvY2tvdXRfZXhwaXJlc19hdCcsXG4gICdfZmFpbGVkX2xvZ2luX2NvdW50JyxcbiAgJ19wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQnLFxuICAnX3Bhc3N3b3JkX2NoYW5nZWRfYXQnLFxuICAnX3Bhc3N3b3JkX2hpc3RvcnknLFxuXTtcblxuY29uc3QgaXNTcGVjaWFsVXBkYXRlS2V5ID0ga2V5ID0+IHtcbiAgcmV0dXJuIHNwZWNpYWxLZXlzRm9yVXBkYXRlLmluZGV4T2Yoa2V5KSA+PSAwO1xufTtcblxuZnVuY3Rpb24gZXhwYW5kUmVzdWx0T25LZXlQYXRoKG9iamVjdCwga2V5LCB2YWx1ZSkge1xuICBpZiAoa2V5LmluZGV4T2YoJy4nKSA8IDApIHtcbiAgICBvYmplY3Rba2V5XSA9IHZhbHVlW2tleV07XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICBjb25zdCBwYXRoID0ga2V5LnNwbGl0KCcuJyk7XG4gIGNvbnN0IGZpcnN0S2V5ID0gcGF0aFswXTtcbiAgY29uc3QgbmV4dFBhdGggPSBwYXRoLnNsaWNlKDEpLmpvaW4oJy4nKTtcbiAgb2JqZWN0W2ZpcnN0S2V5XSA9IGV4cGFuZFJlc3VsdE9uS2V5UGF0aChcbiAgICBvYmplY3RbZmlyc3RLZXldIHx8IHt9LFxuICAgIG5leHRQYXRoLFxuICAgIHZhbHVlW2ZpcnN0S2V5XVxuICApO1xuICBkZWxldGUgb2JqZWN0W2tleV07XG4gIHJldHVybiBvYmplY3Q7XG59XG5cbmZ1bmN0aW9uIHNhbml0aXplRGF0YWJhc2VSZXN1bHQob3JpZ2luYWxPYmplY3QsIHJlc3VsdCk6IFByb21pc2U8YW55PiB7XG4gIGNvbnN0IHJlc3BvbnNlID0ge307XG4gIGlmICghcmVzdWx0KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXNwb25zZSk7XG4gIH1cbiAgT2JqZWN0LmtleXMob3JpZ2luYWxPYmplY3QpLmZvckVhY2goa2V5ID0+IHtcbiAgICBjb25zdCBrZXlVcGRhdGUgPSBvcmlnaW5hbE9iamVjdFtrZXldO1xuICAgIC8vIGRldGVybWluZSBpZiB0aGF0IHdhcyBhbiBvcFxuICAgIGlmIChcbiAgICAgIGtleVVwZGF0ZSAmJlxuICAgICAgdHlwZW9mIGtleVVwZGF0ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIGtleVVwZGF0ZS5fX29wICYmXG4gICAgICBbJ0FkZCcsICdBZGRVbmlxdWUnLCAnUmVtb3ZlJywgJ0luY3JlbWVudCddLmluZGV4T2Yoa2V5VXBkYXRlLl9fb3ApID4gLTFcbiAgICApIHtcbiAgICAgIC8vIG9ubHkgdmFsaWQgb3BzIHRoYXQgcHJvZHVjZSBhbiBhY3Rpb25hYmxlIHJlc3VsdFxuICAgICAgLy8gdGhlIG9wIG1heSBoYXZlIGhhcHBlbmQgb24gYSBrZXlwYXRoXG4gICAgICBleHBhbmRSZXN1bHRPbktleVBhdGgocmVzcG9uc2UsIGtleSwgcmVzdWx0KTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3BvbnNlKTtcbn1cblxuZnVuY3Rpb24gam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSkge1xuICByZXR1cm4gYF9Kb2luOiR7a2V5fToke2NsYXNzTmFtZX1gO1xufVxuXG5jb25zdCBmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlID0gb2JqZWN0ID0+IHtcbiAgZm9yIChjb25zdCBrZXkgaW4gb2JqZWN0KSB7XG4gICAgaWYgKG9iamVjdFtrZXldICYmIG9iamVjdFtrZXldLl9fb3ApIHtcbiAgICAgIHN3aXRjaCAob2JqZWN0W2tleV0uX19vcCkge1xuICAgICAgICBjYXNlICdJbmNyZW1lbnQnOlxuICAgICAgICAgIGlmICh0eXBlb2Ygb2JqZWN0W2tleV0uYW1vdW50ICE9PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5J1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBvYmplY3Rba2V5XS5hbW91bnQ7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ0FkZCc6XG4gICAgICAgICAgaWYgKCEob2JqZWN0W2tleV0ub2JqZWN0cyBpbnN0YW5jZW9mIEFycmF5KSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgICdvYmplY3RzIHRvIGFkZCBtdXN0IGJlIGFuIGFycmF5J1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0W2tleV0gPSBvYmplY3Rba2V5XS5vYmplY3RzO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdBZGRVbmlxdWUnOlxuICAgICAgICAgIGlmICghKG9iamVjdFtrZXldLm9iamVjdHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICAnb2JqZWN0cyB0byBhZGQgbXVzdCBiZSBhbiBhcnJheSdcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9iamVjdFtrZXldID0gb2JqZWN0W2tleV0ub2JqZWN0cztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnUmVtb3ZlJzpcbiAgICAgICAgICBpZiAoIShvYmplY3Rba2V5XS5vYmplY3RzIGluc3RhbmNlb2YgQXJyYXkpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgJ29iamVjdHMgdG8gYWRkIG11c3QgYmUgYW4gYXJyYXknXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBvYmplY3Rba2V5XSA9IFtdO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdEZWxldGUnOlxuICAgICAgICAgIGRlbGV0ZSBvYmplY3Rba2V5XTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5DT01NQU5EX1VOQVZBSUxBQkxFLFxuICAgICAgICAgICAgYFRoZSAke29iamVjdFtrZXldLl9fb3B9IG9wZXJhdG9yIGlzIG5vdCBzdXBwb3J0ZWQgeWV0LmBcbiAgICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuY29uc3QgdHJhbnNmb3JtQXV0aERhdGEgPSAoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSkgPT4ge1xuICBpZiAob2JqZWN0LmF1dGhEYXRhICYmIChjbGFzc05hbWUgPT09ICdfVXNlcicgfHwgY2xhc3NOYW1lID09PSAnQWRtaW5Vc2VyJykpIHtcbiAgICBPYmplY3Qua2V5cyhvYmplY3QuYXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgY29uc3QgcHJvdmlkZXJEYXRhID0gb2JqZWN0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIGNvbnN0IGZpZWxkTmFtZSA9IGBfYXV0aF9kYXRhXyR7cHJvdmlkZXJ9YDtcbiAgICAgIGlmIChwcm92aWRlckRhdGEgPT0gbnVsbCkge1xuICAgICAgICBvYmplY3RbZmllbGROYW1lXSA9IHtcbiAgICAgICAgICBfX29wOiAnRGVsZXRlJyxcbiAgICAgICAgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG9iamVjdFtmaWVsZE5hbWVdID0gcHJvdmlkZXJEYXRhO1xuICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0gPSB7IHR5cGU6ICdPYmplY3QnIH07XG4gICAgICB9XG4gICAgfSk7XG4gICAgZGVsZXRlIG9iamVjdC5hdXRoRGF0YTtcbiAgfVxufTtcbi8vIFRyYW5zZm9ybXMgYSBEYXRhYmFzZSBmb3JtYXQgQUNMIHRvIGEgUkVTVCBBUEkgZm9ybWF0IEFDTFxuY29uc3QgdW50cmFuc2Zvcm1PYmplY3RBQ0wgPSAoeyBfcnBlcm0sIF93cGVybSwgLi4ub3V0cHV0IH0pID0+IHtcbiAgaWYgKF9ycGVybSB8fCBfd3Blcm0pIHtcbiAgICBvdXRwdXQuQUNMID0ge307XG5cbiAgICAoX3JwZXJtIHx8IFtdKS5mb3JFYWNoKGVudHJ5ID0+IHtcbiAgICAgIGlmICghb3V0cHV0LkFDTFtlbnRyeV0pIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV0gPSB7IHJlYWQ6IHRydWUgfTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldWydyZWFkJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgKF93cGVybSB8fCBbXSkuZm9yRWFjaChlbnRyeSA9PiB7XG4gICAgICBpZiAoIW91dHB1dC5BQ0xbZW50cnldKSB7XG4gICAgICAgIG91dHB1dC5BQ0xbZW50cnldID0geyB3cml0ZTogdHJ1ZSB9O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgb3V0cHV0LkFDTFtlbnRyeV1bJ3dyaXRlJ10gPSB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBvdXRwdXQ7XG59O1xuXG4vKipcbiAqIFdoZW4gcXVlcnlpbmcsIHRoZSBmaWVsZE5hbWUgbWF5IGJlIGNvbXBvdW5kLCBleHRyYWN0IHRoZSByb290IGZpZWxkTmFtZVxuICogICAgIGB0ZW1wZXJhdHVyZS5jZWxzaXVzYCBiZWNvbWVzIGB0ZW1wZXJhdHVyZWBcbiAqIEBwYXJhbSB7c3RyaW5nfSBmaWVsZE5hbWUgdGhhdCBtYXkgYmUgYSBjb21wb3VuZCBmaWVsZCBuYW1lXG4gKiBAcmV0dXJucyB7c3RyaW5nfSB0aGUgcm9vdCBuYW1lIG9mIHRoZSBmaWVsZFxuICovXG5jb25zdCBnZXRSb290RmllbGROYW1lID0gKGZpZWxkTmFtZTogc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgcmV0dXJuIGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xufTtcblxuY29uc3QgcmVsYXRpb25TY2hlbWEgPSB7XG4gIGZpZWxkczogeyByZWxhdGVkSWQ6IHsgdHlwZTogJ1N0cmluZycgfSwgb3duaW5nSWQ6IHsgdHlwZTogJ1N0cmluZycgfSB9LFxufTtcblxuY2xhc3MgRGF0YWJhc2VDb250cm9sbGVyIHtcbiAgYWRhcHRlcjogU3RvcmFnZUFkYXB0ZXI7XG4gIHNjaGVtYUNhY2hlOiBhbnk7XG4gIHNjaGVtYVByb21pc2U6ID9Qcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj47XG4gIHNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kOiBib29sZWFuO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgIGFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyLFxuICAgIHNjaGVtYUNhY2hlOiBhbnksXG4gICAgc2tpcE1vbmdvREJTZXJ2ZXIxMzczMldvcmthcm91bmQ6IGJvb2xlYW5cbiAgKSB7XG4gICAgdGhpcy5hZGFwdGVyID0gYWRhcHRlcjtcbiAgICB0aGlzLnNjaGVtYUNhY2hlID0gc2NoZW1hQ2FjaGU7XG4gICAgLy8gV2UgZG9uJ3Qgd2FudCBhIG11dGFibGUgdGhpcy5zY2hlbWEsIGJlY2F1c2UgdGhlbiB5b3UgY291bGQgaGF2ZVxuICAgIC8vIG9uZSByZXF1ZXN0IHRoYXQgdXNlcyBkaWZmZXJlbnQgc2NoZW1hcyBmb3IgZGlmZmVyZW50IHBhcnRzIG9mXG4gICAgLy8gaXQuIEluc3RlYWQsIHVzZSBsb2FkU2NoZW1hIHRvIGdldCBhIHNjaGVtYS5cbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBudWxsO1xuICAgIHRoaXMuc2tpcE1vbmdvREJTZXJ2ZXIxMzczMldvcmthcm91bmQgPSBza2lwTW9uZ29EQlNlcnZlcjEzNzMyV29ya2Fyb3VuZDtcbiAgfVxuXG4gIGNvbGxlY3Rpb25FeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmNsYXNzRXhpc3RzKGNsYXNzTmFtZSk7XG4gIH1cblxuICBwdXJnZUNvbGxlY3Rpb24oY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKHNjaGVtYSA9PiB0aGlzLmFkYXB0ZXIuZGVsZXRlT2JqZWN0c0J5UXVlcnkoY2xhc3NOYW1lLCBzY2hlbWEsIHt9KSk7XG4gIH1cblxuICB2YWxpZGF0ZUNsYXNzTmFtZShjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghU2NoZW1hQ29udHJvbGxlci5jbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZSkpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgICAnaW52YWxpZCBjbGFzc05hbWU6ICcgKyBjbGFzc05hbWVcbiAgICAgICAgKVxuICAgICAgKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgc2NoZW1hQ29udHJvbGxlci5cbiAgbG9hZFNjaGVtYShcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIGlmICh0aGlzLnNjaGVtYVByb21pc2UgIT0gbnVsbCkge1xuICAgICAgcmV0dXJuIHRoaXMuc2NoZW1hUHJvbWlzZTtcbiAgICB9XG4gICAgdGhpcy5zY2hlbWFQcm9taXNlID0gU2NoZW1hQ29udHJvbGxlci5sb2FkKFxuICAgICAgdGhpcy5hZGFwdGVyLFxuICAgICAgdGhpcy5zY2hlbWFDYWNoZSxcbiAgICAgIG9wdGlvbnNcbiAgICApO1xuICAgIHRoaXMuc2NoZW1hUHJvbWlzZS50aGVuKFxuICAgICAgKCkgPT4gZGVsZXRlIHRoaXMuc2NoZW1hUHJvbWlzZSxcbiAgICAgICgpID0+IGRlbGV0ZSB0aGlzLnNjaGVtYVByb21pc2VcbiAgICApO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWEob3B0aW9ucyk7XG4gIH1cblxuICBsb2FkU2NoZW1hSWZOZWVkZWQoXG4gICAgc2NoZW1hQ29udHJvbGxlcjogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyPiB7XG4gICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgID8gUHJvbWlzZS5yZXNvbHZlKHNjaGVtYUNvbnRyb2xsZXIpXG4gICAgICA6IHRoaXMubG9hZFNjaGVtYShvcHRpb25zKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgY2xhc3NuYW1lIHRoYXQgaXMgcmVsYXRlZCB0byB0aGUgZ2l2ZW5cbiAgLy8gY2xhc3NuYW1lIHRocm91Z2ggdGhlIGtleS5cbiAgLy8gVE9ETzogbWFrZSB0aGlzIG5vdCBpbiB0aGUgRGF0YWJhc2VDb250cm9sbGVyIGludGVyZmFjZVxuICByZWRpcmVjdENsYXNzTmFtZUZvcktleShjbGFzc05hbWU6IHN0cmluZywga2V5OiBzdHJpbmcpOiBQcm9taXNlPD9zdHJpbmc+IHtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT4ge1xuICAgICAgdmFyIHQgPSBzY2hlbWEuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwga2V5KTtcbiAgICAgIGlmICh0ICE9IG51bGwgJiYgdHlwZW9mIHQgIT09ICdzdHJpbmcnICYmIHQudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICByZXR1cm4gdC50YXJnZXRDbGFzcztcbiAgICAgIH1cbiAgICAgIHJldHVybiBjbGFzc05hbWU7XG4gICAgfSk7XG4gIH1cblxuICAvLyBVc2VzIHRoZSBzY2hlbWEgdG8gdmFsaWRhdGUgdGhlIG9iamVjdCAoUkVTVCBBUEkgZm9ybWF0KS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byB0aGUgbmV3IHNjaGVtYS5cbiAgLy8gVGhpcyBkb2VzIG5vdCB1cGRhdGUgdGhpcy5zY2hlbWEsIGJlY2F1c2UgaW4gYSBzaXR1YXRpb24gbGlrZSBhXG4gIC8vIGJhdGNoIHJlcXVlc3QsIHRoYXQgY291bGQgY29uZnVzZSBvdGhlciB1c2VycyBvZiB0aGUgc2NoZW1hLlxuICB2YWxpZGF0ZU9iamVjdChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICBxdWVyeTogYW55LFxuICAgIHsgYWNsIH06IFF1ZXJ5T3B0aW9uc1xuICApOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBsZXQgc2NoZW1hO1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgdmFyIGFjbEdyb3VwOiBzdHJpbmdbXSA9IGFjbCB8fCBbXTtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKClcbiAgICAgIC50aGVuKHMgPT4ge1xuICAgICAgICBzY2hlbWEgPSBzO1xuICAgICAgICBpZiAoaXNNYXN0ZXIpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuY2FuQWRkRmllbGQoc2NoZW1hLCBjbGFzc05hbWUsIG9iamVjdCwgYWNsR3JvdXApO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHNjaGVtYS52YWxpZGF0ZU9iamVjdChjbGFzc05hbWUsIG9iamVjdCwgcXVlcnkpO1xuICAgICAgfSk7XG4gIH1cblxuICB1cGRhdGUoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB1cGRhdGU6IGFueSxcbiAgICB7IGFjbCwgbWFueSwgdXBzZXJ0IH06IEZ1bGxRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICBza2lwU2FuaXRpemF0aW9uOiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRhdGVPbmx5OiBib29sZWFuID0gZmFsc2UsXG4gICAgdmFsaWRTY2hlbWFDb250cm9sbGVyOiBTY2hlbWFDb250cm9sbGVyLlNjaGVtYUNvbnRyb2xsZXJcbiAgKTogUHJvbWlzZTxhbnk+IHtcbiAgICBjb25zdCBvcmlnaW5hbFF1ZXJ5ID0gcXVlcnk7XG4gICAgY29uc3Qgb3JpZ2luYWxVcGRhdGUgPSB1cGRhdGU7XG4gICAgLy8gTWFrZSBhIGNvcHkgb2YgdGhlIG9iamVjdCwgc28gd2UgZG9uJ3QgbXV0YXRlIHRoZSBpbmNvbWluZyBkYXRhLlxuICAgIHVwZGF0ZSA9IGRlZXBjb3B5KHVwZGF0ZSk7XG4gICAgdmFyIHJlbGF0aW9uVXBkYXRlcyA9IFtdO1xuICAgIHZhciBpc01hc3RlciA9IGFjbCA9PT0gdW5kZWZpbmVkO1xuICAgIHZhciBhY2xHcm91cCA9IGFjbCB8fCBbXTtcblxuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oXG4gICAgICBzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICAgID8gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgICA6IHNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICd1cGRhdGUnKVxuICAgICAgICApXG4gICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgcmVsYXRpb25VcGRhdGVzID0gdGhpcy5jb2xsZWN0UmVsYXRpb25VcGRhdGVzKFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIG9yaWdpbmFsUXVlcnkub2JqZWN0SWQsXG4gICAgICAgICAgICAgIHVwZGF0ZVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGlmICghaXNNYXN0ZXIpIHtcbiAgICAgICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAndXBkYXRlJyxcbiAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICBhY2xHcm91cFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFxdWVyeSkge1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoYWNsKSB7XG4gICAgICAgICAgICAgIHF1ZXJ5ID0gYWRkV3JpdGVBQ0wocXVlcnksIGFjbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5LCB0aGlzLnNraXBNb25nb0RCU2VydmVyMTM3MzJXb3JrYXJvdW5kKTtcbiAgICAgICAgICAgIHJldHVybiBzY2hlbWFDb250cm9sbGVyXG4gICAgICAgICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKVxuICAgICAgICAgICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAgICAgICAgIC8vIElmIHRoZSBzY2hlbWEgZG9lc24ndCBleGlzdCwgcHJldGVuZCBpdCBleGlzdHMgd2l0aCBubyBmaWVsZHMuIFRoaXMgYmVoYXZpb3JcbiAgICAgICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgICAgICAgICAgT2JqZWN0LmtleXModXBkYXRlKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgICAgICBpZiAoZmllbGROYW1lLm1hdGNoKC9eYXV0aERhdGFcXC4oW2EtekEtWjAtOV9dKylcXC5pZCQvKSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lIGZvciB1cGRhdGU6ICR7ZmllbGROYW1lfWBcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgIGNvbnN0IHJvb3RGaWVsZE5hbWUgPSBnZXRSb290RmllbGROYW1lKGZpZWxkTmFtZSk7XG4gICAgICAgICAgICAgICAgICBpZiAoXG4gICAgICAgICAgICAgICAgICAgICFTY2hlbWFDb250cm9sbGVyLmZpZWxkTmFtZUlzVmFsaWQocm9vdEZpZWxkTmFtZSkgJiZcbiAgICAgICAgICAgICAgICAgICAgIWlzU3BlY2lhbFVwZGF0ZUtleShyb290RmllbGROYW1lKVxuICAgICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgICAgICAgICAgIGBJbnZhbGlkIGZpZWxkIG5hbWUgZm9yIHVwZGF0ZTogJHtmaWVsZE5hbWV9YFxuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgdXBkYXRlT3BlcmF0aW9uIGluIHVwZGF0ZSkge1xuICAgICAgICAgICAgICAgICAgaWYgKFxuICAgICAgICAgICAgICAgICAgICB1cGRhdGVbdXBkYXRlT3BlcmF0aW9uXSAmJlxuICAgICAgICAgICAgICAgICAgICB0eXBlb2YgdXBkYXRlW3VwZGF0ZU9wZXJhdGlvbl0gPT09ICdvYmplY3QnICYmXG4gICAgICAgICAgICAgICAgICAgIE9iamVjdC5rZXlzKHVwZGF0ZVt1cGRhdGVPcGVyYXRpb25dKS5zb21lKFxuICAgICAgICAgICAgICAgICAgICAgIGlubmVyS2V5ID0+XG4gICAgICAgICAgICAgICAgICAgICAgICBpbm5lcktleS5pbmNsdWRlcygnJCcpIHx8IGlubmVyS2V5LmluY2x1ZGVzKCcuJylcbiAgICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX05FU1RFRF9LRVksXG4gICAgICAgICAgICAgICAgICAgICAgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHVwZGF0ZSA9IHRyYW5zZm9ybU9iamVjdEFDTCh1cGRhdGUpO1xuICAgICAgICAgICAgICAgIHRyYW5zZm9ybUF1dGhEYXRhKGNsYXNzTmFtZSwgdXBkYXRlLCBzY2hlbWEpO1xuICAgICAgICAgICAgICAgIGlmICh2YWxpZGF0ZU9ubHkpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgICAgICAgICAgICAgICAgLmZpbmQoY2xhc3NOYW1lLCBzY2hlbWEsIHF1ZXJ5LCB7fSlcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4ocmVzdWx0ID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICBpZiAoIXJlc3VsdCB8fCAhcmVzdWx0Lmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICAgICAgICAgICAgICAgICAnT2JqZWN0IG5vdCBmb3VuZC4nXG4gICAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ge307XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAobWFueSkge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci51cGRhdGVPYmplY3RzQnlRdWVyeShcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICB1cGRhdGVcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmICh1cHNlcnQpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIudXBzZXJ0T25lT2JqZWN0KFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIHVwZGF0ZVxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5maW5kT25lQW5kVXBkYXRlKFxuICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgIHNjaGVtYSxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIHVwZGF0ZVxuICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4oKHJlc3VsdDogYW55KSA9PiB7XG4gICAgICAgICAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAgICAgICAnT2JqZWN0IG5vdCBmb3VuZC4nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZWxhdGlvblVwZGF0ZXMoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgb3JpZ2luYWxRdWVyeS5vYmplY3RJZCxcbiAgICAgICAgICAgICAgdXBkYXRlLFxuICAgICAgICAgICAgICByZWxhdGlvblVwZGF0ZXNcbiAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICBpZiAoc2tpcFNhbml0aXphdGlvbikge1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gc2FuaXRpemVEYXRhYmFzZVJlc3VsdChvcmlnaW5hbFVwZGF0ZSwgcmVzdWx0KTtcbiAgICAgICAgICB9KTtcbiAgICAgIH1cbiAgICApO1xuICB9XG5cbiAgLy8gQ29sbGVjdCBhbGwgcmVsYXRpb24tdXBkYXRpbmcgb3BlcmF0aW9ucyBmcm9tIGEgUkVTVC1mb3JtYXQgdXBkYXRlLlxuICAvLyBSZXR1cm5zIGEgbGlzdCBvZiBhbGwgcmVsYXRpb24gdXBkYXRlcyB0byBwZXJmb3JtXG4gIC8vIFRoaXMgbXV0YXRlcyB1cGRhdGUuXG4gIGNvbGxlY3RSZWxhdGlvblVwZGF0ZXMoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdElkOiA/c3RyaW5nLCB1cGRhdGU6IGFueSkge1xuICAgIHZhciBvcHMgPSBbXTtcbiAgICB2YXIgZGVsZXRlTWUgPSBbXTtcbiAgICBvYmplY3RJZCA9IHVwZGF0ZS5vYmplY3RJZCB8fCBvYmplY3RJZDtcblxuICAgIHZhciBwcm9jZXNzID0gKG9wLCBrZXkpID0+IHtcbiAgICAgIGlmICghb3ApIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0FkZFJlbGF0aW9uJykge1xuICAgICAgICBvcHMucHVzaCh7IGtleSwgb3AgfSk7XG4gICAgICAgIGRlbGV0ZU1lLnB1c2goa2V5KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ1JlbW92ZVJlbGF0aW9uJykge1xuICAgICAgICBvcHMucHVzaCh7IGtleSwgb3AgfSk7XG4gICAgICAgIGRlbGV0ZU1lLnB1c2goa2V5KTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ0JhdGNoJykge1xuICAgICAgICBmb3IgKHZhciB4IG9mIG9wLm9wcykge1xuICAgICAgICAgIHByb2Nlc3MoeCwga2V5KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG5cbiAgICBmb3IgKGNvbnN0IGtleSBpbiB1cGRhdGUpIHtcbiAgICAgIHByb2Nlc3ModXBkYXRlW2tleV0sIGtleSk7XG4gICAgfVxuICAgIGZvciAoY29uc3Qga2V5IG9mIGRlbGV0ZU1lKSB7XG4gICAgICBkZWxldGUgdXBkYXRlW2tleV07XG4gICAgfVxuICAgIHJldHVybiBvcHM7XG4gIH1cblxuICAvLyBQcm9jZXNzZXMgcmVsYXRpb24tdXBkYXRpbmcgb3BlcmF0aW9ucyBmcm9tIGEgUkVTVC1mb3JtYXQgdXBkYXRlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gYWxsIHVwZGF0ZXMgaGF2ZSBiZWVuIHBlcmZvcm1lZFxuICBoYW5kbGVSZWxhdGlvblVwZGF0ZXMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgb2JqZWN0SWQ6IHN0cmluZyxcbiAgICB1cGRhdGU6IGFueSxcbiAgICBvcHM6IGFueVxuICApIHtcbiAgICB2YXIgcGVuZGluZyA9IFtdO1xuICAgIG9iamVjdElkID0gdXBkYXRlLm9iamVjdElkIHx8IG9iamVjdElkO1xuICAgIG9wcy5mb3JFYWNoKCh7IGtleSwgb3AgfSkgPT4ge1xuICAgICAgaWYgKCFvcCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBpZiAob3AuX19vcCA9PSAnQWRkUmVsYXRpb24nKSB7XG4gICAgICAgIGZvciAoY29uc3Qgb2JqZWN0IG9mIG9wLm9iamVjdHMpIHtcbiAgICAgICAgICBwZW5kaW5nLnB1c2goXG4gICAgICAgICAgICB0aGlzLmFkZFJlbGF0aW9uKGtleSwgY2xhc3NOYW1lLCBvYmplY3RJZCwgb2JqZWN0Lm9iamVjdElkKVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKG9wLl9fb3AgPT0gJ1JlbW92ZVJlbGF0aW9uJykge1xuICAgICAgICBmb3IgKGNvbnN0IG9iamVjdCBvZiBvcC5vYmplY3RzKSB7XG4gICAgICAgICAgcGVuZGluZy5wdXNoKFxuICAgICAgICAgICAgdGhpcy5yZW1vdmVSZWxhdGlvbihrZXksIGNsYXNzTmFtZSwgb2JqZWN0SWQsIG9iamVjdC5vYmplY3RJZClcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocGVuZGluZyk7XG4gIH1cblxuICAvLyBBZGRzIGEgcmVsYXRpb24uXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgYWRkIHdhcyBzdWNjZXNzZnVsLlxuICBhZGRSZWxhdGlvbihcbiAgICBrZXk6IHN0cmluZyxcbiAgICBmcm9tQ2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZnJvbUlkOiBzdHJpbmcsXG4gICAgdG9JZDogc3RyaW5nXG4gICkge1xuICAgIGNvbnN0IGRvYyA9IHtcbiAgICAgIHJlbGF0ZWRJZDogdG9JZCxcbiAgICAgIG93bmluZ0lkOiBmcm9tSWQsXG4gICAgfTtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyLnVwc2VydE9uZU9iamVjdChcbiAgICAgIGBfSm9pbjoke2tleX06JHtmcm9tQ2xhc3NOYW1lfWAsXG4gICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgIGRvYyxcbiAgICAgIGRvY1xuICAgICk7XG4gIH1cblxuICAvLyBSZW1vdmVzIGEgcmVsYXRpb24uXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IGlmZiB0aGUgcmVtb3ZlIHdhc1xuICAvLyBzdWNjZXNzZnVsLlxuICByZW1vdmVSZWxhdGlvbihcbiAgICBrZXk6IHN0cmluZyxcbiAgICBmcm9tQ2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZnJvbUlkOiBzdHJpbmcsXG4gICAgdG9JZDogc3RyaW5nXG4gICkge1xuICAgIHZhciBkb2MgPSB7XG4gICAgICByZWxhdGVkSWQ6IHRvSWQsXG4gICAgICBvd25pbmdJZDogZnJvbUlkLFxuICAgIH07XG4gICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgLmRlbGV0ZU9iamVjdHNCeVF1ZXJ5KFxuICAgICAgICBgX0pvaW46JHtrZXl9OiR7ZnJvbUNsYXNzTmFtZX1gLFxuICAgICAgICByZWxhdGlvblNjaGVtYSxcbiAgICAgICAgZG9jXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICAvLyBXZSBkb24ndCBjYXJlIGlmIHRoZXkgdHJ5IHRvIGRlbGV0ZSBhIG5vbi1leGlzdGVudCByZWxhdGlvbi5cbiAgICAgICAgaWYgKGVycm9yLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmVtb3ZlcyBvYmplY3RzIG1hdGNoZXMgdGhpcyBxdWVyeSBmcm9tIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBvYmplY3Qgd2FzXG4gIC8vIGRlbGV0ZWQuXG4gIC8vIE9wdGlvbnM6XG4gIC8vICAgYWNsOiAgYSBsaXN0IG9mIHN0cmluZ3MuIElmIHRoZSBvYmplY3QgdG8gYmUgdXBkYXRlZCBoYXMgYW4gQUNMLFxuICAvLyAgICAgICAgIG9uZSBvZiB0aGUgcHJvdmlkZWQgc3RyaW5ncyBtdXN0IHByb3ZpZGUgdGhlIGNhbGxlciB3aXRoXG4gIC8vICAgICAgICAgd3JpdGUgcGVybWlzc2lvbnMuXG4gIGRlc3Ryb3koXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICB7IGFjbCB9OiBRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hSWZOZWVkZWQodmFsaWRTY2hlbWFDb250cm9sbGVyKS50aGVuKFxuICAgICAgc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnZGVsZXRlJylcbiAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICBxdWVyeSA9IHRoaXMuYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgICAgICAgICAgICBzY2hlbWFDb250cm9sbGVyLFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICdkZWxldGUnLFxuICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgYWNsR3JvdXBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBpZiAoIXF1ZXJ5KSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICAgICAgICdPYmplY3Qgbm90IGZvdW5kLidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gZGVsZXRlIGJ5IHF1ZXJ5XG4gICAgICAgICAgaWYgKGFjbCkge1xuICAgICAgICAgICAgcXVlcnkgPSBhZGRXcml0ZUFDTChxdWVyeSwgYWNsKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSwgdGhpcy5za2lwTW9uZ29EQlNlcnZlcjEzNzMyV29ya2Fyb3VuZCk7XG4gICAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAgIC5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKVxuICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgLy8gSWYgdGhlIHNjaGVtYSBkb2Vzbid0IGV4aXN0LCBwcmV0ZW5kIGl0IGV4aXN0cyB3aXRoIG5vIGZpZWxkcy4gVGhpcyBiZWhhdmlvclxuICAgICAgICAgICAgICAvLyB3aWxsIGxpa2VseSBuZWVkIHJldmlzaXRpbmcuXG4gICAgICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHsgZmllbGRzOiB7fSB9O1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKHBhcnNlRm9ybWF0U2NoZW1hID0+XG4gICAgICAgICAgICAgIHRoaXMuYWRhcHRlci5kZWxldGVPYmplY3RzQnlRdWVyeShcbiAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgcGFyc2VGb3JtYXRTY2hlbWEsXG4gICAgICAgICAgICAgICAgcXVlcnlcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgICAgLy8gV2hlbiBkZWxldGluZyBzZXNzaW9ucyB3aGlsZSBjaGFuZ2luZyBwYXNzd29yZHMsIGRvbid0IHRocm93IGFuIGVycm9yIGlmIHRoZXkgZG9uJ3QgaGF2ZSBhbnkgc2Vzc2lvbnMuXG4gICAgICAgICAgICAgIGlmIChcbiAgICAgICAgICAgICAgICBjbGFzc05hbWUgPT09ICdfU2Vzc2lvbicgJiZcbiAgICAgICAgICAgICAgICBlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EXG4gICAgICAgICAgICAgICkge1xuICAgICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe30pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICAvLyBJbnNlcnRzIGFuIG9iamVjdCBpbnRvIHRoZSBkYXRhYmFzZS5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgaWZmIHRoZSBvYmplY3Qgc2F2ZWQuXG4gIGNyZWF0ZShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBvYmplY3Q6IGFueSxcbiAgICB7IGFjbCB9OiBRdWVyeU9wdGlvbnMgPSB7fSxcbiAgICB2YWxpZGF0ZU9ubHk6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIC8vIE1ha2UgYSBjb3B5IG9mIHRoZSBvYmplY3QsIHNvIHdlIGRvbid0IG11dGF0ZSB0aGUgaW5jb21pbmcgZGF0YS5cbiAgICBjb25zdCBvcmlnaW5hbE9iamVjdCA9IG9iamVjdDtcbiAgICBvYmplY3QgPSB0cmFuc2Zvcm1PYmplY3RBQ0wob2JqZWN0KTtcblxuICAgIG9iamVjdC5jcmVhdGVkQXQgPSB7IGlzbzogb2JqZWN0LmNyZWF0ZWRBdCwgX190eXBlOiAnRGF0ZScgfTtcbiAgICBvYmplY3QudXBkYXRlZEF0ID0geyBpc286IG9iamVjdC51cGRhdGVkQXQsIF9fdHlwZTogJ0RhdGUnIH07XG5cbiAgICB2YXIgaXNNYXN0ZXIgPSBhY2wgPT09IHVuZGVmaW5lZDtcbiAgICB2YXIgYWNsR3JvdXAgPSBhY2wgfHwgW107XG4gICAgY29uc3QgcmVsYXRpb25VcGRhdGVzID0gdGhpcy5jb2xsZWN0UmVsYXRpb25VcGRhdGVzKFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgbnVsbCxcbiAgICAgIG9iamVjdFxuICAgICk7XG5cbiAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsYXNzTmFtZShjbGFzc05hbWUpXG4gICAgICAudGhlbigoKSA9PiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiB7XG4gICAgICAgIHJldHVybiAoaXNNYXN0ZXJcbiAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgOiBzY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWUsIGFjbEdyb3VwLCAnY3JlYXRlJylcbiAgICAgICAgKVxuICAgICAgICAgIC50aGVuKCgpID0+IHNjaGVtYUNvbnRyb2xsZXIuZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZSkpXG4gICAgICAgICAgLnRoZW4oKCkgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCB0cnVlKSlcbiAgICAgICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICAgICAgdHJhbnNmb3JtQXV0aERhdGEoY2xhc3NOYW1lLCBvYmplY3QsIHNjaGVtYSk7XG4gICAgICAgICAgICBmbGF0dGVuVXBkYXRlT3BlcmF0b3JzRm9yQ3JlYXRlKG9iamVjdCk7XG4gICAgICAgICAgICBpZiAodmFsaWRhdGVPbmx5KSB7XG4gICAgICAgICAgICAgIHJldHVybiB7fTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuY3JlYXRlT2JqZWN0KFxuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIFNjaGVtYUNvbnRyb2xsZXIuY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShzY2hlbWEpLFxuICAgICAgICAgICAgICBvYmplY3RcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICAgICAgaWYgKHZhbGlkYXRlT25seSkge1xuICAgICAgICAgICAgICByZXR1cm4gb3JpZ2luYWxPYmplY3Q7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5oYW5kbGVSZWxhdGlvblVwZGF0ZXMoXG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgb2JqZWN0Lm9iamVjdElkLFxuICAgICAgICAgICAgICBvYmplY3QsXG4gICAgICAgICAgICAgIHJlbGF0aW9uVXBkYXRlc1xuICAgICAgICAgICAgKS50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgcmV0dXJuIHNhbml0aXplRGF0YWJhc2VSZXN1bHQob3JpZ2luYWxPYmplY3QsIHJlc3VsdC5vcHNbMF0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgfVxuXG4gIGNhbkFkZEZpZWxkKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9iamVjdDogYW55LFxuICAgIGFjbEdyb3VwOiBzdHJpbmdbXVxuICApOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBjbGFzc1NjaGVtYSA9IHNjaGVtYS5zY2hlbWFEYXRhW2NsYXNzTmFtZV07XG4gICAgaWYgKCFjbGFzc1NjaGVtYSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICBjb25zdCBmaWVsZHMgPSBPYmplY3Qua2V5cyhvYmplY3QpO1xuICAgIGNvbnN0IHNjaGVtYUZpZWxkcyA9IE9iamVjdC5rZXlzKGNsYXNzU2NoZW1hLmZpZWxkcyk7XG4gICAgY29uc3QgbmV3S2V5cyA9IGZpZWxkcy5maWx0ZXIoZmllbGQgPT4ge1xuICAgICAgLy8gU2tpcCBmaWVsZHMgdGhhdCBhcmUgdW5zZXRcbiAgICAgIGlmIChcbiAgICAgICAgb2JqZWN0W2ZpZWxkXSAmJlxuICAgICAgICBvYmplY3RbZmllbGRdLl9fb3AgJiZcbiAgICAgICAgb2JqZWN0W2ZpZWxkXS5fX29wID09PSAnRGVsZXRlJ1xuICAgICAgKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBzY2hlbWFGaWVsZHMuaW5kZXhPZihmaWVsZCkgPCAwO1xuICAgIH0pO1xuICAgIGlmIChuZXdLZXlzLmxlbmd0aCA+IDApIHtcbiAgICAgIHJldHVybiBzY2hlbWEudmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZSwgYWNsR3JvdXAsICdhZGRGaWVsZCcpO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBXb24ndCBkZWxldGUgY29sbGVjdGlvbnMgaW4gdGhlIHN5c3RlbSBuYW1lc3BhY2VcbiAgLyoqXG4gICAqIERlbGV0ZSBhbGwgY2xhc3NlcyBhbmQgY2xlYXJzIHRoZSBzY2hlbWEgY2FjaGVcbiAgICpcbiAgICogQHBhcmFtIHtib29sZWFufSBmYXN0IHNldCB0byB0cnVlIGlmIGl0J3Mgb2sgdG8ganVzdCBkZWxldGUgcm93cyBhbmQgbm90IGluZGV4ZXNcbiAgICogQHJldHVybnMge1Byb21pc2U8dm9pZD59IHdoZW4gdGhlIGRlbGV0aW9ucyBjb21wbGV0ZXNcbiAgICovXG4gIGRlbGV0ZUV2ZXJ5dGhpbmcoZmFzdDogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxhbnk+IHtcbiAgICB0aGlzLnNjaGVtYVByb21pc2UgPSBudWxsO1xuICAgIHJldHVybiBQcm9taXNlLmFsbChbXG4gICAgICB0aGlzLmFkYXB0ZXIuZGVsZXRlQWxsQ2xhc3NlcyhmYXN0KSxcbiAgICAgIHRoaXMuc2NoZW1hQ2FjaGUuY2xlYXIoKSxcbiAgICBdKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIGxpc3Qgb2YgcmVsYXRlZCBpZHMgZ2l2ZW4gYW4gb3duaW5nIGlkLlxuICAvLyBjbGFzc05hbWUgaGVyZSBpcyB0aGUgb3duaW5nIGNsYXNzTmFtZS5cbiAgcmVsYXRlZElkcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBrZXk6IHN0cmluZyxcbiAgICBvd25pbmdJZDogc3RyaW5nLFxuICAgIHF1ZXJ5T3B0aW9uczogUXVlcnlPcHRpb25zXG4gICk6IFByb21pc2U8QXJyYXk8c3RyaW5nPj4ge1xuICAgIGNvbnN0IHsgc2tpcCwgbGltaXQsIHNvcnQgfSA9IHF1ZXJ5T3B0aW9ucztcbiAgICBjb25zdCBmaW5kT3B0aW9ucyA9IHt9O1xuICAgIGlmIChzb3J0ICYmIHNvcnQuY3JlYXRlZEF0ICYmIHRoaXMuYWRhcHRlci5jYW5Tb3J0T25Kb2luVGFibGVzKSB7XG4gICAgICBmaW5kT3B0aW9ucy5zb3J0ID0geyBfaWQ6IHNvcnQuY3JlYXRlZEF0IH07XG4gICAgICBmaW5kT3B0aW9ucy5saW1pdCA9IGxpbWl0O1xuICAgICAgZmluZE9wdGlvbnMuc2tpcCA9IHNraXA7XG4gICAgICBxdWVyeU9wdGlvbnMuc2tpcCA9IDA7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmFkYXB0ZXJcbiAgICAgIC5maW5kKFxuICAgICAgICBqb2luVGFibGVOYW1lKGNsYXNzTmFtZSwga2V5KSxcbiAgICAgICAgcmVsYXRpb25TY2hlbWEsXG4gICAgICAgIHsgb3duaW5nSWQgfSxcbiAgICAgICAgZmluZE9wdGlvbnNcbiAgICAgIClcbiAgICAgIC50aGVuKHJlc3VsdHMgPT4gcmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5yZWxhdGVkSWQpKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIGxpc3Qgb2Ygb3duaW5nIGlkcyBnaXZlbiBzb21lIHJlbGF0ZWQgaWRzLlxuICAvLyBjbGFzc05hbWUgaGVyZSBpcyB0aGUgb3duaW5nIGNsYXNzTmFtZS5cbiAgb3duaW5nSWRzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGtleTogc3RyaW5nLFxuICAgIHJlbGF0ZWRJZHM6IHN0cmluZ1tdXG4gICk6IFByb21pc2U8c3RyaW5nW10+IHtcbiAgICByZXR1cm4gdGhpcy5hZGFwdGVyXG4gICAgICAuZmluZChcbiAgICAgICAgam9pblRhYmxlTmFtZShjbGFzc05hbWUsIGtleSksXG4gICAgICAgIHJlbGF0aW9uU2NoZW1hLFxuICAgICAgICB7IHJlbGF0ZWRJZDogeyAkaW46IHJlbGF0ZWRJZHMgfSB9LFxuICAgICAgICB7fVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiByZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0Lm93bmluZ0lkKSk7XG4gIH1cblxuICAvLyBNb2RpZmllcyBxdWVyeSBzbyB0aGF0IGl0IG5vIGxvbmdlciBoYXMgJGluIG9uIHJlbGF0aW9uIGZpZWxkcywgb3JcbiAgLy8gZXF1YWwtdG8tcG9pbnRlciBjb25zdHJhaW50cyBvbiByZWxhdGlvbiBmaWVsZHMuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2hlbiBxdWVyeSBpcyBtdXRhdGVkXG4gIHJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lOiBzdHJpbmcsIHF1ZXJ5OiBhbnksIHNjaGVtYTogYW55KTogUHJvbWlzZTxhbnk+IHtcbiAgICAvLyBTZWFyY2ggZm9yIGFuIGluLXJlbGF0aW9uIG9yIGVxdWFsLXRvLXJlbGF0aW9uXG4gICAgLy8gTWFrZSBpdCBzZXF1ZW50aWFsIGZvciBub3csIG5vdCBzdXJlIG9mIHBhcmFsbGVpemF0aW9uIHNpZGUgZWZmZWN0c1xuICAgIGlmIChxdWVyeVsnJG9yJ10pIHtcbiAgICAgIGNvbnN0IG9ycyA9IHF1ZXJ5Wyckb3InXTtcbiAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgb3JzLm1hcCgoYVF1ZXJ5LCBpbmRleCkgPT4ge1xuICAgICAgICAgIHJldHVybiB0aGlzLnJlZHVjZUluUmVsYXRpb24oY2xhc3NOYW1lLCBhUXVlcnksIHNjaGVtYSkudGhlbihcbiAgICAgICAgICAgIGFRdWVyeSA9PiB7XG4gICAgICAgICAgICAgIHF1ZXJ5Wyckb3InXVtpbmRleF0gPSBhUXVlcnk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgKTtcbiAgICAgICAgfSlcbiAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgcHJvbWlzZXMgPSBPYmplY3Qua2V5cyhxdWVyeSkubWFwKGtleSA9PiB7XG4gICAgICBjb25zdCB0ID0gc2NoZW1hLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGtleSk7XG4gICAgICBpZiAoIXQgfHwgdC50eXBlICE9PSAnUmVsYXRpb24nKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocXVlcnkpO1xuICAgICAgfVxuICAgICAgbGV0IHF1ZXJpZXM6ID8oYW55W10pID0gbnVsbDtcbiAgICAgIGlmIChcbiAgICAgICAgcXVlcnlba2V5XSAmJlxuICAgICAgICAocXVlcnlba2V5XVsnJGluJ10gfHxcbiAgICAgICAgICBxdWVyeVtrZXldWyckbmUnXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV1bJyRuaW4nXSB8fFxuICAgICAgICAgIHF1ZXJ5W2tleV0uX190eXBlID09ICdQb2ludGVyJylcbiAgICAgICkge1xuICAgICAgICAvLyBCdWlsZCB0aGUgbGlzdCBvZiBxdWVyaWVzXG4gICAgICAgIHF1ZXJpZXMgPSBPYmplY3Qua2V5cyhxdWVyeVtrZXldKS5tYXAoY29uc3RyYWludEtleSA9PiB7XG4gICAgICAgICAgbGV0IHJlbGF0ZWRJZHM7XG4gICAgICAgICAgbGV0IGlzTmVnYXRpb24gPSBmYWxzZTtcbiAgICAgICAgICBpZiAoY29uc3RyYWludEtleSA9PT0gJ29iamVjdElkJykge1xuICAgICAgICAgICAgcmVsYXRlZElkcyA9IFtxdWVyeVtrZXldLm9iamVjdElkXTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRpbicpIHtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckaW4nXS5tYXAociA9PiByLm9iamVjdElkKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNvbnN0cmFpbnRLZXkgPT0gJyRuaW4nKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBxdWVyeVtrZXldWyckbmluJ10ubWFwKHIgPT4gci5vYmplY3RJZCk7XG4gICAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50S2V5ID09ICckbmUnKSB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHJlbGF0ZWRJZHMgPSBbcXVlcnlba2V5XVsnJG5lJ10ub2JqZWN0SWRdO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBpc05lZ2F0aW9uLFxuICAgICAgICAgICAgcmVsYXRlZElkcyxcbiAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXJpZXMgPSBbeyBpc05lZ2F0aW9uOiBmYWxzZSwgcmVsYXRlZElkczogW10gfV07XG4gICAgICB9XG5cbiAgICAgIC8vIHJlbW92ZSB0aGUgY3VycmVudCBxdWVyeUtleSBhcyB3ZSBkb24sdCBuZWVkIGl0IGFueW1vcmVcbiAgICAgIGRlbGV0ZSBxdWVyeVtrZXldO1xuICAgICAgLy8gZXhlY3V0ZSBlYWNoIHF1ZXJ5IGluZGVwZW5kZW50bHkgdG8gYnVpbGQgdGhlIGxpc3Qgb2ZcbiAgICAgIC8vICRpbiAvICRuaW5cbiAgICAgIGNvbnN0IHByb21pc2VzID0gcXVlcmllcy5tYXAocSA9PiB7XG4gICAgICAgIGlmICghcSkge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5vd25pbmdJZHMoY2xhc3NOYW1lLCBrZXksIHEucmVsYXRlZElkcykudGhlbihpZHMgPT4ge1xuICAgICAgICAgIGlmIChxLmlzTmVnYXRpb24pIHtcbiAgICAgICAgICAgIHRoaXMuYWRkTm90SW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuYWRkSW5PYmplY3RJZHNJZHMoaWRzLCBxdWVyeSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcblxuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShxdWVyeSk7XG4gICAgfSk7XG4gIH1cblxuICAvLyBNb2RpZmllcyBxdWVyeSBzbyB0aGF0IGl0IG5vIGxvbmdlciBoYXMgJHJlbGF0ZWRUb1xuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gcXVlcnkgaXMgbXV0YXRlZFxuICByZWR1Y2VSZWxhdGlvbktleXMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgcXVlcnk6IGFueSxcbiAgICBxdWVyeU9wdGlvbnM6IGFueVxuICApOiA/UHJvbWlzZTx2b2lkPiB7XG4gICAgaWYgKHF1ZXJ5Wyckb3InXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICBxdWVyeVsnJG9yJ10ubWFwKGFRdWVyeSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVkdWNlUmVsYXRpb25LZXlzKGNsYXNzTmFtZSwgYVF1ZXJ5LCBxdWVyeU9wdGlvbnMpO1xuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG5cbiAgICB2YXIgcmVsYXRlZFRvID0gcXVlcnlbJyRyZWxhdGVkVG8nXTtcbiAgICBpZiAocmVsYXRlZFRvKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWxhdGVkSWRzKFxuICAgICAgICByZWxhdGVkVG8ub2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgcmVsYXRlZFRvLmtleSxcbiAgICAgICAgcmVsYXRlZFRvLm9iamVjdC5vYmplY3RJZCxcbiAgICAgICAgcXVlcnlPcHRpb25zXG4gICAgICApXG4gICAgICAgIC50aGVuKGlkcyA9PiB7XG4gICAgICAgICAgZGVsZXRlIHF1ZXJ5WyckcmVsYXRlZFRvJ107XG4gICAgICAgICAgdGhpcy5hZGRJbk9iamVjdElkc0lkcyhpZHMsIHF1ZXJ5KTtcbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBxdWVyeSwgcXVlcnlPcHRpb25zKTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4ge30pO1xuICAgIH1cbiAgfVxuXG4gIGFkZEluT2JqZWN0SWRzSWRzKGlkczogP0FycmF5PHN0cmluZz4gPSBudWxsLCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgaWRzRnJvbVN0cmluZzogP0FycmF5PHN0cmluZz4gPVxuICAgICAgdHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJyA/IFtxdWVyeS5vYmplY3RJZF0gOiBudWxsO1xuICAgIGNvbnN0IGlkc0Zyb21FcTogP0FycmF5PHN0cmluZz4gPVxuICAgICAgcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRlcSddID8gW3F1ZXJ5Lm9iamVjdElkWyckZXEnXV0gOiBudWxsO1xuICAgIGNvbnN0IGlkc0Zyb21JbjogP0FycmF5PHN0cmluZz4gPVxuICAgICAgcXVlcnkub2JqZWN0SWQgJiYgcXVlcnkub2JqZWN0SWRbJyRpbiddID8gcXVlcnkub2JqZWN0SWRbJyRpbiddIDogbnVsbDtcblxuICAgIC8vIEBmbG93LWRpc2FibGUtbmV4dFxuICAgIGNvbnN0IGFsbElkczogQXJyYXk8QXJyYXk8c3RyaW5nPj4gPSBbXG4gICAgICBpZHNGcm9tU3RyaW5nLFxuICAgICAgaWRzRnJvbUVxLFxuICAgICAgaWRzRnJvbUluLFxuICAgICAgaWRzLFxuICAgIF0uZmlsdGVyKGxpc3QgPT4gbGlzdCAhPT0gbnVsbCk7XG4gICAgY29uc3QgdG90YWxMZW5ndGggPSBhbGxJZHMucmVkdWNlKChtZW1vLCBsaXN0KSA9PiBtZW1vICsgbGlzdC5sZW5ndGgsIDApO1xuXG4gICAgbGV0IGlkc0ludGVyc2VjdGlvbiA9IFtdO1xuICAgIGlmICh0b3RhbExlbmd0aCA+IDEyNSkge1xuICAgICAgaWRzSW50ZXJzZWN0aW9uID0gaW50ZXJzZWN0LmJpZyhhbGxJZHMpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpZHNJbnRlcnNlY3Rpb24gPSBpbnRlcnNlY3QoYWxsSWRzKTtcbiAgICB9XG5cbiAgICAvLyBOZWVkIHRvIG1ha2Ugc3VyZSB3ZSBkb24ndCBjbG9iYmVyIGV4aXN0aW5nIHNob3J0aGFuZCAkZXEgY29uc3RyYWludHMgb24gb2JqZWN0SWQuXG4gICAgaWYgKCEoJ29iamVjdElkJyBpbiBxdWVyeSkpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkaW46IHVuZGVmaW5lZCxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgcXVlcnkub2JqZWN0SWQgPT09ICdzdHJpbmcnKSB7XG4gICAgICBxdWVyeS5vYmplY3RJZCA9IHtcbiAgICAgICAgJGluOiB1bmRlZmluZWQsXG4gICAgICAgICRlcTogcXVlcnkub2JqZWN0SWQsXG4gICAgICB9O1xuICAgIH1cbiAgICBxdWVyeS5vYmplY3RJZFsnJGluJ10gPSBpZHNJbnRlcnNlY3Rpb247XG5cbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICBhZGROb3RJbk9iamVjdElkc0lkcyhpZHM6IHN0cmluZ1tdID0gW10sIHF1ZXJ5OiBhbnkpIHtcbiAgICBjb25zdCBpZHNGcm9tTmluID1cbiAgICAgIHF1ZXJ5Lm9iamVjdElkICYmIHF1ZXJ5Lm9iamVjdElkWyckbmluJ10gPyBxdWVyeS5vYmplY3RJZFsnJG5pbiddIDogW107XG4gICAgbGV0IGFsbElkcyA9IFsuLi5pZHNGcm9tTmluLCAuLi5pZHNdLmZpbHRlcihsaXN0ID0+IGxpc3QgIT09IG51bGwpO1xuXG4gICAgLy8gbWFrZSBhIHNldCBhbmQgc3ByZWFkIHRvIHJlbW92ZSBkdXBsaWNhdGVzXG4gICAgYWxsSWRzID0gWy4uLm5ldyBTZXQoYWxsSWRzKV07XG5cbiAgICAvLyBOZWVkIHRvIG1ha2Ugc3VyZSB3ZSBkb24ndCBjbG9iYmVyIGV4aXN0aW5nIHNob3J0aGFuZCAkZXEgY29uc3RyYWludHMgb24gb2JqZWN0SWQuXG4gICAgaWYgKCEoJ29iamVjdElkJyBpbiBxdWVyeSkpIHtcbiAgICAgIHF1ZXJ5Lm9iamVjdElkID0ge1xuICAgICAgICAkbmluOiB1bmRlZmluZWQsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHF1ZXJ5Lm9iamVjdElkID09PSAnc3RyaW5nJykge1xuICAgICAgcXVlcnkub2JqZWN0SWQgPSB7XG4gICAgICAgICRuaW46IHVuZGVmaW5lZCxcbiAgICAgICAgJGVxOiBxdWVyeS5vYmplY3RJZCxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgcXVlcnkub2JqZWN0SWRbJyRuaW4nXSA9IGFsbElkcztcbiAgICByZXR1cm4gcXVlcnk7XG4gIH1cblxuICAvLyBSdW5zIGEgcXVlcnkgb24gdGhlIGRhdGFiYXNlLlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGEgbGlzdCBvZiBpdGVtcy5cbiAgLy8gT3B0aW9uczpcbiAgLy8gICBza2lwICAgIG51bWJlciBvZiByZXN1bHRzIHRvIHNraXAuXG4gIC8vICAgbGltaXQgICBsaW1pdCB0byB0aGlzIG51bWJlciBvZiByZXN1bHRzLlxuICAvLyAgIHNvcnQgICAgYW4gb2JqZWN0IHdoZXJlIGtleXMgYXJlIHRoZSBmaWVsZHMgdG8gc29ydCBieS5cbiAgLy8gICAgICAgICAgIHRoZSB2YWx1ZSBpcyArMSBmb3IgYXNjZW5kaW5nLCAtMSBmb3IgZGVzY2VuZGluZy5cbiAgLy8gICBjb3VudCAgIHJ1biBhIGNvdW50IGluc3RlYWQgb2YgcmV0dXJuaW5nIHJlc3VsdHMuXG4gIC8vICAgYWNsICAgICByZXN0cmljdCB0aGlzIG9wZXJhdGlvbiB3aXRoIGFuIEFDTCBmb3IgdGhlIHByb3ZpZGVkIGFycmF5XG4gIC8vICAgICAgICAgICBvZiB1c2VyIG9iamVjdElkcyBhbmQgcm9sZXMuIGFjbDogbnVsbCBtZWFucyBubyB1c2VyLlxuICAvLyAgICAgICAgICAgd2hlbiB0aGlzIGZpZWxkIGlzIG5vdCBwcmVzZW50LCBkb24ndCBkbyBhbnl0aGluZyByZWdhcmRpbmcgQUNMcy5cbiAgLy8gIGluc2Vuc2l0aXZlIG1ha2Ugc3RyaW5nIGNvbXBhcmlzb25zIGNhc2UgaW5zZW5zaXRpdmVcbiAgLy8gVE9ETzogbWFrZSB1c2VySWRzIG5vdCBuZWVkZWQgaGVyZS4gVGhlIGRiIGFkYXB0ZXIgc2hvdWxkbid0IGtub3dcbiAgLy8gYW55dGhpbmcgYWJvdXQgdXNlcnMsIGlkZWFsbHkuIFRoZW4sIGltcHJvdmUgdGhlIGZvcm1hdCBvZiB0aGUgQUNMXG4gIC8vIGFyZyB0byB3b3JrIGxpa2UgdGhlIG90aGVycy5cbiAgZmluZChcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55LFxuICAgIHtcbiAgICAgIHNraXAsXG4gICAgICBsaW1pdCxcbiAgICAgIGFjbCxcbiAgICAgIHNvcnQgPSB7fSxcbiAgICAgIGNvdW50LFxuICAgICAga2V5cyxcbiAgICAgIG9wLFxuICAgICAgZGlzdGluY3QsXG4gICAgICBwaXBlbGluZSxcbiAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgaW5zZW5zaXRpdmUgPSBmYWxzZSxcbiAgICB9OiBhbnkgPSB7fSxcbiAgICBhdXRoOiBhbnkgPSB7fSxcbiAgICB2YWxpZFNjaGVtYUNvbnRyb2xsZXI6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlclxuICApOiBQcm9taXNlPGFueT4ge1xuICAgIGNvbnN0IGlzTWFzdGVyID0gYWNsID09PSB1bmRlZmluZWQ7XG4gICAgY29uc3QgYWNsR3JvdXAgPSBhY2wgfHwgW107XG5cbiAgICBvcCA9XG4gICAgICBvcCB8fFxuICAgICAgKHR5cGVvZiBxdWVyeS5vYmplY3RJZCA9PSAnc3RyaW5nJyAmJiBPYmplY3Qua2V5cyhxdWVyeSkubGVuZ3RoID09PSAxXG4gICAgICAgID8gJ2dldCdcbiAgICAgICAgOiAnZmluZCcpO1xuICAgIC8vIENvdW50IG9wZXJhdGlvbiBpZiBjb3VudGluZ1xuICAgIG9wID0gY291bnQgPT09IHRydWUgPyAnY291bnQnIDogb3A7XG5cbiAgICBsZXQgY2xhc3NFeGlzdHMgPSB0cnVlO1xuICAgIHJldHVybiB0aGlzLmxvYWRTY2hlbWFJZk5lZWRlZCh2YWxpZFNjaGVtYUNvbnRyb2xsZXIpLnRoZW4oXG4gICAgICBzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgICAgLy9BbGxvdyB2b2xhdGlsZSBjbGFzc2VzIGlmIHF1ZXJ5aW5nIHdpdGggTWFzdGVyIChmb3IgX1B1c2hTdGF0dXMpXG4gICAgICAgIC8vVE9ETzogTW92ZSB2b2xhdGlsZSBjbGFzc2VzIGNvbmNlcHQgaW50byBtb25nbyBhZGFwdGVyLCBwb3N0Z3JlcyBhZGFwdGVyIHNob3VsZG4ndCBjYXJlXG4gICAgICAgIC8vdGhhdCBhcGkucGFyc2UuY29tIGJyZWFrcyB3aGVuIF9QdXNoU3RhdHVzIGV4aXN0cyBpbiBtb25nby5cbiAgICAgICAgcmV0dXJuIHNjaGVtYUNvbnRyb2xsZXJcbiAgICAgICAgICAuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgaXNNYXN0ZXIpXG4gICAgICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgICAgIC8vIEJlaGF2aW9yIGZvciBub24tZXhpc3RlbnQgY2xhc3NlcyBpcyBraW5kYSB3ZWlyZCBvbiBQYXJzZS5jb20uIFByb2JhYmx5IGRvZXNuJ3QgbWF0dGVyIHRvbyBtdWNoLlxuICAgICAgICAgICAgLy8gRm9yIG5vdywgcHJldGVuZCB0aGUgY2xhc3MgZXhpc3RzIGJ1dCBoYXMgbm8gb2JqZWN0cyxcbiAgICAgICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgIGNsYXNzRXhpc3RzID0gZmFsc2U7XG4gICAgICAgICAgICAgIHJldHVybiB7IGZpZWxkczoge30gfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICAgIH0pXG4gICAgICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgICAgIC8vIFBhcnNlLmNvbSB0cmVhdHMgcXVlcmllcyBvbiBfY3JlYXRlZF9hdCBhbmQgX3VwZGF0ZWRfYXQgYXMgaWYgdGhleSB3ZXJlIHF1ZXJpZXMgb24gY3JlYXRlZEF0IGFuZCB1cGRhdGVkQXQsXG4gICAgICAgICAgICAvLyBzbyBkdXBsaWNhdGUgdGhhdCBiZWhhdmlvciBoZXJlLiBJZiBib3RoIGFyZSBzcGVjaWZpZWQsIHRoZSBjb3JyZWN0IGJlaGF2aW9yIHRvIG1hdGNoIFBhcnNlLmNvbSBpcyB0b1xuICAgICAgICAgICAgLy8gdXNlIHRoZSBvbmUgdGhhdCBhcHBlYXJzIGZpcnN0IGluIHRoZSBzb3J0IGxpc3QuXG4gICAgICAgICAgICBpZiAoc29ydC5fY3JlYXRlZF9hdCkge1xuICAgICAgICAgICAgICBzb3J0LmNyZWF0ZWRBdCA9IHNvcnQuX2NyZWF0ZWRfYXQ7XG4gICAgICAgICAgICAgIGRlbGV0ZSBzb3J0Ll9jcmVhdGVkX2F0O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHNvcnQuX3VwZGF0ZWRfYXQpIHtcbiAgICAgICAgICAgICAgc29ydC51cGRhdGVkQXQgPSBzb3J0Ll91cGRhdGVkX2F0O1xuICAgICAgICAgICAgICBkZWxldGUgc29ydC5fdXBkYXRlZF9hdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IHF1ZXJ5T3B0aW9ucyA9IHtcbiAgICAgICAgICAgICAgc2tpcCxcbiAgICAgICAgICAgICAgbGltaXQsXG4gICAgICAgICAgICAgIHNvcnQsXG4gICAgICAgICAgICAgIGtleXMsXG4gICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlLFxuICAgICAgICAgICAgICBpbnNlbnNpdGl2ZSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBPYmplY3Qua2V5cyhzb3J0KS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgIGlmIChmaWVsZE5hbWUubWF0Y2goL15hdXRoRGF0YVxcLihbYS16QS1aMC05X10rKVxcLmlkJC8pKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgICAgICAgIGBDYW5ub3Qgc29ydCBieSAke2ZpZWxkTmFtZX1gXG4gICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBjb25zdCByb290RmllbGROYW1lID0gZ2V0Um9vdEZpZWxkTmFtZShmaWVsZE5hbWUpO1xuICAgICAgICAgICAgICBpZiAoIVNjaGVtYUNvbnRyb2xsZXIuZmllbGROYW1lSXNWYWxpZChyb290RmllbGROYW1lKSkge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICAgICAgICBgSW52YWxpZCBmaWVsZCBuYW1lOiAke2ZpZWxkTmFtZX0uYFxuICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIChpc01hc3RlclxuICAgICAgICAgICAgICA/IFByb21pc2UucmVzb2x2ZSgpXG4gICAgICAgICAgICAgIDogc2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lLCBhY2xHcm91cCwgb3ApXG4gICAgICAgICAgICApXG4gICAgICAgICAgICAgIC50aGVuKCgpID0+XG4gICAgICAgICAgICAgICAgdGhpcy5yZWR1Y2VSZWxhdGlvbktleXMoY2xhc3NOYW1lLCBxdWVyeSwgcXVlcnlPcHRpb25zKVxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgIC50aGVuKCgpID0+XG4gICAgICAgICAgICAgICAgdGhpcy5yZWR1Y2VJblJlbGF0aW9uKGNsYXNzTmFtZSwgcXVlcnksIHNjaGVtYUNvbnRyb2xsZXIpXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICAgIGxldCBwcm90ZWN0ZWRGaWVsZHM7XG4gICAgICAgICAgICAgICAgaWYgKCFpc01hc3Rlcikge1xuICAgICAgICAgICAgICAgICAgcXVlcnkgPSB0aGlzLmFkZFBvaW50ZXJQZXJtaXNzaW9ucyhcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBvcCxcbiAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgIGFjbEdyb3VwXG4gICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgLy8gUHJvdGVjdGVkRmllbGRzIGlzIGdlbmVyYXRlZCBiZWZvcmUgZXhlY3V0aW5nIHRoZSBxdWVyeSBzbyB3ZVxuICAgICAgICAgICAgICAgICAgLy8gY2FuIG9wdGltaXplIHRoZSBxdWVyeSB1c2luZyBNb25nbyBQcm9qZWN0aW9uIGF0IGEgbGF0ZXIgc3RhZ2UuXG4gICAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMgPSB0aGlzLmFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICAgICAgICAgICAgICAgICAgc2NoZW1hQ29udHJvbGxlcixcbiAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICBxdWVyeSxcbiAgICAgICAgICAgICAgICAgICAgYWNsR3JvdXAsXG4gICAgICAgICAgICAgICAgICAgIGF1dGhcbiAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmICghcXVlcnkpIHtcbiAgICAgICAgICAgICAgICAgIGlmIChvcCA9PT0gJ2dldCcpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgICAgICAgICAgICAgJ09iamVjdCBub3QgZm91bmQuJ1xuICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoIWlzTWFzdGVyKSB7XG4gICAgICAgICAgICAgICAgICBpZiAob3AgPT09ICd1cGRhdGUnIHx8IG9wID09PSAnZGVsZXRlJykge1xuICAgICAgICAgICAgICAgICAgICBxdWVyeSA9IGFkZFdyaXRlQUNMKHF1ZXJ5LCBhY2xHcm91cCk7XG4gICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBxdWVyeSA9IGFkZFJlYWRBQ0wocXVlcnksIGFjbEdyb3VwKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFsaWRhdGVRdWVyeShxdWVyeSwgdGhpcy5za2lwTW9uZ29EQlNlcnZlcjEzNzMyV29ya2Fyb3VuZCk7XG4gICAgICAgICAgICAgICAgaWYgKGNvdW50KSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlci5jb3VudChcbiAgICAgICAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgICAgICAgc2NoZW1hLFxuICAgICAgICAgICAgICAgICAgICAgIHF1ZXJ5LFxuICAgICAgICAgICAgICAgICAgICAgIHJlYWRQcmVmZXJlbmNlXG4gICAgICAgICAgICAgICAgICAgICk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChkaXN0aW5jdCkge1xuICAgICAgICAgICAgICAgICAgaWYgKCFjbGFzc0V4aXN0cykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5hZGFwdGVyLmRpc3RpbmN0KFxuICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgICAgcXVlcnksXG4gICAgICAgICAgICAgICAgICAgICAgZGlzdGluY3RcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHBpcGVsaW5lKSB7XG4gICAgICAgICAgICAgICAgICBpZiAoIWNsYXNzRXhpc3RzKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuYWdncmVnYXRlKFxuICAgICAgICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICBzY2hlbWEsXG4gICAgICAgICAgICAgICAgICAgICAgcGlwZWxpbmUsXG4gICAgICAgICAgICAgICAgICAgICAgcmVhZFByZWZlcmVuY2VcbiAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuYWRhcHRlclxuICAgICAgICAgICAgICAgICAgICAuZmluZChjbGFzc05hbWUsIHNjaGVtYSwgcXVlcnksIHF1ZXJ5T3B0aW9ucylcbiAgICAgICAgICAgICAgICAgICAgLnRoZW4ob2JqZWN0cyA9PlxuICAgICAgICAgICAgICAgICAgICAgIG9iamVjdHMubWFwKG9iamVjdCA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBvYmplY3QgPSB1bnRyYW5zZm9ybU9iamVjdEFDTChvYmplY3QpO1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGZpbHRlclNlbnNpdGl2ZURhdGEoXG4gICAgICAgICAgICAgICAgICAgICAgICAgIGlzTWFzdGVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBhY2xHcm91cCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBwcm90ZWN0ZWRGaWVsZHMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgIG9iamVjdFxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3JcbiAgICAgICAgICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH0pO1xuICAgICAgfVxuICAgICk7XG4gIH1cblxuICBkZWxldGVTY2hlbWEoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gdGhpcy5sb2FkU2NoZW1hKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIHRydWUpKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICByZXR1cm4geyBmaWVsZHM6IHt9IH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAudGhlbigoc2NoZW1hOiBhbnkpID0+IHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29sbGVjdGlvbkV4aXN0cyhjbGFzc05hbWUpXG4gICAgICAgICAgLnRoZW4oKCkgPT5cbiAgICAgICAgICAgIHRoaXMuYWRhcHRlci5jb3VudChjbGFzc05hbWUsIHsgZmllbGRzOiB7fSB9LCBudWxsLCAnJywgZmFsc2UpXG4gICAgICAgICAgKVxuICAgICAgICAgIC50aGVuKGNvdW50ID0+IHtcbiAgICAgICAgICAgIGlmIChjb3VudCA+IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIDI1NSxcbiAgICAgICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGlzIG5vdCBlbXB0eSwgY29udGFpbnMgJHtjb3VudH0gb2JqZWN0cywgY2Fubm90IGRyb3Agc2NoZW1hLmBcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzLmFkYXB0ZXIuZGVsZXRlQ2xhc3MoY2xhc3NOYW1lKTtcbiAgICAgICAgICB9KVxuICAgICAgICAgIC50aGVuKHdhc1BhcnNlQ29sbGVjdGlvbiA9PiB7XG4gICAgICAgICAgICBpZiAod2FzUGFyc2VDb2xsZWN0aW9uKSB7XG4gICAgICAgICAgICAgIGNvbnN0IHJlbGF0aW9uRmllbGROYW1lcyA9IE9iamVjdC5rZXlzKHNjaGVtYS5maWVsZHMpLmZpbHRlcihcbiAgICAgICAgICAgICAgICBmaWVsZE5hbWUgPT4gc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT09ICdSZWxhdGlvbidcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICAgICAgICAgIHJlbGF0aW9uRmllbGROYW1lcy5tYXAobmFtZSA9PlxuICAgICAgICAgICAgICAgICAgdGhpcy5hZGFwdGVyLmRlbGV0ZUNsYXNzKGpvaW5UYWJsZU5hbWUoY2xhc3NOYW1lLCBuYW1lKSlcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICkudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG5cbiAgYWRkUG9pbnRlclBlcm1pc3Npb25zKFxuICAgIHNjaGVtYTogU2NoZW1hQ29udHJvbGxlci5TY2hlbWFDb250cm9sbGVyLFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIG9wZXJhdGlvbjogc3RyaW5nLFxuICAgIHF1ZXJ5OiBhbnksXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW11cbiAgKSB7XG4gICAgLy8gQ2hlY2sgaWYgY2xhc3MgaGFzIHB1YmxpYyBwZXJtaXNzaW9uIGZvciBvcGVyYXRpb25cbiAgICAvLyBJZiB0aGUgQmFzZUNMUCBwYXNzLCBsZXQgZ28gdGhyb3VnaFxuICAgIGlmIChzY2hlbWEudGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lKGNsYXNzTmFtZSwgYWNsR3JvdXAsIG9wZXJhdGlvbikpIHtcbiAgICAgIHJldHVybiBxdWVyeTtcbiAgICB9XG4gICAgY29uc3QgcGVybXMgPSBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSk7XG4gICAgY29uc3QgZmllbGQgPVxuICAgICAgWydnZXQnLCAnZmluZCddLmluZGV4T2Yob3BlcmF0aW9uKSA+IC0xXG4gICAgICAgID8gJ3JlYWRVc2VyRmllbGRzJ1xuICAgICAgICA6ICd3cml0ZVVzZXJGaWVsZHMnO1xuICAgIGNvbnN0IHVzZXJBQ0wgPSBhY2xHcm91cC5maWx0ZXIoYWNsID0+IHtcbiAgICAgIHJldHVybiBhY2wuaW5kZXhPZigncm9sZTonKSAhPSAwICYmIGFjbCAhPSAnKic7XG4gICAgfSk7XG4gICAgLy8gdGhlIEFDTCBzaG91bGQgaGF2ZSBleGFjdGx5IDEgdXNlclxuICAgIGlmIChwZXJtcyAmJiBwZXJtc1tmaWVsZF0gJiYgcGVybXNbZmllbGRdLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIE5vIHVzZXIgc2V0IHJldHVybiB1bmRlZmluZWRcbiAgICAgIC8vIElmIHRoZSBsZW5ndGggaXMgPiAxLCB0aGF0IG1lYW5zIHdlIGRpZG4ndCBkZS1kdXBlIHVzZXJzIGNvcnJlY3RseVxuICAgICAgaWYgKHVzZXJBQ0wubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgY29uc3QgdXNlcklkID0gdXNlckFDTFswXTtcbiAgICAgIGNvbnN0IHVzZXJQb2ludGVyID0ge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdXNlcklkLFxuICAgICAgfTtcblxuICAgICAgY29uc3QgcGVybUZpZWxkcyA9IHBlcm1zW2ZpZWxkXTtcbiAgICAgIGNvbnN0IG9ycyA9IHBlcm1GaWVsZHMubWFwKGtleSA9PiB7XG4gICAgICAgIGNvbnN0IHEgPSB7XG4gICAgICAgICAgW2tleV06IHVzZXJQb2ludGVyLFxuICAgICAgICB9O1xuICAgICAgICAvLyBpZiB3ZSBhbHJlYWR5IGhhdmUgYSBjb25zdHJhaW50IG9uIHRoZSBrZXksIHVzZSB0aGUgJGFuZFxuICAgICAgICBpZiAocXVlcnkuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgIHJldHVybiB7ICRhbmQ6IFtxLCBxdWVyeV0gfTtcbiAgICAgICAgfVxuICAgICAgICAvLyBvdGhlcndpc2UganVzdCBhZGQgdGhlIGNvbnN0YWludFxuICAgICAgICByZXR1cm4gT2JqZWN0LmFzc2lnbih7fSwgcXVlcnksIHtcbiAgICAgICAgICBbYCR7a2V5fWBdOiB1c2VyUG9pbnRlcixcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICAgIGlmIChvcnMubGVuZ3RoID4gMSkge1xuICAgICAgICByZXR1cm4geyAkb3I6IG9ycyB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIG9yc1swXTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgIH1cbiAgfVxuXG4gIGFkZFByb3RlY3RlZEZpZWxkcyhcbiAgICBzY2hlbWE6IFNjaGVtYUNvbnRyb2xsZXIuU2NoZW1hQ29udHJvbGxlcixcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBxdWVyeTogYW55ID0ge30sXG4gICAgYWNsR3JvdXA6IGFueVtdID0gW10sXG4gICAgYXV0aDogYW55ID0ge31cbiAgKSB7XG4gICAgY29uc3QgcGVybXMgPSBzY2hlbWEuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSk7XG4gICAgaWYgKCFwZXJtcykgcmV0dXJuIG51bGw7XG5cbiAgICBjb25zdCBwcm90ZWN0ZWRGaWVsZHMgPSBwZXJtcy5wcm90ZWN0ZWRGaWVsZHM7XG4gICAgaWYgKCFwcm90ZWN0ZWRGaWVsZHMpIHJldHVybiBudWxsO1xuXG4gICAgaWYgKGFjbEdyb3VwLmluZGV4T2YocXVlcnkub2JqZWN0SWQpID4gLTEpIHJldHVybiBudWxsO1xuICAgIGlmIChcbiAgICAgIE9iamVjdC5rZXlzKHF1ZXJ5KS5sZW5ndGggPT09IDAgJiZcbiAgICAgIGF1dGggJiZcbiAgICAgIGF1dGgudXNlciAmJlxuICAgICAgYWNsR3JvdXAuaW5kZXhPZihhdXRoLnVzZXIuaWQpID4gLTFcbiAgICApXG4gICAgICByZXR1cm4gbnVsbDtcblxuICAgIGxldCBwcm90ZWN0ZWRLZXlzID0gT2JqZWN0LnZhbHVlcyhwcm90ZWN0ZWRGaWVsZHMpLnJlZHVjZShcbiAgICAgIChhY2MsIHZhbCkgPT4gYWNjLmNvbmNhdCh2YWwpLFxuICAgICAgW11cbiAgICApOyAvLy5mbGF0KCk7XG4gICAgWy4uLihhdXRoLnVzZXJSb2xlcyB8fCBbXSldLmZvckVhY2gocm9sZSA9PiB7XG4gICAgICBjb25zdCBmaWVsZHMgPSBwcm90ZWN0ZWRGaWVsZHNbcm9sZV07XG4gICAgICBpZiAoZmllbGRzKSB7XG4gICAgICAgIHByb3RlY3RlZEtleXMgPSBwcm90ZWN0ZWRLZXlzLmZpbHRlcih2ID0+IGZpZWxkcy5pbmNsdWRlcyh2KSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcHJvdGVjdGVkS2V5cztcbiAgfVxuXG4gIC8vIFRPRE86IGNyZWF0ZSBpbmRleGVzIG9uIGZpcnN0IGNyZWF0aW9uIG9mIGEgX1VzZXIgb2JqZWN0LiBPdGhlcndpc2UgaXQncyBpbXBvc3NpYmxlIHRvXG4gIC8vIGhhdmUgYSBQYXJzZSBhcHAgd2l0aG91dCBpdCBoYXZpbmcgYSBfVXNlciBjb2xsZWN0aW9uLlxuICBwZXJmb3JtSW5pdGlhbGl6YXRpb24oKSB7XG4gICAgY29uc3QgcmVxdWlyZWRVc2VyRmllbGRzID0ge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX1VzZXIsXG4gICAgICB9LFxuICAgIH07XG4gICAgY29uc3QgcmVxdWlyZWRSb2xlRmllbGRzID0ge1xuICAgICAgZmllbGRzOiB7XG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAgIC4uLlNjaGVtYUNvbnRyb2xsZXIuZGVmYXVsdENvbHVtbnMuX1JvbGUsXG4gICAgICB9LFxuICAgIH07XG5cbiAgICBjb25zdCB1c2VyQ2xhc3NQcm9taXNlID0gdGhpcy5sb2FkU2NoZW1hKCkudGhlbihzY2hlbWEgPT5cbiAgICAgIHNjaGVtYS5lbmZvcmNlQ2xhc3NFeGlzdHMoJ19Vc2VyJylcbiAgICApO1xuICAgIGNvbnN0IHJvbGVDbGFzc1Byb21pc2UgPSB0aGlzLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYSA9PlxuICAgICAgc2NoZW1hLmVuZm9yY2VDbGFzc0V4aXN0cygnX1JvbGUnKVxuICAgICk7XG5cbiAgICBjb25zdCB1c2VybmFtZVVuaXF1ZW5lc3MgPSB1c2VyQ2xhc3NQcm9taXNlXG4gICAgICAudGhlbigoKSA9PlxuICAgICAgICB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1VzZXInLCByZXF1aXJlZFVzZXJGaWVsZHMsIFsndXNlcm5hbWUnXSlcbiAgICAgIClcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGxvZ2dlci53YXJuKCdVbmFibGUgdG8gZW5zdXJlIHVuaXF1ZW5lc3MgZm9yIHVzZXJuYW1lczogJywgZXJyb3IpO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgY29uc3QgZW1haWxVbmlxdWVuZXNzID0gdXNlckNsYXNzUHJvbWlzZVxuICAgICAgLnRoZW4oKCkgPT5cbiAgICAgICAgdGhpcy5hZGFwdGVyLmVuc3VyZVVuaXF1ZW5lc3MoJ19Vc2VyJywgcmVxdWlyZWRVc2VyRmllbGRzLCBbJ2VtYWlsJ10pXG4gICAgICApXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBsb2dnZXIud2FybihcbiAgICAgICAgICAnVW5hYmxlIHRvIGVuc3VyZSB1bmlxdWVuZXNzIGZvciB1c2VyIGVtYWlsIGFkZHJlc3NlczogJyxcbiAgICAgICAgICBlcnJvclxuICAgICAgICApO1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH0pO1xuXG4gICAgY29uc3Qgcm9sZVVuaXF1ZW5lc3MgPSByb2xlQ2xhc3NQcm9taXNlXG4gICAgICAudGhlbigoKSA9PlxuICAgICAgICB0aGlzLmFkYXB0ZXIuZW5zdXJlVW5pcXVlbmVzcygnX1JvbGUnLCByZXF1aXJlZFJvbGVGaWVsZHMsIFsnbmFtZSddKVxuICAgICAgKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgbG9nZ2VyLndhcm4oJ1VuYWJsZSB0byBlbnN1cmUgdW5pcXVlbmVzcyBmb3Igcm9sZSBuYW1lOiAnLCBlcnJvcik7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfSk7XG5cbiAgICBjb25zdCBpbmRleFByb21pc2UgPSB0aGlzLmFkYXB0ZXIudXBkYXRlU2NoZW1hV2l0aEluZGV4ZXMoKTtcblxuICAgIC8vIENyZWF0ZSB0YWJsZXMgZm9yIHZvbGF0aWxlIGNsYXNzZXNcbiAgICBjb25zdCBhZGFwdGVySW5pdCA9IHRoaXMuYWRhcHRlci5wZXJmb3JtSW5pdGlhbGl6YXRpb24oe1xuICAgICAgVm9sYXRpbGVDbGFzc2VzU2NoZW1hczogU2NoZW1hQ29udHJvbGxlci5Wb2xhdGlsZUNsYXNzZXNTY2hlbWFzLFxuICAgIH0pO1xuICAgIHJldHVybiBQcm9taXNlLmFsbChbXG4gICAgICB1c2VybmFtZVVuaXF1ZW5lc3MsXG4gICAgICBlbWFpbFVuaXF1ZW5lc3MsXG4gICAgICByb2xlVW5pcXVlbmVzcyxcbiAgICAgIGFkYXB0ZXJJbml0LFxuICAgICAgaW5kZXhQcm9taXNlLFxuICAgIF0pO1xuICB9XG5cbiAgc3RhdGljIF92YWxpZGF0ZVF1ZXJ5OiAoYW55LCBib29sZWFuKSA9PiB2b2lkO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IERhdGFiYXNlQ29udHJvbGxlcjtcbi8vIEV4cG9zZSB2YWxpZGF0ZVF1ZXJ5IGZvciB0ZXN0c1xubW9kdWxlLmV4cG9ydHMuX3ZhbGlkYXRlUXVlcnkgPSB2YWxpZGF0ZVF1ZXJ5O1xuIl19