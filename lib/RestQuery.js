"use strict";

// An object that encapsulates everything we need to run a 'find'
// operation, encoded in the REST API format.
var SchemaController = require('./Controllers/SchemaController');

var Parse = require('parse/node').Parse;

const triggers = require('./triggers');

const {
  continueWhile
} = require('parse/lib/node/promiseUtils');

const AlwaysSelectedKeys = ['objectId', 'createdAt', 'updatedAt', 'ACL']; // restOptions can include:
//   skip
//   limit
//   order
//   count
//   include
//   keys
//   excludeKeys
//   redirectClassNameForKey
//   readPreference
//   includeReadPreference
//   subqueryReadPreference

function RestQuery(config, auth, className, restWhere = {}, restOptions = {}, clientSDK) {
  this.config = config;
  this.auth = auth;
  this.className = className;
  this.restWhere = restWhere;
  this.restOptions = restOptions;
  this.clientSDK = clientSDK;
  this.response = null;
  this.findOptions = {};

  if (!this.auth.isMaster) {
    if (this.className == '_Session' || this.className == 'AdminSession') {
      if (!this.auth.user) {
        throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
      }

      this.restWhere = {
        $and: [this.restWhere, {
          user: {
            __type: 'Pointer',
            className: '_User',
            objectId: this.auth.user.id
          }
        }]
      };
    }
  }

  this.doCount = false;
  this.includeAll = false; // The format for this.include is not the same as the format for the
  // include option - it's the paths we should include, in order,
  // stored as arrays, taking into account that we need to include foo
  // before including foo.bar. Also it should dedupe.
  // For example, passing an arg of include=foo.bar,foo.baz could lead to
  // this.include = [['foo'], ['foo', 'baz'], ['foo', 'bar']]

  this.include = []; // If we have keys, we probably want to force some includes (n-1 level)
  // See issue: https://github.com/parse-community/parse-server/issues/3185

  if (restOptions.hasOwnProperty('keys')) {
    const keysForInclude = restOptions.keys.split(',').filter(key => {
      // At least 2 components
      return key.split('.').length > 1;
    }).map(key => {
      // Slice the last component (a.b.c -> a.b)
      // Otherwise we'll include one level too much.
      return key.slice(0, key.lastIndexOf('.'));
    }).join(','); // Concat the possibly present include string with the one from the keys
    // Dedup / sorting is handle in 'include' case.

    if (keysForInclude.length > 0) {
      if (!restOptions.include || restOptions.include.length == 0) {
        restOptions.include = keysForInclude;
      } else {
        restOptions.include += ',' + keysForInclude;
      }
    }
  }

  for (var option in restOptions) {
    switch (option) {
      case 'keys':
        {
          const keys = restOptions.keys.split(',').concat(AlwaysSelectedKeys);
          this.keys = Array.from(new Set(keys));
          break;
        }

      case 'excludeKeys':
        {
          const exclude = restOptions.excludeKeys.split(',').filter(k => AlwaysSelectedKeys.indexOf(k) < 0);
          this.excludeKeys = Array.from(new Set(exclude));
          break;
        }

      case 'count':
        this.doCount = true;
        break;

      case 'includeAll':
        this.includeAll = true;
        break;

      case 'distinct':
      case 'pipeline':
      case 'skip':
      case 'limit':
      case 'readPreference':
        this.findOptions[option] = restOptions[option];
        break;

      case 'order':
        var fields = restOptions.order.split(',');
        this.findOptions.sort = fields.reduce((sortMap, field) => {
          field = field.trim();

          if (field === '$score') {
            sortMap.score = {
              $meta: 'textScore'
            };
          } else if (field[0] == '-') {
            sortMap[field.slice(1)] = -1;
          } else {
            sortMap[field] = 1;
          }

          return sortMap;
        }, {});
        break;

      case 'include':
        {
          const paths = restOptions.include.split(',');

          if (paths.includes('*')) {
            this.includeAll = true;
            break;
          } // Load the existing includes (from keys)


          const pathSet = paths.reduce((memo, path) => {
            // Split each paths on . (a.b.c -> [a,b,c])
            // reduce to create all paths
            // ([a,b,c] -> {a: true, 'a.b': true, 'a.b.c': true})
            return path.split('.').reduce((memo, path, index, parts) => {
              memo[parts.slice(0, index + 1).join('.')] = true;
              return memo;
            }, memo);
          }, {});
          this.include = Object.keys(pathSet).map(s => {
            return s.split('.');
          }).sort((a, b) => {
            return a.length - b.length; // Sort by number of components
          });
          break;
        }

      case 'redirectClassNameForKey':
        this.redirectKey = restOptions.redirectClassNameForKey;
        this.redirectClassName = null;
        break;

      case 'includeReadPreference':
      case 'subqueryReadPreference':
        break;

      default:
        throw new Parse.Error(Parse.Error.INVALID_JSON, 'bad option: ' + option);
    }
  }
} // A convenient method to perform all the steps of processing a query
// in order.
// Returns a promise for the response - an object with optional keys
// 'results' and 'count'.
// TODO: consolidate the replaceX functions


RestQuery.prototype.execute = function (executeOptions) {
  return Promise.resolve().then(() => {
    return this.buildRestWhere();
  }).then(() => {
    return this.handleIncludeAll();
  }).then(() => {
    return this.handleExcludeKeys();
  }).then(() => {
    return this.runFind(executeOptions);
  }).then(() => {
    return this.runCount();
  }).then(() => {
    return this.handleInclude();
  }).then(() => {
    return this.runAfterFindTrigger();
  }).then(() => {
    return this.response;
  });
};

RestQuery.prototype.each = function (callback) {
  const {
    config,
    auth,
    className,
    restWhere,
    restOptions,
    clientSDK
  } = this; // if the limit is set, use it

  restOptions.limit = restOptions.limit || 100;
  restOptions.order = 'objectId';
  let finished = false;
  return continueWhile(() => {
    return !finished;
  }, async () => {
    const query = new RestQuery(config, auth, className, restWhere, restOptions, clientSDK);
    const {
      results
    } = await query.execute();
    results.forEach(callback);
    finished = results.length < restOptions.limit;

    if (!finished) {
      restWhere.objectId = Object.assign({}, restWhere.objectId, {
        $gt: results[results.length - 1].objectId
      });
    }
  });
};

RestQuery.prototype.buildRestWhere = function () {
  return Promise.resolve().then(() => {
    return this.getUserAndRoleACL();
  }).then(() => {
    return this.redirectClassNameForKey();
  }).then(() => {
    return this.validateClientClassCreation();
  }).then(() => {
    return this.replaceSelect();
  }).then(() => {
    return this.replaceDontSelect();
  }).then(() => {
    return this.replaceInQuery();
  }).then(() => {
    return this.replaceNotInQuery();
  }).then(() => {
    return this.replaceEquality();
  });
}; // Uses the Auth object to get the list of roles, adds the user id


RestQuery.prototype.getUserAndRoleACL = function () {
  if (this.auth.isMaster) {
    return Promise.resolve();
  }

  this.findOptions.acl = ['*'];

  if (this.auth.user) {
    return this.auth.getUserRoles().then(roles => {
      this.findOptions.acl = this.findOptions.acl.concat(roles, [this.auth.user.id]);
      return;
    });
  } else {
    return Promise.resolve();
  }
}; // Changes the className if redirectClassNameForKey is set.
// Returns a promise.


RestQuery.prototype.redirectClassNameForKey = function () {
  if (!this.redirectKey) {
    return Promise.resolve();
  } // We need to change the class name based on the schema


  return this.config.database.redirectClassNameForKey(this.className, this.redirectKey).then(newClassName => {
    this.className = newClassName;
    this.redirectClassName = newClassName;
  });
}; // Validates this operation against the allowClientClassCreation config.


RestQuery.prototype.validateClientClassCreation = function () {
  if (this.config.allowClientClassCreation === false && !this.auth.isMaster && SchemaController.systemClasses.indexOf(this.className) === -1) {
    return this.config.database.loadSchema().then(schemaController => schemaController.hasClass(this.className)).then(hasClass => {
      if (hasClass !== true) {
        throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'This user is not allowed to access ' + 'non-existent class: ' + this.className);
      }
    });
  } else {
    return Promise.resolve();
  }
};

function transformInQuery(inQueryObject, className, results) {
  var values = [];

  for (var result of results) {
    values.push({
      __type: 'Pointer',
      className: className,
      objectId: result.objectId
    });
  }

  delete inQueryObject['$inQuery'];

  if (Array.isArray(inQueryObject['$in'])) {
    inQueryObject['$in'] = inQueryObject['$in'].concat(values);
  } else {
    inQueryObject['$in'] = values;
  }
} // Replaces a $inQuery clause by running the subquery, if there is an
// $inQuery clause.
// The $inQuery clause turns into an $in with values that are just
// pointers to the objects returned in the subquery.


RestQuery.prototype.replaceInQuery = function () {
  var inQueryObject = findObjectWithKey(this.restWhere, '$inQuery');

  if (!inQueryObject) {
    return;
  } // The inQuery value must have precisely two keys - where and className


  var inQueryValue = inQueryObject['$inQuery'];

  if (!inQueryValue.where || !inQueryValue.className) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'improper usage of $inQuery');
  }

  const additionalOptions = {
    redirectClassNameForKey: inQueryValue.redirectClassNameForKey
  };

  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }

  var subquery = new RestQuery(this.config, this.auth, inQueryValue.className, inQueryValue.where, additionalOptions);
  return subquery.execute().then(response => {
    transformInQuery(inQueryObject, subquery.className, response.results); // Recurse to repeat

    return this.replaceInQuery();
  });
};

function transformNotInQuery(notInQueryObject, className, results) {
  var values = [];

  for (var result of results) {
    values.push({
      __type: 'Pointer',
      className: className,
      objectId: result.objectId
    });
  }

  delete notInQueryObject['$notInQuery'];

  if (Array.isArray(notInQueryObject['$nin'])) {
    notInQueryObject['$nin'] = notInQueryObject['$nin'].concat(values);
  } else {
    notInQueryObject['$nin'] = values;
  }
} // Replaces a $notInQuery clause by running the subquery, if there is an
// $notInQuery clause.
// The $notInQuery clause turns into a $nin with values that are just
// pointers to the objects returned in the subquery.


RestQuery.prototype.replaceNotInQuery = function () {
  var notInQueryObject = findObjectWithKey(this.restWhere, '$notInQuery');

  if (!notInQueryObject) {
    return;
  } // The notInQuery value must have precisely two keys - where and className


  var notInQueryValue = notInQueryObject['$notInQuery'];

  if (!notInQueryValue.where || !notInQueryValue.className) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'improper usage of $notInQuery');
  }

  const additionalOptions = {
    redirectClassNameForKey: notInQueryValue.redirectClassNameForKey
  };

  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }

  var subquery = new RestQuery(this.config, this.auth, notInQueryValue.className, notInQueryValue.where, additionalOptions);
  return subquery.execute().then(response => {
    transformNotInQuery(notInQueryObject, subquery.className, response.results); // Recurse to repeat

    return this.replaceNotInQuery();
  });
};

const transformSelect = (selectObject, key, objects) => {
  var values = [];

  for (var result of objects) {
    values.push(key.split('.').reduce((o, i) => o[i], result));
  }

  delete selectObject['$select'];

  if (Array.isArray(selectObject['$in'])) {
    selectObject['$in'] = selectObject['$in'].concat(values);
  } else {
    selectObject['$in'] = values;
  }
}; // Replaces a $select clause by running the subquery, if there is a
// $select clause.
// The $select clause turns into an $in with values selected out of
// the subquery.
// Returns a possible-promise.


RestQuery.prototype.replaceSelect = function () {
  var selectObject = findObjectWithKey(this.restWhere, '$select');

  if (!selectObject) {
    return;
  } // The select value must have precisely two keys - query and key


  var selectValue = selectObject['$select']; // iOS SDK don't send where if not set, let it pass

  if (!selectValue.query || !selectValue.key || typeof selectValue.query !== 'object' || !selectValue.query.className || Object.keys(selectValue).length !== 2) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'improper usage of $select');
  }

  const additionalOptions = {
    redirectClassNameForKey: selectValue.query.redirectClassNameForKey
  };

  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }

  var subquery = new RestQuery(this.config, this.auth, selectValue.query.className, selectValue.query.where, additionalOptions);
  return subquery.execute().then(response => {
    transformSelect(selectObject, selectValue.key, response.results); // Keep replacing $select clauses

    return this.replaceSelect();
  });
};

