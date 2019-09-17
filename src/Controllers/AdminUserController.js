'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true,
});
exports.default = exports.UserController = void 0;

var _cryptoUtils = require('../cryptoUtils');

var _triggers = require('../triggers');

var _AdaptableController = _interopRequireDefault(
  require('./AdaptableController')
);

var _MailAdapter = _interopRequireDefault(
  require('../Adapters/Email/MailAdapter')
);

var _rest = _interopRequireDefault(require('../rest'));

var _node = _interopRequireDefault(require('parse/node'));

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : { default: obj };
}

var RestQuery = require('../RestQuery');

var Auth = require('../AdiminAuth');

class UserController extends _AdaptableController.default {
  constructor(adapter, appId, options = {}) {
    super(adapter, appId, options);
  }

  validateAdapter(adapter) {
    // Allow no adapter
    if (!adapter && !this.shouldVerifyEmails) {
      return;
    }

    super.validateAdapter(adapter);
  }

  expectedAdapterType() {
    return _MailAdapter.default;
  }

  get shouldVerifyEmails() {
    return this.options.verifyUserEmails;
  }

  setEmailVerifyToken(user) {
    if (this.shouldVerifyEmails) {
      user._email_verify_token = (0, _cryptoUtils.randomString)(25);
      user.emailVerified = false;

      if (this.config.emailVerifyTokenValidityDuration) {
        user._email_verify_token_expires_at = _node.default._encode(
          this.config.generateEmailVerifyTokenExpiresAt()
        );
      }
    }
  }

  verifyEmail(username, token) {
    if (!this.shouldVerifyEmails) {
      // Trying to verify email when not enabled
      // TODO: Better error here.
      throw undefined;
    }

    const query = {
      username: username,
      _email_verify_token: token,
    };
    const updateFields = {
      emailVerified: true,
      _email_verify_token: {
        __op: 'Delete',
      },
    }; // if the email verify token needs to be validated then
    // add additional query params and additional fields that need to be updated

    if (this.config.emailVerifyTokenValidityDuration) {
      query.emailVerified = false;
      query._email_verify_token_expires_at = {
        $gt: _node.default._encode(new Date()),
      };
      updateFields._email_verify_token_expires_at = {
        __op: 'Delete',
      };
    }

    const masterAuth = Auth.master(this.config);
    var checkIfAlreadyVerified = new RestQuery(
      this.config,
      Auth.master(this.config),
      'AdminUser',
      {
        username: username,
        emailVerified: true,
      }
    );
    return checkIfAlreadyVerified.execute().then(result => {
      if (result.results.length) {
        return Promise.resolve(result.results.length[0]);
      }

      return _rest.default.update(
        this.config,
        masterAuth,
        'AdminUser',
        query,
        updateFields
      );
    });
  }

  checkResetTokenValidity(username, token) {
    return this.config.database
      .find(
        'AdminUser',
        {
          username: username,
          _perishable_token: token,
        },
        {
          limit: 1,
        }
      )
      .then(results => {
        if (results.length != 1) {
          throw 'Failed to reset password: username / email / token is invalid';
        }

        if (
          this.config.passwordPolicy &&
          this.config.passwordPolicy.resetTokenValidityDuration
        ) {
          let expiresDate = results[0]._perishable_token_expires_at;

          if (expiresDate && expiresDate.__type == 'Date') {
            expiresDate = new Date(expiresDate.iso);
          }

          if (expiresDate < new Date())
            throw 'The password reset link has expired';
        }

        return results[0];
      });
  }

  getUserIfNeeded(user) {
    if (user.username && user.email) {
      return Promise.resolve(user);
    }

    var where = {};

    if (user.username) {
      where.username = user.username;
    }

    if (user.email) {
      where.email = user.email;
    }

    var query = new RestQuery(
      this.config,
      Auth.master(this.config),
      'AdminUser',
      where
    );
    return query.execute().then(function(result) {
      if (result.results.length != 1) {
        throw undefined;
      }

      return result.results[0];
    });
  }

  sendVerificationEmail(user) {
    if (!this.shouldVerifyEmails) {
      return;
    }

    const token = encodeURIComponent(user._email_verify_token); // We may need to fetch the user in case of update email

    this.getUserIfNeeded(user).then(user => {
      const username = encodeURIComponent(user.username);
      const link = buildEmailLink(
        this.config.verifyEmailURL,
        username,
        token,
        this.config
      );
      const options = {
        appName: this.config.appName,
        link: link,
        user: (0, _triggers.inflate)('AdminUser', user),
      };

      if (this.adapter.sendVerificationEmail) {
        this.adapter.sendVerificationEmail(options);
      } else {
        this.adapter.sendMail(this.defaultVerificationEmail(options));
      }
    });
  }
  /**
   * Regenerates the given user's email verification token
   *
   * @param user
   * @returns {*}
   */

