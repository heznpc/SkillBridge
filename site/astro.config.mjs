import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://heznpc.github.io/SkillBridge',
  base: '/SkillBridge',
  output: 'static',
  trailingSlash: 'always',
  outDir: './dist',
  publicDir: './public',
  vite: { build: { emptyOutDir: true } },
});
