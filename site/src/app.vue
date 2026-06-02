<template>
  <div class="font-ui">
    <VitePwaManifest />
    <NuxtPage />
    <ToastList />
  </div>
</template>

<script setup lang="ts">
import { joinURL } from "ufo";
import type { ResumeStyles } from "~/types";

const { t, locale } = useI18n();
const colorMode = useColorMode();
const preferredDark = { value: false }; //usePreferredDark();

// Import a resume passed via `?import=<absolute .md path>` (local dev only).
// Lets the resume generator drop a freshly written Markdown file straight into
// the editor — no copy-paste, auto-named from the file's folder. Optional
// `&name=` overrides the derived name. Style params can also be set from the
// URL (`&fontSize=11&lineHeight=1.25&marginV=40&marginH=40&paragraphSpace=4&paper=letter`),
// which is how the headless render tool drives one-page fitting.
// See `~/server/api/import-resume.get.ts`.
const route = useRoute();
const router = useRouter();
const localePath = useLocalePath();

const styleOverrideFromQuery = () => {
  const q = route.query;
  const override: Partial<ResumeStyles> = {};
  const num = (v: unknown) => {
    const n = Number(v);
    return typeof v === "string" && v !== "" && Number.isFinite(n) ? n : undefined;
  };

  const numKeys = ["fontSize", "lineHeight", "marginV", "marginH", "paragraphSpace"] as const;
  for (const key of numKeys) {
    const n = num(q[key]);
    if (n !== undefined) override[key] = n;
  }
  if (q.paper === "A4" || q.paper === "letter") override.paper = q.paper;

  return override;
};

onMounted(async () => {
  const path = route.query.import;
  if (typeof path !== "string" || !path) return;

  try {
    const endpoint = joinURL(useRuntimeConfig().app.baseURL, "api/import-resume");
    const { name, markdown } = await $fetch<{ name: string; markdown: string }>(endpoint, {
      query: { path, name: route.query.name }
    });
    const id = await upsertResumeFromMarkdown(name, markdown, styleOverrideFromQuery());
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
