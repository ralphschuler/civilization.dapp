import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      "**/next-env.d.ts",
      ".next/**",
      "out/**",
      "apps/demo/.next/**",
      "apps/demo/out/**",
      "artefacts/storybook-ui-audit/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
];

export default eslintConfig;
