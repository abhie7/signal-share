export default {
  extends: ['stylelint-config-standard'],
  rules: {
    'at-rule-no-unknown': [
      true,
      {
        ignoreAtRules: ['custom-variant', 'theme', 'tailwind'],
      },
    ],
  },
};
