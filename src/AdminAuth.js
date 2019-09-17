'use strict';

const cryptoUtils = require('./cryptoUtils');

const RestQuery = require('./RestQuery');

const Parse = require('parse/node'); // An Auth object tells you who is requesting something and whether
// the master key was used.
// userObject is a Parse.User and can be null if there's no user.

function Auth({
  config,
  cacheController = undefined,
  isMaster = false,
  isReadOnly = false,
  user,
  installationId,
}) {
  this.config = config;
  this.cacheController = cacheController || (config && config.cacheController);
  this.installationId = installationId;
  this.isMaster = isMaster;
  this.user = user;
  this.isReadOnly = isReadOnly; // Assuming a users roles won't change during a single request, we'll
  // only load them once.

  this.userRoles = [];
  this.fetchedRoles = false;
  this.rolePromise = null;
} // Whether this auth could possibly modify the given user id.
// It still could be forbidden via ACLs even if this returns true.

Auth.prototype.isUnauthenticated = function() {
  if (this.isMaster) {
    return false;
  }

  if (this.user) {
    return false;
  }

  return true;
}; // A helper to get a master-level Auth object

function master(config) {
  return new Auth({
    config,
    isMaster: true,
  });
} // A helper to get a master-level Auth object

function readOnly(config) {
  return new Auth({
    config,
    isMaster: true,
    isReadOnly: true,
  });
} // A helper to get a nobody-level Auth object

function nobody(config) {
  return new Auth({
    config,
    isMaster: false,
  });
} // Returns a promise that resolves to an Auth object

const getAuthForSessionToken = async function({
  config,
  cacheController,
  sessionToken,
  installationId,
}) {
  cacheController = cacheController || (config && config.cacheController);

  if (cacheController) {
    const userJSON = await cacheController.user.get(sessionToken);

    if (userJSON) {
      const cachedUser = Parse.Object.fromJSON(userJSON);
      return Promise.resolve(
        new Auth({
          config,
          cacheController,
          isMaster: false,
          installationId,
          user: cachedUser,
        })
      );
    }
  }

  let results;

  if (config) {
    const restOptions = {
      limit: 1,
      include: 'user',
    };
    const query = new RestQuery(
      config,
      master(config),
      'AdminSession',
      {
        sessionToken,
      },
      restOptions
    );
    results = (await query.execute()).results;
  } else {
    results = (await new Parse.Query('AdminSession')
      .limit(1)
      .include('user')
      .equalTo('sessionToken', sessionToken)
      .find({
        useMasterKey: true,
      })).map(obj => obj.toJSON());
  }

  if (results.length !== 1 || !results[0]['user']) {
    throw new Parse.Error(
      Parse.Error.INVALID_SESSION_TOKEN,
      'Invalid session token'
    );
  }

  const now = new Date(),
    expiresAt = results[0].expiresAt
      ? new Date(results[0].expiresAt.iso)
      : undefined;

  if (expiresAt < now) {
    throw new Parse.Error(
      Parse.Error.INVALID_SESSION_TOKEN,
      'Session token is expired.'
    );
  }

  const obj = results[0]['user'];
  delete obj.password;
  obj['className'] = 'AdminUser';
  obj['sessionToken'] = sessionToken;

  if (cacheController) {
    cacheController.user.put(sessionToken, obj);
  }

  const userObject = Parse.Object.fromJSON(obj);
  return new Auth({
    config,
    cacheController,
    isMaster: false,
    installationId,
    user: userObject,
  });
};

var getAuthForLegacySessionToken = function({
  config,
  sessionToken,
  installationId,
}) {
  var restOptions = {
    limit: 1,
  };
  var query = new RestQuery(
    config,
    master(config),
    'AdminUser',
    {
      sessionToken,
    },
    restOptions
  );
  return query.execute().then(response => {
    var results = response.results;

    if (results.length !== 1) {
      throw new Parse.Error(
        Parse.Error.INVALID_SESSION_TOKEN,
        'invalid legacy session token'
      );
    }

    const obj = results[0];
    obj.className = 'AdminUser';
    const userObject = Parse.Object.fromJSON(obj);
    return new Auth({
      config,
      isMaster: false,
      installationId,
      user: userObject,
    });
  });
}; // Returns a promise that resolves to an array of role names

Auth.prototype.getUserRoles = function() {
  if (this.isMaster || !this.user) {
    return Promise.resolve([]);
  }

  if (this.fetchedRoles) {
    return Promise.resolve(this.userRoles);
  }

  if (this.rolePromise) {
    return this.rolePromise;
  }

  this.rolePromise = this._loadRoles();
  return this.rolePromise;
};

Auth.prototype.getRolesForUser = async function() {
  //Stack all Parse.Role
  const results = [];

  if (this.config) {
    const restWhere = {
      users: {
        __type: 'Pointer',
        className: 'AdminUser',
        objectId: this.user.id,
      },
    };
    await new RestQuery(
      this.config,
      master(this.config),
      '_Role',
      restWhere,
      {}
    ).each(result => results.push(result));
  } else {
    await new Parse.Query(Parse.Role)
      .equalTo('users', this.user)
      .each(result => results.push(result.toJSON()), {
        useMasterKey: true,
      });
  }

  return results;
}; // Iterates through the role tree and compiles a user's roles