const transformDontSelect = (dontSelectObject, key, objects) => {
  var values = [];

  for (var result of objects) {
    values.push(key.split('.').reduce((o, i) => o[i], result));
  }

  delete dontSelectObject['$dontSelect'];

  if (Array.isArray(dontSelectObject['$nin'])) {
    dontSelectObject['$nin'] = dontSelectObject['$nin'].concat(values);
  } else {
    dontSelectObject['$nin'] = values;
  }
}; // Replaces a $dontSelect clause by running the subquery, if there is a
// $dontSelect clause.
// The $dontSelect clause turns into an $nin with values selected out of
// the subquery.
// Returns a possible-promise.


RestQuery.prototype.replaceDontSelect = function () {
  var dontSelectObject = findObjectWithKey(this.restWhere, '$dontSelect');

  if (!dontSelectObject) {
    return;
  } // The dontSelect value must have precisely two keys - query and key


  var dontSelectValue = dontSelectObject['$dontSelect'];

  if (!dontSelectValue.query || !dontSelectValue.key || typeof dontSelectValue.query !== 'object' || !dontSelectValue.query.className || Object.keys(dontSelectValue).length !== 2) {
    throw new Parse.Error(Parse.Error.INVALID_QUERY, 'improper usage of $dontSelect');
  }

  const additionalOptions = {
    redirectClassNameForKey: dontSelectValue.query.redirectClassNameForKey
  };

  if (this.restOptions.subqueryReadPreference) {
    additionalOptions.readPreference = this.restOptions.subqueryReadPreference;
    additionalOptions.subqueryReadPreference = this.restOptions.subqueryReadPreference;
  } else if (this.restOptions.readPreference) {
    additionalOptions.readPreference = this.restOptions.readPreference;
  }

  var subquery = new RestQuery(this.config, this.auth, dontSelectValue.query.className, dontSelectValue.query.where, additionalOptions);
  return subquery.execute().then(response => {
    transformDontSelect(dontSelectObject, dontSelectValue.key, response.results); // Keep replacing $dontSelect clauses

    return this.replaceDontSelect();
  });
};

const cleanResultAuthData = function (result) {
  delete result.password;

  if (result.authData) {
    Object.keys(result.authData).forEach(provider => {
      if (result.authData[provider] === null) {
        delete result.authData[provider];
      }
    });

    if (Object.keys(result.authData).length == 0) {
      delete result.authData;
    }
  }
};

const replaceEqualityConstraint = constraint => {
  if (typeof constraint !== 'object') {
    return constraint;
  }

  const equalToObject = {};
  let hasDirectConstraint = false;
  let hasOperatorConstraint = false;

  for (const key in constraint) {
    if (key.indexOf('$') !== 0) {
      hasDirectConstraint = true;
      equalToObject[key] = constraint[key];
    } else {
      hasOperatorConstraint = true;
    }
  }

  if (hasDirectConstraint && hasOperatorConstraint) {
    constraint['$eq'] = equalToObject;
    Object.keys(equalToObject).forEach(key => {
      delete constraint[key];
    });
  }

  return constraint;
};

RestQuery.prototype.replaceEquality = function () {
  if (typeof this.restWhere !== 'object') {
    return;
  }

  for (const key in this.restWhere) {
    this.restWhere[key] = replaceEqualityConstraint(this.restWhere[key]);
  }
}; // Returns a promise for whether it was successful.
// Populates this.response with an object that only has 'results'.


RestQuery.prototype.runFind = function (options = {}) {
  if (this.findOptions.limit === 0) {
    this.response = {
      results: []
    };
    return Promise.resolve();
  }

  const findOptions = Object.assign({}, this.findOptions);

  if (this.keys) {
    findOptions.keys = this.keys.map(key => {
      return key.split('.')[0];
    });
  }

  if (options.op) {
    findOptions.op = options.op;
  }

  return this.config.database.find(this.className, this.restWhere, findOptions, this.auth).then(results => {
    if (this.className === '_User') {
      for (var result of results) {
        cleanResultAuthData(result);
      }
    }

    this.config.filesController.expandFilesInObject(this.config, results);

    if (this.redirectClassName) {
      for (var r of results) {
        r.className = this.redirectClassName;
      }
    }

    this.response = {
      results: results
    };
  });
}; // Returns a promise for whether it was successful.
// Populates this.response.count with the count


RestQuery.prototype.runCount = function () {
  if (!this.doCount) {
    return;
  }

  this.findOptions.count = true;
  delete this.findOptions.skip;
  delete this.findOptions.limit;
  return this.config.database.find(this.className, this.restWhere, this.findOptions).then(c => {
    this.response.count = c;
  });
}; // Augments this.response with all pointers on an object


RestQuery.prototype.handleIncludeAll = function () {
  if (!this.includeAll) {
    return;
  }

  return this.config.database.loadSchema().then(schemaController => schemaController.getOneSchema(this.className)).then(schema => {
    const includeFields = [];
    const keyFields = [];

    for (const field in schema.fields) {
      if (schema.fields[field].type && schema.fields[field].type === 'Pointer') {
        includeFields.push([field]);
        keyFields.push(field);
      }
    } // Add fields to include, keys, remove dups


    this.include = [...new Set([...this.include, ...includeFields])]; // if this.keys not set, then all keys are already included

    if (this.keys) {
      this.keys = [...new Set([...this.keys, ...keyFields])];
    }
  });
}; // Updates property `this.keys` to contain all keys but the ones unselected.


RestQuery.prototype.handleExcludeKeys = function () {
  if (!this.excludeKeys) {
    return;
  }

  if (this.keys) {
    this.keys = this.keys.filter(k => !this.excludeKeys.includes(k));
    return;
  }

  return this.config.database.loadSchema().then(schemaController => schemaController.getOneSchema(this.className)).then(schema => {
    const fields = Object.keys(schema.fields);
    this.keys = fields.filter(k => !this.excludeKeys.includes(k));
  });
}; // Augments this.response with data at the paths provided in this.include.


RestQuery.prototype.handleInclude = function () {
  if (this.include.length == 0) {
    return;
  }

  var pathResponse = includePath(this.config, this.auth, this.response, this.include[0], this.restOptions);

  if (pathResponse.then) {
    return pathResponse.then(newResponse => {
      this.response = newResponse;
      this.include = this.include.slice(1);
      return this.handleInclude();
    });
  } else if (this.include.length > 0) {
    this.include = this.include.slice(1);
    return this.handleInclude();
  }

  return pathResponse;
}; //Returns a promise of a processed set of results


RestQuery.prototype.runAfterFindTrigger = function () {
  if (!this.response) {
    return;
  } // Avoid doing any setup for triggers if there is no 'afterFind' trigger for this class.


  const hasAfterFindHook = triggers.triggerExists(this.className, triggers.Types.afterFind, this.config.applicationId);

  if (!hasAfterFindHook) {
    return Promise.resolve();
  } // Skip Aggregate and Distinct Queries


  if (this.findOptions.pipeline || this.findOptions.distinct) {
    return Promise.resolve();
  } // Run afterFind trigger and set the new results


  return triggers.maybeRunAfterFindTrigger(triggers.Types.afterFind, this.auth, this.className, this.response.results, this.config).then(results => {
    // Ensure we properly set the className back
    if (this.redirectClassName) {
      this.response.results = results.map(object => {
        if (object instanceof Parse.Object) {
          object = object.toJSON();
        }

        object.className = this.redirectClassName;
        return object;
      });
    } else {
      this.response.results = results;
    }
  });
}; // Adds included values to the response.
// Path is a list of field names.
// Returns a promise for an augmented response.


function includePath(config, auth, response, path, restOptions = {}) {
  var pointers = findPointers(response.results, path);

  if (pointers.length == 0) {
    return response;
  }

  const pointersHash = {};

  for (var pointer of pointers) {
    if (!pointer) {
      continue;
    }

    const className = pointer.className; // only include the good pointers

    if (className) {
      pointersHash[className] = pointersHash[className] || new Set();
      pointersHash[className].add(pointer.objectId);
    }
  }

  const includeRestOptions = {};

  if (restOptions.keys) {
    const keys = new Set(restOptions.keys.split(','));
    const keySet = Array.from(keys).reduce((set, key) => {
      const keyPath = key.split('.');
      let i = 0;

      for (i; i < path.length; i++) {
        if (path[i] != keyPath[i]) {
          return set;
        }
      }

      if (i < keyPath.length) {
        set.add(keyPath[i]);
      }

      return set;
    }, new Set());

    if (keySet.size > 0) {
      includeRestOptions.keys = Array.from(keySet).join(',');
    }
  }

  if (restOptions.includeReadPreference) {
    includeRestOptions.readPreference = restOptions.includeReadPreference;
    includeRestOptions.includeReadPreference = restOptions.includeReadPreference;
  } else if (restOptions.readPreference) {
    includeRestOptions.readPreference = restOptions.readPreference;
  }

  const queryPromises = Object.keys(pointersHash).map(className => {
    const objectIds = Array.from(pointersHash[className]);
    let where;

    if (objectIds.length === 1) {
      where = {
        objectId: objectIds[0]
      };
    } else {
      where = {
        objectId: {
          $in: objectIds
        }
      };
    }

    var query = new RestQuery(config, auth, className, where, includeRestOptions);
    return query.execute({
      op: 'get'
    }).then(results => {
      results.className = className;
      return Promise.resolve(results);
    });
  }); // Get the objects for all these object ids

  return Promise.all(queryPromises).then(responses => {
    var replace = responses.reduce((replace, includeResponse) => {
      for (var obj of includeResponse.results) {
        obj.__type = 'Object';
        obj.className = includeResponse.className;

        if (obj.className == '_User' && !auth.isMaster) {
          delete obj.sessionToken;
          delete obj.authData;
        }

        replace[obj.objectId] = obj;
      }

      return replace;
    }, {});
    var resp = {
      results: replacePointers(response.results, path, replace)
    };

    if (response.count) {
      resp.count = response.count;
    }

    return resp;
  });
} // Object may be a list of REST-format object to find pointers in, or
// it may be a single object.
// If the path yields things that aren't pointers, this throws an error.
// Path is a list of fields to search into.
// Returns a list of pointers in REST format.


function findPointers(object, path) {
  if (object instanceof Array) {
    var answer = [];

    for (var x of object) {
      answer = answer.concat(findPointers(x, path));
    }

    return answer;
  }

  if (typeof object !== 'object' || !object) {
    return [];
  }

  if (path.length == 0) {
    if (object === null || object.__type == 'Pointer') {
      return [object];
    }

    return [];
  }

  var subobject = object[path[0]];

  if (!subobject) {
    return [];
  }

  return findPointers(subobject, path.slice(1));
} // Object may be a list of REST-format objects to replace pointers
// in, or it may be a single object.
// Path is a list of fields to search into.
// replace is a map from object id -> object.
// Returns something analogous to object, but with the appropriate
// pointers inflated.


function replacePointers(object, path, replace) {
  if (object instanceof Array) {
    return object.map(obj => replacePointers(obj, path, replace)).filter(obj => typeof obj !== 'undefined');
  }

  if (typeof object !== 'object' || !object) {
    return object;
  }

  if (path.length === 0) {
    if (object && object.__type === 'Pointer') {
      return replace[object.objectId];
    }

    return object;
  }

  var subobject = object[path[0]];

  if (!subobject) {
    return object;
  }

  var newsub = replacePointers(subobject, path.slice(1), replace);
  var answer = {};

  for (var key in object) {
    if (key == path[0]) {
      answer[key] = newsub;
    } else {
      answer[key] = object[key];
    }
  }

  return answer;
} // Finds a subobject that has the given key, if there is one.
// Returns undefined otherwise.


function findObjectWithKey(root, key) {
  if (typeof root !== 'object') {
    return;
  }

  if (root instanceof Array) {
    for (var item of root) {
      const answer = findObjectWithKey(item, key);

      if (answer) {
        return answer;
      }
    }
  }

  if (root && root[key]) {
    return root;
  }

  for (var subkey in root) {
    const answer = findObjectWithKey(root[subkey], key);

    if (answer) {
      return answer;
    }
  }
}

