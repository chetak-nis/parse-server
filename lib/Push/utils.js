"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isPushIncrementing = isPushIncrementing;
exports.getLocalesFromPush = getLocalesFromPush;
exports.transformPushBodyForLocale = transformPushBodyForLocale;
exports.stripLocalesFromBody = stripLocalesFromBody;
exports.bodiesPerLocales = bodiesPerLocales;
exports.groupByLocaleIdentifier = groupByLocaleIdentifier;
exports.validatePushType = validatePushType;
exports.applyDeviceTokenExists = applyDeviceTokenExists;

var _node = _interopRequireDefault(require("parse/node"));

var _deepcopy = _interopRequireDefault(require("deepcopy"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function isPushIncrementing(body) {
  if (!body.data || !body.data.badge) {
    return false;
  }

  const badge = body.data.badge;

  if (typeof badge == 'string' && badge.toLowerCase() == 'increment') {
    return true;
  }

  return typeof badge == 'object' && typeof badge.__op == 'string' && badge.__op.toLowerCase() == 'increment' && Number(badge.amount);
}

const localizableKeys = ['alert', 'title'];

function getLocalesFromPush(body) {
  const data = body.data;

  if (!data) {
    return [];
  }

  return [...new Set(Object.keys(data).reduce((memo, key) => {
    localizableKeys.forEach(localizableKey => {
      if (key.indexOf(`${localizableKey}-`) == 0) {
        memo.push(key.slice(localizableKey.length + 1));
      }
    });
    return memo;
  }, []))];
}

function transformPushBodyForLocale(body, locale) {
  const data = body.data;

  if (!data) {
    return body;
  }

  body = (0, _deepcopy.default)(body);
  localizableKeys.forEach(key => {
    const localeValue = body.data[`${key}-${locale}`];

    if (localeValue) {
      body.data[key] = localeValue;
    }
  });
  return stripLocalesFromBody(body);
}

function stripLocalesFromBody(body) {
  if (!body.data) {
    return body;
  }

  Object.keys(body.data).forEach(key => {
    localizableKeys.forEach(localizableKey => {
      if (key.indexOf(`${localizableKey}-`) == 0) {
        delete body.data[key];
      }
    });
  });
  return body;
}

function bodiesPerLocales(body, locales = []) {
  // Get all tranformed bodies for each locale
  const result = locales.reduce((memo, locale) => {
    memo[locale] = transformPushBodyForLocale(body, locale);
    return memo;
  }, {}); // Set the default locale, with the stripped body

  result.default = stripLocalesFromBody(body);
  return result;
}

function groupByLocaleIdentifier(installations, locales = []) {
  return installations.reduce((map, installation) => {
    let added = false;
    locales.forEach(locale => {
      if (added) {
        return;
      }

      if (installation.localeIdentifier && installation.localeIdentifier.indexOf(locale) === 0) {
        added = true;
        map[locale] = map[locale] || [];
        map[locale].push(installation);
      }
    });

    if (!added) {
      map.default.push(installation);
    }

    return map;
  }, {
    default: []
  });
}
/**
 * Check whether the deviceType parameter in qury condition is valid or not.
 * @param {Object} where A query condition
 * @param {Array} validPushTypes An array of valid push types(string)
 */


function validatePushType(where = {}, validPushTypes = []) {
  var deviceTypeField = where.deviceType || {};
  var deviceTypes = [];

  if (typeof deviceTypeField === 'string') {
    deviceTypes.push(deviceTypeField);
  } else if (Array.isArray(deviceTypeField['$in'])) {
    deviceTypes.concat(deviceTypeField['$in']);
  }

  for (var i = 0; i < deviceTypes.length; i++) {
    var deviceType = deviceTypes[i];

    if (validPushTypes.indexOf(deviceType) < 0) {
      throw new _node.default.Error(_node.default.Error.PUSH_MISCONFIGURED, deviceType + ' is not supported push type.');
    }
  }
}

function applyDeviceTokenExists(where) {
  where = (0, _deepcopy.default)(where);

  if (!where.hasOwnProperty('deviceToken')) {
    where['deviceToken'] = {
      $exists: true
    };
  }

  return where;
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9QdXNoL3V0aWxzLmpzIl0sIm5hbWVzIjpbImlzUHVzaEluY3JlbWVudGluZyIsImJvZHkiLCJkYXRhIiwiYmFkZ2UiLCJ0b0xvd2VyQ2FzZSIsIl9fb3AiLCJOdW1iZXIiLCJhbW91bnQiLCJsb2NhbGl6YWJsZUtleXMiLCJnZXRMb2NhbGVzRnJvbVB1c2giLCJTZXQiLCJPYmplY3QiLCJrZXlzIiwicmVkdWNlIiwibWVtbyIsImtleSIsImZvckVhY2giLCJsb2NhbGl6YWJsZUtleSIsImluZGV4T2YiLCJwdXNoIiwic2xpY2UiLCJsZW5ndGgiLCJ0cmFuc2Zvcm1QdXNoQm9keUZvckxvY2FsZSIsImxvY2FsZSIsImxvY2FsZVZhbHVlIiwic3RyaXBMb2NhbGVzRnJvbUJvZHkiLCJib2RpZXNQZXJMb2NhbGVzIiwibG9jYWxlcyIsInJlc3VsdCIsImRlZmF1bHQiLCJncm91cEJ5TG9jYWxlSWRlbnRpZmllciIsImluc3RhbGxhdGlvbnMiLCJtYXAiLCJpbnN0YWxsYXRpb24iLCJhZGRlZCIsImxvY2FsZUlkZW50aWZpZXIiLCJ2YWxpZGF0ZVB1c2hUeXBlIiwid2hlcmUiLCJ2YWxpZFB1c2hUeXBlcyIsImRldmljZVR5cGVGaWVsZCIsImRldmljZVR5cGUiLCJkZXZpY2VUeXBlcyIsIkFycmF5IiwiaXNBcnJheSIsImNvbmNhdCIsImkiLCJQYXJzZSIsIkVycm9yIiwiUFVTSF9NSVNDT05GSUdVUkVEIiwiYXBwbHlEZXZpY2VUb2tlbkV4aXN0cyIsImhhc093blByb3BlcnR5IiwiJGV4aXN0cyJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7QUFBQTs7QUFDQTs7OztBQUVPLFNBQVNBLGtCQUFULENBQTRCQyxJQUE1QixFQUFrQztBQUN2QyxNQUFJLENBQUNBLElBQUksQ0FBQ0MsSUFBTixJQUFjLENBQUNELElBQUksQ0FBQ0MsSUFBTCxDQUFVQyxLQUE3QixFQUFvQztBQUNsQyxXQUFPLEtBQVA7QUFDRDs7QUFFRCxRQUFNQSxLQUFLLEdBQUdGLElBQUksQ0FBQ0MsSUFBTCxDQUFVQyxLQUF4Qjs7QUFDQSxNQUFJLE9BQU9BLEtBQVAsSUFBZ0IsUUFBaEIsSUFBNEJBLEtBQUssQ0FBQ0MsV0FBTixNQUF1QixXQUF2RCxFQUFvRTtBQUNsRSxXQUFPLElBQVA7QUFDRDs7QUFFRCxTQUNFLE9BQU9ELEtBQVAsSUFBZ0IsUUFBaEIsSUFDQSxPQUFPQSxLQUFLLENBQUNFLElBQWIsSUFBcUIsUUFEckIsSUFFQUYsS0FBSyxDQUFDRSxJQUFOLENBQVdELFdBQVgsTUFBNEIsV0FGNUIsSUFHQUUsTUFBTSxDQUFDSCxLQUFLLENBQUNJLE1BQVAsQ0FKUjtBQU1EOztBQUVELE1BQU1DLGVBQWUsR0FBRyxDQUFDLE9BQUQsRUFBVSxPQUFWLENBQXhCOztBQUVPLFNBQVNDLGtCQUFULENBQTRCUixJQUE1QixFQUFrQztBQUN2QyxRQUFNQyxJQUFJLEdBQUdELElBQUksQ0FBQ0MsSUFBbEI7O0FBQ0EsTUFBSSxDQUFDQSxJQUFMLEVBQVc7QUFDVCxXQUFPLEVBQVA7QUFDRDs7QUFDRCxTQUFPLENBQ0wsR0FBRyxJQUFJUSxHQUFKLENBQ0RDLE1BQU0sQ0FBQ0MsSUFBUCxDQUFZVixJQUFaLEVBQWtCVyxNQUFsQixDQUF5QixDQUFDQyxJQUFELEVBQU9DLEdBQVAsS0FBZTtBQUN0Q1AsSUFBQUEsZUFBZSxDQUFDUSxPQUFoQixDQUF3QkMsY0FBYyxJQUFJO0FBQ3hDLFVBQUlGLEdBQUcsQ0FBQ0csT0FBSixDQUFhLEdBQUVELGNBQWUsR0FBOUIsS0FBcUMsQ0FBekMsRUFBNEM7QUFDMUNILFFBQUFBLElBQUksQ0FBQ0ssSUFBTCxDQUFVSixHQUFHLENBQUNLLEtBQUosQ0FBVUgsY0FBYyxDQUFDSSxNQUFmLEdBQXdCLENBQWxDLENBQVY7QUFDRDtBQUNGLEtBSkQ7QUFLQSxXQUFPUCxJQUFQO0FBQ0QsR0FQRCxFQU9HLEVBUEgsQ0FEQyxDQURFLENBQVA7QUFZRDs7QUFFTSxTQUFTUSwwQkFBVCxDQUFvQ3JCLElBQXBDLEVBQTBDc0IsTUFBMUMsRUFBa0Q7QUFDdkQsUUFBTXJCLElBQUksR0FBR0QsSUFBSSxDQUFDQyxJQUFsQjs7QUFDQSxNQUFJLENBQUNBLElBQUwsRUFBVztBQUNULFdBQU9ELElBQVA7QUFDRDs7QUFDREEsRUFBQUEsSUFBSSxHQUFHLHVCQUFTQSxJQUFULENBQVA7QUFDQU8sRUFBQUEsZUFBZSxDQUFDUSxPQUFoQixDQUF3QkQsR0FBRyxJQUFJO0FBQzdCLFVBQU1TLFdBQVcsR0FBR3ZCLElBQUksQ0FBQ0MsSUFBTCxDQUFXLEdBQUVhLEdBQUksSUFBR1EsTUFBTyxFQUEzQixDQUFwQjs7QUFDQSxRQUFJQyxXQUFKLEVBQWlCO0FBQ2Z2QixNQUFBQSxJQUFJLENBQUNDLElBQUwsQ0FBVWEsR0FBVixJQUFpQlMsV0FBakI7QUFDRDtBQUNGLEdBTEQ7QUFNQSxTQUFPQyxvQkFBb0IsQ0FBQ3hCLElBQUQsQ0FBM0I7QUFDRDs7QUFFTSxTQUFTd0Isb0JBQVQsQ0FBOEJ4QixJQUE5QixFQUFvQztBQUN6QyxNQUFJLENBQUNBLElBQUksQ0FBQ0MsSUFBVixFQUFnQjtBQUNkLFdBQU9ELElBQVA7QUFDRDs7QUFDRFUsRUFBQUEsTUFBTSxDQUFDQyxJQUFQLENBQVlYLElBQUksQ0FBQ0MsSUFBakIsRUFBdUJjLE9BQXZCLENBQStCRCxHQUFHLElBQUk7QUFDcENQLElBQUFBLGVBQWUsQ0FBQ1EsT0FBaEIsQ0FBd0JDLGNBQWMsSUFBSTtBQUN4QyxVQUFJRixHQUFHLENBQUNHLE9BQUosQ0FBYSxHQUFFRCxjQUFlLEdBQTlCLEtBQXFDLENBQXpDLEVBQTRDO0FBQzFDLGVBQU9oQixJQUFJLENBQUNDLElBQUwsQ0FBVWEsR0FBVixDQUFQO0FBQ0Q7QUFDRixLQUpEO0FBS0QsR0FORDtBQU9BLFNBQU9kLElBQVA7QUFDRDs7QUFFTSxTQUFTeUIsZ0JBQVQsQ0FBMEJ6QixJQUExQixFQUFnQzBCLE9BQU8sR0FBRyxFQUExQyxFQUE4QztBQUNuRDtBQUNBLFFBQU1DLE1BQU0sR0FBR0QsT0FBTyxDQUFDZCxNQUFSLENBQWUsQ0FBQ0MsSUFBRCxFQUFPUyxNQUFQLEtBQWtCO0FBQzlDVCxJQUFBQSxJQUFJLENBQUNTLE1BQUQsQ0FBSixHQUFlRCwwQkFBMEIsQ0FBQ3JCLElBQUQsRUFBT3NCLE1BQVAsQ0FBekM7QUFDQSxXQUFPVCxJQUFQO0FBQ0QsR0FIYyxFQUdaLEVBSFksQ0FBZixDQUZtRCxDQU1uRDs7QUFDQWMsRUFBQUEsTUFBTSxDQUFDQyxPQUFQLEdBQWlCSixvQkFBb0IsQ0FBQ3hCLElBQUQsQ0FBckM7QUFDQSxTQUFPMkIsTUFBUDtBQUNEOztBQUVNLFNBQVNFLHVCQUFULENBQWlDQyxhQUFqQyxFQUFnREosT0FBTyxHQUFHLEVBQTFELEVBQThEO0FBQ25FLFNBQU9JLGFBQWEsQ0FBQ2xCLE1BQWQsQ0FDTCxDQUFDbUIsR0FBRCxFQUFNQyxZQUFOLEtBQXVCO0FBQ3JCLFFBQUlDLEtBQUssR0FBRyxLQUFaO0FBQ0FQLElBQUFBLE9BQU8sQ0FBQ1gsT0FBUixDQUFnQk8sTUFBTSxJQUFJO0FBQ3hCLFVBQUlXLEtBQUosRUFBVztBQUNUO0FBQ0Q7O0FBQ0QsVUFDRUQsWUFBWSxDQUFDRSxnQkFBYixJQUNBRixZQUFZLENBQUNFLGdCQUFiLENBQThCakIsT0FBOUIsQ0FBc0NLLE1BQXRDLE1BQWtELENBRnBELEVBR0U7QUFDQVcsUUFBQUEsS0FBSyxHQUFHLElBQVI7QUFDQUYsUUFBQUEsR0FBRyxDQUFDVCxNQUFELENBQUgsR0FBY1MsR0FBRyxDQUFDVCxNQUFELENBQUgsSUFBZSxFQUE3QjtBQUNBUyxRQUFBQSxHQUFHLENBQUNULE1BQUQsQ0FBSCxDQUFZSixJQUFaLENBQWlCYyxZQUFqQjtBQUNEO0FBQ0YsS0FaRDs7QUFhQSxRQUFJLENBQUNDLEtBQUwsRUFBWTtBQUNWRixNQUFBQSxHQUFHLENBQUNILE9BQUosQ0FBWVYsSUFBWixDQUFpQmMsWUFBakI7QUFDRDs7QUFDRCxXQUFPRCxHQUFQO0FBQ0QsR0FwQkksRUFxQkw7QUFBRUgsSUFBQUEsT0FBTyxFQUFFO0FBQVgsR0FyQkssQ0FBUDtBQXVCRDtBQUVEOzs7Ozs7O0FBS08sU0FBU08sZ0JBQVQsQ0FBMEJDLEtBQUssR0FBRyxFQUFsQyxFQUFzQ0MsY0FBYyxHQUFHLEVBQXZELEVBQTJEO0FBQ2hFLE1BQUlDLGVBQWUsR0FBR0YsS0FBSyxDQUFDRyxVQUFOLElBQW9CLEVBQTFDO0FBQ0EsTUFBSUMsV0FBVyxHQUFHLEVBQWxCOztBQUNBLE1BQUksT0FBT0YsZUFBUCxLQUEyQixRQUEvQixFQUF5QztBQUN2Q0UsSUFBQUEsV0FBVyxDQUFDdEIsSUFBWixDQUFpQm9CLGVBQWpCO0FBQ0QsR0FGRCxNQUVPLElBQUlHLEtBQUssQ0FBQ0MsT0FBTixDQUFjSixlQUFlLENBQUMsS0FBRCxDQUE3QixDQUFKLEVBQTJDO0FBQ2hERSxJQUFBQSxXQUFXLENBQUNHLE1BQVosQ0FBbUJMLGVBQWUsQ0FBQyxLQUFELENBQWxDO0FBQ0Q7O0FBQ0QsT0FBSyxJQUFJTSxDQUFDLEdBQUcsQ0FBYixFQUFnQkEsQ0FBQyxHQUFHSixXQUFXLENBQUNwQixNQUFoQyxFQUF3Q3dCLENBQUMsRUFBekMsRUFBNkM7QUFDM0MsUUFBSUwsVUFBVSxHQUFHQyxXQUFXLENBQUNJLENBQUQsQ0FBNUI7O0FBQ0EsUUFBSVAsY0FBYyxDQUFDcEIsT0FBZixDQUF1QnNCLFVBQXZCLElBQXFDLENBQXpDLEVBQTRDO0FBQzFDLFlBQU0sSUFBSU0sY0FBTUMsS0FBVixDQUNKRCxjQUFNQyxLQUFOLENBQVlDLGtCQURSLEVBRUpSLFVBQVUsR0FBRyw4QkFGVCxDQUFOO0FBSUQ7QUFDRjtBQUNGOztBQUVNLFNBQVNTLHNCQUFULENBQWdDWixLQUFoQyxFQUF1QztBQUM1Q0EsRUFBQUEsS0FBSyxHQUFHLHVCQUFTQSxLQUFULENBQVI7O0FBQ0EsTUFBSSxDQUFDQSxLQUFLLENBQUNhLGNBQU4sQ0FBcUIsYUFBckIsQ0FBTCxFQUEwQztBQUN4Q2IsSUFBQUEsS0FBSyxDQUFDLGFBQUQsQ0FBTCxHQUF1QjtBQUFFYyxNQUFBQSxPQUFPLEVBQUU7QUFBWCxLQUF2QjtBQUNEOztBQUNELFNBQU9kLEtBQVA7QUFDRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBQYXJzZSBmcm9tICdwYXJzZS9ub2RlJztcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1B1c2hJbmNyZW1lbnRpbmcoYm9keSkge1xuICBpZiAoIWJvZHkuZGF0YSB8fCAhYm9keS5kYXRhLmJhZGdlKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgYmFkZ2UgPSBib2R5LmRhdGEuYmFkZ2U7XG4gIGlmICh0eXBlb2YgYmFkZ2UgPT0gJ3N0cmluZycgJiYgYmFkZ2UudG9Mb3dlckNhc2UoKSA9PSAnaW5jcmVtZW50Jykge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgcmV0dXJuIChcbiAgICB0eXBlb2YgYmFkZ2UgPT0gJ29iamVjdCcgJiZcbiAgICB0eXBlb2YgYmFkZ2UuX19vcCA9PSAnc3RyaW5nJyAmJlxuICAgIGJhZGdlLl9fb3AudG9Mb3dlckNhc2UoKSA9PSAnaW5jcmVtZW50JyAmJlxuICAgIE51bWJlcihiYWRnZS5hbW91bnQpXG4gICk7XG59XG5cbmNvbnN0IGxvY2FsaXphYmxlS2V5cyA9IFsnYWxlcnQnLCAndGl0bGUnXTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldExvY2FsZXNGcm9tUHVzaChib2R5KSB7XG4gIGNvbnN0IGRhdGEgPSBib2R5LmRhdGE7XG4gIGlmICghZGF0YSkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuICByZXR1cm4gW1xuICAgIC4uLm5ldyBTZXQoXG4gICAgICBPYmplY3Qua2V5cyhkYXRhKS5yZWR1Y2UoKG1lbW8sIGtleSkgPT4ge1xuICAgICAgICBsb2NhbGl6YWJsZUtleXMuZm9yRWFjaChsb2NhbGl6YWJsZUtleSA9PiB7XG4gICAgICAgICAgaWYgKGtleS5pbmRleE9mKGAke2xvY2FsaXphYmxlS2V5fS1gKSA9PSAwKSB7XG4gICAgICAgICAgICBtZW1vLnB1c2goa2V5LnNsaWNlKGxvY2FsaXphYmxlS2V5Lmxlbmd0aCArIDEpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgIH0sIFtdKVxuICAgICksXG4gIF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0cmFuc2Zvcm1QdXNoQm9keUZvckxvY2FsZShib2R5LCBsb2NhbGUpIHtcbiAgY29uc3QgZGF0YSA9IGJvZHkuZGF0YTtcbiAgaWYgKCFkYXRhKSB7XG4gICAgcmV0dXJuIGJvZHk7XG4gIH1cbiAgYm9keSA9IGRlZXBjb3B5KGJvZHkpO1xuICBsb2NhbGl6YWJsZUtleXMuZm9yRWFjaChrZXkgPT4ge1xuICAgIGNvbnN0IGxvY2FsZVZhbHVlID0gYm9keS5kYXRhW2Ake2tleX0tJHtsb2NhbGV9YF07XG4gICAgaWYgKGxvY2FsZVZhbHVlKSB7XG4gICAgICBib2R5LmRhdGFba2V5XSA9IGxvY2FsZVZhbHVlO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBzdHJpcExvY2FsZXNGcm9tQm9keShib2R5KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0cmlwTG9jYWxlc0Zyb21Cb2R5KGJvZHkpIHtcbiAgaWYgKCFib2R5LmRhdGEpIHtcbiAgICByZXR1cm4gYm9keTtcbiAgfVxuICBPYmplY3Qua2V5cyhib2R5LmRhdGEpLmZvckVhY2goa2V5ID0+IHtcbiAgICBsb2NhbGl6YWJsZUtleXMuZm9yRWFjaChsb2NhbGl6YWJsZUtleSA9PiB7XG4gICAgICBpZiAoa2V5LmluZGV4T2YoYCR7bG9jYWxpemFibGVLZXl9LWApID09IDApIHtcbiAgICAgICAgZGVsZXRlIGJvZHkuZGF0YVtrZXldO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcbiAgcmV0dXJuIGJvZHk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBib2RpZXNQZXJMb2NhbGVzKGJvZHksIGxvY2FsZXMgPSBbXSkge1xuICAvLyBHZXQgYWxsIHRyYW5mb3JtZWQgYm9kaWVzIGZvciBlYWNoIGxvY2FsZVxuICBjb25zdCByZXN1bHQgPSBsb2NhbGVzLnJlZHVjZSgobWVtbywgbG9jYWxlKSA9PiB7XG4gICAgbWVtb1tsb2NhbGVdID0gdHJhbnNmb3JtUHVzaEJvZHlGb3JMb2NhbGUoYm9keSwgbG9jYWxlKTtcbiAgICByZXR1cm4gbWVtbztcbiAgfSwge30pO1xuICAvLyBTZXQgdGhlIGRlZmF1bHQgbG9jYWxlLCB3aXRoIHRoZSBzdHJpcHBlZCBib2R5XG4gIHJlc3VsdC5kZWZhdWx0ID0gc3RyaXBMb2NhbGVzRnJvbUJvZHkoYm9keSk7XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBncm91cEJ5TG9jYWxlSWRlbnRpZmllcihpbnN0YWxsYXRpb25zLCBsb2NhbGVzID0gW10pIHtcbiAgcmV0dXJuIGluc3RhbGxhdGlvbnMucmVkdWNlKFxuICAgIChtYXAsIGluc3RhbGxhdGlvbikgPT4ge1xuICAgICAgbGV0IGFkZGVkID0gZmFsc2U7XG4gICAgICBsb2NhbGVzLmZvckVhY2gobG9jYWxlID0+IHtcbiAgICAgICAgaWYgKGFkZGVkKSB7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG4gICAgICAgIGlmIChcbiAgICAgICAgICBpbnN0YWxsYXRpb24ubG9jYWxlSWRlbnRpZmllciAmJlxuICAgICAgICAgIGluc3RhbGxhdGlvbi5sb2NhbGVJZGVudGlmaWVyLmluZGV4T2YobG9jYWxlKSA9PT0gMFxuICAgICAgICApIHtcbiAgICAgICAgICBhZGRlZCA9IHRydWU7XG4gICAgICAgICAgbWFwW2xvY2FsZV0gPSBtYXBbbG9jYWxlXSB8fCBbXTtcbiAgICAgICAgICBtYXBbbG9jYWxlXS5wdXNoKGluc3RhbGxhdGlvbik7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgICAgaWYgKCFhZGRlZCkge1xuICAgICAgICBtYXAuZGVmYXVsdC5wdXNoKGluc3RhbGxhdGlvbik7XG4gICAgICB9XG4gICAgICByZXR1cm4gbWFwO1xuICAgIH0sXG4gICAgeyBkZWZhdWx0OiBbXSB9XG4gICk7XG59XG5cbi8qKlxuICogQ2hlY2sgd2hldGhlciB0aGUgZGV2aWNlVHlwZSBwYXJhbWV0ZXIgaW4gcXVyeSBjb25kaXRpb24gaXMgdmFsaWQgb3Igbm90LlxuICogQHBhcmFtIHtPYmplY3R9IHdoZXJlIEEgcXVlcnkgY29uZGl0aW9uXG4gKiBAcGFyYW0ge0FycmF5fSB2YWxpZFB1c2hUeXBlcyBBbiBhcnJheSBvZiB2YWxpZCBwdXNoIHR5cGVzKHN0cmluZylcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkYXRlUHVzaFR5cGUod2hlcmUgPSB7fSwgdmFsaWRQdXNoVHlwZXMgPSBbXSkge1xuICB2YXIgZGV2aWNlVHlwZUZpZWxkID0gd2hlcmUuZGV2aWNlVHlwZSB8fCB7fTtcbiAgdmFyIGRldmljZVR5cGVzID0gW107XG4gIGlmICh0eXBlb2YgZGV2aWNlVHlwZUZpZWxkID09PSAnc3RyaW5nJykge1xuICAgIGRldmljZVR5cGVzLnB1c2goZGV2aWNlVHlwZUZpZWxkKTtcbiAgfSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRldmljZVR5cGVGaWVsZFsnJGluJ10pKSB7XG4gICAgZGV2aWNlVHlwZXMuY29uY2F0KGRldmljZVR5cGVGaWVsZFsnJGluJ10pO1xuICB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgZGV2aWNlVHlwZXMubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgZGV2aWNlVHlwZSA9IGRldmljZVR5cGVzW2ldO1xuICAgIGlmICh2YWxpZFB1c2hUeXBlcy5pbmRleE9mKGRldmljZVR5cGUpIDwgMCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5QVVNIX01JU0NPTkZJR1VSRUQsXG4gICAgICAgIGRldmljZVR5cGUgKyAnIGlzIG5vdCBzdXBwb3J0ZWQgcHVzaCB0eXBlLidcbiAgICAgICk7XG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcHBseURldmljZVRva2VuRXhpc3RzKHdoZXJlKSB7XG4gIHdoZXJlID0gZGVlcGNvcHkod2hlcmUpO1xuICBpZiAoIXdoZXJlLmhhc093blByb3BlcnR5KCdkZXZpY2VUb2tlbicpKSB7XG4gICAgd2hlcmVbJ2RldmljZVRva2VuJ10gPSB7ICRleGlzdHM6IHRydWUgfTtcbiAgfVxuICByZXR1cm4gd2hlcmU7XG59XG4iXX0=