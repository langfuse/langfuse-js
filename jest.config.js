module.exports = {
  roots: ['<rootDir>'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts?$': [
      'ts-jest', {
        tsconfig: {
          lib: ['ES2015', 'ES2022.Error', 'DOM'], // We need to include DOM for tests
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
}
