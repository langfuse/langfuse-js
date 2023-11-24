module.exports = {
  roots: ['<rootDir>'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts?$': [
      'ts-jest', {
        tsconfig: {
          lib: ['ES2021', 'ES2022.Error', 'DOM'], // We need to include DOM for tests
        },
      }
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  collectCoverage: true,
  clearMocks: true,
  coverageDirectory: 'coverage',
  fakeTimers: { enableGlobally: true },
  transformIgnorePatterns: ['<rootDir>/node_modules/'],
  testPathIgnorePatterns: ['<rootDir>/lib/', '/node_modules/', '/examples/'],
  // we want to depend on the source version in the tests to get correct coverage
  moduleNameMapper: {
    "^(langfuse.*)$": "<rootDir>/$1/index",
  },
  // we need to exclude the modules in the examples folder from the module lookup as they would collide
  modulePathIgnorePatterns: ["<rootDir>/examples/"],
}
