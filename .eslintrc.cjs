module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
    jest: true
  },
  extends: ["eslint:recommended", "plugin:prettier/recommended"],
  plugins: ["html"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  }
};
