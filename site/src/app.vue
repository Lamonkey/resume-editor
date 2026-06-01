<template>
  <div class="font-ui">
    <VitePwaManifest />
    <NuxtPage />
    <ToastList />
  </div>
</template>

<script setup lang="ts">
import { joinURL } from "ufo";

const { t, locale } = useI18n();
const colorMode = useColorMode();
const preferredDark = { value: false }; //usePreferredDark();

// Import a resume passed via `?import=<absolute .md path>` (local dev only).
// Lets the resume generator drop a freshly written Markdown file straight into
// the editor — no copy-paste, auto-named from the file's folder. Optional
// `&name=` overrides the derived name. See `~/server/api/import-resume.get.ts`.
const route = useRoute();
const router = useRouter();
const localePath = useLocalePath();

onMounted(async () => {
  const path = route.query.import;
  if (typeof path !== "string" || !path) return;

  try {
    const endpoint = joinURL(useRuntimeConfig().app.baseURL, "api/import-resume");
    const { name, markdown } = await $fetch<{ name: string; markdown: string }>(endpoint, {
      query: { path, name: route.query.name }
    });
    const id = await upsertResumeFromMarkdown(name, markdown);
    await router.replace(localePath(`/edit/${id}`));
  } catch (e) {
    console.error("[import-resume] failed to import", route.query.import, e);
  }
});

useHead({
  title: t("head.title"),
  meta: [
    { name: "keywords", content: t("head.keywords") },
    { name: "description", content: t("head.desc") },
    { property: "og:title", content: t("head.title") },
    { property: "og:description", content: t("head.desc") },
    { property: "og:locale", content: locale },
    {
      name: "theme-color",
      content: () => (colorMode?.preference === "dark" ? "#475569" : "#f3f4f6")
    }
  ],
  link: [
    {
      rel: "icon",
      type: "image/svg+xml",
      href: () => (preferredDark.value ? "/favicon-dark.svg" : "/favicon.svg")
    }
  ],
  script: [
    {
      src: "https://code.iconify.design/2/2.2.1/iconify.min.js",
      type: "module",
      tagPosition: "bodyClose"
    }
  ]
});
</script>
