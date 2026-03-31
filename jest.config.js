module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testEnvironment: "node",
  testRegex: ["(.*\\.spec\\.ts$)", "(test/batch-d-slice\\.e2e-spec\\.ts$)"],
  modulePathIgnorePatterns: ["<rootDir>/.claude/"],
  testPathIgnorePatterns: ["<rootDir>/.claude/", "test/app\\.e2e-spec\\.ts$"],
  transform: {
    "^.+\\.(t|j)s$": [
      "ts-jest",
      {
        astTransformers: {
          before: [
            {
              path: "<rootDir>/test/nest-swagger-ast-transformer.js",
            },
          ],
        },
      },
    ],
  },
  collectCoverageFrom: ["src/**/*.ts", "!src/main.ts"],
  coverageDirectory: "./coverage",
};