module.exports = RestQuery;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9SZXN0UXVlcnkuanMiXSwibmFtZXMiOlsiU2NoZW1hQ29udHJvbGxlciIsInJlcXVpcmUiLCJQYXJzZSIsInRyaWdnZXJzIiwiY29udGludWVXaGlsZSIsIkFsd2F5c1NlbGVjdGVkS2V5cyIsIlJlc3RRdWVyeSIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJyZXN0V2hlcmUiLCJyZXN0T3B0aW9ucyIsImNsaWVudFNESyIsInJlc3BvbnNlIiwiZmluZE9wdGlvbnMiLCJpc01hc3RlciIsInVzZXIiLCJFcnJvciIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsIiRhbmQiLCJfX3R5cGUiLCJvYmplY3RJZCIsImlkIiwiZG9Db3VudCIsImluY2x1ZGVBbGwiLCJpbmNsdWRlIiwiaGFzT3duUHJvcGVydHkiLCJrZXlzRm9ySW5jbHVkZSIsImtleXMiLCJzcGxpdCIsImZpbHRlciIsImtleSIsImxlbmd0aCIsIm1hcCIsInNsaWNlIiwibGFzdEluZGV4T2YiLCJqb2luIiwib3B0aW9uIiwiY29uY2F0IiwiQXJyYXkiLCJmcm9tIiwiU2V0IiwiZXhjbHVkZSIsImV4Y2x1ZGVLZXlzIiwiayIsImluZGV4T2YiLCJmaWVsZHMiLCJvcmRlciIsInNvcnQiLCJyZWR1Y2UiLCJzb3J0TWFwIiwiZmllbGQiLCJ0cmltIiwic2NvcmUiLCIkbWV0YSIsInBhdGhzIiwiaW5jbHVkZXMiLCJwYXRoU2V0IiwibWVtbyIsInBhdGgiLCJpbmRleCIsInBhcnRzIiwiT2JqZWN0IiwicyIsImEiLCJiIiwicmVkaXJlY3RLZXkiLCJyZWRpcmVjdENsYXNzTmFtZUZvcktleSIsInJlZGlyZWN0Q2xhc3NOYW1lIiwiSU5WQUxJRF9KU09OIiwicHJvdG90eXBlIiwiZXhlY3V0ZSIsImV4ZWN1dGVPcHRpb25zIiwiUHJvbWlzZSIsInJlc29sdmUiLCJ0aGVuIiwiYnVpbGRSZXN0V2hlcmUiLCJoYW5kbGVJbmNsdWRlQWxsIiwiaGFuZGxlRXhjbHVkZUtleXMiLCJydW5GaW5kIiwicnVuQ291bnQiLCJoYW5kbGVJbmNsdWRlIiwicnVuQWZ0ZXJGaW5kVHJpZ2dlciIsImVhY2giLCJjYWxsYmFjayIsImxpbWl0IiwiZmluaXNoZWQiLCJxdWVyeSIsInJlc3VsdHMiLCJmb3JFYWNoIiwiYXNzaWduIiwiJGd0IiwiZ2V0VXNlckFuZFJvbGVBQ0wiLCJ2YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24iLCJyZXBsYWNlU2VsZWN0IiwicmVwbGFjZURvbnRTZWxlY3QiLCJyZXBsYWNlSW5RdWVyeSIsInJlcGxhY2VOb3RJblF1ZXJ5IiwicmVwbGFjZUVxdWFsaXR5IiwiYWNsIiwiZ2V0VXNlclJvbGVzIiwicm9sZXMiLCJkYXRhYmFzZSIsIm5ld0NsYXNzTmFtZSIsImFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiIsInN5c3RlbUNsYXNzZXMiLCJsb2FkU2NoZW1hIiwic2NoZW1hQ29udHJvbGxlciIsImhhc0NsYXNzIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsInRyYW5zZm9ybUluUXVlcnkiLCJpblF1ZXJ5T2JqZWN0IiwidmFsdWVzIiwicmVzdWx0IiwicHVzaCIsImlzQXJyYXkiLCJmaW5kT2JqZWN0V2l0aEtleSIsImluUXVlcnlWYWx1ZSIsIndoZXJlIiwiSU5WQUxJRF9RVUVSWSIsImFkZGl0aW9uYWxPcHRpb25zIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsInJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnkiLCJ0cmFuc2Zvcm1Ob3RJblF1ZXJ5Iiwibm90SW5RdWVyeU9iamVjdCIsIm5vdEluUXVlcnlWYWx1ZSIsInRyYW5zZm9ybVNlbGVjdCIsInNlbGVjdE9iamVjdCIsIm9iamVjdHMiLCJvIiwiaSIsInNlbGVjdFZhbHVlIiwidHJhbnNmb3JtRG9udFNlbGVjdCIsImRvbnRTZWxlY3RPYmplY3QiLCJkb250U2VsZWN0VmFsdWUiLCJjbGVhblJlc3VsdEF1dGhEYXRhIiwicGFzc3dvcmQiLCJhdXRoRGF0YSIsInByb3ZpZGVyIiwicmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCIsImNvbnN0cmFpbnQiLCJlcXVhbFRvT2JqZWN0IiwiaGFzRGlyZWN0Q29uc3RyYWludCIsImhhc09wZXJhdG9yQ29uc3RyYWludCIsIm9wdGlvbnMiLCJvcCIsImZpbmQiLCJmaWxlc0NvbnRyb2xsZXIiLCJleHBhbmRGaWxlc0luT2JqZWN0IiwiciIsImNvdW50Iiwic2tpcCIsImMiLCJnZXRPbmVTY2hlbWEiLCJzY2hlbWEiLCJpbmNsdWRlRmllbGRzIiwia2V5RmllbGRzIiwidHlwZSIsInBhdGhSZXNwb25zZSIsImluY2x1ZGVQYXRoIiwibmV3UmVzcG9uc2UiLCJoYXNBZnRlckZpbmRIb29rIiwidHJpZ2dlckV4aXN0cyIsIlR5cGVzIiwiYWZ0ZXJGaW5kIiwiYXBwbGljYXRpb25JZCIsInBpcGVsaW5lIiwiZGlzdGluY3QiLCJtYXliZVJ1bkFmdGVyRmluZFRyaWdnZXIiLCJvYmplY3QiLCJ0b0pTT04iLCJwb2ludGVycyIsImZpbmRQb2ludGVycyIsInBvaW50ZXJzSGFzaCIsInBvaW50ZXIiLCJhZGQiLCJpbmNsdWRlUmVzdE9wdGlvbnMiLCJrZXlTZXQiLCJzZXQiLCJrZXlQYXRoIiwic2l6ZSIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsInF1ZXJ5UHJvbWlzZXMiLCJvYmplY3RJZHMiLCIkaW4iLCJhbGwiLCJyZXNwb25zZXMiLCJyZXBsYWNlIiwiaW5jbHVkZVJlc3BvbnNlIiwib2JqIiwic2Vzc2lvblRva2VuIiwicmVzcCIsInJlcGxhY2VQb2ludGVycyIsImFuc3dlciIsIngiLCJzdWJvYmplY3QiLCJuZXdzdWIiLCJyb290IiwiaXRlbSIsInN1YmtleSIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiI7O0FBQUE7QUFDQTtBQUVBLElBQUlBLGdCQUFnQixHQUFHQyxPQUFPLENBQUMsZ0NBQUQsQ0FBOUI7O0FBQ0EsSUFBSUMsS0FBSyxHQUFHRCxPQUFPLENBQUMsWUFBRCxDQUFQLENBQXNCQyxLQUFsQzs7QUFDQSxNQUFNQyxRQUFRLEdBQUdGLE9BQU8sQ0FB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Q0Y7O0FBQ0QsU0FBT21LLE1BQVA7QUFDRCxDLENBRUQ7QUFDQTs7O0FBQ0EsU0FBUzlFLGlCQUFULENBQTJCa0YsSUFBM0IsRUFBaUN2SyxHQUFqQyxFQUFzQztBQUNwQyxNQUFJLE9BQU91SyxJQUFQLEtBQWdCLFFBQXBCLEVBQThCO0FBQzVCO0FBQ0Q7O0FBQ0QsTUFBSUEsSUFBSSxZQUFZL0osS0FBcEIsRUFBMkI7QUFDekIsU0FBSyxJQUFJZ0ssSUFBVCxJQUFpQkQsSUFBakIsRUFBdUI7QUFDckIsWUFBTUosTUFBTSxHQUFHOUUsaUJBQWlCLENBQUNtRixJQUFELEVBQU94SyxHQUFQLENBQWhDOztBQUNBLFVBQUltSyxNQUFKLEVBQVk7QUFDVixlQUFPQSxNQUFQO0FBQ0Q7QUFDRjtBQUNGOztBQUNELE1BQUlJLElBQUksSUFBSUEsSUFBSSxDQUFDdkssR0FBRCxDQUFoQixFQUF1QjtBQUNyQixXQUFPdUssSUFBUDtBQUNEOztBQUNELE9BQUssSUFBSUUsTUFBVCxJQUFtQkYsSUFBbkIsRUFBeUI7QUFDdkIsVUFBTUosTUFBTSxHQUFHOUUsaUJBQWlCLENBQUNrRixJQUFJLENBQUNFLE1BQUQsQ0FBTCxFQUFlekssR0FBZixDQUFoQzs7QUFDQSxRQUFJbUssTUFBSixFQUFZO0FBQ1YsYUFBT0EsTUFBUDtBQUNEO0FBQ0Y7QUFDRjs7QUFFRE8sTUFBTSxDQUFDQyxPQUFQLEdBQWlCcE0sU0FBakIiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBbiBvYmplY3QgdGhhdCBlbmNhcHN1bGF0ZXMgZXZlcnl0aGluZyB3ZSBuZWVkIHRvIHJ1biBhICdmaW5kJ1xuLy8gb3BlcmF0aW9uLCBlbmNvZGVkIGluIHRoZSBSRVNUIEFQSSBmb3JtYXQuXG5cbnZhciBTY2hlbWFDb250cm9sbGVyID0gcmVxdWlyZSgnLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJyk7XG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2U7XG5jb25zdCB0cmlnZ2VycyA9IHJlcXVpcmUoJy4vdHJpZ2dlcnMnKTtcbmNvbnN0IHsgY29udGludWVXaGlsZSB9ID0gcmVxdWlyZSgncGFyc2UvbGliL25vZGUvcHJvbWlzZVV0aWxzJyk7XG5jb25zdCBBbHdheXNTZWxlY3RlZEtleXMgPSBbJ29iamVjdElkJywgJ2NyZWF0ZWRBdCcsICd1cGRhdGVkQXQnLCAnQUNMJ107XG4vLyByZXN0T3B0aW9ucyBjYW4gaW5jbHVkZTpcbi8vICAgc2tpcFxuLy8gICBsaW1pdFxuLy8gICBvcmRlclxuLy8gICBjb3VudFxuLy8gICBpbmNsdWRlXG4vLyAgIGtleXNcbi8vICAgZXhjbHVkZUtleXNcbi8vICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXlcbi8vICAgcmVhZFByZWZlcmVuY2Vcbi8vICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlXG4vLyAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2VcbmZ1bmN0aW9uIFJlc3RRdWVyeShcbiAgY29uZmlnLFxuICBhdXRoLFxuICBjbGFzc05hbWUsXG4gIHJlc3RXaGVyZSA9IHt9LFxuICByZXN0T3B0aW9ucyA9IHt9LFxuICBjbGllbnRTREtcbikge1xuICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgdGhpcy5hdXRoID0gYXV0aDtcbiAgdGhpcy5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gIHRoaXMucmVzdFdoZXJlID0gcmVzdFdoZXJlO1xuICB0aGlzLnJlc3RPcHRpb25zID0gcmVzdE9wdGlvbnM7XG4gIHRoaXMuY2xpZW50U0RLID0gY2xpZW50U0RLO1xuICB0aGlzLnJlc3BvbnNlID0gbnVsbDtcbiAgdGhpcy5maW5kT3B0aW9ucyA9IHt9O1xuXG4gIGlmICghdGhpcy5hdXRoLmlzTWFzdGVyKSB7XG4gICAgaWYgKHRoaXMuY2xhc3NOYW1lID09ICdfU2Vzc2lvbicgfHwgdGhpcy5jbGFzc05hbWUgPT0gJ0FkbWluU2Vzc2lvbicpIHtcbiAgICAgIGlmICghdGhpcy5hdXRoLnVzZXIpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTixcbiAgICAgICAgICAnSW52YWxpZCBzZXNzaW9uIHRva2VuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgdGhpcy5yZXN0V2hlcmUgPSB7XG4gICAgICAgICRhbmQ6IFtcbiAgICAgICAgICB0aGlzLnJlc3RXaGVyZSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgICAgICAgIG9iamVjdElkOiB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgdGhpcy5kb0NvdW50ID0gZmFsc2U7XG4gIHRoaXMuaW5jbHVkZUFsbCA9IGZhbHNlO1xuXG4gIC8vIFRoZSBmb3JtYXQgZm9yIHRoaXMuaW5jbHVkZSBpcyBub3QgdGhlIHNhbWUgYXMgdGhlIGZvcm1hdCBmb3IgdGhlXG4gIC8vIGluY2x1ZGUgb3B0aW9uIC0gaXQncyB0aGUgcGF0aHMgd2Ugc2hvdWxkIGluY2x1ZGUsIGluIG9yZGVyLFxuICAvLyBzdG9yZWQgYXMgYXJyYXlzLCB0YWtpbmcgaW50byBhY2NvdW50IHRoYXQgd2UgbmVlZCB0byBpbmNsdWRlIGZvb1xuICAvLyBiZWZvcmUgaW5jbHVkaW5nIGZvby5iYXIuIEFsc28gaXQgc2hvdWxkIGRlZHVwZS5cbiAgLy8gRm9yIGV4YW1wbGUsIHBhc3NpbmcgYW4gYXJnIG9mIGluY2x1ZGU9Zm9vLmJhcixmb28uYmF6IGNvdWxkIGxlYWQgdG9cbiAgLy8gdGhpcy5pbmNsdWRlID0gW1snZm9vJ10sIFsnZm9vJywgJ2JheiddLCBbJ2ZvbycsICdiYXInXV1cbiAgdGhpcy5pbmNsdWRlID0gW107XG5cbiAgLy8gSWYgd2UgaGF2ZSBrZXlzLCB3ZSBwcm9iYWJseSB3YW50IHRvIGZvcmNlIHNvbWUgaW5jbHVkZXMgKG4tMSBsZXZlbClcbiAgLy8gU2VlIGlzc3VlOiBodHRwczovL2dpdGh1Yi5jb20vcGFyc2UtY29tbXVuaXR5L3BhcnNlLXNlcnZlci9pc3N1ZXMvMzE4NVxuICBpZiAocmVzdE9wdGlvbnMuaGFzT3duUHJvcGVydHkoJ2tleXMnKSkge1xuICAgIGNvbnN0IGtleXNGb3JJbmNsdWRlID0gcmVzdE9wdGlvbnMua2V5c1xuICAgICAgLnNwbGl0KCcsJylcbiAgICAgIC5maWx0ZXIoa2V5ID0+IHtcbiAgICAgICAgLy8gQXQgbGVhc3QgMiBjb21wb25lbnRzXG4gICAgICAgIHJldHVybiBrZXkuc3BsaXQoJy4nKS5sZW5ndGggPiAxO1xuICAgICAgfSlcbiAgICAgIC5tYXAoa2V5ID0+IHtcbiAgICAgICAgLy8gU2xpY2UgdGhlIGxhc3QgY29tcG9uZW50IChhLmIuYyAtPiBhLmIpXG4gICAgICAgIC8vIE90aGVyd2lzZSB3ZSdsbCBpbmNsdWRlIG9uZSBsZXZlbCB0b28gbXVjaC5cbiAgICAgICAgcmV0dXJuIGtleS5zbGljZSgwLCBrZXkubGFzdEluZGV4T2YoJy4nKSk7XG4gICAgICB9KVxuICAgICAgLmpvaW4oJywnKTtcblxuICAgIC8vIENvbmNhdCB0aGUgcG9zc2libHkgcHJlc2VudCBpbmNsdWRlIHN0cmluZyB3aXRoIHRoZSBvbmUgZnJvbSB0aGUga2V5c1xuICAgIC8vIERlZHVwIC8gc29ydGluZyBpcyBoYW5kbGUgaW4gJ2luY2x1ZGUnIGNhc2UuXG4gICAgaWYgKGtleXNGb3JJbmNsdWRlLmxlbmd0aCA+IDApIHtcbiAgICAgIGlmICghcmVzdE9wdGlvbnMuaW5jbHVkZSB8fCByZXN0T3B0aW9ucy5pbmNsdWRlLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGUgPSBrZXlzRm9ySW5jbHVkZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3RPcHRpb25zLmluY2x1ZGUgKz0gJywnICsga2V5c0ZvckluY2x1ZGU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZm9yICh2YXIgb3B0aW9uIGluIHJlc3RPcHRpb25zKSB7XG4gICAgc3dpdGNoIChvcHRpb24pIHtcbiAgICAgIGNhc2UgJ2tleXMnOiB7XG4gICAgICAgIGNvbnN0IGtleXMgPSByZXN0T3B0aW9ucy5rZXlzLnNwbGl0KCcsJykuY29uY2F0KEFsd2F5c1NlbGVjdGVkS2V5cyk7XG4gICAgICAgIHRoaXMua2V5cyA9IEFycmF5LmZyb20obmV3IFNldChrZXlzKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgY2FzZSAnZXhjbHVkZUtleXMnOiB7XG4gICAgICAgIGNvbnN0IGV4Y2x1ZGUgPSByZXN0T3B0aW9ucy5leGNsdWRlS2V5c1xuICAgICAgICAgIC5zcGxpdCgnLCcpXG4gICAgICAgICAgLmZpbHRlcihrID0+IEFsd2F5c1NlbGVjdGVkS2V5cy5pbmRleE9mKGspIDwgMCk7XG4gICAgICAgIHRoaXMuZXhjbHVkZUtleXMgPSBBcnJheS5mcm9tKG5ldyBTZXQoZXhjbHVkZSkpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGNhc2UgJ2NvdW50JzpcbiAgICAgICAgdGhpcy5kb0NvdW50ID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdpbmNsdWRlQWxsJzpcbiAgICAgICAgdGhpcy5pbmNsdWRlQWxsID0gdHJ1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdkaXN0aW5jdCc6XG4gICAgICBjYXNlICdwaXBlbGluZSc6XG4gICAgICBjYXNlICdza2lwJzpcbiAgICAgIGNhc2UgJ2xpbWl0JzpcbiAgICAgIGNhc2UgJ3JlYWRQcmVmZXJlbmNlJzpcbiAgICAgICAgdGhpcy5maW5kT3B0aW9uc1tvcHRpb25dID0gcmVzdE9wdGlvbnNbb3B0aW9uXTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdvcmRlcic6XG4gICAgICAgIHZhciBmaWVsZHMgPSByZXN0T3B0aW9ucy5vcmRlci5zcGxpdCgnLCcpO1xuICAgICAgICB0aGlzLmZpbmRPcHRpb25zLnNvcnQgPSBmaWVsZHMucmVkdWNlKChzb3J0TWFwLCBmaWVsZCkgPT4ge1xuICAgICAgICAgIGZpZWxkID0gZmllbGQudHJpbSgpO1xuICAgICAgICAgIGlmIChmaWVsZCA9PT0gJyRzY29yZScpIHtcbiAgICAgICAgICAgIHNvcnRNYXAuc2NvcmUgPSB7ICRtZXRhOiAndGV4dFNjb3JlJyB9O1xuICAgICAgICAgIH0gZWxzZSBpZiAoZmllbGRbMF0gPT0gJy0nKSB7XG4gICAgICAgICAgICBzb3J0TWFwW2ZpZWxkLnNsaWNlKDEpXSA9IC0xO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzb3J0TWFwW2ZpZWxkXSA9IDE7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBzb3J0TWFwO1xuICAgICAgICB9LCB7fSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnaW5jbHVkZSc6IHtcbiAgICAgICAgY29uc3QgcGF0aHMgPSByZXN0T3B0aW9ucy5pbmNsdWRlLnNwbGl0KCcsJyk7XG4gICAgICAgIGlmIChwYXRocy5pbmNsdWRlcygnKicpKSB7XG4gICAgICAgICAgdGhpcy5pbmNsdWRlQWxsID0gdHJ1ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICAvLyBMb2FkIHRoZSBleGlzdGluZyBpbmNsdWRlcyAoZnJvbSBrZXlzKVxuICAgICAgICBjb25zdCBwYXRoU2V0ID0gcGF0aHMucmVkdWNlKChtZW1vLCBwYXRoKSA9PiB7XG4gICAgICAgICAgLy8gU3BsaXQgZWFjaCBwYXRocyBvbiAuIChhLmIuYyAtPiBbYSxiLGNdKVxuICAgICAgICAgIC8vIHJlZHVjZSB0byBjcmVhdGUgYWxsIHBhdGhzXG4gICAgICAgICAgLy8gKFthLGIsY10gLT4ge2E6IHRydWUsICdhLmInOiB0cnVlLCAnYS5iLmMnOiB0cnVlfSlcbiAgICAgICAgICByZXR1cm4gcGF0aC5zcGxpdCgnLicpLnJlZHVjZSgobWVtbywgcGF0aCwgaW5kZXgsIHBhcnRzKSA9PiB7XG4gICAgICAgICAgICBtZW1vW3BhcnRzLnNsaWNlKDAsIGluZGV4ICsgMSkuam9pbignLicpXSA9IHRydWU7XG4gICAgICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgICAgICB9LCBtZW1vKTtcbiAgICAgICAgfSwge30pO1xuXG4gICAgICAgIHRoaXMuaW5jbHVkZSA9IE9iamVjdC5rZXlzKHBhdGhTZXQpXG4gICAgICAgICAgLm1hcChzID0+IHtcbiAgICAgICAgICAgIHJldHVybiBzLnNwbGl0KCcuJyk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuc29ydCgoYSwgYikgPT4ge1xuICAgICAgICAgICAgcmV0dXJuIGEubGVuZ3RoIC0gYi5sZW5ndGg7IC8vIFNvcnQgYnkgbnVtYmVyIG9mIGNvbXBvbmVudHNcbiAgICAgICAgICB9KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBjYXNlICdyZWRpcmVjdENsYXNzTmFtZUZvcktleSc6XG4gICAgICAgIHRoaXMucmVkaXJlY3RLZXkgPSByZXN0T3B0aW9ucy5yZWRpcmVjdENsYXNzTmFtZUZvcktleTtcbiAgICAgICAgdGhpcy5yZWRpcmVjdENsYXNzTmFtZSA9IG51bGw7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnaW5jbHVkZVJlYWRQcmVmZXJlbmNlJzpcbiAgICAgIGNhc2UgJ3N1YnF1ZXJ5UmVhZFByZWZlcmVuY2UnOlxuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgJ2JhZCBvcHRpb246ICcgKyBvcHRpb25cbiAgICAgICAgKTtcbiAgICB9XG4gIH1cbn1cblxuLy8gQSBjb252ZW5pZW50IG1ldGhvZCB0byBwZXJmb3JtIGFsbCB0aGUgc3RlcHMgb2YgcHJvY2Vzc2luZyBhIHF1ZXJ5XG4vLyBpbiBvcmRlci5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB0aGUgcmVzcG9uc2UgLSBhbiBvYmplY3Qgd2l0aCBvcHRpb25hbCBrZXlzXG4vLyAncmVzdWx0cycgYW5kICdjb3VudCcuXG4vLyBUT0RPOiBjb25zb2xpZGF0ZSB0aGUgcmVwbGFjZVggZnVuY3Rpb25zXG5SZXN0UXVlcnkucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbihleGVjdXRlT3B0aW9ucykge1xuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5idWlsZFJlc3RXaGVyZSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlSW5jbHVkZUFsbCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlRXhjbHVkZUtleXMoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkZpbmQoZXhlY3V0ZU9wdGlvbnMpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucnVuQ291bnQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGUoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJ1bkFmdGVyRmluZFRyaWdnZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlc3BvbnNlO1xuICAgIH0pO1xufTtcblxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5lYWNoID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgY29uc3QgeyBjb25maWcsIGF1dGgsIGNsYXNzTmFtZSwgcmVzdFdoZXJlLCByZXN0T3B0aW9ucywgY2xpZW50U0RLIH0gPSB0aGlzO1xuICAvLyBpZiB0aGUgbGltaXQgaXMgc2V0LCB1c2UgaXRcbiAgcmVzdE9wdGlvbnMubGltaXQgPSByZXN0T3B0aW9ucy5saW1pdCB8fCAxMDA7XG4gIHJlc3RPcHRpb25zLm9yZGVyID0gJ29iamVjdElkJztcbiAgbGV0IGZpbmlzaGVkID0gZmFsc2U7XG5cbiAgcmV0dXJuIGNvbnRpbnVlV2hpbGUoXG4gICAgKCkgPT4ge1xuICAgICAgcmV0dXJuICFmaW5pc2hlZDtcbiAgICB9LFxuICAgIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBhdXRoLFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIHJlc3RXaGVyZSxcbiAgICAgICAgcmVzdE9wdGlvbnMsXG4gICAgICAgIGNsaWVudFNES1xuICAgICAgKTtcbiAgICAgIGNvbnN0IHsgcmVzdWx0cyB9ID0gYXdhaXQgcXVlcnkuZXhlY3V0ZSgpO1xuICAgICAgcmVzdWx0cy5mb3JFYWNoKGNhbGxiYWNrKTtcbiAgICAgIGZpbmlzaGVkID0gcmVzdWx0cy5sZW5ndGggPCByZXN0T3B0aW9ucy5saW1pdDtcbiAgICAgIGlmICghZmluaXNoZWQpIHtcbiAgICAgICAgcmVzdFdoZXJlLm9iamVjdElkID0gT2JqZWN0LmFzc2lnbih7fSwgcmVzdFdoZXJlLm9iamVjdElkLCB7XG4gICAgICAgICAgJGd0OiByZXN1bHRzW3Jlc3VsdHMubGVuZ3RoIC0gMV0ub2JqZWN0SWQsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cbiAgKTtcbn07XG5cblJlc3RRdWVyeS5wcm90b3R5cGUuYnVpbGRSZXN0V2hlcmUgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZ2V0VXNlckFuZFJvbGVBQ0woKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VTZWxlY3QoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VEb250U2VsZWN0KCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5yZXBsYWNlSW5RdWVyeSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMucmVwbGFjZU5vdEluUXVlcnkoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnJlcGxhY2VFcXVhbGl0eSgpO1xuICAgIH0pO1xufTtcblxuLy8gVXNlcyB0aGUgQXV0aCBvYmplY3QgdG8gZ2V0IHRoZSBsaXN0IG9mIHJvbGVzLCBhZGRzIHRoZSB1c2VyIGlkXG5SZXN0UXVlcnkucHJvdG90eXBlLmdldFVzZXJBbmRSb2xlQUNMID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLmF1dGguaXNNYXN0ZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICB0aGlzLmZpbmRPcHRpb25zLmFjbCA9IFsnKiddO1xuXG4gIGlmICh0aGlzLmF1dGgudXNlcikge1xuICAgIHJldHVybiB0aGlzLmF1dGguZ2V0VXNlclJvbGVzKCkudGhlbihyb2xlcyA9PiB7XG4gICAgICB0aGlzLmZpbmRPcHRpb25zLmFjbCA9IHRoaXMuZmluZE9wdGlvbnMuYWNsLmNvbmNhdChyb2xlcywgW1xuICAgICAgICB0aGlzLmF1dGgudXNlci5pZCxcbiAgICAgIF0pO1xuICAgICAgcmV0dXJuO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gQ2hhbmdlcyB0aGUgY2xhc3NOYW1lIGlmIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5IGlzIHNldC5cbi8vIFJldHVybnMgYSBwcm9taXNlLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSA9IGZ1bmN0aW9uKCkge1xuICBpZiAoIXRoaXMucmVkaXJlY3RLZXkpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICAvLyBXZSBuZWVkIHRvIGNoYW5nZSB0aGUgY2xhc3MgbmFtZSBiYXNlZCBvbiB0aGUgc2NoZW1hXG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5yZWRpcmVjdENsYXNzTmFtZUZvcktleSh0aGlzLmNsYXNzTmFtZSwgdGhpcy5yZWRpcmVjdEtleSlcbiAgICAudGhlbihuZXdDbGFzc05hbWUgPT4ge1xuICAgICAgdGhpcy5jbGFzc05hbWUgPSBuZXdDbGFzc05hbWU7XG4gICAgICB0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lID0gbmV3Q2xhc3NOYW1lO1xuICAgIH0pO1xufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiBjb25maWcuXG5SZXN0UXVlcnkucHJvdG90eXBlLnZhbGlkYXRlQ2xpZW50Q2xhc3NDcmVhdGlvbiA9IGZ1bmN0aW9uKCkge1xuICBpZiAoXG4gICAgdGhpcy5jb25maWcuYWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uID09PSBmYWxzZSAmJlxuICAgICF0aGlzLmF1dGguaXNNYXN0ZXIgJiZcbiAgICBTY2hlbWFDb250cm9sbGVyLnN5c3RlbUNsYXNzZXMuaW5kZXhPZih0aGlzLmNsYXNzTmFtZSkgPT09IC0xXG4gICkge1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmxvYWRTY2hlbWEoKVxuICAgICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmhhc0NsYXNzKHRoaXMuY2xhc3NOYW1lKSlcbiAgICAgIC50aGVuKGhhc0NsYXNzID0+IHtcbiAgICAgICAgaWYgKGhhc0NsYXNzICE9PSB0cnVlKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgICAgICdUaGlzIHVzZXIgaXMgbm90IGFsbG93ZWQgdG8gYWNjZXNzICcgK1xuICAgICAgICAgICAgICAnbm9uLWV4aXN0ZW50IGNsYXNzOiAnICtcbiAgICAgICAgICAgICAgdGhpcy5jbGFzc05hbWVcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybUluUXVlcnkoaW5RdWVyeU9iamVjdCwgY2xhc3NOYW1lLCByZXN1bHRzKSB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIHJlc3VsdHMpIHtcbiAgICB2YWx1ZXMucHVzaCh7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgb2JqZWN0SWQ6IHJlc3VsdC5vYmplY3RJZCxcbiAgICB9KTtcbiAgfVxuICBkZWxldGUgaW5RdWVyeU9iamVjdFsnJGluUXVlcnknXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkoaW5RdWVyeU9iamVjdFsnJGluJ10pKSB7XG4gICAgaW5RdWVyeU9iamVjdFsnJGluJ10gPSBpblF1ZXJ5T2JqZWN0WyckaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBpblF1ZXJ5T2JqZWN0WyckaW4nXSA9IHZhbHVlcztcbiAgfVxufVxuXG4vLyBSZXBsYWNlcyBhICRpblF1ZXJ5IGNsYXVzZSBieSBydW5uaW5nIHRoZSBzdWJxdWVyeSwgaWYgdGhlcmUgaXMgYW5cbi8vICRpblF1ZXJ5IGNsYXVzZS5cbi8vIFRoZSAkaW5RdWVyeSBjbGF1c2UgdHVybnMgaW50byBhbiAkaW4gd2l0aCB2YWx1ZXMgdGhhdCBhcmUganVzdFxuLy8gcG9pbnRlcnMgdG8gdGhlIG9iamVjdHMgcmV0dXJuZWQgaW4gdGhlIHN1YnF1ZXJ5LlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlSW5RdWVyeSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgaW5RdWVyeU9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJGluUXVlcnknKTtcbiAgaWYgKCFpblF1ZXJ5T2JqZWN0KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gVGhlIGluUXVlcnkgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHdoZXJlIGFuZCBjbGFzc05hbWVcbiAgdmFyIGluUXVlcnlWYWx1ZSA9IGluUXVlcnlPYmplY3RbJyRpblF1ZXJ5J107XG4gIGlmICghaW5RdWVyeVZhbHVlLndoZXJlIHx8ICFpblF1ZXJ5VmFsdWUuY2xhc3NOYW1lKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9RVUVSWSxcbiAgICAgICdpbXByb3BlciB1c2FnZSBvZiAkaW5RdWVyeSdcbiAgICApO1xuICB9XG5cbiAgY29uc3QgYWRkaXRpb25hbE9wdGlvbnMgPSB7XG4gICAgcmVkaXJlY3RDbGFzc05hbWVGb3JLZXk6IGluUXVlcnlWYWx1ZS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgdmFyIHN1YnF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShcbiAgICB0aGlzLmNvbmZpZyxcbiAgICB0aGlzLmF1dGgsXG4gICAgaW5RdWVyeVZhbHVlLmNsYXNzTmFtZSxcbiAgICBpblF1ZXJ5VmFsdWUud2hlcmUsXG4gICAgYWRkaXRpb25hbE9wdGlvbnNcbiAgKTtcbiAgcmV0dXJuIHN1YnF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB0cmFuc2Zvcm1JblF1ZXJ5KGluUXVlcnlPYmplY3QsIHN1YnF1ZXJ5LmNsYXNzTmFtZSwgcmVzcG9uc2UucmVzdWx0cyk7XG4gICAgLy8gUmVjdXJzZSB0byByZXBlYXRcbiAgICByZXR1cm4gdGhpcy5yZXBsYWNlSW5RdWVyeSgpO1xuICB9KTtcbn07XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybU5vdEluUXVlcnkobm90SW5RdWVyeU9iamVjdCwgY2xhc3NOYW1lLCByZXN1bHRzKSB7XG4gIHZhciB2YWx1ZXMgPSBbXTtcbiAgZm9yICh2YXIgcmVzdWx0IG9mIHJlc3VsdHMpIHtcbiAgICB2YWx1ZXMucHVzaCh7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgb2JqZWN0SWQ6IHJlc3VsdC5vYmplY3RJZCxcbiAgICB9KTtcbiAgfVxuICBkZWxldGUgbm90SW5RdWVyeU9iamVjdFsnJG5vdEluUXVlcnknXTtcbiAgaWYgKEFycmF5LmlzQXJyYXkobm90SW5RdWVyeU9iamVjdFsnJG5pbiddKSkge1xuICAgIG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXSA9IG5vdEluUXVlcnlPYmplY3RbJyRuaW4nXS5jb25jYXQodmFsdWVzKTtcbiAgfSBlbHNlIHtcbiAgICBub3RJblF1ZXJ5T2JqZWN0WyckbmluJ10gPSB2YWx1ZXM7XG4gIH1cbn1cblxuLy8gUmVwbGFjZXMgYSAkbm90SW5RdWVyeSBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFuXG4vLyAkbm90SW5RdWVyeSBjbGF1c2UuXG4vLyBUaGUgJG5vdEluUXVlcnkgY2xhdXNlIHR1cm5zIGludG8gYSAkbmluIHdpdGggdmFsdWVzIHRoYXQgYXJlIGp1c3Rcbi8vIHBvaW50ZXJzIHRvIHRoZSBvYmplY3RzIHJldHVybmVkIGluIHRoZSBzdWJxdWVyeS5cblJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZU5vdEluUXVlcnkgPSBmdW5jdGlvbigpIHtcbiAgdmFyIG5vdEluUXVlcnlPYmplY3QgPSBmaW5kT2JqZWN0V2l0aEtleSh0aGlzLnJlc3RXaGVyZSwgJyRub3RJblF1ZXJ5Jyk7XG4gIGlmICghbm90SW5RdWVyeU9iamVjdCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFRoZSBub3RJblF1ZXJ5IHZhbHVlIG11c3QgaGF2ZSBwcmVjaXNlbHkgdHdvIGtleXMgLSB3aGVyZSBhbmQgY2xhc3NOYW1lXG4gIHZhciBub3RJblF1ZXJ5VmFsdWUgPSBub3RJblF1ZXJ5T2JqZWN0Wyckbm90SW5RdWVyeSddO1xuICBpZiAoIW5vdEluUXVlcnlWYWx1ZS53aGVyZSB8fCAhbm90SW5RdWVyeVZhbHVlLmNsYXNzTmFtZSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAnaW1wcm9wZXIgdXNhZ2Ugb2YgJG5vdEluUXVlcnknXG4gICAgKTtcbiAgfVxuXG4gIGNvbnN0IGFkZGl0aW9uYWxPcHRpb25zID0ge1xuICAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5OiBub3RJblF1ZXJ5VmFsdWUucmVkaXJlY3RDbGFzc05hbWVGb3JLZXksXG4gIH07XG5cbiAgaWYgKHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gIH0gZWxzZSBpZiAodGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZSkge1xuICAgIGFkZGl0aW9uYWxPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5yZWFkUHJlZmVyZW5jZTtcbiAgfVxuXG4gIHZhciBzdWJxdWVyeSA9IG5ldyBSZXN0UXVlcnkoXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5hdXRoLFxuICAgIG5vdEluUXVlcnlWYWx1ZS5jbGFzc05hbWUsXG4gICAgbm90SW5RdWVyeVZhbHVlLndoZXJlLFxuICAgIGFkZGl0aW9uYWxPcHRpb25zXG4gICk7XG4gIHJldHVybiBzdWJxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdHJhbnNmb3JtTm90SW5RdWVyeShub3RJblF1ZXJ5T2JqZWN0LCBzdWJxdWVyeS5jbGFzc05hbWUsIHJlc3BvbnNlLnJlc3VsdHMpO1xuICAgIC8vIFJlY3Vyc2UgdG8gcmVwZWF0XG4gICAgcmV0dXJuIHRoaXMucmVwbGFjZU5vdEluUXVlcnkoKTtcbiAgfSk7XG59O1xuXG5jb25zdCB0cmFuc2Zvcm1TZWxlY3QgPSAoc2VsZWN0T2JqZWN0LCBrZXksIG9iamVjdHMpID0+IHtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICBmb3IgKHZhciByZXN1bHQgb2Ygb2JqZWN0cykge1xuICAgIHZhbHVlcy5wdXNoKGtleS5zcGxpdCgnLicpLnJlZHVjZSgobywgaSkgPT4gb1tpXSwgcmVzdWx0KSk7XG4gIH1cbiAgZGVsZXRlIHNlbGVjdE9iamVjdFsnJHNlbGVjdCddO1xuICBpZiAoQXJyYXkuaXNBcnJheShzZWxlY3RPYmplY3RbJyRpbiddKSkge1xuICAgIHNlbGVjdE9iamVjdFsnJGluJ10gPSBzZWxlY3RPYmplY3RbJyRpbiddLmNvbmNhdCh2YWx1ZXMpO1xuICB9IGVsc2Uge1xuICAgIHNlbGVjdE9iamVjdFsnJGluJ10gPSB2YWx1ZXM7XG4gIH1cbn07XG5cbi8vIFJlcGxhY2VzIGEgJHNlbGVjdCBjbGF1c2UgYnkgcnVubmluZyB0aGUgc3VicXVlcnksIGlmIHRoZXJlIGlzIGFcbi8vICRzZWxlY3QgY2xhdXNlLlxuLy8gVGhlICRzZWxlY3QgY2xhdXNlIHR1cm5zIGludG8gYW4gJGluIHdpdGggdmFsdWVzIHNlbGVjdGVkIG91dCBvZlxuLy8gdGhlIHN1YnF1ZXJ5LlxuLy8gUmV0dXJucyBhIHBvc3NpYmxlLXByb21pc2UuXG5SZXN0UXVlcnkucHJvdG90eXBlLnJlcGxhY2VTZWxlY3QgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHNlbGVjdE9iamVjdCA9IGZpbmRPYmplY3RXaXRoS2V5KHRoaXMucmVzdFdoZXJlLCAnJHNlbGVjdCcpO1xuICBpZiAoIXNlbGVjdE9iamVjdCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFRoZSBzZWxlY3QgdmFsdWUgbXVzdCBoYXZlIHByZWNpc2VseSB0d28ga2V5cyAtIHF1ZXJ5IGFuZCBrZXlcbiAgdmFyIHNlbGVjdFZhbHVlID0gc2VsZWN0T2JqZWN0Wyckc2VsZWN0J107XG4gIC8vIGlPUyBTREsgZG9uJ3Qgc2VuZCB3aGVyZSBpZiBub3Qgc2V0LCBsZXQgaXQgcGFzc1xuICBpZiAoXG4gICAgIXNlbGVjdFZhbHVlLnF1ZXJ5IHx8XG4gICAgIXNlbGVjdFZhbHVlLmtleSB8fFxuICAgIHR5cGVvZiBzZWxlY3RWYWx1ZS5xdWVyeSAhPT0gJ29iamVjdCcgfHxcbiAgICAhc2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lIHx8XG4gICAgT2JqZWN0LmtleXMoc2VsZWN0VmFsdWUpLmxlbmd0aCAhPT0gMlxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1FVRVJZLFxuICAgICAgJ2ltcHJvcGVyIHVzYWdlIG9mICRzZWxlY3QnXG4gICAgKTtcbiAgfVxuXG4gIGNvbnN0IGFkZGl0aW9uYWxPcHRpb25zID0ge1xuICAgIHJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5OiBzZWxlY3RWYWx1ZS5xdWVyeS5yZWRpcmVjdENsYXNzTmFtZUZvcktleSxcbiAgfTtcblxuICBpZiAodGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgfSBlbHNlIGlmICh0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgYWRkaXRpb25hbE9wdGlvbnMucmVhZFByZWZlcmVuY2UgPSB0aGlzLnJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlO1xuICB9XG5cbiAgdmFyIHN1YnF1ZXJ5ID0gbmV3IFJlc3RRdWVyeShcbiAgICB0aGlzLmNvbmZpZyxcbiAgICB0aGlzLmF1dGgsXG4gICAgc2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lLFxuICAgIHNlbGVjdFZhbHVlLnF1ZXJ5LndoZXJlLFxuICAgIGFkZGl0aW9uYWxPcHRpb25zXG4gICk7XG4gIHJldHVybiBzdWJxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdHJhbnNmb3JtU2VsZWN0KHNlbGVjdE9iamVjdCwgc2VsZWN0VmFsdWUua2V5LCByZXNwb25zZS5yZXN1bHRzKTtcbiAgICAvLyBLZWVwIHJlcGxhY2luZyAkc2VsZWN0IGNsYXVzZXNcbiAgICByZXR1cm4gdGhpcy5yZXBsYWNlU2VsZWN0KCk7XG4gIH0pO1xufTtcblxuY29uc3QgdHJhbnNmb3JtRG9udFNlbGVjdCA9IChkb250U2VsZWN0T2JqZWN0LCBrZXksIG9iamVjdHMpID0+IHtcbiAgdmFyIHZhbHVlcyA9IFtdO1xuICBmb3IgKHZhciByZXN1bHQgb2Ygb2JqZWN0cykge1xuICAgIHZhbHVlcy5wdXNoKGtleS5zcGxpdCgnLicpLnJlZHVjZSgobywgaSkgPT4gb1tpXSwgcmVzdWx0KSk7XG4gIH1cbiAgZGVsZXRlIGRvbnRTZWxlY3RPYmplY3RbJyRkb250U2VsZWN0J107XG4gIGlmIChBcnJheS5pc0FycmF5KGRvbnRTZWxlY3RPYmplY3RbJyRuaW4nXSkpIHtcbiAgICBkb250U2VsZWN0T2JqZWN0WyckbmluJ10gPSBkb250U2VsZWN0T2JqZWN0WyckbmluJ10uY29uY2F0KHZhbHVlcyk7XG4gIH0gZWxzZSB7XG4gICAgZG9udFNlbGVjdE9iamVjdFsnJG5pbiddID0gdmFsdWVzO1xuICB9XG59O1xuXG4vLyBSZXBsYWNlcyBhICRkb250U2VsZWN0IGNsYXVzZSBieSBydW5uaW5nIHRoZSBzdWJxdWVyeSwgaWYgdGhlcmUgaXMgYVxuLy8gJGRvbnRTZWxlY3QgY2xhdXNlLlxuLy8gVGhlICRkb250U2VsZWN0IGNsYXVzZSB0dXJucyBpbnRvIGFuICRuaW4gd2l0aCB2YWx1ZXMgc2VsZWN0ZWQgb3V0IG9mXG4vLyB0aGUgc3VicXVlcnkuXG4vLyBSZXR1cm5zIGEgcG9zc2libGUtcHJvbWlzZS5cblJlc3RRdWVyeS5wcm90b3R5cGUucmVwbGFjZURvbnRTZWxlY3QgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGRvbnRTZWxlY3RPYmplY3QgPSBmaW5kT2JqZWN0V2l0aEtleSh0aGlzLnJlc3RXaGVyZSwgJyRkb250U2VsZWN0Jyk7XG4gIGlmICghZG9udFNlbGVjdE9iamVjdCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIFRoZSBkb250U2VsZWN0IHZhbHVlIG11c3QgaGF2ZSBwcmVjaXNlbHkgdHdvIGtleXMgLSBxdWVyeSBhbmQga2V5XG4gIHZhciBkb250U2VsZWN0VmFsdWUgPSBkb250U2VsZWN0T2JqZWN0WyckZG9udFNlbGVjdCddO1xuICBpZiAoXG4gICAgIWRvbnRTZWxlY3RWYWx1ZS5xdWVyeSB8fFxuICAgICFkb250U2VsZWN0VmFsdWUua2V5IHx8XG4gICAgdHlwZW9mIGRvbnRTZWxlY3RWYWx1ZS5xdWVyeSAhPT0gJ29iamVjdCcgfHxcbiAgICAhZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LmNsYXNzTmFtZSB8fFxuICAgIE9iamVjdC5rZXlzKGRvbnRTZWxlY3RWYWx1ZSkubGVuZ3RoICE9PSAyXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfUVVFUlksXG4gICAgICAnaW1wcm9wZXIgdXNhZ2Ugb2YgJGRvbnRTZWxlY3QnXG4gICAgKTtcbiAgfVxuICBjb25zdCBhZGRpdGlvbmFsT3B0aW9ucyA9IHtcbiAgICByZWRpcmVjdENsYXNzTmFtZUZvcktleTogZG9udFNlbGVjdFZhbHVlLnF1ZXJ5LnJlZGlyZWN0Q2xhc3NOYW1lRm9yS2V5LFxuICB9O1xuXG4gIGlmICh0aGlzLnJlc3RPcHRpb25zLnN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMuc3VicXVlcnlSZWFkUHJlZmVyZW5jZTtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlID0gdGhpcy5yZXN0T3B0aW9ucy5zdWJxdWVyeVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2UpIHtcbiAgICBhZGRpdGlvbmFsT3B0aW9ucy5yZWFkUHJlZmVyZW5jZSA9IHRoaXMucmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICB2YXIgc3VicXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuYXV0aCxcbiAgICBkb250U2VsZWN0VmFsdWUucXVlcnkuY2xhc3NOYW1lLFxuICAgIGRvbnRTZWxlY3RWYWx1ZS5xdWVyeS53aGVyZSxcbiAgICBhZGRpdGlvbmFsT3B0aW9uc1xuICApO1xuICByZXR1cm4gc3VicXVlcnkuZXhlY3V0ZSgpLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgIHRyYW5zZm9ybURvbnRTZWxlY3QoXG4gICAgICBkb250U2VsZWN0T2JqZWN0LFxuICAgICAgZG9udFNlbGVjdFZhbHVlLmtleSxcbiAgICAgIHJlc3BvbnNlLnJlc3VsdHNcbiAgICApO1xuICAgIC8vIEtlZXAgcmVwbGFjaW5nICRkb250U2VsZWN0IGNsYXVzZXNcbiAgICByZXR1cm4gdGhpcy5yZXBsYWNlRG9udFNlbGVjdCgpO1xuICB9KTtcbn07XG5cbmNvbnN0IGNsZWFuUmVzdWx0QXV0aERhdGEgPSBmdW5jdGlvbihyZXN1bHQpIHtcbiAgZGVsZXRlIHJlc3VsdC5wYXNzd29yZDtcbiAgaWYgKHJlc3VsdC5hdXRoRGF0YSkge1xuICAgIE9iamVjdC5rZXlzKHJlc3VsdC5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICBpZiAocmVzdWx0LmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICBkZWxldGUgcmVzdWx0LmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGlmIChPYmplY3Qua2V5cyhyZXN1bHQuYXV0aERhdGEpLmxlbmd0aCA9PSAwKSB7XG4gICAgICBkZWxldGUgcmVzdWx0LmF1dGhEYXRhO1xuICAgIH1cbiAgfVxufTtcblxuY29uc3QgcmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCA9IGNvbnN0cmFpbnQgPT4ge1xuICBpZiAodHlwZW9mIGNvbnN0cmFpbnQgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIGNvbnN0cmFpbnQ7XG4gIH1cbiAgY29uc3QgZXF1YWxUb09iamVjdCA9IHt9O1xuICBsZXQgaGFzRGlyZWN0Q29uc3RyYWludCA9IGZhbHNlO1xuICBsZXQgaGFzT3BlcmF0b3JDb25zdHJhaW50ID0gZmFsc2U7XG4gIGZvciAoY29uc3Qga2V5IGluIGNvbnN0cmFpbnQpIHtcbiAgICBpZiAoa2V5LmluZGV4T2YoJyQnKSAhPT0gMCkge1xuICAgICAgaGFzRGlyZWN0Q29uc3RyYWludCA9IHRydWU7XG4gICAgICBlcXVhbFRvT2JqZWN0W2tleV0gPSBjb25zdHJhaW50W2tleV07XG4gICAgfSBlbHNlIHtcbiAgICAgIGhhc09wZXJhdG9yQ29uc3RyYWludCA9IHRydWU7XG4gICAgfVxuICB9XG4gIGlmIChoYXNEaXJlY3RDb25zdHJhaW50ICYmIGhhc09wZXJhdG9yQ29uc3RyYWludCkge1xuICAgIGNvbnN0cmFpbnRbJyRlcSddID0gZXF1YWxUb09iamVjdDtcbiAgICBPYmplY3Qua2V5cyhlcXVhbFRvT2JqZWN0KS5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBkZWxldGUgY29uc3RyYWludFtrZXldO1xuICAgIH0pO1xuICB9XG4gIHJldHVybiBjb25zdHJhaW50O1xufTtcblxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5yZXBsYWNlRXF1YWxpdHkgPSBmdW5jdGlvbigpIHtcbiAgaWYgKHR5cGVvZiB0aGlzLnJlc3RXaGVyZSAhPT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgaW4gdGhpcy5yZXN0V2hlcmUpIHtcbiAgICB0aGlzLnJlc3RXaGVyZVtrZXldID0gcmVwbGFjZUVxdWFsaXR5Q29uc3RyYWludCh0aGlzLnJlc3RXaGVyZVtrZXldKTtcbiAgfVxufTtcblxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZXRoZXIgaXQgd2FzIHN1Y2Nlc3NmdWwuXG4vLyBQb3B1bGF0ZXMgdGhpcy5yZXNwb25zZSB3aXRoIGFuIG9iamVjdCB0aGF0IG9ubHkgaGFzICdyZXN1bHRzJy5cblJlc3RRdWVyeS5wcm90b3R5cGUucnVuRmluZCA9IGZ1bmN0aW9uKG9wdGlvbnMgPSB7fSkge1xuICBpZiAodGhpcy5maW5kT3B0aW9ucy5saW1pdCA9PT0gMCkge1xuICAgIHRoaXMucmVzcG9uc2UgPSB7IHJlc3VsdHM6IFtdIH07XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIGNvbnN0IGZpbmRPcHRpb25zID0gT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5maW5kT3B0aW9ucyk7XG4gIGlmICh0aGlzLmtleXMpIHtcbiAgICBmaW5kT3B0aW9ucy5rZXlzID0gdGhpcy5rZXlzLm1hcChrZXkgPT4ge1xuICAgICAgcmV0dXJuIGtleS5zcGxpdCgnLicpWzBdO1xuICAgIH0pO1xuICB9XG4gIGlmIChvcHRpb25zLm9wKSB7XG4gICAgZmluZE9wdGlvbnMub3AgPSBvcHRpb25zLm9wO1xuICB9XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5maW5kKHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlc3RXaGVyZSwgZmluZE9wdGlvbnMsIHRoaXMuYXV0aClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICBmb3IgKHZhciByZXN1bHQgb2YgcmVzdWx0cykge1xuICAgICAgICAgIGNsZWFuUmVzdWx0QXV0aERhdGEocmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICB0aGlzLmNvbmZpZy5maWxlc0NvbnRyb2xsZXIuZXhwYW5kRmlsZXNJbk9iamVjdCh0aGlzLmNvbmZpZywgcmVzdWx0cyk7XG5cbiAgICAgIGlmICh0aGlzLnJlZGlyZWN0Q2xhc3NOYW1lKSB7XG4gICAgICAgIGZvciAodmFyIHIgb2YgcmVzdWx0cykge1xuICAgICAgICAgIHIuY2xhc3NOYW1lID0gdGhpcy5yZWRpcmVjdENsYXNzTmFtZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdGhpcy5yZXNwb25zZSA9IHsgcmVzdWx0czogcmVzdWx0cyB9O1xuICAgIH0pO1xufTtcblxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIHdoZXRoZXIgaXQgd2FzIHN1Y2Nlc3NmdWwuXG4vLyBQb3B1bGF0ZXMgdGhpcy5yZXNwb25zZS5jb3VudCB3aXRoIHRoZSBjb3VudFxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5ydW5Db3VudCA9IGZ1bmN0aW9uKCkge1xuICBpZiAoIXRoaXMuZG9Db3VudCkge1xuICAgIHJldHVybjtcbiAgfVxuICB0aGlzLmZpbmRPcHRpb25zLmNvdW50ID0gdHJ1ZTtcbiAgZGVsZXRlIHRoaXMuZmluZE9wdGlvbnMuc2tpcDtcbiAgZGVsZXRlIHRoaXMuZmluZE9wdGlvbnMubGltaXQ7XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgIC5maW5kKHRoaXMuY2xhc3NOYW1lLCB0aGlzLnJlc3RXaGVyZSwgdGhpcy5maW5kT3B0aW9ucylcbiAgICAudGhlbihjID0+IHtcbiAgICAgIHRoaXMucmVzcG9uc2UuY291bnQgPSBjO1xuICAgIH0pO1xufTtcblxuLy8gQXVnbWVudHMgdGhpcy5yZXNwb25zZSB3aXRoIGFsbCBwb2ludGVycyBvbiBhbiBvYmplY3RcblJlc3RRdWVyeS5wcm90b3R5cGUuaGFuZGxlSW5jbHVkZUFsbCA9IGZ1bmN0aW9uKCkge1xuICBpZiAoIXRoaXMuaW5jbHVkZUFsbCkge1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAubG9hZFNjaGVtYSgpXG4gICAgLnRoZW4oc2NoZW1hQ29udHJvbGxlciA9PiBzY2hlbWFDb250cm9sbGVyLmdldE9uZVNjaGVtYSh0aGlzLmNsYXNzTmFtZSkpXG4gICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgIGNvbnN0IGluY2x1ZGVGaWVsZHMgPSBbXTtcbiAgICAgIGNvbnN0IGtleUZpZWxkcyA9IFtdO1xuICAgICAgZm9yIChjb25zdCBmaWVsZCBpbiBzY2hlbWEuZmllbGRzKSB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICBzY2hlbWEuZmllbGRzW2ZpZWxkXS50eXBlICYmXG4gICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZF0udHlwZSA9PT0gJ1BvaW50ZXInXG4gICAgICAgICkge1xuICAgICAgICAgIGluY2x1ZGVGaWVsZHMucHVzaChbZmllbGRdKTtcbiAgICAgICAgICBrZXlGaWVsZHMucHVzaChmaWVsZCk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIEFkZCBmaWVsZHMgdG8gaW5jbHVkZSwga2V5cywgcmVtb3ZlIGR1cHNcbiAgICAgIHRoaXMuaW5jbHVkZSA9IFsuLi5uZXcgU2V0KFsuLi50aGlzLmluY2x1ZGUsIC4uLmluY2x1ZGVGaWVsZHNdKV07XG4gICAgICAvLyBpZiB0aGlzLmtleXMgbm90IHNldCwgdGhlbiBhbGwga2V5cyBhcmUgYWxyZWFkeSBpbmNsdWRlZFxuICAgICAgaWYgKHRoaXMua2V5cykge1xuICAgICAgICB0aGlzLmtleXMgPSBbLi4ubmV3IFNldChbLi4udGhpcy5rZXlzLCAuLi5rZXlGaWVsZHNdKV07XG4gICAgICB9XG4gICAgfSk7XG59O1xuXG4vLyBVcGRhdGVzIHByb3BlcnR5IGB0aGlzLmtleXNgIHRvIGNvbnRhaW4gYWxsIGtleXMgYnV0IHRoZSBvbmVzIHVuc2VsZWN0ZWQuXG5SZXN0UXVlcnkucHJvdG90eXBlLmhhbmRsZUV4Y2x1ZGVLZXlzID0gZnVuY3Rpb24oKSB7XG4gIGlmICghdGhpcy5leGNsdWRlS2V5cykge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAodGhpcy5rZXlzKSB7XG4gICAgdGhpcy5rZXlzID0gdGhpcy5rZXlzLmZpbHRlcihrID0+ICF0aGlzLmV4Y2x1ZGVLZXlzLmluY2x1ZGVzKGspKTtcbiAgICByZXR1cm47XG4gIH1cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmxvYWRTY2hlbWEoKVxuICAgIC50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4gc2NoZW1hQ29udHJvbGxlci5nZXRPbmVTY2hlbWEodGhpcy5jbGFzc05hbWUpKVxuICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICBjb25zdCBmaWVsZHMgPSBPYmplY3Qua2V5cyhzY2hlbWEuZmllbGRzKTtcbiAgICAgIHRoaXMua2V5cyA9IGZpZWxkcy5maWx0ZXIoayA9PiAhdGhpcy5leGNsdWRlS2V5cy5pbmNsdWRlcyhrKSk7XG4gICAgfSk7XG59O1xuXG4vLyBBdWdtZW50cyB0aGlzLnJlc3BvbnNlIHdpdGggZGF0YSBhdCB0aGUgcGF0aHMgcHJvdmlkZWQgaW4gdGhpcy5pbmNsdWRlLlxuUmVzdFF1ZXJ5LnByb3RvdHlwZS5oYW5kbGVJbmNsdWRlID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLmluY2x1ZGUubGVuZ3RoID09IDApIHtcbiAgICByZXR1cm47XG4gIH1cblxuICB2YXIgcGF0aFJlc3BvbnNlID0gaW5jbHVkZVBhdGgoXG4gICAgdGhpcy5jb25maWcsXG4gICAgdGhpcy5hdXRoLFxuICAgIHRoaXMucmVzcG9uc2UsXG4gICAgdGhpcy5pbmNsdWRlWzBdLFxuICAgIHRoaXMucmVzdE9wdGlvbnNcbiAgKTtcbiAgaWYgKHBhdGhSZXNwb25zZS50aGVuKSB7XG4gICAgcmV0dXJuIHBhdGhSZXNwb25zZS50aGVuKG5ld1Jlc3BvbnNlID0+IHtcbiAgICAgIHRoaXMucmVzcG9uc2UgPSBuZXdSZXNwb25zZTtcbiAgICAgIHRoaXMuaW5jbHVkZSA9IHRoaXMuaW5jbHVkZS5zbGljZSgxKTtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluY2x1ZGUoKTtcbiAgICB9KTtcbiAgfSBlbHNlIGlmICh0aGlzLmluY2x1ZGUubGVuZ3RoID4gMCkge1xuICAgIHRoaXMuaW5jbHVkZSA9IHRoaXMuaW5jbHVkZS5zbGljZSgxKTtcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVJbmNsdWRlKCk7XG4gIH1cblxuICByZXR1cm4gcGF0aFJlc3BvbnNlO1xufTtcblxuLy9SZXR1cm5zIGEgcHJvbWlzZSBvZiBhIHByb2Nlc3NlZCBzZXQgb2YgcmVzdWx0c1xuUmVzdFF1ZXJ5LnByb3RvdHlwZS5ydW5BZnRlckZpbmRUcmlnZ2VyID0gZnVuY3Rpb24oKSB7XG4gIGlmICghdGhpcy5yZXNwb25zZSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBBdm9pZCBkb2luZyBhbnkgc2V0dXAgZm9yIHRyaWdnZXJzIGlmIHRoZXJlIGlzIG5vICdhZnRlckZpbmQnIHRyaWdnZXIgZm9yIHRoaXMgY2xhc3MuXG4gIGNvbnN0IGhhc0FmdGVyRmluZEhvb2sgPSB0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKFxuICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyRmluZCxcbiAgICB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkXG4gICk7XG4gIGlmICghaGFzQWZ0ZXJGaW5kSG9vaykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBTa2lwIEFnZ3JlZ2F0ZSBhbmQgRGlzdGluY3QgUXVlcmllc1xuICBpZiAodGhpcy5maW5kT3B0aW9ucy5waXBlbGluZSB8fCB0aGlzLmZpbmRPcHRpb25zLmRpc3RpbmN0KSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIFJ1biBhZnRlckZpbmQgdHJpZ2dlciBhbmQgc2V0IHRoZSBuZXcgcmVzdWx0c1xuICByZXR1cm4gdHJpZ2dlcnNcbiAgICAubWF5YmVSdW5BZnRlckZpbmRUcmlnZ2VyKFxuICAgICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJGaW5kLFxuICAgICAgdGhpcy5hdXRoLFxuICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICB0aGlzLnJlc3BvbnNlLnJlc3VsdHMsXG4gICAgICB0aGlzLmNvbmZpZ1xuICAgIClcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIC8vIEVuc3VyZSB3ZSBwcm9wZXJseSBzZXQgdGhlIGNsYXNzTmFtZSBiYWNrXG4gICAgICBpZiAodGhpcy5yZWRpcmVjdENsYXNzTmFtZSkge1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3VsdHMgPSByZXN1bHRzLm1hcChvYmplY3QgPT4ge1xuICAgICAgICAgIGlmIChvYmplY3QgaW5zdGFuY2VvZiBQYXJzZS5PYmplY3QpIHtcbiAgICAgICAgICAgIG9iamVjdCA9IG9iamVjdC50b0pTT04oKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb2JqZWN0LmNsYXNzTmFtZSA9IHRoaXMucmVkaXJlY3RDbGFzc05hbWU7XG4gICAgICAgICAgcmV0dXJuIG9iamVjdDtcbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnJlc3BvbnNlLnJlc3VsdHMgPSByZXN1bHRzO1xuICAgICAgfVxuICAgIH0pO1xufTtcblxuLy8gQWRkcyBpbmNsdWRlZCB2YWx1ZXMgdG8gdGhlIHJlc3BvbnNlLlxuLy8gUGF0aCBpcyBhIGxpc3Qgb2YgZmllbGQgbmFtZXMuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYW4gYXVnbWVudGVkIHJlc3BvbnNlLlxuZnVuY3Rpb24gaW5jbHVkZVBhdGgoY29uZmlnLCBhdXRoLCByZXNwb25zZSwgcGF0aCwgcmVzdE9wdGlvbnMgPSB7fSkge1xuICB2YXIgcG9pbnRlcnMgPSBmaW5kUG9pbnRlcnMocmVzcG9uc2UucmVzdWx0cywgcGF0aCk7XG4gIGlmIChwb2ludGVycy5sZW5ndGggPT0gMCkge1xuICAgIHJldHVybiByZXNwb25zZTtcbiAgfVxuICBjb25zdCBwb2ludGVyc0hhc2ggPSB7fTtcbiAgZm9yICh2YXIgcG9pbnRlciBvZiBwb2ludGVycykge1xuICAgIGlmICghcG9pbnRlcikge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IGNsYXNzTmFtZSA9IHBvaW50ZXIuY2xhc3NOYW1lO1xuICAgIC8vIG9ubHkgaW5jbHVkZSB0aGUgZ29vZCBwb2ludGVyc1xuICAgIGlmIChjbGFzc05hbWUpIHtcbiAgICAgIHBvaW50ZXJzSGFzaFtjbGFzc05hbWVdID0gcG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0gfHwgbmV3IFNldCgpO1xuICAgICAgcG9pbnRlcnNIYXNoW2NsYXNzTmFtZV0uYWRkKHBvaW50ZXIub2JqZWN0SWQpO1xuICAgIH1cbiAgfVxuICBjb25zdCBpbmNsdWRlUmVzdE9wdGlvbnMgPSB7fTtcbiAgaWYgKHJlc3RPcHRpb25zLmtleXMpIHtcbiAgICBjb25zdCBrZXlzID0gbmV3IFNldChyZXN0T3B0aW9ucy5rZXlzLnNwbGl0KCcsJykpO1xuICAgIGNvbnN0IGtleVNldCA9IEFycmF5LmZyb20oa2V5cykucmVkdWNlKChzZXQsIGtleSkgPT4ge1xuICAgICAgY29uc3Qga2V5UGF0aCA9IGtleS5zcGxpdCgnLicpO1xuICAgICAgbGV0IGkgPSAwO1xuICAgICAgZm9yIChpOyBpIDwgcGF0aC5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAocGF0aFtpXSAhPSBrZXlQYXRoW2ldKSB7XG4gICAgICAgICAgcmV0dXJuIHNldDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKGkgPCBrZXlQYXRoLmxlbmd0aCkge1xuICAgICAgICBzZXQuYWRkKGtleVBhdGhbaV0pO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHNldDtcbiAgICB9LCBuZXcgU2V0KCkpO1xuICAgIGlmIChrZXlTZXQuc2l6ZSA+IDApIHtcbiAgICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5rZXlzID0gQXJyYXkuZnJvbShrZXlTZXQpLmpvaW4oJywnKTtcbiAgICB9XG4gIH1cblxuICBpZiAocmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlKSB7XG4gICAgaW5jbHVkZVJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gcmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlO1xuICAgIGluY2x1ZGVSZXN0T3B0aW9ucy5pbmNsdWRlUmVhZFByZWZlcmVuY2UgPVxuICAgICAgcmVzdE9wdGlvbnMuaW5jbHVkZVJlYWRQcmVmZXJlbmNlO1xuICB9IGVsc2UgaWYgKHJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlKSB7XG4gICAgaW5jbHVkZVJlc3RPcHRpb25zLnJlYWRQcmVmZXJlbmNlID0gcmVzdE9wdGlvbnMucmVhZFByZWZlcmVuY2U7XG4gIH1cblxuICBjb25zdCBxdWVyeVByb21pc2VzID0gT2JqZWN0LmtleXMocG9pbnRlcnNIYXNoKS5tYXAoY2xhc3NOYW1lID0+IHtcbiAgICBjb25zdCBvYmplY3RJZHMgPSBBcnJheS5mcm9tKHBvaW50ZXJzSGFzaFtjbGFzc05hbWVdKTtcbiAgICBsZXQgd2hlcmU7XG4gICAgaWYgKG9iamVjdElkcy5sZW5ndGggPT09IDEpIHtcbiAgICAgIHdoZXJlID0geyBvYmplY3RJZDogb2JqZWN0SWRzWzBdIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIHdoZXJlID0geyBvYmplY3RJZDogeyAkaW46IG9iamVjdElkcyB9IH07XG4gICAgfVxuICAgIHZhciBxdWVyeSA9IG5ldyBSZXN0UXVlcnkoXG4gICAgICBjb25maWcsXG4gICAgICBhdXRoLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgd2hlcmUsXG4gICAgICBpbmNsdWRlUmVzdE9wdGlvbnNcbiAgICApO1xuICAgIHJldHVybiBxdWVyeS5leGVjdXRlKHsgb3A6ICdnZXQnIH0pLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICByZXN1bHRzLmNsYXNzTmFtZSA9IGNsYXNzTmFtZTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzdWx0cyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIC8vIEdldCB0aGUgb2JqZWN0cyBmb3IgYWxsIHRoZXNlIG9iamVjdCBpZHNcbiAgcmV0dXJuIFByb21pc2UuYWxsKHF1ZXJ5UHJvbWlzZXMpLnRoZW4ocmVzcG9uc2VzID0+IHtcbiAgICB2YXIgcmVwbGFjZSA9IHJlc3BvbnNlcy5yZWR1Y2UoKHJlcGxhY2UsIGluY2x1ZGVSZXNwb25zZSkgPT4ge1xuICAgICAgZm9yICh2YXIgb2JqIG9mIGluY2x1ZGVSZXNwb25zZS5yZXN1bHRzKSB7XG4gICAgICAgIG9iai5fX3R5cGUgPSAnT2JqZWN0JztcbiAgICAgICAgb2JqLmNsYXNzTmFtZSA9IGluY2x1ZGVSZXNwb25zZS5jbGFzc05hbWU7XG5cbiAgICAgICAgaWYgKG9iai5jbGFzc05hbWUgPT0gJ19Vc2VyJyAmJiAhYXV0aC5pc01hc3Rlcikge1xuICAgICAgICAgIGRlbGV0ZSBvYmouc2Vzc2lvblRva2VuO1xuICAgICAgICAgIGRlbGV0ZSBvYmouYXV0aERhdGE7XG4gICAgICAgIH1cbiAgICAgICAgcmVwbGFjZVtvYmoub2JqZWN0SWRdID0gb2JqO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlcGxhY2U7XG4gICAgfSwge30pO1xuXG4gICAgdmFyIHJlc3AgPSB7XG4gICAgICByZXN1bHRzOiByZXBsYWNlUG9pbnRlcnMocmVzcG9uc2UucmVzdWx0cywgcGF0aCwgcmVwbGFjZSksXG4gICAgfTtcbiAgICBpZiAocmVzcG9uc2UuY291bnQpIHtcbiAgICAgIHJlc3AuY291bnQgPSByZXNwb25zZS5jb3VudDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3A7XG4gIH0pO1xufVxuXG4vLyBPYmplY3QgbWF5IGJlIGEgbGlzdCBvZiBSRVNULWZvcm1hdCBvYmplY3QgdG8gZmluZCBwb2ludGVycyBpbiwgb3Jcbi8vIGl0IG1heSBiZSBhIHNpbmdsZSBvYmplY3QuXG4vLyBJZiB0aGUgcGF0aCB5aWVsZHMgdGhpbmdzIHRoYXQgYXJlbid0IHBvaW50ZXJzLCB0aGlzIHRocm93cyBhbiBlcnJvci5cbi8vIFBhdGggaXMgYSBsaXN0IG9mIGZpZWxkcyB0byBzZWFyY2ggaW50by5cbi8vIFJldHVybnMgYSBsaXN0IG9mIHBvaW50ZXJzIGluIFJFU1QgZm9ybWF0LlxuZnVuY3Rpb24gZmluZFBvaW50ZXJzKG9iamVjdCwgcGF0aCkge1xuICBpZiAob2JqZWN0IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICB2YXIgYW5zd2VyID0gW107XG4gICAgZm9yICh2YXIgeCBvZiBvYmplY3QpIHtcbiAgICAgIGFuc3dlciA9IGFuc3dlci5jb25jYXQoZmluZFBvaW50ZXJzKHgsIHBhdGgpKTtcbiAgICB9XG4gICAgcmV0dXJuIGFuc3dlcjtcbiAgfVxuXG4gIGlmICh0eXBlb2Ygb2JqZWN0ICE9PSAnb2JqZWN0JyB8fCAhb2JqZWN0KSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgaWYgKHBhdGgubGVuZ3RoID09IDApIHtcbiAgICBpZiAob2JqZWN0ID09PSBudWxsIHx8IG9iamVjdC5fX3R5cGUgPT0gJ1BvaW50ZXInKSB7XG4gICAgICByZXR1cm4gW29iamVjdF07XG4gICAgfVxuICAgIHJldHVybiBbXTtcbiAgfVxuXG4gIHZhciBzdWJvYmplY3QgPSBvYmplY3RbcGF0aFswXV07XG4gIGlmICghc3Vib2JqZWN0KSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG4gIHJldHVybiBmaW5kUG9pbnRlcnMoc3Vib2JqZWN0LCBwYXRoLnNsaWNlKDEpKTtcbn1cblxuLy8gT2JqZWN0IG1heSBiZSBhIGxpc3Qgb2YgUkVTVC1mb3JtYXQgb2JqZWN0cyB0byByZXBsYWNlIHBvaW50ZXJzXG4vLyBpbiwgb3IgaXQgbWF5IGJlIGEgc2luZ2xlIG9iamVjdC5cbi8vIFBhdGggaXMgYSBsaXN0IG9mIGZpZWxkcyB0byBzZWFyY2ggaW50by5cbi8vIHJlcGxhY2UgaXMgYSBtYXAgZnJvbSBvYmplY3QgaWQgLT4gb2JqZWN0LlxuLy8gUmV0dXJucyBzb21ldGhpbmcgYW5hbG9nb3VzIHRvIG9iamVjdCwgYnV0IHdpdGggdGhlIGFwcHJvcHJpYXRlXG4vLyBwb2ludGVycyBpbmZsYXRlZC5cbmZ1bmN0aW9uIHJlcGxhY2VQb2ludGVycyhvYmplY3QsIHBhdGgsIHJlcGxhY2UpIHtcbiAgaWYgKG9iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgcmV0dXJuIG9iamVjdFxuICAgICAgLm1hcChvYmogPT4gcmVwbGFjZVBvaW50ZXJzKG9iaiwgcGF0aCwgcmVwbGFjZSkpXG4gICAgICAuZmlsdGVyKG9iaiA9PiB0eXBlb2Ygb2JqICE9PSAndW5kZWZpbmVkJyk7XG4gIH1cblxuICBpZiAodHlwZW9mIG9iamVjdCAhPT0gJ29iamVjdCcgfHwgIW9iamVjdCkge1xuICAgIHJldHVybiBvYmplY3Q7XG4gIH1cblxuICBpZiAocGF0aC5sZW5ndGggPT09IDApIHtcbiAgICBpZiAob2JqZWN0ICYmIG9iamVjdC5fX3R5cGUgPT09ICdQb2ludGVyJykge1xuICAgICAgcmV0dXJuIHJlcGxhY2Vbb2JqZWN0Lm9iamVjdElkXTtcbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuXG4gIHZhciBzdWJvYmplY3QgPSBvYmplY3RbcGF0aFswXV07XG4gIGlmICghc3Vib2JqZWN0KSB7XG4gICAgcmV0dXJuIG9iamVjdDtcbiAgfVxuICB2YXIgbmV3c3ViID0gcmVwbGFjZVBvaW50ZXJzKHN1Ym9iamVjdCwgcGF0aC5zbGljZSgxKSwgcmVwbGFjZSk7XG4gIHZhciBhbnN3ZXIgPSB7fTtcbiAgZm9yICh2YXIga2V5IGluIG9iamVjdCkge1xuICAgIGlmIChrZXkgPT0gcGF0aFswXSkge1xuICAgICAgYW5zd2VyW2tleV0gPSBuZXdzdWI7XG4gICAgfSBlbHNlIHtcbiAgICAgIGFuc3dlcltrZXldID0gb2JqZWN0W2tleV07XG4gICAgfVxuICB9XG4gIHJldHVybiBhbnN3ZXI7XG59XG5cbi8vIEZpbmRzIGEgc3Vib2JqZWN0IHRoYXQgaGFzIHRoZSBnaXZlbiBrZXksIGlmIHRoZXJlIGlzIG9uZS5cbi8vIFJldHVybnMgdW5kZWZpbmVkIG90aGVyd2lzZS5cbmZ1bmN0aW9uIGZpbmRPYmplY3RXaXRoS2V5KHJvb3QsIGtleSkge1xuICBpZiAodHlwZW9mIHJvb3QgIT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChyb290IGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICBmb3IgKHZhciBpdGVtIG9mIHJvb3QpIHtcbiAgICAgIGNvbnN0IGFuc3dlciA9IGZpbmRPYmplY3RXaXRoS2V5KGl0ZW0sIGtleSk7XG4gICAgICBpZiAoYW5zd2VyKSB7XG4gICAgICAgIHJldHVybiBhbnN3ZXI7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGlmIChyb290ICYmIHJvb3Rba2V5XSkge1xuICAgIHJldHVybiByb290O1xuICB9XG4gIGZvciAodmFyIHN1YmtleSBpbiByb290KSB7XG4gICAgY29uc3QgYW5zd2VyID0gZmluZE9iamVjdFdpdGhLZXkocm9vdFtzdWJrZXldLCBrZXkpO1xuICAgIGlmIChhbnN3ZXIpIHtcbiAgICAgIHJldHVybiBhbnN3ZXI7XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gUmVzdFF1ZXJ5O1xuIl19