  regenerateEmailVerifyToken(user) {
    this.setEmailVerifyToken(user);
    return this.config.database.update(
      'AdminUser',
      {
        username: user.username,
      },
      user
    );
  }

  resendVerificationEmail(username) {
    return this.getUserIfNeeded({
      username: username,
    }).then(aUser => {
      if (!aUser || aUser.emailVerified) {
        throw undefined;
      }

      return this.regenerateEmailVerifyToken(aUser).then(() => {
        this.sendVerificationEmail(aUser);
      });
    });
  }

  setPasswordResetToken(email) {
    const token = {
      _perishable_token: (0, _cryptoUtils.randomString)(25),
    };

    if (
      this.config.passwordPolicy &&
      this.config.passwordPolicy.resetTokenValidityDuration
    ) {
      token._perishable_token_expires_at = _node.default._encode(
        this.config.generatePasswordResetTokenExpiresAt()
      );
    }

    return this.config.database.update(
      'AdminUser',
      {
        $or: [
          {
            email,
          },
          {
            username: email,
            email: {
              $exists: false,
            },
          },
        ],
      },
      token,
      {},
      true
    );
  }

  sendPasswordResetEmail(email) {
    if (!this.adapter) {
      throw 'Trying to send a reset password but no adapter is set'; //  TODO: No adapter?
    }

    return this.setPasswordResetToken(email).then(user => {
      const token = encodeURIComponent(user._perishable_token);
      const username = encodeURIComponent(user.username);
      const link = buildEmailLink(
        this.config.requestResetPasswordURL,
        username,
        token,
        this.config
      );
      const options = {
        appName: this.config.appName,
        link: link,
        user: (0, _triggers.inflate)('AdminUser', user),
      };

      if (this.adapter.sendPasswordResetEmail) {
        this.adapter.sendPasswordResetEmail(options);
      } else {
        this.adapter.sendMail(this.defaultResetPasswordEmail(options));
      }

      return Promise.resolve(user);
    });
  }

  updatePassword(username, token, password) {
    return this.checkResetTokenValidity(username, token)
      .then(user => updateUserPassword(user.objectId, password, this.config))
      .catch(error => {
        if (error && error.message) {
          // in case of Parse.Error, fail with the error message only
          return Promise.reject(error.message);
        } else {
          return Promise.reject(error);
        }
      });
  }

  defaultVerificationEmail({ link, user, appName }) {
    const text =
      'Hi,\n\n' +
      'You are being asked to confirm the e-mail address ' +
      user.get('email') +
      ' with ' +
      appName +
      '\n\n' +
      '' +
      'Click here to confirm it:\n' +
      link;
    const to = user.get('email');
    const subject = 'Please verify your e-mail for ' + appName;
    return {
      text,
      to,
      subject,
    };
  }

  defaultResetPasswordEmail({ link, user, appName }) {
    const text =
      'Hi,\n\n' +
      'You requested to reset your password for ' +
      appName +
      (user.get('username')
        ? " (your username is '" + user.get('username') + "')"
        : '') +
      '.\n\n' +
      '' +
      'Click here to reset it:\n' +
      link;
    const to = user.get('email') || user.get('username');
    const subject = 'Password Reset for ' + appName;
    return {
      text,
      to,
      subject,
    };
  }
} // Mark this private

exports.UserController = UserController;

function updateUserPassword(userId, password, config) {
  return _rest.default.update(
    config,
    Auth.master(config),
    'AdminUser',
    {
      objectId: userId,
    },
    {
      password: password,
    }
  );
}

function buildEmailLink(destination, username, token, config) {
  const usernameAndToken = `token=${token}&username=${username}`;

  if (config.parseFrameURL) {
    const destinationWithoutHost = destination.replace(
      config.publicServerURL,
      ''
    );
    return `${config.parseFrameURL}?link=${encodeURIComponent(
      destinationWithoutHost
    )}&${usernameAndToken}`;
  } else {
    return `${destination}?${usernameAndToken}`;
  }
}

