"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var objectsQueries = _interopRequireWildcard(require("./objectsQueries"));

var usersQueries = _interopRequireWildcard(require("./usersQueries"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const load = parseGraphQLSchema => {
  parseGraphQLSchema.graphQLQueries.health = {
    description: 'The health query can be used to check if the server is up and running.',
    type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean),
    resolve: () => true
  };
  objectsQueries.load(parseGraphQLSchema);
  usersQueries.load(parseGraphQLSchema);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxRdWVyaWVzLmpzIl0sIm5hbWVzIjpbImxvYWQiLCJwYXJzZUdyYXBoUUxTY2hlbWEiLCJncmFwaFFMUXVlcmllcyIsImhlYWx0aCIsImRlc2NyaXB0aW9uIiwidHlwZSIsIkdyYXBoUUxOb25OdWxsIiwiR3JhcGhRTEJvb2xlYW4iLCJyZXNvbHZlIiwib2JqZWN0c1F1ZXJpZXMiLCJ1c2Vyc1F1ZXJpZXMiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFDQTs7QUFDQTs7Ozs7O0FBRUEsTUFBTUEsSUFBSSxHQUFHQyxrQkFBa0IsSUFBSTtBQUNqQ0EsRUFBQUEsa0JBQWtCLENBQUNDLGNBQW5CLENBQWtDQyxNQUFsQyxHQUEyQztBQUN6Q0MsSUFBQUEsV0FBVyxFQUNULHdFQUZ1QztBQUd6Q0MsSUFBQUEsSUFBSSxFQUFFLElBQUlDLHVCQUFKLENBQW1CQyx1QkFBbkIsQ0FIbUM7QUFJekNDLElBQUFBLE9BQU8sRUFBRSxNQUFNO0FBSjBCLEdBQTNDO0FBT0FDLEVBQUFBLGNBQWMsQ0FBQ1QsSUFBZixDQUFvQkMsa0JBQXBCO0FBQ0FTLEVBQUFBLFlBQVksQ0FBQ1YsSUFBYixDQUFrQkMsa0JBQWxCO0FBQ0QsQ0FWRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEdyYXBoUUxOb25OdWxsLCBHcmFwaFFMQm9vbGVhbiB9IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0ICogYXMgb2JqZWN0c1F1ZXJpZXMgZnJvbSAnLi9vYmplY3RzUXVlcmllcyc7XG5pbXBvcnQgKiBhcyB1c2Vyc1F1ZXJpZXMgZnJvbSAnLi91c2Vyc1F1ZXJpZXMnO1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxRdWVyaWVzLmhlYWx0aCA9IHtcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdUaGUgaGVhbHRoIHF1ZXJ5IGNhbiBiZSB1c2VkIHRvIGNoZWNrIGlmIHRoZSBzZXJ2ZXIgaXMgdXAgYW5kIHJ1bm5pbmcuJyxcbiAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIHJlc29sdmU6ICgpID0+IHRydWUsXG4gIH07XG5cbiAgb2JqZWN0c1F1ZXJpZXMubG9hZChwYXJzZUdyYXBoUUxTY2hlbWEpO1xuICB1c2Vyc1F1ZXJpZXMubG9hZChwYXJzZUdyYXBoUUxTY2hlbWEpO1xufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl19