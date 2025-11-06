/**
 * Stylelint 配置：支持在 .vue 文件中校验 <style>，并采用标准规则集。
 */
module.exports = {
  extends: [
    'stylelint-config-standard',
    'stylelint-config-html',
    'stylelint-config-recommended-vue',
  ],
  rules: {
    'no-empty-source': null,
  },
};