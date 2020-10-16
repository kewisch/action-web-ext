module.exports = {
  coveragePathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/tests/'],
  collectCoverageFrom: ['src/**/*.js'],
  moduleDirectories: ['src', 'node_modules'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  transform: {
    '^.+\\.js$': 'babel-jest',
    '^.+\\.txt$': 'jest-raw-loader',
  },
  transformIgnorePatterns: ['<rootDir>/node_modules/'],
  testEnvironment: 'node',
  verbose: false,
};
