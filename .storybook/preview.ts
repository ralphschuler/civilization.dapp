import type { Preview } from "storybook";
import "../src/app/globals.css";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    viewport: {
      viewports: {
        auditMobile: {
          name: "Audit mobile (390px)",
          styles: { width: "390px", height: "844px" },
        },
      },
    },
  },
  globalTypes: {
    viewport: {
      defaultValue: "auditMobile",
    },
  },
};

export default preview;
