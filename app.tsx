// bb-plugin-better-sidebar — frontend entry.
//
// Three registrations, one idea: the sidebar's thread list, the place to choose
// a project's icon, and a content script that carries that icon into the
// browser tab. React, the SDK, radix, and sonner are provided by the BB app at
// load time and never bundled.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ThreadList } from "./src/app/ThreadList";
import { SettingsSection } from "./src/app/SettingsSection";
import { mountFaviconSync } from "./src/app/favicon-script";

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "projects",
    title: "Better Sidebar",
    description:
      "Threads grouped by project, with the project's icon on every group.",
    component: ThreadList,
  });

  app.slots.settingsSection({
    id: "project-icons",
    title: "Project icons",
    description:
      "By default a project's icon comes from its GitHub or git repository. Override it with your own file or a URL.",
    component: SettingsSection,
  });

  // The favicon has to follow every route — Settings, Extensions, the compact
  // drawer — so it cannot live in a sidebar component's lifetime.
  app.contentScripts.register({
    id: "tab-favicon",
    mount: ({ pluginId, signal }) => mountFaviconSync({ pluginId, signal }),
  });
});