var _default = UserController;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9Vc2VyQ29udHJvbGxlci5qcyJdLCJuYW1lcyI6WyJSZXN0UXVlcnkiLCJyZXF1aXJlIiwiQXV0aCIsIlVzZXJDb250cm9sbGVyIiwiQWRhcHRhYmxlQ29udHJvbGxlciIsImNvbnN0cnVjdG9yIiwiYWRhcHRlciIsImFwcElkIiwib3B0aW9ucyIsInZhbGlkYXRlQWRhcHRlciIsInNob3VsZFZlcmlmeUVtYWlscyIsImV4cGVjdGVkQWRhcHRlclR5cGUiLCJNYWlsQWRhcHRlciIsInZlcmlmeVVzZXJFbWFpbHMiLCJzZXRFbWFpbFZlcmlmeVRva2VuIiwidXNlciIsIl9lbWFpbF92ZXJpZnlfdG9rZW4iLCJlbWFpbFZlcmlmaWVkIiwiY29uZmlnIiwiZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24iLCJfZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQiLCJQYXJzZSIsIl9lbmNvZGUiLCJnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQiLCJ2ZXJpZnlFbWFpbCIsInVzZXJuYW1lIiwidG9rZW4iLCJ1bmRlZmluZWQiLCJxdWVyeSIsInVwZGF0ZUZpZWxkcyIsIl9fb3AiLCIkZ3QiLCJEYXRlIiwibWFzdGVyQXV0aCIsIm1hc3RlciIsImNoZWNrSWZBbHJlYWR5VmVyaWZpZWQiLCJleGVjdXRlIiwidGhlbiIsInJlc3VsdCIsInJlc3VsdHMiLCJsZW5ndGgiLCJQcm9taXNlIiwicmVzb2x2ZSIsInJlc3QiLCJ1cGRhdGUiLCJjaGVja1Jlc2V0VG9rZW5WYWxpZGl0eSIsImRhdGFiYXNlIiwiZmluZCIsIl9wZXJpc2hhYmxlX3Rva2VuIiwibGltaXQiLCJwYXNzd29yZFBvbGljeSIsInJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZXhwaXJlc0RhdGUiLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiX190eXBlIiwiaXNvIiwiZ2V0VXNlcklmTmVlZGVkIiwiZW1haWwiLCJ3aGVyZSIsInNlbmRWZXJpZmljYXRpb25FbWFpbCIsImVuY29kZVVSSUNvbXBvbmVudCIsImxpbmsiLCJidWlsZEVtYWlsTGluayIsInZlcmlmeUVtYWlsVVJMIiwiYXBwTmFtZSIsInNlbmRNYWlsIiwiZGVmYXVsdFZlcmlmaWNhdGlvbkVtYWlsIiwicmVnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW4iLCJyZXNlbmRWZXJpZmljYXRpb25FbWFpbCIsImFVc2VyIiwic2V0UGFzc3dvcmRSZXNldFRva2VuIiwiZ2VuZXJhdGVQYXNzd29yZFJlc2V0VG9rZW5FeHBpcmVzQXQiLCIkb3IiLCIkZXhpc3RzIiwic2VuZFBhc3N3b3JkUmVzZXRFbWFpbCIsInJlcXVlc3RSZXNldFBhc3N3b3JkVVJMIiwiZGVmYXVsdFJlc2V0UGFzc3dvcmRFbWFpbCIsInVwZGF0ZVBhc3N3b3JkIiwicGFzc3dvcmQiLCJ1cGRhdGVVc2VyUGFzc3dvcmQiLCJvYmplY3RJZCIsImNhdGNoIiwiZXJyb3IiLCJtZXNzYWdlIiwicmVqZWN0IiwidGV4dCIsImdldCIsInRvIiwic3ViamVjdCIsInVzZXJJZCIsImRlc3RpbmF0aW9uIiwidXNlcm5hbWVBbmRUb2tlbiIsInBhcnNlRnJhbWVVUkwiLCJkZXN0aW5hdGlvbldpdGhvdXRIb3N0IiwicmVwbGFjZSIsInB1YmxpY1NlcnZlclVSTCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7O0FBRUEsSUFBSUEsU0FBUyxHQUFHQyxPQUFPLENBQUMsY0FBRCxDQUF2Qjs7QUFDQSxJQUFJQyxJQUFJLEdBQUdELE9BQU8sQ0FBQyxTQUFELENBQWxCOztBQUVPLE1BQU1FLGNBQU4sU0FBNkJDLDRCQUE3QixDQUFpRDtBQUN0REMsRUFBQUEsV0FBVyxDQUFDQyxPQUFELEVBQVVDLEtBQVYsRUFBaUJDLE9BQU8sR0FBRyxFQUEzQixFQUErQjtBQUN4QyxVQUFNRixPQUFOLEVBQWVDLEtBQWYsRUFBc0JDLE9BQXRCO0FBQ0Q7O0FBRURDLEVB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SUFBQUEsUUFBUSxFQUFFUztBQUFaLEdBSkssRUFLTDtBQUNFWCxJQUFBQSxRQUFRLEVBQUVBO0FBRFosR0FMSyxDQUFQO0FBU0Q7O0FBRUQsU0FBU2hCLGNBQVQsQ0FBd0I0QixXQUF4QixFQUFxQ2pFLFFBQXJDLEVBQStDQyxLQUEvQyxFQUFzRFIsTUFBdEQsRUFBOEQ7QUFDNUQsUUFBTXlFLGdCQUFnQixHQUFJLFNBQVFqRSxLQUFNLGFBQVlELFFBQVMsRUFBN0Q7O0FBRUEsTUFBSVAsTUFBTSxDQUFDMEUsYUFBWCxFQUEwQjtBQUN4QixVQUFNQyxzQkFBc0IsR0FBR0gsV0FBVyxDQUFDSSxPQUFaLENBQzdCNUUsTUFBTSxDQUFDNkUsZUFEc0IsRUFFN0IsRUFGNkIsQ0FBL0I7QUFLQSxXQUFRLEdBQUU3RSxNQUFNLENBQUMwRSxhQUFjLFNBQVFoQyxrQkFBa0IsQ0FDdkRpQyxzQkFEdUQsQ0FFdkQsSUFBR0YsZ0JBQWlCLEVBRnRCO0FBR0QsR0FURCxNQVNPO0FBQ0wsV0FBUSxHQUFFRCxXQUFZLElBQUdDLGdCQUFpQixFQUExQztBQUNEO0FBQ0Y7O2VBRWN4RixjIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgcmFuZG9tU3RyaW5nIH0gZnJvbSAnLi4vY3J5cHRvVXRpbHMnO1xuaW1wb3J0IHsgaW5mbGF0ZSB9IGZyb20gJy4uL3RyaWdnZXJzJztcbmltcG9ydCBBZGFwdGFibGVDb250cm9sbGVyIGZyb20gJy4vQWRhcHRhYmxlQ29udHJvbGxlcic7XG5pbXBvcnQgTWFpbEFkYXB0ZXIgZnJvbSAnLi4vQWRhcHRlcnMvRW1haWwvTWFpbEFkYXB0ZXInO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vcmVzdCc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5cbnZhciBSZXN0UXVlcnkgPSByZXF1aXJlKCcuLi9SZXN0UXVlcnknKTtcbnZhciBBdXRoID0gcmVxdWlyZSgnLi4vQXV0aCcpO1xuXG5leHBvcnQgY2xhc3MgVXNlckNvbnRyb2xsZXIgZXh0ZW5kcyBBZGFwdGFibGVDb250cm9sbGVyIHtcbiAgY29uc3RydWN0b3IoYWRhcHRlciwgYXBwSWQsIG9wdGlvbnMgPSB7fSkge1xuICAgIHN1cGVyKGFkYXB0ZXIsIGFwcElkLCBvcHRpb25zKTtcbiAgfVxuXG4gIHZhbGlkYXRlQWRhcHRlcihhZGFwdGVyKSB7XG4gICAgLy8gQWxsb3cgbm8gYWRhcHRlclxuICAgIGlmICghYWRhcHRlciAmJiAhdGhpcy5zaG91bGRWZXJpZnlFbWFpbHMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgc3VwZXIudmFsaWRhdGVBZGFwdGVyKGFkYXB0ZXIpO1xuICB9XG5cbiAgZXhwZWN0ZWRBZGFwdGVyVHlwZSgpIHtcbiAgICByZXR1cm4gTWFpbEFkYXB0ZXI7XG4gIH1cblxuICBnZXQgc2hvdWxkVmVyaWZ5RW1haWxzKCkge1xuICAgIHJldHVybiB0aGlzLm9wdGlvbnMudmVyaWZ5VXNlckVtYWlscztcbiAgfVxuXG4gIHNldEVtYWlsVmVyaWZ5VG9rZW4odXNlcikge1xuICAgIGlmICh0aGlzLnNob3VsZFZlcmlmeUVtYWlscykge1xuICAgICAgdXNlci5fZW1haWxfdmVyaWZ5X3Rva2VuID0gcmFuZG9tU3RyaW5nKDI1KTtcbiAgICAgIHVzZXIuZW1haWxWZXJpZmllZCA9IGZhbHNlO1xuXG4gICAgICBpZiAodGhpcy5jb25maWcuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgICAgdXNlci5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSBQYXJzZS5fZW5jb2RlKFxuICAgICAgICAgIHRoaXMuY29uZmlnLmdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdCgpXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdmVyaWZ5RW1haWwodXNlcm5hbWUsIHRva2VuKSB7XG4gICAgaWYgKCF0aGlzLnNob3VsZFZlcmlmeUVtYWlscykge1xuICAgICAgLy8gVHJ5aW5nIHRvIHZlcmlmeSBlbWFpbCB3aGVuIG5vdCBlbmFibGVkXG4gICAgICAvLyBUT0RPOiBCZXR0ZXIgZXJyb3IgaGVyZS5cbiAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjb25zdCBxdWVyeSA9IHsgdXNlcm5hbWU6IHVzZXJuYW1lLCBfZW1haWxfdmVyaWZ5X3Rva2VuOiB0b2tlbiB9O1xuICAgIGNvbnN0IHVwZGF0ZUZpZWxkcyA9IHtcbiAgICAgIGVtYWlsVmVyaWZpZWQ6IHRydWUsXG4gICAgICBfZW1haWxfdmVyaWZ5X3Rva2VuOiB7IF9fb3A6ICdEZWxldGUnIH0sXG4gICAgfTtcblxuICAgIC8vIGlmIHRoZSBlbWFpbCB2ZXJpZnkgdG9rZW4gbmVlZHMgdG8gYmUgdmFsaWRhdGVkIHRoZW5cbiAgICAvLyBhZGQgYWRkaXRpb25hbCBxdWVyeSBwYXJhbXMgYW5kIGFkZGl0aW9uYWwgZmllbGRzIHRoYXQgbmVlZCB0byBiZSB1cGRhdGVkXG4gICAgaWYgKHRoaXMuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICBxdWVyeS5lbWFpbFZlcmlmaWVkID0gZmFsc2U7XG4gICAgICBxdWVyeS5fZW1haWxfdmVyaWZ5X3Rva2VuX2V4cGlyZXNfYXQgPSB7ICRndDogUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKSB9O1xuXG4gICAgICB1cGRhdGVGaWVsZHMuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0geyBfX29wOiAnRGVsZXRlJyB9O1xuICAgIH1cbiAgICBjb25zdCBtYXN0ZXJBdXRoID0gQXV0aC5tYXN0ZXIodGhpcy5jb25maWcpO1xuICAgIHZhciBjaGVja0lmQWxyZWFkeVZlcmlmaWVkID0gbmV3IFJlc3RRdWVyeShcbiAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgQXV0aC5tYXN0ZXIodGhpcy5jb25maWcpLFxuICAgICAgJ19Vc2VyJyxcbiAgICAgIHsgdXNlcm5hbWU6IHVzZXJuYW1lLCBlbWFpbFZlcmlmaWVkOiB0cnVlIH1cbiAgICApO1xuICAgIHJldHVybiBjaGVja0lmQWxyZWFkeVZlcmlmaWVkLmV4ZWN1dGUoKS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICBpZiAocmVzdWx0LnJlc3VsdHMubGVuZ3RoKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzdWx0LnJlc3VsdHMubGVuZ3RoWzBdKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN0LnVwZGF0ZSh0aGlzLmNvbmZpZywgbWFzdGVyQXV0aCwgJ19Vc2VyJywgcXVlcnksIHVwZGF0ZUZpZWxkcyk7XG4gICAgfSk7XG4gIH1cblxuICBjaGVja1Jlc2V0VG9rZW5WYWxpZGl0eSh1c2VybmFtZSwgdG9rZW4pIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5maW5kKFxuICAgICAgICAnX1VzZXInLFxuICAgICAgICB7XG4gICAgICAgICAgdXNlcm5hbWU6IHVzZXJuYW1lLFxuICAgICAgICAgIF9wZXJpc2hhYmxlX3Rva2VuOiB0b2tlbixcbiAgICAgICAgfSxcbiAgICAgICAgeyBsaW1pdDogMSB9XG4gICAgICApXG4gICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgICB0aHJvdyAnRmFpbGVkIHRvIHJlc2V0IHBhc3N3b3JkOiB1c2VybmFtZSAvIGVtYWlsIC8gdG9rZW4gaXMgaW52YWxpZCc7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kgJiZcbiAgICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvblxuICAgICAgICApIHtcbiAgICAgICAgICBsZXQgZXhwaXJlc0RhdGUgPSByZXN1bHRzWzBdLl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQ7XG4gICAgICAgICAgaWYgKGV4cGlyZXNEYXRlICYmIGV4cGlyZXNEYXRlLl9fdHlwZSA9PSAnRGF0ZScpIHtcbiAgICAgICAgICAgIGV4cGlyZXNEYXRlID0gbmV3IERhdGUoZXhwaXJlc0RhdGUuaXNvKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGV4cGlyZXNEYXRlIDwgbmV3IERhdGUoKSlcbiAgICAgICAgICAgIHRocm93ICdUaGUgcGFzc3dvcmQgcmVzZXQgbGluayBoYXMgZXhwaXJlZCc7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0c1swXTtcbiAgICAgIH0pO1xuICB9XG5cbiAgZ2V0VXNlcklmTmVlZGVkKHVzZXIpIHtcbiAgICBpZiAodXNlci51c2VybmFtZSAmJiB1c2VyLmVtYWlsKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVzZXIpO1xuICAgIH1cbiAgICB2YXIgd2hlcmUgPSB7fTtcbiAgICBpZiAodXNlci51c2VybmFtZSkge1xuICAgICAgd2hlcmUudXNlcm5hbWUgPSB1c2VyLnVzZXJuYW1lO1xuICAgIH1cbiAgICBpZiAodXNlci5lbWFpbCkge1xuICAgICAgd2hlcmUuZW1haWwgPSB1c2VyLmVtYWlsO1xuICAgIH1cblxuICAgIHZhciBxdWVyeSA9IG5ldyBSZXN0UXVlcnkoXG4gICAgICB0aGlzLmNvbmZpZyxcbiAgICAgIEF1dGgubWFzdGVyKHRoaXMuY29uZmlnKSxcbiAgICAgICdfVXNlcicsXG4gICAgICB3aGVyZVxuICAgICk7XG4gICAgcmV0dXJuIHF1ZXJ5LmV4ZWN1dGUoKS50aGVuKGZ1bmN0aW9uKHJlc3VsdCkge1xuICAgICAgaWYgKHJlc3VsdC5yZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQucmVzdWx0c1swXTtcbiAgICB9KTtcbiAgfVxuXG4gIHNlbmRWZXJpZmljYXRpb25FbWFpbCh1c2VyKSB7XG4gICAgaWYgKCF0aGlzLnNob3VsZFZlcmlmeUVtYWlscykge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCB0b2tlbiA9IGVuY29kZVVSSUNvbXBvbmVudCh1c2VyLl9lbWFpbF92ZXJpZnlfdG9rZW4pO1xuICAgIC8vIFdlIG1heSBuZWVkIHRvIGZldGNoIHRoZSB1c2VyIGluIGNhc2Ugb2YgdXBkYXRlIGVtYWlsXG4gICAgdGhpcy5nZXRVc2VySWZOZWVkZWQodXNlcikudGhlbih1c2VyID0+IHtcbiAgICAgIGNvbnN0IHVzZXJuYW1lID0gZW5jb2RlVVJJQ29tcG9uZW50KHVzZXIudXNlcm5hbWUpO1xuXG4gICAgICBjb25zdCBsaW5rID0gYnVpbGRFbWFpbExpbmsoXG4gICAgICAgIHRoaXMuY29uZmlnLnZlcmlmeUVtYWlsVVJMLFxuICAgICAgICB1c2VybmFtZSxcbiAgICAgICAgdG9rZW4sXG4gICAgICAgIHRoaXMuY29uZmlnXG4gICAgICApO1xuICAgICAgY29uc3Qgb3B0aW9ucyA9IHtcbiAgICAgICAgYXBwTmFtZTogdGhpcy5jb25maWcuYXBwTmFtZSxcbiAgICAgICAgbGluazogbGluayxcbiAgICAgICAgdXNlcjogaW5mbGF0ZSgnX1VzZXInLCB1c2VyKSxcbiAgICAgIH07XG4gICAgICBpZiAodGhpcy5hZGFwdGVyLnNlbmRWZXJpZmljYXRpb25FbWFpbCkge1xuICAgICAgICB0aGlzLmFkYXB0ZXIuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKG9wdGlvbnMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5hZGFwdGVyLnNlbmRNYWlsKHRoaXMuZGVmYXVsdFZlcmlmaWNhdGlvbkVtYWlsKG9wdGlvbnMpKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZWdlbmVyYXRlcyB0aGUgZ2l2ZW4gdXNlcidzIGVtYWlsIHZlcmlmaWNhdGlvbiB0b2tlblxuICAgKlxuICAgKiBAcGFyYW0gdXNlclxuICAgKiBAcmV0dXJucyB7Kn1cbiAgICovXG4gIHJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuKHVzZXIpIHtcbiAgICB0aGlzLnNldEVtYWlsVmVyaWZ5VG9rZW4odXNlcik7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICdfVXNlcicsXG4gICAgICB7IHVzZXJuYW1lOiB1c2VyLnVzZXJuYW1lIH0sXG4gICAgICB1c2VyXG4gICAgKTtcbiAgfVxuXG4gIHJlc2VuZFZlcmlmaWNhdGlvbkVtYWlsKHVzZXJuYW1lKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0VXNlcklmTmVlZGVkKHsgdXNlcm5hbWU6IHVzZXJuYW1lIH0pLnRoZW4oYVVzZXIgPT4ge1xuICAgICAgaWYgKCFhVXNlciB8fCBhVXNlci5lbWFpbFZlcmlmaWVkKSB7XG4gICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGlzLnJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuKGFVc2VyKS50aGVuKCgpID0+IHtcbiAgICAgICAgdGhpcy5zZW5kVmVyaWZpY2F0aW9uRW1haWwoYVVzZXIpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBzZXRQYXNzd29yZFJlc2V0VG9rZW4oZW1haWwpIHtcbiAgICBjb25zdCB0b2tlbiA9IHsgX3BlcmlzaGFibGVfdG9rZW46IHJhbmRvbVN0cmluZygyNSkgfTtcblxuICAgIGlmIChcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvblxuICAgICkge1xuICAgICAgdG9rZW4uX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdCA9IFBhcnNlLl9lbmNvZGUoXG4gICAgICAgIHRoaXMuY29uZmlnLmdlbmVyYXRlUGFzc3dvcmRSZXNldFRva2VuRXhwaXJlc0F0KClcbiAgICAgICk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICdfVXNlcicsXG4gICAgICB7ICRvcjogW3sgZW1haWwgfSwgeyB1c2VybmFtZTogZW1haWwsIGVtYWlsOiB7ICRleGlzdHM6IGZhbHNlIH0gfV0gfSxcbiAgICAgIHRva2VuLFxuICAgICAge30sXG4gICAgICB0cnVlXG4gICAgKTtcbiAgfVxuXG4gIHNlbmRQYXNzd29yZFJlc2V0RW1haWwoZW1haWwpIHtcbiAgICBpZiAoIXRoaXMuYWRhcHRlcikge1xuICAgICAgdGhyb3cgJ1RyeWluZyB0byBzZW5kIGEgcmVzZXQgcGFzc3dvcmQgYnV0IG5vIGFkYXB0ZXIgaXMgc2V0JztcbiAgICAgIC8vICBUT0RPOiBObyBhZGFwdGVyP1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnNldFBhc3N3b3JkUmVzZXRUb2tlbihlbWFpbCkudGhlbih1c2VyID0+IHtcbiAgICAgIGNvbnN0IHRva2VuID0gZW5jb2RlVVJJQ29tcG9uZW50KHVzZXIuX3BlcmlzaGFibGVfdG9rZW4pO1xuICAgICAgY29uc3QgdXNlcm5hbWUgPSBlbmNvZGVVUklDb21wb25lbnQodXNlci51c2VybmFtZSk7XG5cbiAgICAgIGNvbnN0IGxpbmsgPSBidWlsZEVtYWlsTGluayhcbiAgICAgICAgdGhpcy5jb25maWcucmVxdWVzdFJlc2V0UGFzc3dvcmRVUkwsXG4gICAgICAgIHVzZXJuYW1lLFxuICAgICAgICB0b2tlbixcbiAgICAgICAgdGhpcy5jb25maWdcbiAgICAgICk7XG4gICAgICBjb25zdCBvcHRpb25zID0ge1xuICAgICAgICBhcHBOYW1lOiB0aGlzLmNvbmZpZy5hcHBOYW1lLFxuICAgICAgICBsaW5rOiBsaW5rLFxuICAgICAgICB1c2VyOiBpbmZsYXRlKCdfVXNlcicsIHVzZXIpLFxuICAgICAgfTtcblxuICAgICAgaWYgKHRoaXMuYWRhcHRlci5zZW5kUGFzc3dvcmRSZXNldEVtYWlsKSB7XG4gICAgICAgIHRoaXMuYWRhcHRlci5zZW5kUGFzc3dvcmRSZXNldEVtYWlsKG9wdGlvbnMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5hZGFwdGVyLnNlbmRNYWlsKHRoaXMuZGVmYXVsdFJlc2V0UGFzc3dvcmRFbWFpbChvcHRpb25zKSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodXNlcik7XG4gICAgfSk7XG4gIH1cblxuICB1cGRhdGVQYXNzd29yZCh1c2VybmFtZSwgdG9rZW4sIHBhc3N3b3JkKSB7XG4gICAgcmV0dXJuIHRoaXMuY2hlY2tSZXNldFRva2VuVmFsaWRpdHkodXNlcm5hbWUsIHRva2VuKVxuICAgICAgLnRoZW4odXNlciA9PiB1cGRhdGVVc2VyUGFzc3dvcmQodXNlci5vYmplY3RJZCwgcGFzc3dvcmQsIHRoaXMuY29uZmlnKSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci5tZXNzYWdlKSB7XG4gICAgICAgICAgLy8gaW4gY2FzZSBvZiBQYXJzZS5FcnJvciwgZmFpbCB3aXRoIHRoZSBlcnJvciBtZXNzYWdlIG9ubHlcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyb3IubWVzc2FnZSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGVycm9yKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICBkZWZhdWx0VmVyaWZpY2F0aW9uRW1haWwoeyBsaW5rLCB1c2VyLCBhcHBOYW1lIH0pIHtcbiAgICBjb25zdCB0ZXh0ID1cbiAgICAgICdIaSxcXG5cXG4nICtcbiAgICAgICdZb3UgYXJlIGJlaW5nIGFza2VkIHRvIGNvbmZpcm0gdGhlIGUtbWFpbCBhZGRyZXNzICcgK1xuICAgICAgdXNlci5nZXQoJ2VtYWlsJykgK1xuICAgICAgJyB3aXRoICcgK1xuICAgICAgYXBwTmFtZSArXG4gICAgICAnXFxuXFxuJyArXG4gICAgICAnJyArXG4gICAgICAnQ2xpY2sgaGVyZSB0byBjb25maXJtIGl0OlxcbicgK1xuICAgICAgbGluaztcbiAgICBjb25zdCB0byA9IHVzZXIuZ2V0KCdlbWFpbCcpO1xuICAgIGNvbnN0IHN1YmplY3QgPSAnUGxlYXNlIHZlcmlmeSB5b3VyIGUtbWFpbCBmb3IgJyArIGFwcE5hbWU7XG4gICAgcmV0dXJuIHsgdGV4dCwgdG8sIHN1YmplY3QgfTtcbiAgfVxuXG4gIGRlZmF1bHRSZXNldFBhc3N3b3JkRW1haWwoeyBsaW5rLCB1c2VyLCBhcHBOYW1lIH0pIHtcbiAgICBjb25zdCB0ZXh0ID1cbiAgICAgICdIaSxcXG5cXG4nICtcbiAgICAgICdZb3UgcmVxdWVzdGVkIHRvIHJlc2V0IHlvdXIgcGFzc3dvcmQgZm9yICcgK1xuICAgICAgYXBwTmFtZSArXG4gICAgICAodXNlci5nZXQoJ3VzZXJuYW1lJylcbiAgICAgICAgPyBcIiAoeW91ciB1c2VybmFtZSBpcyAnXCIgKyB1c2VyLmdldCgndXNlcm5hbWUnKSArIFwiJylcIlxuICAgICAgICA6ICcnKSArXG4gICAgICAnLlxcblxcbicgK1xuICAgICAgJycgK1xuICAgICAgJ0NsaWNrIGhlcmUgdG8gcmVzZXQgaXQ6XFxuJyArXG4gICAgICBsaW5rO1xuICAgIGNvbnN0IHRvID0gdXNlci5nZXQoJ2VtYWlsJykgfHwgdXNlci5nZXQoJ3VzZXJuYW1lJyk7XG4gICAgY29uc3Qgc3ViamVjdCA9ICdQYXNzd29yZCBSZXNldCBmb3IgJyArIGFwcE5hbWU7XG4gICAgcmV0dXJuIHsgdGV4dCwgdG8sIHN1YmplY3QgfTtcbiAgfVxufVxuXG4vLyBNYXJrIHRoaXMgcHJpdmF0ZVxuZnVuY3Rpb24gdXBkYXRlVXNlclBhc3N3b3JkKHVzZXJJZCwgcGFzc3dvcmQsIGNvbmZpZykge1xuICByZXR1cm4gcmVzdC51cGRhdGUoXG4gICAgY29uZmlnLFxuICAgIEF1dGgubWFzdGVyKGNvbmZpZyksXG4gICAgJ19Vc2VyJyxcbiAgICB7IG9iamVjdElkOiB1c2VySWQgfSxcbiAgICB7XG4gICAgICBwYXNzd29yZDogcGFzc3dvcmQsXG4gICAgfVxuICApO1xufVxuXG5mdW5jdGlvbiBidWlsZEVtYWlsTGluayhkZXN0aW5hdGlvbiwgdXNlcm5hbWUsIHRva2VuLCBjb25maWcpIHtcbiAgY29uc3QgdXNlcm5hbWVBbmRUb2tlbiA9IGB0b2tlbj0ke3Rva2VufSZ1c2VybmFtZT0ke3VzZXJuYW1lfWA7XG5cbiAgaWYgKGNvbmZpZy5wYXJzZUZyYW1lVVJMKSB7XG4gICAgY29uc3QgZGVzdGluYXRpb25XaXRob3V0SG9zdCA9IGRlc3RpbmF0aW9uLnJlcGxhY2UoXG4gICAgICBjb25maWcucHVibGljU2VydmVyVVJMLFxuICAgICAgJydcbiAgICApO1xuXG4gICAgcmV0dXJuIGAke2NvbmZpZy5wYXJzZUZyYW1lVVJMfT9saW5rPSR7ZW5jb2RlVVJJQ29tcG9uZW50KFxuICAgICAgZGVzdGluYXRpb25XaXRob3V0SG9zdFxuICAgICl9JiR7dXNlcm5hbWVBbmRUb2tlbn1gO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBgJHtkZXN0aW5hdGlvbn0/JHt1c2VybmFtZUFuZFRva2VufWA7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgVXNlckNvbnRyb2xsZXI7XG4iXX0=
