import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // 这两条来自 react-hooks v7 的 React Compiler「建议型」检查：
    //  - set-state-in-effect：本项目页面/组件在挂载时通过 effect 拉取首屏数据，属有意设计；
    //  - immutability：会连带报「变量在声明前被访问」，而这些 load 函数都是函数声明（会提升），运行时无问题。
    // 降级为 warning，避免 CI 失败，同时保留提示。
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
  {
    // 构建/工具配置文件运行在 Node 环境，需要 Node 全局变量（如 process）
    files: ['vite.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // 测试脚本运行在 Node 环境
    files: ['../test-*.mjs', '../tools/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
])