Auth.prototype._loadRoles = async function() {
  if (this.cacheController) {
    const cachedRoles = await this.cacheController.role.get(this.user.id);

    if (cachedRoles != null) {
      this.fetchedRoles = true;
      this.userRoles = cachedRoles;
      return cachedRoles;
    }
  } // First get the role ids this user is directly a member of

  const results = await this.getRolesForUser();

  if (!results.length) {
    this.userRoles = [];
    this.fetchedRoles = true;
    this.rolePromise = null;
    this.cacheRoles();
    return this.userRoles;
  }

  const rolesMap = results.reduce(
    (m, r) => {
      m.names.push(r.name);
      m.ids.push(r.objectId);
      return m;
    },
    {
      ids: [],
      names: [],
    }
  ); // run the recursive finding

  const roleNames = await this._getAllRolesNamesForRoleIds(
    rolesMap.ids,
    rolesMap.names
  );
  this.userRoles = roleNames.map(r => {
    return 'role:' + r;
  });
  this.fetchedRoles = true;
  this.rolePromise = null;
  this.cacheRoles();
  return this.userRoles;
};

Auth.prototype.cacheRoles = function() {
  if (!this.cacheController) {
    return false;
  }

  this.cacheController.role.put(this.user.id, Array(...this.userRoles));
  return true;
};

Auth.prototype.getRolesByIds = async function(ins) {
  const results = []; // Build an OR query across all parentRoles

  if (!this.config) {
    await new Parse.Query(Parse.Role)
      .containedIn(
        'roles',
        ins.map(id => {
          const role = new Parse.Object(Parse.Role);
          role.id = id;
          return role;
        })
      )
      .each(result => results.push(result.toJSON()), {
        useMasterKey: true,
      });
  } else {
    const roles = ins.map(id => {
      return {
        __type: 'Pointer',
        className: '_Role',
        objectId: id,
      };
    });
    const restWhere = {
      roles: {
        $in: roles,
      },
    };
    await new RestQuery(
      this.config,
      master(this.config),
      '_Role',
      restWhere,
      {}
    ).each(result => results.push(result));
  }

  return results;
}; // Given a list of roleIds, find all the parent roles, returns a promise with all names

Auth.prototype._getAllRolesNamesForRoleIds = function(
  roleIDs,
  names = [],
  queriedRoles = {}
) {
  const ins = roleIDs.filter(roleID => {
    const wasQueried = queriedRoles[roleID] !== true;
    queriedRoles[roleID] = true;
    return wasQueried;
  }); // all roles are accounted for, return the names

  if (ins.length == 0) {
    return Promise.resolve([...new Set(names)]);
  }

  return this.getRolesByIds(ins)
    .then(results => {
      // Nothing found
      if (!results.length) {
        return Promise.resolve(names);
      } // Map the results with all Ids and names

      const resultMap = results.reduce(
        (memo, role) => {
          memo.names.push(role.name);
          memo.ids.push(role.objectId);
          return memo;
        },
        {
          ids: [],
          names: [],
        }
      ); // store the new found names

      names = names.concat(resultMap.names); // find the next ones, circular roles will be cut

      return this._getAllRolesNamesForRoleIds(
        resultMap.ids,
        names,
        queriedRoles
      );
    })
    .then(names => {
      return Promise.resolve([...new Set(names)]);
    });
};

const createSession = function(
  config,
  { userId, createdWith, installationId, additionalSessionData }
) {
  const token = 'r:' + cryptoUtils.newToken();
  const expiresAt = config.generateSessionExpiresAt();
  const sessionData = {
    sessionToken: token,
    user: {
      __type: 'Pointer',
      className: 'AdminUser',
      objectId: userId,
    },
    createdWith,
    restricted: false,
    expiresAt: Parse._encode(expiresAt),
  };

  if (installationId) {
    sessionData.installationId = installationId;
  }

  Object.assign(sessionData, additionalSessionData); // We need to import RestWrite at this point for the cyclic dependency it has to it

  const RestWrite = require('./RestWrite');

  return {
    sessionData,
    createSession: () =>
      new RestWrite(
        config,
        master(config),
        'AdminSession',
        null,
        sessionData
      ).execute(),
  };
};

