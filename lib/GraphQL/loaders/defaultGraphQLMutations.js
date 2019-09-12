"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var objectsMutations = _interopRequireWildcard(require("./objectsMutations"));

var filesMutations = _interopRequireWildcard(require("./filesMutations"));

var usersMutations = _interopRequireWildcard(require("./usersMutations"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

const load = parseGraphQLSchema => {
  objectsMutations.load(parseGraphQLSchema);
  filesMutations.load(parseGraphQLSchema);
  usersMutations.load(parseGraphQLSchema);
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsIm9iamVjdHNNdXRhdGlvbnMiLCJmaWxlc011dGF0aW9ucyIsInVzZXJzTXV0YXRpb25zIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBQ0E7O0FBQ0E7Ozs7OztBQUVBLE1BQU1BLElBQUksR0FBR0Msa0JBQWtCLElBQUk7QUFDakNDLEVBQUFBLGdCQUFnQixDQUFDRixJQUFqQixDQUFzQkMsa0JBQXRCO0FBQ0FFLEVBQUFBLGNBQWMsQ0FBQ0gsSUFBZixDQUFvQkMsa0JBQXBCO0FBQ0FHLEVBQUFBLGNBQWMsQ0FBQ0osSUFBZixDQUFvQkMsa0JBQXBCO0FBQ0QsQ0FKRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIG9iamVjdHNNdXRhdGlvbnMgZnJvbSAnLi9vYmplY3RzTXV0YXRpb25zJztcbmltcG9ydCAqIGFzIGZpbGVzTXV0YXRpb25zIGZyb20gJy4vZmlsZXNNdXRhdGlvbnMnO1xuaW1wb3J0ICogYXMgdXNlcnNNdXRhdGlvbnMgZnJvbSAnLi91c2Vyc011dGF0aW9ucyc7XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBvYmplY3RzTXV0YXRpb25zLmxvYWQocGFyc2VHcmFwaFFMU2NoZW1hKTtcbiAgZmlsZXNNdXRhdGlvbnMubG9hZChwYXJzZUdyYXBoUUxTY2hlbWEpO1xuICB1c2Vyc011dGF0aW9ucy5sb2FkKHBhcnNlR3JhcGhRTFNjaGVtYSk7XG59O1xuXG5leHBvcnQgeyBsb2FkIH07XG4iXX0=