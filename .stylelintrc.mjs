export default {
  extends: [],
  rules: {
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: ['custom-variant', 'theme', 'tailwind'],
      },
    ],
  },
};