module.exports = {
  Auth,
  master,
  nobody,
  readOnly,
  getAuthForSessionToken,
  getAuthForLegacySessionToken,
  createSession,
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9BdXRoLmpzIl0sIm5hbWVzIjpbImNyeXB0b1V0aWxzIiwicmVxdWlyZSIsIlJlc3RRdWVyeSIsIlBhcnNlIiwiQXV0aCIsImNvbmZpZyIsImNhY2hlQ29udHJvbGxlciIsInVuZGVmaW5lZCIsImlzTWFzdGVyIiwiaXNSZWFkT25seSIsInVzZXIiLCJpbnN0YWxsYXRpb25JZCIsInVzZXJSb2xlcyIsImZldGNoZWRSb2xlcyIsInJvbGVQcm9taXNlIiwicHJvdG90eXBlIiwiaXNVbmF1dGhlbnRpY2F0ZWQiLCJtYXN0ZXIiLCJyZWFkT25seSIsIm5vYm9keSIsImdldEF1dGhGb3JTZXNzaW9uVG9rZW4iLCJzZXNzaW9uVG9rZW4iLCJ1c2VySlNPTiIsImdldCIsImNhY2hlZFVzZXIiLCJPYmplY3QiLCJmcm9tSlNPTiIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVzdWx0cyIsInJlc3RPcHRpb25zIiwibGltaXQiLCJpbmNsdWRlIiwicXVlcnkiLCJleGVjdXRlIiwiUXVlcnkiLCJTZXNzaW9uIiwiZXF1YWxUbyIsImZpbmQiLCJ1c2VNYXN0ZXJLZXkiLCJtYXAiLCJvYmoiLCJ0b0pTT04iLCJsZW5ndGgiLCJFcnJvciIsIklOVkFMSURfU0VTU0lPTl9UT0tFTiIsIm5vdyIsIkRhdGUiLCJleHBpcmVzQXQiLCJpc28iLCJwYXNzd29yZCIsInB1dCIsInVzZXJPYmplY3QiLCJnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuIiwidGhlbiIsInJlc3BvbnNlIiwiY2xhc3NOYW1lIiwiZ2V0VXNlclJvbGVzIiwiX2xvYWRSb2xlcyIsImdldFJvbGVzRm9yVXNlciIsInJlc3RXaGVyZSIsInVzZXJzIiwiX190eXBlIiwib2JqZWN0SWQiLCJpZCIsImVhY2giLCJyZXN1bHQiLCJwdXNoIiwiUm9sZSIsImNhY2hlZFJvbGVzIiwicm9sZSIsImNhY2hlUm9sZXMiLCJyb2xlc01hcCIsInJlZHVjZSIsIm0iLCJyIiwibmFtZXMiLCJuYW1lIiwiaWRzIiwicm9sZU5hbWVzIiwiX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzIiwiQXJyYXkiLCJnZXRSb2xlc0J5SWRzIiwiaW5zIiwiY29udGFpbmVkSW4iLCJyb2xlcyIsIiRpbiIsInJvbGVJRHMiLCJxdWVyaWVkUm9sZXMiLCJmaWx0ZXIiLCJyb2xlSUQiLCJ3YXNRdWVyaWVkIiwiU2V0IiwicmVzdWx0TWFwIiwibWVtbyIsImNvbmNhdCIsImNyZWF0ZVNlc3Npb24iLCJ1c2VySWQiLCJjcmVhdGVkV2l0aCIsImFkZGl0aW9uYWxTZXNzaW9uRGF0YSIsInRva2VuIiwibmV3VG9rZW4iLCJnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQiLCJzZXNzaW9uRGF0YSIsInJlc3RyaWN0ZWQiLCJfZW5jb2RlIiwiYXNzaWduIiwiUmVzdFdyaXRlIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJtYXBwaW5ncyI6Ijs7QUFBQSxNQUFNQSxXQUFXLEdBQUdDLE9BQU8sQ0FBQyxlQUFELENBQTNCOztBQUNBLE1BQU1DLFNBQVMsR0FBR0QsT0FBTyxDQUFDLGFBQUQsQ0FBekI7O0FBQ0EsTUFBTUUsS0FBSyxHQUFHRixPQUFPLENBQUMsWUFBRCxDQUFyQixDLENBRUE7QUFDQTtBQUNBOzs7QUFDQSxTQUFTRyxJQUFULENBQWM7QUFDWkMsRUFBQUEsTUFEWTtBQUVaQyxFQUFBQSxlQUFlLEdBQUdDLFNBRk47QUFHWkMsRUFBQUEsUUFBUSxHQUFHLEtBSEM7QUFJWkMsRUFBQUEsVUFBVSxHQUFHLEtBSkQ7QUFLWkMsRUFBQUEsSUFMWTtBQU1aQyxFQUFBQTtBQU5ZLENBQWQsRUFPRztBQUNELE9BQUtOLE1BQUwsR0FBY0EsTUFBZDtBQUNBLE9BQUtDLGVBQUwsR0FBdUJBLGVBQWUsSUFBS0QsTUFBTSxJQUFJQSxNQUFNLENBQUNDLGVBQTVEO0FBQ0EsT0FBS0ssY0FBTCxHQUFzQkEsY0FBdEI7QUFDQSxPQUFLSCxRQUFMLEdBQWdCQSxRQUFoQjtBQUNBLE9BQUtFLElBQUwsR0FBWUEsSUFBWjtBQUNBLE9BQUtELFVBQUwsR0FBa0JB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RURjLEVBQUFBLE1BQU0sQ0FBQ2lGLE1BQVAsQ0FBY0gsV0FBZCxFQUEyQkoscUJBQTNCLEVBbkJBLENBb0JBOztBQUNBLFFBQU1RLFNBQVMsR0FBRzFHLE9BQU8sQ0FBQyxhQUFELENBQXpCOztBQUVBLFNBQU87QUFDTHNHLElBQUFBLFdBREs7QUFFTFAsSUFBQUEsYUFBYSxFQUFFLE1BQ2IsSUFBSVcsU0FBSixDQUNFdEcsTUFERixFQUVFWSxNQUFNLENBQUNaLE1BQUQsQ0FGUixFQUdFLFVBSEYsRUFJRSxJQUpGLEVBS0VrRyxXQUxGLEVBTUVyRSxPQU5GO0FBSEcsR0FBUDtBQVdELENBckNEOztBQXVDQTBFLE1BQU0sQ0FBQ0MsT0FBUCxHQUFpQjtBQUNmekcsRUFBQUEsSUFEZTtBQUVmYSxFQUFBQSxNQUZlO0FBR2ZFLEVBQUFBLE1BSGU7QUFJZkQsRUFBQUEsUUFKZTtBQUtmRSxFQUFBQSxzQkFMZTtBQU1maUMsRUFBQUEsNEJBTmU7QUFPZjJDLEVBQUFBO0FBUGUsQ0FBakIiLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBjcnlwdG9VdGlscyA9IHJlcXVpcmUoJy4vY3J5cHRvVXRpbHMnKTtcbmNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG5jb25zdCBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKTtcblxuLy8gQW4gQXV0aCBvYmplY3QgdGVsbHMgeW91IHdobyBpcyByZXF1ZXN0aW5nIHNvbWV0aGluZyBhbmQgd2hldGhlclxuLy8gdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4vLyB1c2VyT2JqZWN0IGlzIGEgUGFyc2UuVXNlciBhbmQgY2FuIGJlIG51bGwgaWYgdGhlcmUncyBubyB1c2VyLlxuZnVuY3Rpb24gQXV0aCh7XG4gIGNvbmZpZyxcbiAgY2FjaGVDb250cm9sbGVyID0gdW5kZWZpbmVkLFxuICBpc01hc3RlciA9IGZhbHNlLFxuICBpc1JlYWRPbmx5ID0gZmFsc2UsXG4gIHVzZXIsXG4gIGluc3RhbGxhdGlvbklkLFxufSkge1xuICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgdGhpcy5jYWNoZUNvbnRyb2xsZXIgPSBjYWNoZUNvbnRyb2xsZXIgfHwgKGNvbmZpZyAmJiBjb25maWcuY2FjaGVDb250cm9sbGVyKTtcbiAgdGhpcy5pbnN0YWxsYXRpb25JZCA9IGluc3RhbGxhdGlvbklkO1xuICB0aGlzLmlzTWFzdGVyID0gaXNNYXN0ZXI7XG4gIHRoaXMudXNlciA9IHVzZXI7XG4gIHRoaXMuaXNSZWFkT25seSA9IGlzUmVhZE9ubHk7XG5cbiAgLy8gQXNzdW1pbmcgYSB1c2VycyByb2xlcyB3b24ndCBjaGFuZ2UgZHVyaW5nIGEgc2luZ2xlIHJlcXVlc3QsIHdlJ2xsXG4gIC8vIG9ubHkgbG9hZCB0aGVtIG9uY2UuXG4gIHRoaXMudXNlclJvbGVzID0gW107XG4gIHRoaXMuZmV0Y2hlZFJvbGVzID0gZmFsc2U7XG4gIHRoaXMucm9sZVByb21pc2UgPSBudWxsO1xufVxuXG4vLyBXaGV0aGVyIHRoaXMgYXV0aCBjb3VsZCBwb3NzaWJseSBtb2RpZnkgdGhlIGdpdmVuIHVzZXIgaWQuXG4vLyBJdCBzdGlsbCBjb3VsZCBiZSBmb3JiaWRkZW4gdmlhIEFDTHMgZXZlbiBpZiB0aGlzIHJldHVybnMgdHJ1ZS5cbkF1dGgucHJvdG90eXBlLmlzVW5hdXRoZW50aWNhdGVkID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmICh0aGlzLnVzZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59O1xuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBtYXN0ZXItbGV2ZWwgQXV0aCBvYmplY3RcbmZ1bmN0aW9uIG1hc3Rlcihjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01hc3RlcjogdHJ1ZSB9KTtcbn1cblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbWFzdGVyLWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiByZWFkT25seShjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01hc3RlcjogdHJ1ZSwgaXNSZWFkT25seTogdHJ1ZSB9KTtcbn1cblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbm9ib2R5LWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiBub2JvZHkoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IGZhbHNlIH0pO1xufVxuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIEF1dGggb2JqZWN0XG5jb25zdCBnZXRBdXRoRm9yU2Vzc2lvblRva2VuID0gYXN5bmMgZnVuY3Rpb24oe1xuICBjb25maWcsXG4gIGNhY2hlQ29udHJvbGxlcixcbiAgc2Vzc2lvblRva2VuLFxuICBpbnN0YWxsYXRpb25JZCxcbn0pIHtcbiAgY2FjaGVDb250cm9sbGVyID0gY2FjaGVDb250cm9sbGVyIHx8IChjb25maWcgJiYgY29uZmlnLmNhY2hlQ29udHJvbGxlcik7XG4gIGlmIChjYWNoZUNvbnRyb2xsZXIpIHtcbiAgICBjb25zdCB1c2VySlNPTiA9IGF3YWl0IGNhY2hlQ29udHJvbGxlci51c2VyLmdldChzZXNzaW9uVG9rZW4pO1xuICAgIGlmICh1c2VySlNPTikge1xuICAgICAgY29uc3QgY2FjaGVkVXNlciA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTih1c2VySlNPTik7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFxuICAgICAgICBuZXcgQXV0aCh7XG4gICAgICAgICAgY29uZmlnLFxuICAgICAgICAgIGNhY2hlQ29udHJvbGxlcixcbiAgICAgICAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgdXNlcjogY2FjaGVkVXNlcixcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgbGV0IHJlc3VsdHM7XG4gIGlmIChjb25maWcpIHtcbiAgICBjb25zdCByZXN0T3B0aW9ucyA9IHtcbiAgICAgIGxpbWl0OiAxLFxuICAgICAgaW5jbHVkZTogJ3VzZXInLFxuICAgIH07XG5cbiAgICBjb25zdCBxdWVyeSA9IG5ldyBSZXN0UXVlcnkoXG4gICAgICBjb25maWcsXG4gICAgICBtYXN0ZXIoY29uZmlnKSxcbiAgICAgICdfU2Vzc2lvbicsXG4gICAgICB7IHNlc3Npb25Ub2tlbiB9LFxuICAgICAgcmVzdE9wdGlvbnNcbiAgICApO1xuICAgIHJlc3VsdHMgPSAoYXdhaXQgcXVlcnkuZXhlY3V0ZSgpKS5yZXN1bHRzO1xuICB9IGVsc2Uge1xuICAgIHJlc3VsdHMgPSAoYXdhaXQgbmV3IFBhcnNlLlF1ZXJ5KFBhcnNlLlNlc3Npb24pXG4gICAgICAubGltaXQoMSlcbiAgICAgIC5pbmNsdWRlKCd1c2VyJylcbiAgICAgIC5lcXVhbFRvKCdzZXNzaW9uVG9rZW4nLCBzZXNzaW9uVG9rZW4pXG4gICAgICAuZmluZCh7IHVzZU1hc3RlcktleTogdHJ1ZSB9KSkubWFwKG9iaiA9PiBvYmoudG9KU09OKCkpO1xuICB9XG5cbiAgaWYgKHJlc3VsdHMubGVuZ3RoICE9PSAxIHx8ICFyZXN1bHRzWzBdWyd1c2VyJ10pIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX1NFU1NJT05fVE9LRU4sXG4gICAgICAnSW52YWxpZCBzZXNzaW9uIHRva2VuJ1xuICAgICk7XG4gIH1cbiAgY29uc3Qgbm93ID0gbmV3IERhdGUoKSxcbiAgICBleHBpcmVzQXQgPSByZXN1bHRzWzBdLmV4cGlyZXNBdFxuICAgICAgPyBuZXcgRGF0ZShyZXN1bHRzWzBdLmV4cGlyZXNBdC5pc28pXG4gICAgICA6IHVuZGVmaW5lZDtcbiAgaWYgKGV4cGlyZXNBdCA8IG5vdykge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTixcbiAgICAgICdTZXNzaW9uIHRva2VuIGlzIGV4cGlyZWQuJ1xuICAgICk7XG4gIH1cbiAgY29uc3Qgb2JqID0gcmVzdWx0c1swXVsndXNlciddO1xuICBkZWxldGUgb2JqLnBhc3N3b3JkO1xuICBvYmpbJ2NsYXNzTmFtZSddID0gJ19Vc2VyJztcbiAgb2JqWydzZXNzaW9uVG9rZW4nXSA9IHNlc3Npb25Ub2tlbjtcbiAgaWYgKGNhY2hlQ29udHJvbGxlcikge1xuICAgIGNhY2hlQ29udHJvbGxlci51c2VyLnB1dChzZXNzaW9uVG9rZW4sIG9iaik7XG4gIH1cbiAgY29uc3QgdXNlck9iamVjdCA9IFBhcnNlLk9iamVjdC5mcm9tSlNPTihvYmopO1xuICByZXR1cm4gbmV3IEF1dGgoe1xuICAgIGNvbmZpZyxcbiAgICBjYWNoZUNvbnRyb2xsZXIsXG4gICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgIGluc3RhbGxhdGlvbklkLFxuICAgIHVzZXI6IHVzZXJPYmplY3QsXG4gIH0pO1xufTtcblxudmFyIGdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4gPSBmdW5jdGlvbih7XG4gIGNvbmZpZyxcbiAgc2Vzc2lvblRva2VuLFxuICBpbnN0YWxsYXRpb25JZCxcbn0pIHtcbiAgdmFyIHJlc3RPcHRpb25zID0ge1xuICAgIGxpbWl0OiAxLFxuICB9O1xuICB2YXIgcXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgIGNvbmZpZyxcbiAgICBtYXN0ZXIoY29uZmlnKSxcbiAgICAnX1VzZXInLFxuICAgIHsgc2Vzc2lvblRva2VuIH0sXG4gICAgcmVzdE9wdGlvbnNcbiAgKTtcbiAgcmV0dXJuIHF1ZXJ5LmV4ZWN1dGUoKS50aGVuKHJlc3BvbnNlID0+IHtcbiAgICB2YXIgcmVzdWx0cyA9IHJlc3BvbnNlLnJlc3VsdHM7XG4gICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9PSAxKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTixcbiAgICAgICAgJ2ludmFsaWQgbGVnYWN5IHNlc3Npb24gdG9rZW4nXG4gICAgICApO1xuICAgIH1cbiAgICBjb25zdCBvYmogPSByZXN1bHRzWzBdO1xuICAgIG9iai5jbGFzc05hbWUgPSAnX1VzZXInO1xuICAgIGNvbnN0IHVzZXJPYmplY3QgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04ob2JqKTtcbiAgICByZXR1cm4gbmV3IEF1dGgoe1xuICAgICAgY29uZmlnLFxuICAgICAgaXNNYXN0ZXI6IGZhbHNlLFxuICAgICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgICB1c2VyOiB1c2VyT2JqZWN0LFxuICAgIH0pO1xuICB9KTtcbn07XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gYW4gYXJyYXkgb2Ygcm9sZSBuYW1lc1xuQXV0aC5wcm90b3R5cGUuZ2V0VXNlclJvbGVzID0gZnVuY3Rpb24oKSB7XG4gIGlmICh0aGlzLmlzTWFzdGVyIHx8ICF0aGlzLnVzZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcbiAgfVxuICBpZiAodGhpcy5mZXRjaGVkUm9sZXMpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMudXNlclJvbGVzKTtcbiAgfVxuICBpZiAodGhpcy5yb2xlUHJvbWlzZSkge1xuICAgIHJldHVybiB0aGlzLnJvbGVQcm9taXNlO1xuICB9XG4gIHRoaXMucm9sZVByb21pc2UgPSB0aGlzLl9sb2FkUm9sZXMoKTtcbiAgcmV0dXJuIHRoaXMucm9sZVByb21pc2U7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5nZXRSb2xlc0ZvclVzZXIgPSBhc3luYyBmdW5jdGlvbigpIHtcbiAgLy9TdGFjayBhbGwgUGFyc2UuUm9sZVxuICBjb25zdCByZXN1bHRzID0gW107XG4gIGlmICh0aGlzLmNvbmZpZykge1xuICAgIGNvbnN0IHJlc3RXaGVyZSA9IHtcbiAgICAgIHVzZXJzOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLnVzZXIuaWQsXG4gICAgICB9LFxuICAgIH07XG4gICAgYXdhaXQgbmV3IFJlc3RRdWVyeShcbiAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgbWFzdGVyKHRoaXMuY29uZmlnKSxcbiAgICAgICdfUm9sZScsXG4gICAgICByZXN0V2hlcmUsXG4gICAgICB7fVxuICAgICkuZWFjaChyZXN1bHQgPT4gcmVzdWx0cy5wdXNoKHJlc3VsdCkpO1xuICB9IGVsc2Uge1xuICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKVxuICAgICAgLmVxdWFsVG8oJ3VzZXJzJywgdGhpcy51c2VyKVxuICAgICAgLmVhY2gocmVzdWx0ID0+IHJlc3VsdHMucHVzaChyZXN1bHQudG9KU09OKCkpLCB7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn07XG5cbi8vIEl0ZXJhdGVzIHRocm91Z2ggdGhlIHJvbGUgdHJlZSBhbmQgY29tcGlsZXMgYSB1c2VyJ3Mgcm9sZXNcbkF1dGgucHJvdG90eXBlLl9sb2FkUm9sZXMgPSBhc3luYyBmdW5jdGlvbigpIHtcbiAgaWYgKHRoaXMuY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY29uc3QgY2FjaGVkUm9sZXMgPSBhd2FpdCB0aGlzLmNhY2hlQ29udHJvbGxlci5yb2xlLmdldCh0aGlzLnVzZXIuaWQpO1xuICAgIGlmIChjYWNoZWRSb2xlcyAhPSBudWxsKSB7XG4gICAgICB0aGlzLmZldGNoZWRSb2xlcyA9IHRydWU7XG4gICAgICB0aGlzLnVzZXJSb2xlcyA9IGNhY2hlZFJvbGVzO1xuICAgICAgcmV0dXJuIGNhY2hlZFJvbGVzO1xuICAgIH1cbiAgfVxuXG4gIC8vIEZpcnN0IGdldCB0aGUgcm9sZSBpZHMgdGhpcyB1c2VyIGlzIGRpcmVjdGx5IGEgbWVtYmVyIG9mXG4gIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmdldFJvbGVzRm9yVXNlcigpO1xuICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgdGhpcy51c2VyUm9sZXMgPSBbXTtcbiAgICB0aGlzLmZldGNoZWRSb2xlcyA9IHRydWU7XG4gICAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG5cbiAgICB0aGlzLmNhY2hlUm9sZXMoKTtcbiAgICByZXR1cm4gdGhpcy51c2VyUm9sZXM7XG4gIH1cblxuICBjb25zdCByb2xlc01hcCA9IHJlc3VsdHMucmVkdWNlKFxuICAgIChtLCByKSA9PiB7XG4gICAgICBtLm5hbWVzLnB1c2goci5uYW1lKTtcbiAgICAgIG0uaWRzLnB1c2goci5vYmplY3RJZCk7XG4gICAgICByZXR1cm4gbTtcbiAgICB9LFxuICAgIHsgaWRzOiBbXSwgbmFtZXM6IFtdIH1cbiAgKTtcblxuICAvLyBydW4gdGhlIHJlY3Vyc2l2ZSBmaW5kaW5nXG4gIGNvbnN0IHJvbGVOYW1lcyA9IGF3YWl0IHRoaXMuX2dldEFsbFJvbGVzTmFtZXNGb3JSb2xlSWRzKFxuICAgIHJvbGVzTWFwLmlkcyxcbiAgICByb2xlc01hcC5uYW1lc1xuICApO1xuICB0aGlzLnVzZXJSb2xlcyA9IHJvbGVOYW1lcy5tYXAociA9PiB7XG4gICAgcmV0dXJuICdyb2xlOicgKyByO1xuICB9KTtcbiAgdGhpcy5mZXRjaGVkUm9sZXMgPSB0cnVlO1xuICB0aGlzLnJvbGVQcm9taXNlID0gbnVsbDtcbiAgdGhpcy5jYWNoZVJvbGVzKCk7XG4gIHJldHVybiB0aGlzLnVzZXJSb2xlcztcbn07XG5cbkF1dGgucHJvdG90eXBlLmNhY2hlUm9sZXMgPSBmdW5jdGlvbigpIHtcbiAgaWYgKCF0aGlzLmNhY2hlQ29udHJvbGxlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICB0aGlzLmNhY2hlQ29udHJvbGxlci5yb2xlLnB1dCh0aGlzLnVzZXIuaWQsIEFycmF5KC4uLnRoaXMudXNlclJvbGVzKSk7XG4gIHJldHVybiB0cnVlO1xufTtcblxuQXV0aC5wcm90b3R5cGUuZ2V0Um9sZXNCeUlkcyA9IGFzeW5jIGZ1bmN0aW9uKGlucykge1xuICBjb25zdCByZXN1bHRzID0gW107XG4gIC8vIEJ1aWxkIGFuIE9SIHF1ZXJ5IGFjcm9zcyBhbGwgcGFyZW50Um9sZXNcbiAgaWYgKCF0aGlzLmNvbmZpZykge1xuICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKVxuICAgICAgLmNvbnRhaW5lZEluKFxuICAgICAgICAncm9sZXMnLFxuICAgICAgICBpbnMubWFwKGlkID0+IHtcbiAgICAgICAgICBjb25zdCByb2xlID0gbmV3IFBhcnNlLk9iamVjdChQYXJzZS5Sb2xlKTtcbiAgICAgICAgICByb2xlLmlkID0gaWQ7XG4gICAgICAgICAgcmV0dXJuIHJvbGU7XG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuZWFjaChyZXN1bHQgPT4gcmVzdWx0cy5wdXNoKHJlc3VsdC50b0pTT04oKSksIHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IHJvbGVzID0gaW5zLm1hcChpZCA9PiB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1JvbGUnLFxuICAgICAgICBvYmplY3RJZDogaWQsXG4gICAgICB9O1xuICAgIH0pO1xuICAgIGNvbnN0IHJlc3RXaGVyZSA9IHsgcm9sZXM6IHsgJGluOiByb2xlcyB9IH07XG4gICAgYXdhaXQgbmV3IFJlc3RRdWVyeShcbiAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgbWFzdGVyKHRoaXMuY29uZmlnKSxcbiAgICAgICdfUm9sZScsXG4gICAgICByZXN0V2hlcmUsXG4gICAgICB7fVxuICAgICkuZWFjaChyZXN1bHQgPT4gcmVzdWx0cy5wdXNoKHJlc3VsdCkpO1xuICB9XG4gIHJldHVybiByZXN1bHRzO1xufTtcblxuLy8gR2l2ZW4gYSBsaXN0IG9mIHJvbGVJZHMsIGZpbmQgYWxsIHRoZSBwYXJlbnQgcm9sZXMsIHJldHVybnMgYSBwcm9taXNlIHdpdGggYWxsIG5hbWVzXG5BdXRoLnByb3RvdHlwZS5fZ2V0QWxsUm9sZXNOYW1lc0ZvclJvbGVJZHMgPSBmdW5jdGlvbihcbiAgcm9sZUlEcyxcbiAgbmFtZXMgPSBbXSxcbiAgcXVlcmllZFJvbGVzID0ge31cbikge1xuICBjb25zdCBpbnMgPSByb2xlSURzLmZpbHRlcihyb2xlSUQgPT4ge1xuICAgIGNvbnN0IHdhc1F1ZXJpZWQgPSBxdWVyaWVkUm9sZXNbcm9sZUlEXSAhPT0gdHJ1ZTtcbiAgICBxdWVyaWVkUm9sZXNbcm9sZUlEXSA9IHRydWU7XG4gICAgcmV0dXJuIHdhc1F1ZXJpZWQ7XG4gIH0pO1xuXG4gIC8vIGFsbCByb2xlcyBhcmUgYWNjb3VudGVkIGZvciwgcmV0dXJuIHRoZSBuYW1lc1xuICBpZiAoaW5zLmxlbmd0aCA9PSAwKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShbLi4ubmV3IFNldChuYW1lcyldKTtcbiAgfVxuXG4gIHJldHVybiB0aGlzLmdldFJvbGVzQnlJZHMoaW5zKVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgLy8gTm90aGluZyBmb3VuZFxuICAgICAgaWYgKCFyZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG5hbWVzKTtcbiAgICAgIH1cbiAgICAgIC8vIE1hcCB0aGUgcmVzdWx0cyB3aXRoIGFsbCBJZHMgYW5kIG5hbWVzXG4gICAgICBjb25zdCByZXN1bHRNYXAgPSByZXN1bHRzLnJlZHVjZShcbiAgICAgICAgKG1lbW8sIHJvbGUpID0+IHtcbiAgICAgICAgICBtZW1vLm5hbWVzLnB1c2gocm9sZS5uYW1lKTtcbiAgICAgICAgICBtZW1vLmlkcy5wdXNoKHJvbGUub2JqZWN0SWQpO1xuICAgICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgICB9LFxuICAgICAgICB7IGlkczogW10sIG5hbWVzOiBbXSB9XG4gICAgICApO1xuICAgICAgLy8gc3RvcmUgdGhlIG5ldyBmb3VuZCBuYW1lc1xuICAgICAgbmFtZXMgPSBuYW1lcy5jb25jYXQocmVzdWx0TWFwLm5hbWVzKTtcbiAgICAgIC8vIGZpbmQgdGhlIG5leHQgb25lcywgY2lyY3VsYXIgcm9sZXMgd2lsbCBiZSBjdXRcbiAgICAgIHJldHVybiB0aGlzLl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyhcbiAgICAgICAgcmVzdWx0TWFwLmlkcyxcbiAgICAgICAgbmFtZXMsXG4gICAgICAgIHF1ZXJpZWRSb2xlc1xuICAgICAgKTtcbiAgICB9KVxuICAgIC50aGVuKG5hbWVzID0+IHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoWy4uLm5ldyBTZXQobmFtZXMpXSk7XG4gICAgfSk7XG59O1xuXG5jb25zdCBjcmVhdGVTZXNzaW9uID0gZnVuY3Rpb24oXG4gIGNvbmZpZyxcbiAgeyB1c2VySWQsIGNyZWF0ZWRXaXRoLCBpbnN0YWxsYXRpb25JZCwgYWRkaXRpb25hbFNlc3Npb25EYXRhIH1cbikge1xuICBjb25zdCB0b2tlbiA9ICdyOicgKyBjcnlwdG9VdGlscy5uZXdUb2tlbigpO1xuICBjb25zdCBleHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCk7XG4gIGNvbnN0IHNlc3Npb25EYXRhID0ge1xuICAgIHNlc3Npb25Ub2tlbjogdG9rZW4sXG4gICAgdXNlcjoge1xuICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICBvYmplY3RJZDogdXNlcklkLFxuICAgIH0sXG4gICAgY3JlYXRlZFdpdGgsXG4gICAgcmVzdHJpY3RlZDogZmFsc2UsXG4gICAgZXhwaXJlc0F0OiBQYXJzZS5fZW5jb2RlKGV4cGlyZXNBdCksXG4gIH07XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgc2Vzc2lvbkRhdGEuaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZDtcbiAgfVxuXG4gIE9iamVjdC5hc3NpZ24oc2Vzc2lvbkRhdGEsIGFkZGl0aW9uYWxTZXNzaW9uRGF0YSk7XG4gIC8vIFdlIG5lZWQgdG8gaW1wb3J0IFJlc3RXcml0ZSBhdCB0aGlzIHBvaW50IGZvciB0aGUgY3ljbGljIGRlcGVuZGVuY3kgaXQgaGFzIHRvIGl0XG4gIGNvbnN0IFJlc3RXcml0ZSA9IHJlcXVpcmUoJy4vUmVzdFdyaXRlJyk7XG5cbiAgcmV0dXJuIHtcbiAgICBzZXNzaW9uRGF0YSxcbiAgICBjcmVhdGVTZXNzaW9uOiAoKSA9PlxuICAgICAgbmV3IFJlc3RXcml0ZShcbiAgICAgICAgY29uZmlnLFxuICAgICAgICBtYXN0ZXIoY29uZmlnKSxcbiAgICAgICAgJ19TZXNzaW9uJyxcbiAgICAgICAgbnVsbCxcbiAgICAgICAgc2Vzc2lvbkRhdGFcbiAgICAgICkuZXhlY3V0ZSgpLFxuICB9O1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIEF1dGgsXG4gIG1hc3RlcixcbiAgbm9ib2R5LFxuICByZWFkT25seSxcbiAgZ2V0QXV0aEZvclNlc3Npb25Ub2tlbixcbiAgZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbixcbiAgY3JlYXRlU2Vzc2lvbixcbn07XG4iXX0=
