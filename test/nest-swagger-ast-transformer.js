const swaggerPlugin = require("@nestjs/swagger/plugin");

exports.name = "nestjsSwaggerAstTransformer";
exports.version = 1;
exports.factory = (compilerInstance, options = {}) => {
  const program = compilerInstance.program;
  if (!program) {
    throw new Error(
      'The "@nestjs/swagger" AST transformer requires a TypeScript program.',
    );
  }

  return swaggerPlugin.before(
    {
      classValidatorShim: true,
      introspectComments: true,
      ...options,
    },
    program,
  );
};
