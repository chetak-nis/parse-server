'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});
exports.default = exports.UserController = void 0;

var _cryptoUtils = require('../cryptoUtils');

var _triggers = require('../triggers');

var _AdaptableController = _interopRequireDefault(require('./AdaptableController'));

var _MailAdapter = _interopRequireDefault(require('../Adapters/Email/MailAdapter'));

var _rest = _interopRequireDefault(require('../rest'));

var _node = _interopRequireDefault(require('parse/node'));

function _interopRequireDefault(obj) {
  return obj && obj.__esModule ? obj : {
    default: obj
  };
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
        user._email_verify_token_expires_at = _node.default._encode(this.config.generateEmailVerifyTokenExpiresAt());
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
      _email_verify_token: token
    };
    const updateFields = {
      emailVerified: true,
      _email_verify_token: {
        __op: 'Delete'
      }
    }; // if the email verify token needs to be validated then
    // add additional query params and additional fields that need to be updated

    if (this.config.emailVerifyTokenValidityDuration) {
      query.emailVerified = false;
      query._email_verify_token_expires_at = {
        $gt: _node.default._encode(new Date())
      };
      updateFields._email_verify_token_expires_at = {
        __op: 'Delete'
      };
    }

    const masterAuth = Auth.master(this.config);
    var checkIfAlreadyVerified = new RestQuery(this.config, Auth.master(this.config), 'AdminUser', {
      username: username,
      emailVerified: true
    });
    return checkIfAlreadyVerified.execute().then(result => {
      if (result.results.length) {
        return Promise.resolve(result.results.length[0]);
      }

      return _rest.default.update(this.config, masterAuth, 'AdminUser', query, updateFields);
    });
  }

  checkResetTokenValidity(username, token) {
    return this.config.database.find('AdminUser', {
      username: username,
      _perishable_token: token
    }, {
      limit: 1
    }).then(results => {
      if (results.length != 1) {
        throw 'Failed to reset password: username / email / token is invalid';
      }

      if (this.config.passwordPolicy && this.config.passwordPolicy.resetTokenValidityDuration) {
        let expiresDate = results[0]._perishable_token_expires_at;

        if (expiresDate && expiresDate.__type == 'Date') {
          expiresDate = new Date(expiresDate.iso);
        }

        if (expiresDate < new Date()) throw 'The password reset link has expired';
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

    var query = new RestQuery(this.config, Auth.master(this.config), 'AdminUser', where);
    return query.execute().then(function (result) {
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
      const link = buildEmailLink(this.config.verifyEmailURL, username, token, this.config);
      const options = {
        appName: this.config.appName,
        link: link,
        user: (0, _triggers.inflate)('AdminUser', user)
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
    return this.config.database.update('AdminUser', {
      username: user.username
    }, user);
  }

  resendVerificationEmail(username) {
    return this.getUserIfNeeded({
      username: username
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
      _perishable_token: (0, _cryptoUtils.randomString)(25)
    };

    if (this.config.passwordPolicy && this.config.passwordPolicy.resetTokenValidityDuration) {
      token._perishable_token_expires_at = _node.default._encode(this.config.generatePasswordResetTokenExpiresAt());
    }

    return this.config.database.update('AdminUser', {
      $or: [{
        email
      }, {
        username: email,
        email: {
          $exists: false
        }
      }]
    }, token, {}, true);
  }

  sendPasswordResetEmail(email) {
    if (!this.adapter) {
      throw 'Trying to send a reset password but no adapter is set'; //  TODO: No adapter?
    }

    return this.setPasswordResetToken(email).then(user => {
      const token = encodeURIComponent(user._perishable_token);
      const username = encodeURIComponent(user.username);
      const link = buildEmailLink(this.config.requestResetPasswordURL, username, token, this.config);
      const options = {
        appName: this.config.appName,
        link: link,
        user: (0, _triggers.inflate)('AdminUser', user)
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
    return this.checkResetTokenValidity(username, token).then(user => updateUserPassword(user.objectId, password, this.config)).catch(error => {
      if (error && error.message) {
        // in case of Parse.Error, fail with the error message only
        return Promise.reject(error.message);
      } else {
        return Promise.reject(error);
      }
    });
  }

  defaultVerificationEmail({
    link,
    user,
    appName
  }) {
    const text = 'Hi,\n\n' + 'You are being asked to confirm the e-mail address ' + user.get('email') + ' with ' + appName + '\n\n' + '' + 'Click here to confirm it:\n' + link;
    const to = user.get('email');
    const subject = 'Please verify your e-mail for ' + appName;
    return {
      text,
      to,
      subject
    };
  }

  defaultResetPasswordEmail({
    link,
    user,
    appName
  }) {
    const text = 'Hi,\n\n' + 'You requested to reset your password for ' + appName + (user.get('username') ? " (your username is '" + user.get('username') + "')" : '') + '.\n\n' + '' + 'Click here to reset it:\n' + link;
    const to = user.get('email') || user.get('username');
    const subject = 'Password Reset for ' + appName;
    return {
      text,
      to,
      subject
    };
  }

} // Mark this private


exports.UserController = UserController;

function updateUserPassword(userId, password, config) {
  return _rest.default.update(config, Auth.master(config), 'AdminUser', {
    objectId: userId
  }, {
    password: password
  });
}

function buildEmailLink(destination, username, token, config) {
  const usernameAndToken = `token=${token}&username=${username}`;

  if (config.parseFrameURL) {
    const destinationWithoutHost = destination.replace(config.publicServerURL, '');
    return `${config.parseFrameURL}?link=${encodeURIComponent(destinationWithoutHost)}&${usernameAndToken}`;
  } else {
    return `${destination}?${usernameAndToken}`;
  }
}

var _default = UserController;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9Vc2VyQ29udHJvbGxlci5qcyJdLCJuYW1lcyI6WyJSZXN0UXVlcnkiLCJhZGFwdGVyIiwiYXBwSWQiLCJzaG91bGRWZXJpZnlFbWFpbHMiLCJ2YWxpZGF0ZUFkYXB0ZXIiLCJleHBlY3RlZEFkYXB0ZXJUeXBlIiwic2V0RW1haWxWZXJpZnlUb2tlbiIsInVzZXIiLCJlbWFpbFZlcmlmaWVkIiwiX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0IiwidmVyaWZ5RW1haWwiLCJ1c2VybmFtZSIsIl9lbWFpbF92ZXJpZnlfdG9rZW4iLCJ0b2tlbiIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwicXVlcnkiLCIkZ3QiLCJQYXJzZSIsInVwZGF0ZUZpZWxkcyIsIl9fb3AiLCJtYXN0ZXJBdXRoIiwiY2hlY2tJZkFscmVhZHlWZXJpZmllZCIsImNoZWNrUmVzZXRUb2tlblZhbGlkaXR5IiwibGltaXQiLCJyZXN1bHRzIiwiZ2V0VXNlcklmTmVlZGVkIiwid2hlcmUiLCJjb25maWciLCJyZXN1bHQiLCJsZW5ndGgiLCJzZW5kVmVyaWZpY2F0aW9uRW1haWwiLCJlbmNvZGVVUklDb21wb25lbnQiLCJsaW5rIiwiYXBwTmFtZSIsInJlZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuIiwiYVVzZXIiLCJ1bmRlZmluZWQiLCJzZXRQYXNzd29yZFJlc2V0VG9rZW4iLCJlbWFpbCIsIl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQiLCIkb3IiLCJzZW5kUGFzc3dvcmRSZXNldEVtYWlsIiwib3B0aW9ucyIsIlByb21pc2UiLCJyZXNvbHZlIiwiZXJyb3IiLCJkZWZhdWx0VmVyaWZpY2F0aW9uRW1haWwiLCJzdWJqZWN0IiwiZGVmYXVsdFJlc2V0UGFzc3dvcmRFbWFpbCIsInVwZGF0ZVVzZXJQYXNzd29yZCIsIm9iamVjdElkIiwidXNlcklkIiwiYnVpbGRFbWFpbExpbmsiLCJkZXN0aW5hdGlvbiIsInBhcnNlRnJhbWVVUkwiLCJ1c2VybmFtZUFuZFRva2VuIiwiVXNlckNvbnRyb2xsZXIiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQSxJQUFBLFlBQUEsR0FBQSxPQUFBLENBQUEsZ0JBQUEsQ0FBQTs7QUFDQSxJQUFBLFNBQUEsR0FBQSxPQUFBLENBQUEsYUFBQSxDQUFBOztBQUNBLElBQUEsb0JBQUEsR0FBQSxzQkFBQSxDLGdDQUFBLENBQUE7O0FBRUEsSUFBQSxZQUFBLEdBQUEsc0JBQUEsQyx3Q0FBQSxDQUFBOzs7O0FBR0EsSUFBSUEsS0FBQUEsR0FBQUEsc0JBQW9CLENBQXhCLE9BQUEsQ0FBQSxZQUFBLENBQXdCLENBQXhCOztBQUNBLFNBQUEsc0JBQUEsQ0FBQSxHQUFBLEVBQUE7Ozs7QUFFTzs7QUFFSCxJQUFBLFNBQU1DLEdBQU4sT0FBZUMsQ0FBZixjQUFlQSxDQUFmOzs7O0FBSUEsTUFBQSxjQUFBLFNBQUEsb0JBQUEsQ0FBQSxPQUFBLENBQUE7QUFDQSxFQUFBLFdBQUtELENBQUQsT0FBQ0EsRUFBWSxLQUFaQSxFQUFpQkUsT0FBQUEsR0FBQUEsRUFBakJGLEVBQUw7QUFDRSxVQUFBLE9BQUEsRUFBQSxLQUFBLEVBQUEsT0FBQTtBQUNEOztBQUNELEVBQUEsZUFBTUcsQ0FBTixPQUFNQSxFQUFOO0FBQ0Q7O0FBRURDO0FBQ0U7OztBQUdGOztBQUVDLEVBQUEsbUJBQUEsR0FBQTs7QUFFREM7O0FBRUlDLE1BQUFBLGtCQUFBQSxHQUFBQTtBQUNBQSxXQUFLQyxLQUFBQSxPQUFBQSxDQUFMRCxnQkFBQUE7OztBQUdFQSxFQUFBQSxtQkFBS0UsQ0FBQUEsSUFBQUEsRUFBTEY7QUFHRCxRQUFBLEtBQUEsa0JBQUEsRUFBQTtBQUNGLE1BQUEsSUFBQSxDQUFBLG1CQUFBLEdBQUEsQ0FBQSxHQUFBLFlBQUEsQ0FBQSxZQUFBLEVBQUEsRUFBQSxDQUFBO0FBQ0YsTUFBQSxJQUFBLENBQUEsYUFBQSxHQUFBLEtBQUE7O0FBRURHLFVBQUFBLEtBQVlDLE1BQVpELENBQVcsZ0NBQVhBLEVBQTZCO0FBQ3ZCLFFBQUEsSUFBQyxDQUFMLDhCQUFJLEdBQTBCLEtBQUEsQ0FBQSxPQUFBLENBQUEsT0FBQSxDQUM1QixLQUFBLE1BQUEsQ0FBQSxpQ0FBQSxFQUQ0QixDQUExQjtBQUdGO0FBQ0Q7OztBQUVlQyxFQUFBQSxXQUFBQSxDQUFRLFFBQVJBLEVBQUYsS0FBRUEsRUFBRjtBQUFzQkMsUUFBQUEsQ0FBQUEsS0FBQUEsa0JBQUFBLEVBQXFCQztBQUF6RDtBQUNBO0FBQ0VMLFlBRG1CLFNBQ25CQTtBQUNBSTs7QUFBcUIsVUFBQSxLQUFBLEdBQUE7QUFWSSxNQUFBLFFBYTNCLEVBQUEsUUFIdUI7QUFJdkIsTUFBQSxtQkFBQSxFQUFBO0FBSnVCLEtBQUE7QUFLdkIsVUFBSSxZQUFZRSxHQUFoQjtBQUNFQyxNQUFBQSxhQUFNUCxFQUFOTyxJQURGO0FBRUVBLE1BQUFBLG1CQUFNTixFQUFOTTtBQUF5Q0MsUUFBQUEsSUFBRyxFQUFFQztBQUE5Q0Y7QUFGRixLQUFBLENBUmMsQ0FZWkc7QUFBZ0RDOztBQUNqRCxRQUFBLEtBQUEsTUFBQSxDQUFBLGdDQUFBLEVBQUE7O0FBQ0QsTUFBQSxLQUFNQyxDQUFBQSw4QkFBTixHQUFBO0FBQ0lDLFFBQUFBLEdBQUFBLEVBQUFBLEtBQUFBLENBQUFBLE9BQUFBLENBQUFBLE9BQUFBLENBQXlCLElBQUEsSUFBQSxFQUF6QkE7QUFESixPQUFBO0FBS3dCYixNQUFBQSxZQUFBQSxDQUFhLDhCQUFiQSxHQUFlO0FBSnZDLFFBQUEsSUFBQSxFQUFBO0FBSXVDLE9BQWZBO0FBR3RCOztBQUVDLFVBQUEsVUFBQSxHQUFBLElBQUEsQ0FBQSxNQUFBLENBQUEsS0FBQSxNQUFBLENBQUE7K0NBQ0QsS0FBQSxNLEVBSkYsSUFBQSxDQUFBLE1BQUEsQ0FBQSxLQUFBLE1BQUEsQyxFQU1ELFc7QUFFRGMsTUFBQUEsUUFBQUEsRUFBQUEsUTtBQUNFLE1BQUEsYUFBTyxFQUFBOztBQUFBLFdBT0gsc0JBQUEsQ0FBQSxPQUFBLEdBQUEsSUFBQSxDQUFBLE1BQUEsSUFBQTtBQUFFQyxVQUFBQSxNQUFPLENBQUEsT0FBUEEsQ0FBTyxNQUFQQSxFQUFPO0FBUE4sZUFTQ0MsT0FBTyxDQUFJLE9BQVhBLENBQVcsTUFBQSxDQUFBLE9BQUEsQ0FBQSxNQUFBLENBQUEsQ0FBQSxDQUFYQSxDQVREO0FBVUg7O0FBRUMsYUFBQSxLQUFBLENBQUEsT0FBQSxDQUFBLE1BQUEsQyxXQUFBLEVBRUQsVUFGQyxFQU1DLFdBTkQsRSxLQUFBLEVBT0MsWUFQRCxDQUFBO0FBU0UsS0FkSCxDQVBHOzs7QUF3QkYsRUFBQSx1QkFBQSxDQUFBLFFBQUEsRUFBQSxLQUFBLEVBQUE7Z0NBRUQsSSxDQTFCSixXLEVBNEJEO3dCQUFBO0FBRURDLE1BQUFBLGlCQUFzQixFQUFBO0FBRnJCLEssRUFJRztBQUNELE1BQUEsS0FBQSxFQUFBO0FBREMsSztBQUdFbEIsVUFBSSxPQUFDSSxDQUFULE1BQVEsSUFBVyxDQUFmSixFQUFlO0FBQ2pCbUIsY0FBQUEsK0RBQUFBO0FBQ0Q7O0FBQ0QsVUFDRUEsS0FBQUEsTUFBQUEsQ0FBQUEsY0FBQUEsSUFDRCxLQUFBLE1BQUEsQ0FBQSxjQUFBLENBQUEsMEJBRkQsRTtBQUlJWCxZQUFLLFdBQU9mLEdBQUosT0FDTDJCLENBQUFBLENBQUFBLENBREssQ0FBWiw0QkFBSVo7O0FBT0VhLFlBQUFBLFdBQWVDLElBQW5CLFdBQWdDLENBQUEsTUFBaEMsSUFBZ0MsTUFBNUJELEVBQTRCO0FBQzlCLFVBQUEsV0FBQSxHQUFBLElBQUEsSUFBQSxDQUFBLFdBQUEsQ0FBQSxHQUFBLENBQUE7QUFDRDs7QUFDRCxZQUFPQSxXQUFBQSxHQUFQLElBQUEsSUFBQSxFQUFBLEVBSkYsTUFBQSxxQ0FBQTtBQU1EOztBQUVERSxhQUFBQSxPQUFBQSxDQUFxQixDQUFyQkEsQ0FBQUE7QUFDRSxLO0FBQ0U7OztBQUVGLFFBQUEsSUFBTWpCLENBQUFBLFFBQU4sSUFBY2tCLElBQUFBLENBQUFBLEtBQWQsRUFKMEI7O0FBTTFCOztBQUdFLFFBQUEsS0FBTUMsR0FBTixFQUFBOztBQU9FQyxRQUFBQSxJQUFBQSxDQUFBQSxRQUFBQSxFQURjO0FBRWRELE1BQUFBLEtBQUFBLENBRmMsUUFFZEEsR0FGYyxJQUFBLENBQUEsUUFFZEE7QUFDQXpCOzs7QUFFRixNQUFBLEtBQUksQ0FBQSxLQUFKLEdBQUksSUFBYXVCLENBQWpCLEtBQUE7QUFDRTs7QUFFQSxRQUFBLEtBQUs3QixHQUFBQSxJQUFMLFNBQUtBLENBQ04sS0FBQSxNQURNQSxFQWpCVCxJQUFBLENBQUEsTUFBQSxDQUFBLEtBQUEsTUFBQSxDQWlCU0EsRUFHVixXQUhVQSxFQUtYLEtBTFdBLENBQUw7Ozs7Ozs7QUFXTmlDLEs7QUFDRTs7QUFHSXZCLEVBQUFBLHFCQUFlQSxDQUFBQSxJQUFBQSxFQUFBQTtBQUZaLFFBR0xKLENBSEYsS0FBQSxrQkFBTyxFQUFQO0FBS0Q7OztBQUdDLFVBQUEsS0FBTyxHQUFBLGtCQUFxQixDQUFBLElBQUEsQ0FBQSxtQkFBQSxDQUE1QixDQU5tQkksQ0FNUzs7QUFBckIsU0FBQSxlQUFBLENBQTJELElBQTNELEVBQTJELElBQTNELENBQTJELElBQUEsSUFBQTtBQUNoRSxZQUFJLFFBQVV3QixHQUFkLGtCQUFtQyxDQUFBLElBQUEsQ0FBQSxRQUFBLENBQW5DO0FBQ0UsWUFBQSxJQUFNQyxHQUFOLGNBQUEsQ0FDRCxLQUFBLE1BQUEsQ0FBQSxjQURDLEUsUUFBQSxFQUVGLEtBRkUsRUFHQSxLQUFBLE1BSEEsQ0FBQTtBQUZKLFlBQUEsT0FBQSxHQUFBO0FBUUQsUUFBQSxPQUFBLEVBQUEsS0FBQSxNQUFBLENBQUEsT0FSQztrQkFBQTtBQVVGQyxRQUFBQSxJQUFBQSxFQUFBQSxDQUFBQSxHQUFBQSxTQUFzQkMsQ0FBRCxPQUFyQkQsRUFBNkIsV0FBN0JBLEVBQTZCLElBQTdCQTtBQVZFLE9BQUE7O0FBV0EsVUFBQSxLQUFBLE9BQUEsQ0FBQSxxQkFBQSxFQUFBOztBQUVBLE9BRkEsTUFFQTtBQUlFeEIsYUFBTTBCLE9BQU4xQixDQUFNMEIsUUFBTjFCLENBQU0wQixLQUFOMUIsd0JBQU0wQixDQUFOMUIsT0FBTTBCLENBQU4xQjtBQUdEO0tBcEJNO0FBc0JQO0FBRUkyQjs7Ozs7Ozs7QUFBSyxFQUFBLDBCQUFBLENBQUEsSUFBQSxFQUFBO0FBRkYsU0FBUCxtQkFBTyxDQUFQLElBQU87QUFPUixXQUFBLEtBQUEsTUFBQSxDQUFBLFFBQUEsQ0FBQSxNQUFBLEMsV0FBQSxFQUVEQztBQUNNLE1BQUEsUUFBTXhDLEVBQVYsSUFBQSxDQUFtQjtBQURyQndDLEtBRkMsRUFNRSxJQU5GLENBQUE7QUFRQzs7QUFFRSxFQUFBLHVCQUFpQlYsQ0FBQUEsUUFBQUEsRUFBakI7QUFFQSxXQUFBLEtBQVUsZUFBVixDQUFBO0FBTUEsTUFBQSxRQUFNVyxFQUFBQTtBQU5OLEtBQUEsRUFPRVQsSUFQRixDQU9FQSxLQUFTLElBREs7QUFFZEQsVUFBQUEsQ0FGYyxLQUVkQSxJQUZjLEtBQUEsQ0FBQSxhQUVkQSxFQUZjO0FBR2R6QixjQUFNLFNBQU5BO0FBSEY7O0FBTUEsYUFBSSxLQUFBLDBCQUFBLENBQUosS0FBSSxFQUFxQyxJQUFyQyxDQUFxQyxNQUFBO0FBQ3ZDLGFBQUEscUJBQUEsQ0FBQSxLQUFBO0FBREYsT0FBSSxDQUFKO0FBR0UsS0FmRixDQUFBO0FBZ0JDOztBQUVELEVBQUEscUJBQWVxQyxDQUFSRCxLQUFRQyxFQUFmO0FBdEJGLFVBQUEsS0FBQSxHQUFBO0FBd0JELE1BQUEsaUJBQUEsRUFBQSxDQUFBLEdBQUEsWUFBQSxDQUFBLFlBQUEsRUFBQSxFQUFBO0FBeEJDLEtBQUE7O0FBMkJBLFFBR0ksS0FBSUMsTUFBSixDQUFBLGNBQUEsSUFDRSxLQUFBLE1BQUEsQ0FBQSxjQUFBLENBQUEsMEJBSk4sRUFLTTtBQUZGLE1BQUEsS0FBQSxDQUFBLDRCQUFBLEdBR08sS0FBQSxDQUFBLE9BQUEsQ0FBQSxPQUFBLENBQ0wsS0FBQSxNQUFBLENBQUEsbUNBQUEsRUFESyxDQUhQO0FBSEo7O3VDQVlGQyxXLEVBQXlCO0FBQUEsTUFBQSxHQUFBLEVBQUEsQ0FBY2I7QUFBVyxRQUFBO0FBQVhBLE9BQWQsRUFXdkI7QUFDTWMsUUFBQUEsUUFBVSxFQUFoQixLQURBO0FBRU8sUUFBQSxLQUFBLEVBQUE7QUFBQSxVQUFBLE9BQUEsRUFBQTtBQUFBO0FBRlAsT0FYdUI7QUFBQSxLLFNBZ0J6QkMsRSxFQUEwQixJO0FBQWNmOztBQUN0QyxFQUFBLHNCQUNFLENBQUEsS0FBQSxFQURGO0FBV0EsUUFBQSxDQUFBLEtBQVEsT0FBUixFQUFBO0FBQ0EsWUFBQSx1REFBQSxDQURBLENBQ0E7QUFDQTs7QUFBTyxXQUFBLEtBQUEscUJBQUEsQ0FBQSxLQUFBLEVBQUEsSUFBQSxDQUFBLElBQUEsSUFBQTtBQUFZYyxZQUFBQSxLQUFBQSxHQUFBQSxrQkFBQUEsQ0FBQUEsSUFBQUEsQ0FBQUEsaUJBQUFBLENBQUFBO0FBQW5CLFlBQUEsUUFBQSxHQUFBLGtCQUFBLENBQUEsSUFBQSxDQUFBLFFBQUEsQ0FBQTtBQUNELFlBQUEsSUFBQSxHQUFBLGNBQUEsQyxtQ0FBQSxFQUdILFFBSEcsRSxLQUFBLEUsV0FBQSxDQUFBOztBQUlILFFBQUEsT0FBU0UsRUFBQUEsS0FBVCxNQUFTQSxDQUFULE87QUFDRSxRQUFBLElBQU8sRUFBQSxJO0FBSUhDLFFBQUFBLElBQVEsRUFBRUMsQ0FBQUEsR0FBQUEsU0FBQUEsQ0FBQUEsT0FBQUEsRUFBQUEsV0FBQUEsRUFBQUEsSUFBQUE7OztBQUpkLFVBQUEsS0FBQSxPQUFBLENBQUEsc0JBQUEsRUFBQTtBQVNELGFBQUEsT0FBQSxDQUFBLHNCQUFBLENBQUEsT0FBQTtPQVRDLE07QUFXRixhQUFTQyxPQUFULENBQUEsUUFBQSxDQUF3QkMsS0FBeEIseUJBQXdCQSxDQUF4QixPQUF3QkEsQ0FBeEI7QUFDRTs7QUFFSTFCLGFBQU8yQixPQUFBQSxDQUFYLE9BQVdBLENBQWUsSUFBZkEsQ0FBUDNCO0FBQ0YsS0FyQk8sQ0FBQTtBQTBCUDs7QUFJQSxFQUFBLGNBQVUwQixDQUFBQSxRQUFBQSxFQUFZLEtBQVpBLEVBQWVFLFFBQWZGLEVBQVY7QUFDRCxXQUFBLEtBQUEsdUJBQUEsQ0FBQSxRQUFBLEVBQUEsS0FBQSxFQUNGLElBREUsQ0FDRixJQUFBLElBQUEsa0JBQUEsQ0FBQSxJQUFBLENBQUEsUUFBQSxFQUFBLFFBQUEsRUFBQSxLQUFBLE1BQUEsQ0FERSxFLEtBQUEsQztVQUdZRyxLQUFBQSxJQUFBQSxLQUFBQSxDQUFBQSxPOzs7Ozs7S0FIWixDQUFBOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUE5U0MsQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IHJhbmRvbVN0cmluZyB9IGZyb20gJy4uL2NyeXB0b1V0aWxzJztcbmltcG9ydCB7IGluZmxhdGUgfSBmcm9tICcuLi90cmlnZ2Vycyc7XG5pbXBvcnQgQWRhcHRhYmxlQ29udHJvbGxlciBmcm9tICcuL0FkYXB0YWJsZUNvbnRyb2xsZXInO1xuaW1wb3J0IE1haWxBZGFwdGVyIGZyb20gJy4uL0FkYXB0ZXJzL0VtYWlsL01haWxBZGFwdGVyJztcbmltcG9ydCByZXN0IGZyb20gJy4uL3Jlc3QnO1xuaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuXG52YXIgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi4vUmVzdFF1ZXJ5Jyk7XG52YXIgQXV0aCA9IHJlcXVpcmUoJy4uL0F1dGgnKTtcblxuZXhwb3J0IGNsYXNzIFVzZXJDb250cm9sbGVyIGV4dGVuZHMgQWRhcHRhYmxlQ29udHJvbGxlciB7XG4gIGNvbnN0cnVjdG9yKGFkYXB0ZXIsIGFwcElkLCBvcHRpb25zID0ge30pIHtcbiAgICBzdXBlcihhZGFwdGVyLCBhcHBJZCwgb3B0aW9ucyk7XG4gIH1cblxuICB2YWxpZGF0ZUFkYXB0ZXIoYWRhcHRlcikge1xuICAgIC8vIEFsbG93IG5vIGFkYXB0ZXJcbiAgICBpZiAoIWFkYXB0ZXIgJiYgIXRoaXMuc2hvdWxkVmVyaWZ5RW1haWxzKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHN1cGVyLnZhbGlkYXRlQWRhcHRlcihhZGFwdGVyKTtcbiAgfVxuXG4gIGV4cGVjdGVkQWRhcHRlclR5cGUoKSB7XG4gICAgcmV0dXJuIE1haWxBZGFwdGVyO1xuICB9XG5cbiAgZ2V0IHNob3VsZFZlcmlmeUVtYWlscygpIHtcbiAgICByZXR1cm4gdGhpcy5vcHRpb25zLnZlcmlmeVVzZXJFbWFpbHM7XG4gIH1cblxuICBzZXRFbWFpbFZlcmlmeVRva2VuKHVzZXIpIHtcbiAgICBpZiAodGhpcy5zaG91bGRWZXJpZnlFbWFpbHMpIHtcbiAgICAgIHVzZXIuX2VtYWlsX3ZlcmlmeV90b2tlbiA9IHJhbmRvbVN0cmluZygyNSk7XG4gICAgICB1c2VyLmVtYWlsVmVyaWZpZWQgPSBmYWxzZTtcblxuICAgICAgaWYgKHRoaXMuY29uZmlnLmVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICAgIHVzZXIuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0gUGFyc2UuX2VuY29kZShcbiAgICAgICAgICB0aGlzLmNvbmZpZy5nZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQoKVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHZlcmlmeUVtYWlsKHVzZXJuYW1lLCB0b2tlbikge1xuICAgIGlmICghdGhpcy5zaG91bGRWZXJpZnlFbWFpbHMpIHtcbiAgICAgIC8vIFRyeWluZyB0byB2ZXJpZnkgZW1haWwgd2hlbiBub3QgZW5hYmxlZFxuICAgICAgLy8gVE9ETzogQmV0dGVyIGVycm9yIGhlcmUuXG4gICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgY29uc3QgcXVlcnkgPSB7IHVzZXJuYW1lOiB1c2VybmFtZSwgX2VtYWlsX3ZlcmlmeV90b2tlbjogdG9rZW4gfTtcbiAgICBjb25zdCB1cGRhdGVGaWVsZHMgPSB7XG4gICAgICBlbWFpbFZlcmlmaWVkOiB0cnVlLFxuICAgICAgX2VtYWlsX3ZlcmlmeV90b2tlbjogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgIH07XG5cbiAgICAvLyBpZiB0aGUgZW1haWwgdmVyaWZ5IHRva2VuIG5lZWRzIHRvIGJlIHZhbGlkYXRlZCB0aGVuXG4gICAgLy8gYWRkIGFkZGl0aW9uYWwgcXVlcnkgcGFyYW1zIGFuZCBhZGRpdGlvbmFsIGZpZWxkcyB0aGF0IG5lZWQgdG8gYmUgdXBkYXRlZFxuICAgIGlmICh0aGlzLmNvbmZpZy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgcXVlcnkuZW1haWxWZXJpZmllZCA9IGZhbHNlO1xuICAgICAgcXVlcnkuX2VtYWlsX3ZlcmlmeV90b2tlbl9leHBpcmVzX2F0ID0geyAkZ3Q6IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSkgfTtcblxuICAgICAgdXBkYXRlRmllbGRzLl9lbWFpbF92ZXJpZnlfdG9rZW5fZXhwaXJlc19hdCA9IHsgX19vcDogJ0RlbGV0ZScgfTtcbiAgICB9XG4gICAgY29uc3QgbWFzdGVyQXV0aCA9IEF1dGgubWFzdGVyKHRoaXMuY29uZmlnKTtcbiAgICB2YXIgY2hlY2tJZkFscmVhZHlWZXJpZmllZCA9IG5ldyBSZXN0UXVlcnkoXG4gICAgICB0aGlzLmNvbmZpZyxcbiAgICAgIEF1dGgubWFzdGVyKHRoaXMuY29uZmlnKSxcbiAgICAgICdfVXNlcicsXG4gICAgICB7IHVzZXJuYW1lOiB1c2VybmFtZSwgZW1haWxWZXJpZmllZDogdHJ1ZSB9XG4gICAgKTtcbiAgICByZXR1cm4gY2hlY2tJZkFscmVhZHlWZXJpZmllZC5leGVjdXRlKCkudGhlbihyZXN1bHQgPT4ge1xuICAgICAgaWYgKHJlc3VsdC5yZXN1bHRzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc3VsdC5yZXN1bHRzLmxlbmd0aFswXSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdC51cGRhdGUodGhpcy5jb25maWcsIG1hc3RlckF1dGgsICdfVXNlcicsIHF1ZXJ5LCB1cGRhdGVGaWVsZHMpO1xuICAgIH0pO1xuICB9XG5cbiAgY2hlY2tSZXNldFRva2VuVmFsaWRpdHkodXNlcm5hbWUsIHRva2VuKSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuZmluZChcbiAgICAgICAgJ19Vc2VyJyxcbiAgICAgICAge1xuICAgICAgICAgIHVzZXJuYW1lOiB1c2VybmFtZSxcbiAgICAgICAgICBfcGVyaXNoYWJsZV90b2tlbjogdG9rZW4sXG4gICAgICAgIH0sXG4gICAgICAgIHsgbGltaXQ6IDEgfVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgdGhyb3cgJ0ZhaWxlZCB0byByZXNldCBwYXNzd29yZDogdXNlcm5hbWUgLyBlbWFpbCAvIHRva2VuIGlzIGludmFsaWQnO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmXG4gICAgICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb25cbiAgICAgICAgKSB7XG4gICAgICAgICAgbGV0IGV4cGlyZXNEYXRlID0gcmVzdWx0c1swXS5fcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0O1xuICAgICAgICAgIGlmIChleHBpcmVzRGF0ZSAmJiBleHBpcmVzRGF0ZS5fX3R5cGUgPT0gJ0RhdGUnKSB7XG4gICAgICAgICAgICBleHBpcmVzRGF0ZSA9IG5ldyBEYXRlKGV4cGlyZXNEYXRlLmlzbyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChleHBpcmVzRGF0ZSA8IG5ldyBEYXRlKCkpXG4gICAgICAgICAgICB0aHJvdyAnVGhlIHBhc3N3b3JkIHJlc2V0IGxpbmsgaGFzIGV4cGlyZWQnO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdHNbMF07XG4gICAgICB9KTtcbiAgfVxuXG4gIGdldFVzZXJJZk5lZWRlZCh1c2VyKSB7XG4gICAgaWYgKHVzZXIudXNlcm5hbWUgJiYgdXNlci5lbWFpbCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh1c2VyKTtcbiAgICB9XG4gICAgdmFyIHdoZXJlID0ge307XG4gICAgaWYgKHVzZXIudXNlcm5hbWUpIHtcbiAgICAgIHdoZXJlLnVzZXJuYW1lID0gdXNlci51c2VybmFtZTtcbiAgICB9XG4gICAgaWYgKHVzZXIuZW1haWwpIHtcbiAgICAgIHdoZXJlLmVtYWlsID0gdXNlci5lbWFpbDtcbiAgICB9XG5cbiAgICB2YXIgcXVlcnkgPSBuZXcgUmVzdFF1ZXJ5KFxuICAgICAgdGhpcy5jb25maWcsXG4gICAgICBBdXRoLm1hc3Rlcih0aGlzLmNvbmZpZyksXG4gICAgICAnX1VzZXInLFxuICAgICAgd2hlcmVcbiAgICApO1xuICAgIHJldHVybiBxdWVyeS5leGVjdXRlKCkudGhlbihmdW5jdGlvbihyZXN1bHQpIHtcbiAgICAgIGlmIChyZXN1bHQucmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0LnJlc3VsdHNbMF07XG4gICAgfSk7XG4gIH1cblxuICBzZW5kVmVyaWZpY2F0aW9uRW1haWwodXNlcikge1xuICAgIGlmICghdGhpcy5zaG91bGRWZXJpZnlFbWFpbHMpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgdG9rZW4gPSBlbmNvZGVVUklDb21wb25lbnQodXNlci5fZW1haWxfdmVyaWZ5X3Rva2VuKTtcbiAgICAvLyBXZSBtYXkgbmVlZCB0byBmZXRjaCB0aGUgdXNlciBpbiBjYXNlIG9mIHVwZGF0ZSBlbWFpbFxuICAgIHRoaXMuZ2V0VXNlcklmTmVlZGVkKHVzZXIpLnRoZW4odXNlciA9PiB7XG4gICAgICBjb25zdCB1c2VybmFtZSA9IGVuY29kZVVSSUNvbXBvbmVudCh1c2VyLnVzZXJuYW1lKTtcblxuICAgICAgY29uc3QgbGluayA9IGJ1aWxkRW1haWxMaW5rKFxuICAgICAgICB0aGlzLmNvbmZpZy52ZXJpZnlFbWFpbFVSTCxcbiAgICAgICAgdXNlcm5hbWUsXG4gICAgICAgIHRva2VuLFxuICAgICAgICB0aGlzLmNvbmZpZ1xuICAgICAgKTtcbiAgICAgIGNvbnN0IG9wdGlvbnMgPSB7XG4gICAgICAgIGFwcE5hbWU6IHRoaXMuY29uZmlnLmFwcE5hbWUsXG4gICAgICAgIGxpbms6IGxpbmssXG4gICAgICAgIHVzZXI6IGluZmxhdGUoJ19Vc2VyJywgdXNlciksXG4gICAgICB9O1xuICAgICAgaWYgKHRoaXMuYWRhcHRlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwpIHtcbiAgICAgICAgdGhpcy5hZGFwdGVyLnNlbmRWZXJpZmljYXRpb25FbWFpbChvcHRpb25zKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuYWRhcHRlci5zZW5kTWFpbCh0aGlzLmRlZmF1bHRWZXJpZmljYXRpb25FbWFpbChvcHRpb25zKSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvKipcbiAgICogUmVnZW5lcmF0ZXMgdGhlIGdpdmVuIHVzZXIncyBlbWFpbCB2ZXJpZmljYXRpb24gdG9rZW5cbiAgICpcbiAgICogQHBhcmFtIHVzZXJcbiAgICogQHJldHVybnMgeyp9XG4gICAqL1xuICByZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbih1c2VyKSB7XG4gICAgdGhpcy5zZXRFbWFpbFZlcmlmeVRva2VuKHVzZXIpO1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAnX1VzZXInLFxuICAgICAgeyB1c2VybmFtZTogdXNlci51c2VybmFtZSB9LFxuICAgICAgdXNlclxuICAgICk7XG4gIH1cblxuICByZXNlbmRWZXJpZmljYXRpb25FbWFpbCh1c2VybmFtZSkge1xuICAgIHJldHVybiB0aGlzLmdldFVzZXJJZk5lZWRlZCh7IHVzZXJuYW1lOiB1c2VybmFtZSB9KS50aGVuKGFVc2VyID0+IHtcbiAgICAgIGlmICghYVVzZXIgfHwgYVVzZXIuZW1haWxWZXJpZmllZCkge1xuICAgICAgICB0aHJvdyB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5yZWdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbihhVXNlcikudGhlbigoKSA9PiB7XG4gICAgICAgIHRoaXMuc2VuZFZlcmlmaWNhdGlvbkVtYWlsKGFVc2VyKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgc2V0UGFzc3dvcmRSZXNldFRva2VuKGVtYWlsKSB7XG4gICAgY29uc3QgdG9rZW4gPSB7IF9wZXJpc2hhYmxlX3Rva2VuOiByYW5kb21TdHJpbmcoMjUpIH07XG5cbiAgICBpZiAoXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucmVzZXRUb2tlblZhbGlkaXR5RHVyYXRpb25cbiAgICApIHtcbiAgICAgIHRva2VuLl9wZXJpc2hhYmxlX3Rva2VuX2V4cGlyZXNfYXQgPSBQYXJzZS5fZW5jb2RlKFxuICAgICAgICB0aGlzLmNvbmZpZy5nZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCgpXG4gICAgICApO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAnX1VzZXInLFxuICAgICAgeyAkb3I6IFt7IGVtYWlsIH0sIHsgdXNlcm5hbWU6IGVtYWlsLCBlbWFpbDogeyAkZXhpc3RzOiBmYWxzZSB9IH1dIH0sXG4gICAgICB0b2tlbixcbiAgICAgIHt9LFxuICAgICAgdHJ1ZVxuICAgICk7XG4gIH1cblxuICBzZW5kUGFzc3dvcmRSZXNldEVtYWlsKGVtYWlsKSB7XG4gICAgaWYgKCF0aGlzLmFkYXB0ZXIpIHtcbiAgICAgIHRocm93ICdUcnlpbmcgdG8gc2VuZCBhIHJlc2V0IHBhc3N3b3JkIGJ1dCBubyBhZGFwdGVyIGlzIHNldCc7XG4gICAgICAvLyAgVE9ETzogTm8gYWRhcHRlcj9cbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5zZXRQYXNzd29yZFJlc2V0VG9rZW4oZW1haWwpLnRoZW4odXNlciA9PiB7XG4gICAgICBjb25zdCB0b2tlbiA9IGVuY29kZVVSSUNvbXBvbmVudCh1c2VyLl9wZXJpc2hhYmxlX3Rva2VuKTtcbiAgICAgIGNvbnN0IHVzZXJuYW1lID0gZW5jb2RlVVJJQ29tcG9uZW50KHVzZXIudXNlcm5hbWUpO1xuXG4gICAgICBjb25zdCBsaW5rID0gYnVpbGRFbWFpbExpbmsoXG4gICAgICAgIHRoaXMuY29uZmlnLnJlcXVlc3RSZXNldFBhc3N3b3JkVVJMLFxuICAgICAgICB1c2VybmFtZSxcbiAgICAgICAgdG9rZW4sXG4gICAgICAgIHRoaXMuY29uZmlnXG4gICAgICApO1xuICAgICAgY29uc3Qgb3B0aW9ucyA9IHtcbiAgICAgICAgYXBwTmFtZTogdGhpcy5jb25maWcuYXBwTmFtZSxcbiAgICAgICAgbGluazogbGluayxcbiAgICAgICAgdXNlcjogaW5mbGF0ZSgnX1VzZXInLCB1c2VyKSxcbiAgICAgIH07XG5cbiAgICAgIGlmICh0aGlzLmFkYXB0ZXIuc2VuZFBhc3N3b3JkUmVzZXRFbWFpbCkge1xuICAgICAgICB0aGlzLmFkYXB0ZXIuc2VuZFBhc3N3b3JkUmVzZXRFbWFpbChvcHRpb25zKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuYWRhcHRlci5zZW5kTWFpbCh0aGlzLmRlZmF1bHRSZXNldFBhc3N3b3JkRW1haWwob3B0aW9ucykpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVzZXIpO1xuICAgIH0pO1xuICB9XG5cbiAgdXBkYXRlUGFzc3dvcmQodXNlcm5hbWUsIHRva2VuLCBwYXNzd29yZCkge1xuICAgIHJldHVybiB0aGlzLmNoZWNrUmVzZXRUb2tlblZhbGlkaXR5KHVzZXJuYW1lLCB0b2tlbilcbiAgICAgIC50aGVuKHVzZXIgPT4gdXBkYXRlVXNlclBhc3N3b3JkKHVzZXIub2JqZWN0SWQsIHBhc3N3b3JkLCB0aGlzLmNvbmZpZykpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IubWVzc2FnZSkge1xuICAgICAgICAgIC8vIGluIGNhc2Ugb2YgUGFyc2UuRXJyb3IsIGZhaWwgd2l0aCB0aGUgZXJyb3IgbWVzc2FnZSBvbmx5XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KGVycm9yLm1lc3NhZ2UpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChlcnJvcik7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgZGVmYXVsdFZlcmlmaWNhdGlvbkVtYWlsKHsgbGluaywgdXNlciwgYXBwTmFtZSB9KSB7XG4gICAgY29uc3QgdGV4dCA9XG4gICAgICAnSGksXFxuXFxuJyArXG4gICAgICAnWW91IGFyZSBiZWluZyBhc2tlZCB0byBjb25maXJtIHRoZSBlLW1haWwgYWRkcmVzcyAnICtcbiAgICAgIHVzZXIuZ2V0KCdlbWFpbCcpICtcbiAgICAgICcgd2l0aCAnICtcbiAgICAgIGFwcE5hbWUgK1xuICAgICAgJ1xcblxcbicgK1xuICAgICAgJycgK1xuICAgICAgJ0NsaWNrIGhlcmUgdG8gY29uZmlybSBpdDpcXG4nICtcbiAgICAgIGxpbms7XG4gICAgY29uc3QgdG8gPSB1c2VyLmdldCgnZW1haWwnKTtcbiAgICBjb25zdCBzdWJqZWN0ID0gJ1BsZWFzZSB2ZXJpZnkgeW91ciBlLW1haWwgZm9yICcgKyBhcHBOYW1lO1xuICAgIHJldHVybiB7IHRleHQsIHRvLCBzdWJqZWN0IH07XG4gIH1cblxuICBkZWZhdWx0UmVzZXRQYXNzd29yZEVtYWlsKHsgbGluaywgdXNlciwgYXBwTmFtZSB9KSB7XG4gICAgY29uc3QgdGV4dCA9XG4gICAgICAnSGksXFxuXFxuJyArXG4gICAgICAnWW91IHJlcXVlc3RlZCB0byByZXNldCB5b3VyIHBhc3N3b3JkIGZvciAnICtcbiAgICAgIGFwcE5hbWUgK1xuICAgICAgKHVzZXIuZ2V0KCd1c2VybmFtZScpXG4gICAgICAgID8gXCIgKHlvdXIgdXNlcm5hbWUgaXMgJ1wiICsgdXNlci5nZXQoJ3VzZXJuYW1lJykgKyBcIicpXCJcbiAgICAgICAgOiAnJykgK1xuICAgICAgJy5cXG5cXG4nICtcbiAgICAgICcnICtcbiAgICAgICdDbGljayBoZXJlIHRvIHJlc2V0IGl0OlxcbicgK1xuICAgICAgbGluaztcbiAgICBjb25zdCB0byA9IHVzZXIuZ2V0KCdlbWFpbCcpIHx8IHVzZXIuZ2V0KCd1c2VybmFtZScpO1xuICAgIGNvbnN0IHN1YmplY3QgPSAnUGFzc3dvcmQgUmVzZXQgZm9yICcgKyBhcHBOYW1lO1xuICAgIHJldHVybiB7IHRleHQsIHRvLCBzdWJqZWN0IH07XG4gIH1cbn1cblxuLy8gTWFyayB0aGlzIHByaXZhdGVcbmZ1bmN0aW9uIHVwZGF0ZVVzZXJQYXNzd29yZCh1c2VySWQsIHBhc3N3b3JkLCBjb25maWcpIHtcbiAgcmV0dXJuIHJlc3QudXBkYXRlKFxuICAgIGNvbmZpZyxcbiAgICBBdXRoLm1hc3Rlcihjb25maWcpLFxuICAgICdfVXNlcicsXG4gICAgeyBvYmplY3RJZDogdXNlcklkIH0sXG4gICAge1xuICAgICAgcGFzc3dvcmQ6IHBhc3N3b3JkLFxuICAgIH1cbiAgKTtcbn1cblxuZnVuY3Rpb24gYnVpbGRFbWFpbExpbmsoZGVzdGluYXRpb24sIHVzZXJuYW1lLCB0b2tlbiwgY29uZmlnKSB7XG4gIGNvbnN0IHVzZXJuYW1lQW5kVG9rZW4gPSBgdG9rZW49JHt0b2tlbn0mdXNlcm5hbWU9JHt1c2VybmFtZX1gO1xuXG4gIGlmIChjb25maWcucGFyc2VGcmFtZVVSTCkge1xuICAgIGNvbnN0IGRlc3RpbmF0aW9uV2l0aG91dEhvc3QgPSBkZXN0aW5hdGlvbi5yZXBsYWNlKFxuICAgICAgY29uZmlnLnB1YmxpY1NlcnZlclVSTCxcbiAgICAgICcnXG4gICAgKTtcblxuICAgIHJldHVybiBgJHtjb25maWcucGFyc2VGcmFtZVVSTH0/bGluaz0ke2VuY29kZVVSSUNvbXBvbmVudChcbiAgICAgIGRlc3RpbmF0aW9uV2l0aG91dEhvc3RcbiAgICApfSYke3VzZXJuYW1lQW5kVG9rZW59YDtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYCR7ZGVzdGluYXRpb259PyR7dXNlcm5hbWVBbmRUb2tlbn1gO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFVzZXJDb250cm9sbGVyO1xuIl19