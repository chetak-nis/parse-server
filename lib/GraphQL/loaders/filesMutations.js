"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.load = void 0;

var _graphql = require("graphql");

var _graphqlUpload = require("graphql-upload");

var _node = _interopRequireDefault(require("parse/node"));

var defaultGraphQLTypes = _interopRequireWildcard(require("./defaultGraphQLTypes"));

var _logger = _interopRequireDefault(require("../../logger"));

function _getRequireWildcardCache() { if (typeof WeakMap !== "function") return null; var cache = new WeakMap(); _getRequireWildcardCache = function () { return cache; }; return cache; }

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } var cache = _getRequireWildcardCache(); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; if (obj != null) { var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const load = parseGraphQLSchema => {
  const fields = {};
  fields.create = {
    description: 'The create mutation can be used to create and upload a new file.',
    args: {
      file: {
        description: 'This is the new file to be created and uploaded',
        type: new _graphql.GraphQLNonNull(_graphqlUpload.GraphQLUpload)
      }
    },
    type: new _graphql.GraphQLNonNull(defaultGraphQLTypes.FILE_INFO),

    async resolve(_source, args, context) {
      try {
        const {
          file
        } = args;
        const {
          config
        } = context;
        const {
          createReadStream,
          filename,
          mimetype
        } = await file;
        let data = null;

        if (createReadStream) {
          const stream = createReadStream();
          data = await new Promise((resolve, reject) => {
            let data = '';
            stream.on('error', reject).on('data', chunk => data += chunk).on('end', () => resolve(data));
          });
        }

        if (!data || !data.length) {
          throw new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, 'Invalid file upload.');
        }

        if (filename.length > 128) {
          throw new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename too long.');
        }

        if (!filename.match(/^[_a-zA-Z0-9][a-zA-Z0-9@\.\ ~_-]*$/)) {
          throw new _node.default.Error(_node.default.Error.INVALID_FILE_NAME, 'Filename contains invalid characters.');
        }

        try {
          return await config.filesController.createFile(config, filename, data, mimetype);
        } catch (e) {
          _logger.default.error('Error creating a file: ', e);

          throw new _node.default.Error(_node.default.Error.FILE_SAVE_ERROR, `Could not store file: ${filename}.`);
        }
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    }

  };
  const filesMutation = new _graphql.GraphQLObjectType({
    name: 'FilesMutation',
    description: 'FilesMutation is the top level type for files mutations.',
    fields
  });
  parseGraphQLSchema.graphQLTypes.push(filesMutation);
  parseGraphQLSchema.graphQLMutations.files = {
    description: 'This is the top level for files mutations.',
    type: filesMutation,
    resolve: () => new Object()
  };
};

exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZmlsZXNNdXRhdGlvbnMuanMiXSwibmFtZXMiOlsibG9hZCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsImZpZWxkcyIsImNyZWF0ZSIsImRlc2NyaXB0aW9uIiwiYXJncyIsImZpbGUiLCJ0eXBlIiwiR3JhcGhRTE5vbk51bGwiLCJHcmFwaFFMVXBsb2FkIiwiZGVmYXVsdEdyYXBoUUxUeXBlcyIsIkZJTEVfSU5GTyIsInJlc29sdmUiLCJfc291cmNlIiwiY29udGV4dCIsImNvbmZpZyIsImNyZWF0ZVJlYWRTdHJlYW0iLCJmaWxlbmFtZSIsIm1pbWV0eXBlIiwiZGF0YSIsInN0cmVhbSIsIlByb21pc2UiLCJyZWplY3QiLCJvbiIsImNodW5rIiwibGVuZ3RoIiwiUGFyc2UiLCJFcnJvciIsIkZJTEVfU0FWRV9FUlJPUiIsIklOVkFMSURfRklMRV9OQU1FIiwibWF0Y2giLCJmaWxlc0NvbnRyb2xsZXIiLCJjcmVhdGVGaWxlIiwiZSIsImxvZ2dlciIsImVycm9yIiwiaGFuZGxlRXJyb3IiLCJmaWxlc011dGF0aW9uIiwiR3JhcGhRTE9iamVjdFR5cGUiLCJuYW1lIiwiZ3JhcGhRTFR5cGVzIiwicHVzaCIsImdyYXBoUUxNdXRhdGlvbnMiLCJmaWxlcyIsIk9iamVjdCJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7OztBQUVBLE1BQU1BLElBQUksR0FBR0Msa0JBQWtCLElBQUk7QUFDakMsUUFBTUMsTUFBTSxHQUFHLEVBQWY7QUFFQUEsRUFBQUEsTUFBTSxDQUFDQyxNQUFQLEdBQWdCO0FBQ2RDLElBQUFBLFdBQVcsRUFDVCxrRUFGWTtBQUdkQyxJQUFBQSxJQUFJLEVBQUU7QUFDSkMsTUFBQUEsSUFBSSxFQUFFO0FBQ0pGLFFBQUFBLFdBQVcsRUFBRSxpREFEVDtBQUVKRyxRQUFBQSxJQUFJLEVBQUUsSUFBSUMsdUJBQUosQ0FBbUJDLDRCQUFuQjtBQUZG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S0QsQ0FwRkQiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBHcmFwaFFMT2JqZWN0VHlwZSwgR3JhcGhRTE5vbk51bGwgfSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IEdyYXBoUUxVcGxvYWQgfSBmcm9tICdncmFwaHFsLXVwbG9hZCc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgKiBhcyBkZWZhdWx0R3JhcGhRTFR5cGVzIGZyb20gJy4vZGVmYXVsdEdyYXBoUUxUeXBlcyc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uLy4uL2xvZ2dlcic7XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBjb25zdCBmaWVsZHMgPSB7fTtcblxuICBmaWVsZHMuY3JlYXRlID0ge1xuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1RoZSBjcmVhdGUgbXV0YXRpb24gY2FuIGJlIHVzZWQgdG8gY3JlYXRlIGFuZCB1cGxvYWQgYSBuZXcgZmlsZS4nLFxuICAgIGFyZ3M6IHtcbiAgICAgIGZpbGU6IHtcbiAgICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBuZXcgZmlsZSB0byBiZSBjcmVhdGVkIGFuZCB1cGxvYWRlZCcsXG4gICAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMVXBsb2FkKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoZGVmYXVsdEdyYXBoUUxUeXBlcy5GSUxFX0lORk8pLFxuICAgIGFzeW5jIHJlc29sdmUoX3NvdXJjZSwgYXJncywgY29udGV4dCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgeyBmaWxlIH0gPSBhcmdzO1xuICAgICAgICBjb25zdCB7IGNvbmZpZyB9ID0gY29udGV4dDtcblxuICAgICAgICBjb25zdCB7IGNyZWF0ZVJlYWRTdHJlYW0sIGZpbGVuYW1lLCBtaW1ldHlwZSB9ID0gYXdhaXQgZmlsZTtcbiAgICAgICAgbGV0IGRhdGEgPSBudWxsO1xuICAgICAgICBpZiAoY3JlYXRlUmVhZFN0cmVhbSkge1xuICAgICAgICAgIGNvbnN0IHN0cmVhbSA9IGNyZWF0ZVJlYWRTdHJlYW0oKTtcbiAgICAgICAgICBkYXRhID0gYXdhaXQgbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgICAgbGV0IGRhdGEgPSAnJztcbiAgICAgICAgICAgIHN0cmVhbVxuICAgICAgICAgICAgICAub24oJ2Vycm9yJywgcmVqZWN0KVxuICAgICAgICAgICAgICAub24oJ2RhdGEnLCBjaHVuayA9PiAoZGF0YSArPSBjaHVuaykpXG4gICAgICAgICAgICAgIC5vbignZW5kJywgKCkgPT4gcmVzb2x2ZShkYXRhKSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWRhdGEgfHwgIWRhdGEubGVuZ3RoKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRklMRV9TQVZFX0VSUk9SLFxuICAgICAgICAgICAgJ0ludmFsaWQgZmlsZSB1cGxvYWQuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZmlsZW5hbWUubGVuZ3RoID4gMTI4KSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9GSUxFX05BTUUsXG4gICAgICAgICAgICAnRmlsZW5hbWUgdG9vIGxvbmcuJ1xuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIWZpbGVuYW1lLm1hdGNoKC9eW19hLXpBLVowLTldW2EtekEtWjAtOUBcXC5cXCB+Xy1dKiQvKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfRklMRV9OQU1FLFxuICAgICAgICAgICAgJ0ZpbGVuYW1lIGNvbnRhaW5zIGludmFsaWQgY2hhcmFjdGVycy4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIGF3YWl0IGNvbmZpZy5maWxlc0NvbnRyb2xsZXIuY3JlYXRlRmlsZShcbiAgICAgICAgICAgIGNvbmZpZyxcbiAgICAgICAgICAgIGZpbGVuYW1lLFxuICAgICAgICAgICAgZGF0YSxcbiAgICAgICAgICAgIG1pbWV0eXBlXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIGxvZ2dlci5lcnJvcignRXJyb3IgY3JlYXRpbmcgYSBmaWxlOiAnLCBlKTtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5GSUxFX1NBVkVfRVJST1IsXG4gICAgICAgICAgICBgQ291bGQgbm90IHN0b3JlIGZpbGU6ICR7ZmlsZW5hbWV9LmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5oYW5kbGVFcnJvcihlKTtcbiAgICAgIH1cbiAgICB9LFxuICB9O1xuXG4gIGNvbnN0IGZpbGVzTXV0YXRpb24gPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICAgIG5hbWU6ICdGaWxlc011dGF0aW9uJyxcbiAgICBkZXNjcmlwdGlvbjogJ0ZpbGVzTXV0YXRpb24gaXMgdGhlIHRvcCBsZXZlbCB0eXBlIGZvciBmaWxlcyBtdXRhdGlvbnMuJyxcbiAgICBmaWVsZHMsXG4gIH0pO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goZmlsZXNNdXRhdGlvbik7XG5cbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxNdXRhdGlvbnMuZmlsZXMgPSB7XG4gICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB0b3AgbGV2ZWwgZm9yIGZpbGVzIG11dGF0aW9ucy4nLFxuICAgIHR5cGU6IGZpbGVzTXV0YXRpb24sXG4gICAgcmVzb2x2ZTogKCkgPT4gbmV3IE9iamVjdCgpLFxuICB9O1xufTtcblxuZXhwb3J0IHsgbG9hZCB9O1xuIl19