// jest.config.js in each workspace package
const baseConfig = require("../jest.config.js");

module.exports = {
  ...baseConfig,
  transform: {
    "^.+\\.ts?$": [
      "ts-jest",
      {
        tsconfig: {
          lib: ["ES2016", "ES2022.Error", "DOM"], // We need to include DOM for tests
        },
      },
    ],
  },
};
